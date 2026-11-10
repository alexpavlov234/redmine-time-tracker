/// <summary>
/// Content script injected into Redmine issue pages.
/// Integrates interactive timer controls positioned below the Redmine action buttons row,
/// status change prompts on start, and activity description prompts on stop.
/// </summary>

(function () {
  'use strict';

  const TIMER_API_BASE = 'http://localhost:3000/timer';
  const ROW_CONTAINER_ID = 'rtt-injected-timer-row';
  const BUTTON_CONTAINER_ID = 'rtt-injected-timer-button';
  const MODAL_CONTAINER_ID = 'rtt-modal-container';
  let pollIntervalId = null;
  let isEnabled = true;
  let cachedStatuses = null;

  // Clean vector SVG icons
  const SVG_ICONS = {
    play: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><path d="M6 4l15 8-15 8V4z"/></svg>',
    stop: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    alert: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    switch: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/></svg>'
  };

  /// <summary>
  /// Formats elapsed seconds into HH:MM:SS or MM:SS string.
  /// </summary>
  /// <param name="totalSeconds">Total seconds elapsed.</param>
  /// <returns>Formatted time string.</returns>
  function formatSeconds(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(sec / 3600);
    const minutes = Math.floor((sec % 3600) / 60);
    const seconds = sec % 60;

    const pad = (n) => String(n).padStart(2, '0');
    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  /// <summary>
  /// Extracts the current Redmine issue ID from the URL.
  /// </summary>
  /// <returns>The issue ID, or null if not an issue page.</returns>
  function getIssueId() {
    const match = window.location.pathname.match(/\/issues\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }

  /// <summary>
  /// Extracts the issue subject from the Redmine page DOM.
  /// </summary>
  /// <returns>The subject text.</returns>
  function getIssueSubject() {
    const subjectEl = document.querySelector('div.subject h3') ||
                      document.querySelector('#content > h2') ||
                      document.querySelector('h2.inline-flex');
    if (subjectEl) {
      return subjectEl.innerText.trim();
    }
    return document.title.replace(/^[^:]+:\s*/, '').trim();
  }

  /// <summary>
  /// Extracts the project name from the Redmine page DOM.
  /// </summary>
  /// <returns>The project name.</returns>
  function getProjectName() {
    const projectEl = document.querySelector('#header h1') ||
                      document.querySelector('.current-project') ||
                      document.querySelector('#project-menu');
    if (projectEl) {
      return projectEl.innerText.trim().replace(/\s*»\s*$/, '');
    }
    return '';
  }

  /// <summary>
  /// Performs a direct fetch request with fallback from localhost to 127.0.0.1.
  /// </summary>
  /// <param name="url">Target URL.</param>
  /// <param name="options">Fetch options.</param>
  /// <returns>Parsed response payload.</returns>
  async function directFetch(url, options = {}) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      if (url.includes('http://localhost:3000')) {
        const fallbackUrl = url.replace('http://localhost:3000', 'http://127.0.0.1:3000');
        response = await fetch(fallbackUrl, options);
      } else {
        throw err;
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /// <summary>
  /// Executes an HTTP request via the extension background service worker,
  /// with automatic fallback to direct fetch if the extension context was reloaded.
  /// </summary>
  /// <param name="url">The target URL.</param>
  /// <param name="options">Fetch request options.</param>
  /// <returns>The parsed JSON or text response.</returns>
  async function apiRequest(url, options = {}) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id && chrome.runtime.sendMessage) {
      try {
        const response = await new Promise((resolve, reject) => {
          try {
            chrome.runtime.sendMessage(
              {
                type: 'API_REQUEST',
                url,
                options,
              },
              (res) => {
                if (chrome.runtime.lastError) {
                  return reject(new Error(chrome.runtime.lastError.message));
                }
                if (!res) {
                  return reject(new Error('No response from background service worker'));
                }
                if (!res.ok) {
                  return reject(new Error(res.error || `HTTP ${res.status}: ${res.statusText}`));
                }
                resolve(res.data);
              }
            );
          } catch (syncErr) {
            reject(syncErr);
          }
        });
        return response;
      } catch {
        // Fallback to direct fetch if service worker is unavailable or context invalidated
        return await directFetch(url, options);
      }
    }

    return await directFetch(url, options);
  }

  /// <summary>
  /// Fetches available issue statuses from the Redmine DOM first (instant), then falls back to local proxy API.
  /// </summary>
  /// <returns>List of statuses.</returns>
  async function getRedmineStatuses() {
    // 1. Try parsing select in Redmine's edit form if present in DOM (instant and issue-specific)
    const select = document.getElementById('issue_status_id');
    if (select && select.options && select.options.length > 0) {
      const statuses = Array.from(select.options)
        .filter((opt) => opt.value)
        .map((opt) => ({ id: Number(opt.value), name: opt.text }));
      if (statuses.length > 0) {
        cachedStatuses = statuses;
        return cachedStatuses;
      }
    }

    if (cachedStatuses && cachedStatuses.length > 0) {
      return cachedStatuses;
    }

    // 2. Query through local proxy with a short timeout
    try {
      const data = await Promise.race([
        apiRequest('http://localhost:3000/api/issue_statuses.json'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2500)),
      ]);
      if (data && Array.isArray(data.issue_statuses) && data.issue_statuses.length > 0) {
        cachedStatuses = data.issue_statuses;
        return cachedStatuses;
      }
    } catch {
      // Ignore proxy errors and proceed to fallback
    }

    return [
      { id: 2, name: 'В процес на изпълнение (In Progress)' },
      { id: 1, name: 'Нова (New)' },
      { id: 3, name: 'Решена (Resolved)' },
      { id: 4, name: 'Обратна връзка (Feedback)' }
    ];
  }

  /// <summary>
  /// Updates an issue's status in Redmine using the local proxy API.
  /// </summary>
  /// <param name="issueId">The issue ID.</param>
  /// <param name="statusId">The new status ID.</param>
  async function updateIssueStatus(issueId, statusId) {
    if (!statusId) return;
    try {
      await apiRequest(`http://localhost:3000/api/issues/${issueId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: { status_id: Number(statusId) } }),
      });
    } catch (e) {
      console.warn('Could not update status via proxy:', e);
    }
  }

  /// <summary>
  /// Closes any open modal dialog.
  /// </summary>
  function closeModal() {
    const existing = document.getElementById(MODAL_CONTAINER_ID);
    if (existing) {
      existing.remove();
    }
  }

  /// <summary>
  /// Detects whether the current Redmine page is using a dark theme.
  /// </summary>
  /// <returns>True if dark background is detected.</returns>
  function isDarkTheme() {
    try {
      const candidates = [document.body, document.getElementById('content'), document.getElementById('main')];
      for (const el of candidates) {
        if (!el) continue;
        const bg = window.getComputedStyle(el).backgroundColor;
        const rgb = bg.match(/\d+/g);
        if (rgb && rgb.length >= 3 && rgb[0] !== '0' && rgb[3] !== '0') {
          const brightness = (Number(rgb[0]) * 299 + Number(rgb[1]) * 587 + Number(rgb[2]) * 114) / 1000;
          return brightness < 130;
        }
      }
    } catch {
      // Ignore style check errors
    }
    return false;
  }

  /// <summary>
  /// Displays the modal asking whether to change the issue status before starting the timer.
  /// </summary>
  /// <param name="issueId">The current issue ID.</param>
  /// <param name="subject">The issue subject.</param>
  /// <param name="project">The project name.</param>
  /// <param name="btn">The button element to update.</param>
  async function showStartModal(issueId, subject, project, btn) {
    closeModal();
    const statuses = await getRedmineStatuses();

    const overlay = document.createElement('div');
    overlay.id = MODAL_CONTAINER_ID;
    overlay.className = `rtt-modal-overlay ${isDarkTheme() ? 'rtt-dark' : 'rtt-light'}`;

    let optionsHtml = '<option value="">-- Не променяй статуса --</option>';
    statuses.forEach((s) => {
      const isDefault = /in\s*progress|в\s*процес/i.test(s.name);
      optionsHtml += `<option value="${s.id}" ${isDefault ? 'selected' : ''}>${s.name}</option>`;
    });

    overlay.innerHTML = `
      <div class="ui-dialog ui-corner-all ui-widget ui-widget-content rtt-modal-dialog" role="dialog">
        <div class="ui-dialog-titlebar ui-corner-all ui-widget-header ui-helper-clearfix rtt-modal-header">
          <span class="ui-dialog-title">Стартиране на таймер</span>
          <a href="#" class="ui-dialog-titlebar-close rtt-modal-close" id="rtt-close-btn" title="Затвори">&times;</a>
        </div>
        <div class="ui-dialog-content ui-widget-content rtt-modal-body">
          <h3 class="title">#${issueId} - ${subject}</h3>
          <div class="box tabular">
            <p>
              <label for="rtt-status-select"><strong>Статус:</strong></label>
              <select id="rtt-status-select" style="min-width: 180px;">
                ${optionsHtml}
              </select>
            </p>
          </div>
          <p class="buttons">
            <input type="button" id="rtt-confirm-start-btn" value="Стартирай" class="button-positive">
            <a href="#" id="rtt-cancel-start-btn" class="button-cancel">Отказ</a>
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    document.getElementById('rtt-close-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
    document.getElementById('rtt-cancel-start-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });

    document.getElementById('rtt-confirm-start-btn')?.addEventListener('click', async () => {
      const select = document.getElementById('rtt-status-select');
      const chosenStatusId = select ? select.value : '';

      closeModal();

      if (chosenStatusId) {
        await updateIssueStatus(issueId, chosenStatusId);
      }

      try {
        const data = await apiRequest(`${TIMER_API_BASE}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueId: issueId,
            issueSubject: subject,
            projectName: project,
          }),
        });

        if (data && data.timer) {
          updateButtonUI(btn, data.timer, issueId);
        }
      } catch (err) {
        console.error('Failed to start timer:', err);
      }
    });
  }

  /// <summary>
  /// Displays the modal asking for an activity note before stopping the timer.
  /// </summary>
  /// <param name="issueId">The current issue ID.</param>
  /// <param name="subject">The issue subject.</param>
  /// <param name="elapsedSeconds">Total elapsed seconds.</param>
  /// <param name="btn">The button element to update.</param>
  function showStopModal(issueId, subject, elapsedSeconds, btn) {
    closeModal();
    const formatted = formatSeconds(elapsedSeconds);

    const overlay = document.createElement('div');
    overlay.id = MODAL_CONTAINER_ID;
    overlay.className = `rtt-modal-overlay ${isDarkTheme() ? 'rtt-dark' : 'rtt-light'}`;

    overlay.innerHTML = `
      <div class="ui-dialog ui-corner-all ui-widget ui-widget-content rtt-modal-dialog" role="dialog">
        <div class="ui-dialog-titlebar ui-corner-all ui-widget-header ui-helper-clearfix rtt-modal-header">
          <span class="ui-dialog-title">Спиране на отчитането (${formatted})</span>
          <a href="#" class="ui-dialog-titlebar-close rtt-modal-close" id="rtt-close-btn" title="Затвори">&times;</a>
        </div>
        <div class="ui-dialog-content ui-widget-content rtt-modal-body">
          <h3 class="title">#${issueId} - ${subject}</h3>
          <div class="box">
            <p>
              <label for="rtt-activity-text"><strong>Какво свършихте по задачата?</strong></label>
            </p>
            <p style="margin: 0;">
              <textarea id="rtt-activity-text" rows="4" style="width: 100%; box-sizing: border-box;" placeholder="Опишете накратко извършената дейност..."></textarea>
            </p>
          </div>
          <p class="buttons">
            <input type="button" id="rtt-confirm-stop-btn" value="Запази и спри" class="button-positive">
            <input type="button" id="rtt-skip-stop-btn" value="Спри без описание">
            <a href="#" id="rtt-cancel-stop-btn" class="button-cancel">Отказ</a>
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = document.getElementById('rtt-activity-text');
    if (textarea) textarea.focus();

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    document.getElementById('rtt-close-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });
    document.getElementById('rtt-cancel-stop-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeModal();
    });

    const handleStop = async (noteText) => {
      closeModal();
      try {
        const data = await apiRequest(`${TIMER_API_BASE}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: noteText }),
        });
        if (data && data.timer) {
          updateButtonUI(btn, data.timer, issueId);
        }
      } catch (err) {
        console.error('Failed to stop timer:', err);
      }
    };

    document.getElementById('rtt-skip-stop-btn')?.addEventListener('click', () => handleStop(''));
    document.getElementById('rtt-confirm-stop-btn')?.addEventListener('click', () => {
      const text = textarea ? textarea.value.trim() : '';
      handleStop(text);
    });
  }

  /// <summary>
  /// Finds the primary action toolbar in Redmine to place the tracking button row underneath.
  /// </summary>
  /// <returns>The container element.</returns>
  function findActionToolbar() {
    return document.querySelector('#content > .contextual') ||
           document.querySelector('.contextual') ||
           document.querySelector('#content');
  }

  /// <summary>
  /// Removes the injected timer button row from the DOM.
  /// </summary>
  function removeButton() {
    const existingRow = document.getElementById(ROW_CONTAINER_ID);
    if (existingRow) existingRow.remove();
    const existingBtn = document.getElementById(BUTTON_CONTAINER_ID);
    if (existingBtn) existingBtn.remove();
  }

  /// <summary>
  /// Updates the button visuals based on the timer response from the proxy server.
  /// Preserves child DOM nodes while ticking to avoid swallowing click events.
  /// </summary>
  /// <param name="btn">The button element to update.</param>
  /// <param name="timerState">The timer status object or null if offline.</param>
  /// <param name="issueId">The current issue ID.</param>
  function updateButtonUI(btn, timerState, issueId) {
    if (!timerState) {
      if (btn.dataset.state !== 'offline') {
        btn.dataset.state = 'offline';
        btn.className = 'rtt-action-button rtt-button-offline';
        btn.innerHTML = `${SVG_ICONS.alert} <span>Таймерът е офлайн</span>`;
        btn.title = 'Сървърът на http://localhost:3000 не отговаря. Стартирайте го с npm run dev';
      }
      return;
    }

    const isRunning = Boolean(timerState.isRunning);
    const isThisIssue = String(timerState.issueId) === String(issueId);

    if (isRunning && isThisIssue) {
      const now = Date.now();
      const sessionMs = timerState.startTime ? Math.max(0, now - timerState.startTime) : 0;
      const totalSec = Math.floor(((timerState.elapsedMs || 0) + sessionMs) / 1000);
      const formatted = formatSeconds(totalSec);

      if (btn.dataset.state === 'running') {
        const timeEl = btn.querySelector('.rtt-time-text');
        if (timeEl) {
          timeEl.textContent = formatted;
          return;
        }
      }

      btn.dataset.state = 'running';
      btn.className = 'rtt-action-button rtt-button-running';
      btn.innerHTML = `<span class="rtt-pulse-dot rtt-pulse-dot-active"></span> <span class="rtt-time-text">${formatted}</span> <span class="rtt-divider">|</span> <span class="rtt-stop-text">Спри</span>`;
      btn.title = 'Кликнете, за да спрете отчитането на време за тази задача.';
    } else if (isRunning && !isThisIssue) {
      const stateKey = `switch_${timerState.issueId}`;
      if (btn.dataset.state !== stateKey) {
        btn.dataset.state = stateKey;
        btn.className = 'rtt-action-button rtt-button-switch';
        btn.innerHTML = `${SVG_ICONS.switch} <span>Стартирай тук (#${timerState.issueId})</span>`;
        btn.title = `В момента се отчита задача #${timerState.issueId}. Кликнете, за да превключите към тази задача.`;
      }
    } else {
      if (btn.dataset.state !== 'start') {
        btn.dataset.state = 'start';
        btn.className = 'rtt-action-button rtt-button-start';
        btn.innerHTML = `${SVG_ICONS.play} <span>Стартирай таймер</span>`;
        btn.title = 'Кликнете, за да стартирате таймера за тази задача.';
      }
    }
  }

  /// <summary>
  /// Injects or retrieves the tracking button positioned on a new row below the Redmine action buttons.
  /// </summary>
  /// <param name="issueId">The current issue ID.</param>
  /// <returns>The button element.</returns>
  function ensureButton(issueId) {
    let btn = document.getElementById(BUTTON_CONTAINER_ID);
    if (btn) return btn;

    const toolbar = findActionToolbar();
    if (!toolbar) return null;

    // Ensure flex-based Redmine toolbars allow our second row to wrap below the buttons
    const computedDisplay = window.getComputedStyle(toolbar).display;
    if (computedDisplay === 'flex' || computedDisplay === 'inline-flex') {
      toolbar.style.flexWrap = 'wrap';
    }

    const row = document.createElement('div');
    row.id = ROW_CONTAINER_ID;
    row.className = 'rtt-toolbar-row';

    btn = document.createElement('a');
    btn.id = BUTTON_CONTAINER_ID;
    btn.className = 'rtt-action-button rtt-button-start';
    btn.innerHTML = `${SVG_ICONS.clock} <span>Таймер...</span>`;
    btn.href = '#';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const currentState = await apiRequest(TIMER_API_BASE);
        const isRunningThis = currentState?.isRunning && String(currentState?.issueId) === String(issueId);

        if (isRunningThis) {
          const now = Date.now();
          const sessionMs = currentState.startTime ? Math.max(0, now - currentState.startTime) : 0;
          const totalSec = Math.floor(((currentState.elapsedMs || 0) + sessionMs) / 1000);
          showStopModal(issueId, getIssueSubject(), totalSec, btn);
        } else {
          showStartModal(issueId, getIssueSubject(), getProjectName(), btn);
        }
      } catch (err) {
        console.error('Redmine Time Tracker Error:', err);
        updateButtonUI(btn, null, issueId);
      }
    });

    row.appendChild(btn);
    toolbar.appendChild(row);

    return btn;
  }

  /// <summary>
  /// Polls the timer proxy server to keep the button label and timer counter updated.
  /// </summary>
  /// <param name="issueId">The current issue ID.</param>
  async function pollTimer(issueId) {
    if (!isEnabled) {
      removeButton();
      closeModal();
      return;
    }

    const btn = ensureButton(issueId);
    if (!btn) return;

    try {
      const timerData = await apiRequest(TIMER_API_BASE);
      updateButtonUI(btn, timerData, issueId);
    } catch {
      updateButtonUI(btn, null, issueId);
    }
  }

  /// <summary>
  /// Initializes the content script, observing settings and starting polling.
  /// </summary>
  async function init() {
    const issueId = getIssueId();
    if (!issueId) return;

    // Remove any stale button from previous script instance
    removeButton();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
      try {
        const items = await chrome.storage.local.get({ extensionEnabled: true });
        isEnabled = items.extensionEnabled !== false;
        if (isEnabled) {
          await pollTimer(issueId);
          pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
        }

        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.extensionEnabled) {
            isEnabled = changes.extensionEnabled.newValue !== false;
            if (isEnabled) {
              pollTimer(issueId);
              if (!pollIntervalId) {
                pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
              }
            } else {
              removeButton();
              closeModal();
              if (pollIntervalId) {
                clearInterval(pollIntervalId);
                pollIntervalId = null;
              }
            }
          }
        });
      } catch {
        await pollTimer(issueId);
        pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
      }
    } else {
      await pollTimer(issueId);
      pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
