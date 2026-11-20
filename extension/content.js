/// <summary>
/// Content script injected into Redmine issue and time-entry pages.
/// Integrates interactive timer controls positioned below the Redmine action buttons row,
/// status change prompts on start, activity description prompts on stop,
/// and batch Find & Replace on time entry lists.
/// </summary>

(function () {
  'use strict';

  // Clean up any previous instance if the extension reloaded or re-injected
  if (typeof window.__rttCleanup === 'function') {
    try {
      window.__rttCleanup();
    } catch {
      // Ignore cleanup errors from stale contexts
    }
  }

  const TIMER_API_BASE = 'http://localhost:3000/timer';
  const ROW_CONTAINER_ID = 'rtt-injected-timer-row';
  const BUTTON_CONTAINER_ID = 'rtt-injected-timer-button';
  const MODAL_CONTAINER_ID = 'rtt-modal-container';
  const FR_TRIGGER_BTN_ID = 'rtt-fr-trigger-btn';
  const FR_PANEL_ID = 'rtt-find-replace-panel';
  const STORAGE_SCROLL_KEY = 'rtt_scroll_pos';
  const STORAGE_STATE_KEY = 'rtt_fr_state';

  let pollIntervalId = null;
  let storageChangeListener = null;
  let isEnabled = true;
  let cachedStatuses = null;
  let currentFrMatches = [];

  // Clean vector SVG icons (used on action buttons only)
  const SVG_ICONS = {
    play: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><path d="M6 4l15 8-15 8V4z"/></svg>',
    alert: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    switch: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/></svg>',
    clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    search: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
  };

  /// <summary>
  /// Escapes unsafe characters for safe HTML insertion.
  /// </summary>
  /// <param name="str">The string to escape.</param>
  /// <returns>Escaped HTML-safe string.</returns>
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

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
                  return reject(new Error('Няма отговор от фоновия процес на разширението.'));
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
  /// Retrieves stored Redmine connection credentials from Chrome extension local storage.
  /// </summary>
  /// <returns>Promise resolving to { redmineUrl, redmineApiKey }.</returns>
  async function getStoredCredentials() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const items = await chrome.storage.local.get({ redmineUrl: '', redmineApiKey: '' });
        return {
          redmineUrl: (items.redmineUrl || '').replace(/\/+$/, '').trim(),
          redmineApiKey: (items.redmineApiKey || '').trim(),
        };
      } catch {
        return { redmineUrl: '', redmineApiKey: '' };
      }
    }
    return { redmineUrl: '', redmineApiKey: '' };
  }

  /// <summary>
  /// Builds proxy request headers containing stored Redmine URL and API key.
  /// </summary>
  /// <param name="includeContentType">Whether to include Content-Type: application/json.</param>
  /// <returns>Headers object for proxy requests.</returns>
  async function getProxyCredentialHeaders(includeContentType = true) {
    const creds = await getStoredCredentials();
    const headers = {
      'X-Redmine-URL': creds.redmineUrl || window.location.origin,
    };
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (creds.redmineApiKey) {
      headers['X-Redmine-API-Key'] = creds.redmineApiKey;
    }
    return headers;
  }

  /// <summary>
  /// Fetches available issue statuses from the Redmine DOM first (instant), then falls back to local proxy API.
  /// </summary>
  /// <returns>List of statuses.</returns>
  async function getRedmineStatuses() {
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

    try {
      const proxyHeaders = await getProxyCredentialHeaders(false);
      const data = await Promise.race([
        apiRequest('http://localhost:3000/api/issue_statuses.json', { headers: proxyHeaders }),
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
      { id: 2, name: 'В процес на изпълнение' },
      { id: 1, name: 'Нова' },
      { id: 3, name: 'Решена' },
      { id: 4, name: 'Обратна връзка' }
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
      const proxyHeaders = await getProxyCredentialHeaders(true);
      await apiRequest(`http://localhost:3000/api/issues/${issueId}.json`, {
        method: 'PUT',
        headers: proxyHeaders,
        body: JSON.stringify({ issue: { status_id: Number(statusId) } }),
      });
    } catch (e) {
      console.warn('[RTT] Could not update status via proxy:', e);
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
  /// Properly handles transparent backgrounds while still recognizing pure black rgb(0, 0, 0).
  /// </summary>
  /// <returns>True if a dark background is detected.</returns>
  function isDarkTheme() {
    try {
      const candidates = [document.body, document.getElementById('content'), document.getElementById('main')];
      for (const el of candidates) {
        if (!el) continue;
        const bg = window.getComputedStyle(el).backgroundColor;
        if (!bg || bg === 'transparent') continue;
        const match = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (!match) continue;
        const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
        if (alpha === 0) continue;
        const r = parseInt(match[1], 10);
        const g = parseInt(match[2], 10);
        const b = parseInt(match[3], 10);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness < 130;
      }
    } catch {
      // Ignore style check errors
    }

    return (
      document.documentElement.classList.contains('theme-dark') ||
      document.body.classList.contains('theme-dark') ||
      document.body.classList.contains('dark') ||
      document.querySelector('meta[name="color-scheme"][content*="dark"]') !== null
    );
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
      optionsHtml += `<option value="${escapeHtml(s.id)}" ${isDefault ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
    });

    overlay.innerHTML = `
      <div class="ui-dialog ui-corner-all ui-widget ui-widget-content rtt-modal-dialog" role="dialog">
        <div class="ui-dialog-titlebar ui-corner-all ui-widget-header ui-helper-clearfix rtt-modal-header">
          <span class="ui-dialog-title">Стартиране на таймера</span>
          <a href="#" class="ui-dialog-titlebar-close rtt-modal-close" id="rtt-close-btn" title="Затвори">&times;</a>
        </div>
        <div class="ui-dialog-content ui-widget-content rtt-modal-body">
          <h3 class="title">#${escapeHtml(issueId)} - ${escapeHtml(subject)}</h3>
          <div class="box tabular">
            <p>
              <label for="rtt-status-select"><strong>Статус:</strong></label>
              <select id="rtt-status-select" style="min-width: 180px;">
                ${optionsHtml}
              </select>
            </p>
          </div>
          <p class="buttons">
            <input type="button" id="rtt-confirm-start-btn" value="Стартирай таймера" class="button-positive">
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
        console.error('[RTT] Failed to start timer:', err);
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
          <span class="ui-dialog-title">Спиране на отчитането (${escapeHtml(formatted)})</span>
          <a href="#" class="ui-dialog-titlebar-close rtt-modal-close" id="rtt-close-btn" title="Затвори">&times;</a>
        </div>
        <div class="ui-dialog-content ui-widget-content rtt-modal-body">
          <h3 class="title">#${escapeHtml(issueId)} - ${escapeHtml(subject)}</h3>
          <div class="box">
            <p>
              <label for="rtt-activity-text"><strong>Каква дейност извършихте по задачата?</strong></label>
            </p>
            <p style="margin: 0;">
              <textarea id="rtt-activity-text" rows="4" style="width: 100%; box-sizing: border-box;" placeholder="Моля, опишете накратко каква дейност извършихте по задачата..."></textarea>
            </p>
          </div>
          <p class="buttons">
            <input type="button" id="rtt-confirm-stop-btn" value="Запази описанието и спри" class="button-positive">
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
        console.error('[RTT] Failed to stop timer:', err);
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
        btn.title = 'Сървърът на http://localhost:3000 не отговаря, затова стартирайте приложението с npm run dev.';
      }
      return;
    }

    const isRunning = Boolean(timerState.isRunning);
    const hasIssueId = timerState.issueId !== null && timerState.issueId !== undefined && String(timerState.issueId).trim() !== '';
    const isThisIssue = hasIssueId && String(timerState.issueId) === String(issueId);

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
      if (hasIssueId) {
        const stateKey = `switch_${timerState.issueId}`;
        if (btn.dataset.state !== stateKey) {
          btn.dataset.state = stateKey;
          btn.className = 'rtt-action-button rtt-button-switch';
          btn.innerHTML = `${SVG_ICONS.switch} <span>Стартирай тук (#${escapeHtml(timerState.issueId)})</span>`;
          btn.title = `В момента се отчита задача #${timerState.issueId}. Кликнете, за да превключите отчитането към тази задача.`;
        }
      } else {
        if (btn.dataset.state !== 'switch_notask') {
          btn.dataset.state = 'switch_notask';
          btn.className = 'rtt-action-button rtt-button-switch';
          btn.innerHTML = `${SVG_ICONS.switch} <span>Превключи към тази задача</span>`;
          btn.title = 'В момента работи таймер без избрана задача. Кликнете, за да превключите отчитането към тази задача.';
        }
      }
    } else {
      if (btn.dataset.state !== 'start') {
        btn.dataset.state = 'start';
        btn.className = 'rtt-action-button rtt-button-start';
        btn.innerHTML = `${SVG_ICONS.play} <span>Стартирай таймера</span>`;
        btn.title = 'Кликнете, за да стартирате отчитането на време за тази задача.';
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
        const hasIssueId = currentState?.issueId !== null && currentState?.issueId !== undefined && String(currentState.issueId).trim() !== '';
        const isRunningThis = Boolean(currentState?.isRunning) && hasIssueId && String(currentState.issueId) === String(issueId);

        if (isRunningThis) {
          const now = Date.now();
          const sessionMs = currentState.startTime ? Math.max(0, now - currentState.startTime) : 0;
          const totalSec = Math.floor(((currentState.elapsedMs || 0) + sessionMs) / 1000);
          showStopModal(issueId, getIssueSubject(), totalSec, btn);
        } else {
          showStartModal(issueId, getIssueSubject(), getProjectName(), btn);
        }
      } catch (err) {
        console.error('[RTT] Redmine Time Tracker Error:', err);
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

  // =========================================================================
  // Spent Time (Time Entries) Find & Replace Feature Module
  // =========================================================================

  /// <summary>
  /// Determines if current page is a Redmine spent time / time entries list.
  /// </summary>
  /// <returns>True if spent time page or contains spent time entries table.</returns>
  function isTimeEntriesPage() {
    const path = window.location.pathname;
    const isTimeEntriesPath = /\/time_entries(\/|\?|$)/i.test(path) ||
                              /\/projects\/[^/]+\/time_entries/i.test(path) ||
                              /\/issues\/\d+\/time_entries/i.test(path);
    const hasTimeEntriesTable = Boolean(
      document.querySelector('table.time-entries, table.list.time-entries, tr.time-entry, tr[id^="time_entry-"]')
    );
    return isTimeEntriesPath || hasTimeEntriesTable;
  }

  /// <summary>
  /// Extracts the Redmine CSRF authenticity token from the page head meta tag or form inputs.
  /// </summary>
  /// <returns>The CSRF token string or empty string.</returns>
  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) {
      const content = meta.getAttribute('content');
      if (content) return content;
    }
    const input = document.querySelector('input[name="authenticity_token"]');
    if (input && input.value) {
      return input.value;
    }
    return '';
  }

  /// <summary>
  /// Escapes all regular expression metacharacters.
  /// </summary>
  /// <param name="str">The plain text string to escape.</param>
  /// <returns>Regex-safe escaped string.</returns>
  function escapeRegex(str) {
    if (!str) return '';
    return String(str).replace(/[\\^$*+?.()|[\]{}/-]/g, '\\$&');
  }

  /// <summary>
  /// Extracts the time entry ID from a table row element.
  /// </summary>
  /// <param name="tr">The table row.</param>
  /// <returns>The ID string or null.</returns>
  function extractTimeEntryId(tr) {
    if (tr.id) {
      const idMatch = tr.id.match(/time_entry[_-](\d+)/i);
      if (idMatch) return idMatch[1];
    }
    const checkbox = tr.querySelector('input[type="checkbox"][name="ids[]"], input[type="checkbox"][name="id[]"]');
    if (checkbox && checkbox.value && /^\d+$/.test(checkbox.value)) {
      return checkbox.value;
    }
    const editLink = tr.querySelector('a[href*="/time_entries/"][href*="/edit"]');
    if (editLink) {
      const m = editLink.getAttribute('href').match(/\/time_entries\/(\d+)\/edit/i);
      if (m) return m[1];
    }
    const anyLink = tr.querySelector('td.buttons a[href*="/time_entries/"], td a[href*="/time_entries/"]');
    if (anyLink) {
      const m = anyLink.getAttribute('href').match(/\/time_entries\/(\d+)/i);
      if (m) return m[1];
    }
    return null;
  }

  /// <summary>
  /// Locates the comments cell (td) within a time entry table row.
  /// </summary>
  /// <param name="tr">The table row element.</param>
  /// <returns>The comment td element or null.</returns>
  function getCommentCell(tr) {
    const cell = tr.querySelector('td.comments');
    if (cell) return cell;

    const table = tr.closest('table');
    if (table) {
      const ths = Array.from(table.querySelectorAll('thead th, tr:first-child th'));
      const commentIndex = ths.findIndex(th =>
        th.classList.contains('comments') || /коментар|comment/i.test(th.textContent)
      );
      if (commentIndex !== -1 && tr.children[commentIndex]) {
        return tr.children[commentIndex];
      }
    }

    return null;
  }

  /// <summary>
  /// Gets the clean original comment text of a time entry row, caching it on data attribute.
  /// </summary>
  /// <param name="tr">The table row element.</param>
  /// <param name="td">The comments cell element.</param>
  /// <returns>Clean comment text.</returns>
  function getRowOriginalComment(tr, td) {
    if (tr.dataset.rttOriginalComment !== undefined) {
      return tr.dataset.rttOriginalComment;
    }
    const clone = td.cloneNode(true);
    const preview = clone.querySelector('.rtt-row-fr-container');
    if (preview) preview.remove();
    const text = clone.innerText.trim();
    tr.dataset.rttOriginalComment = text;
    return text;
  }

  /// <summary>
  /// Computes string replacement supporting plain text and regex with capture groups.
  /// </summary>
  /// <param name="originalComment">The existing comment string.</param>
  /// <param name="findStr">Search query or regex pattern.</param>
  /// <param name="replaceStr">Replacement string.</param>
  /// <param name="isRegex">Whether findStr is regular expression.</param>
  /// <param name="matchCase">Whether search is case-sensitive.</param>
  /// <returns>New replaced string, null if no match, or { error } object if syntax error.</returns>
  function computeReplacement(originalComment, findStr, replaceStr, isRegex, matchCase) {
    if (!findStr) return null;
    try {
      let regex;
      if (isRegex) {
        regex = new RegExp(findStr, matchCase ? 'g' : 'gi');
      } else {
        const escaped = escapeRegex(findStr);
        regex = new RegExp(escaped, matchCase ? 'g' : 'gi');
      }

      if (!regex.test(originalComment)) {
        return null;
      }

      regex.lastIndex = 0;
      if (isRegex) {
        const parsedReplace = replaceStr
          .replace(/\\n/g, '\n')
          .replace(/\\t/g, '\t');
        return originalComment.replace(regex, parsedReplace);
      } else {
        return originalComment.replace(regex, () => replaceStr);
      }
    } catch (err) {
      return { error: err.message };
    }
  }

  /// <summary>
  /// Updates a Redmine time entry's comment via local app proxy or native browser session.
  /// </summary>
  /// <param name="entryId">Redmine time entry ID.</param>
  /// <param name="newComment">New comment string.</param>
  async function updateTimeEntryComment(entryId, newComment) {
    let lastError = null;

    // 1. Primary method: Send request via local proxy
    try {
      const proxyHeaders = await getProxyCredentialHeaders(true);
      const proxyRes = await apiRequest(`http://localhost:3000/api/time_entries/${entryId}.json`, {
        method: 'PUT',
        headers: proxyHeaders,
        body: JSON.stringify({ time_entry: { comments: newComment } })
      });

      if (proxyRes !== undefined && proxyRes !== null) {
        return { ok: true };
      }
    } catch (proxyErr) {
      console.warn('[RTT] App proxy update failed, trying browser session methods...', proxyErr);
      lastError = proxyErr;
    }

    // 2. Fallback: Native Redmine form-encoded update using browser's active session
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      try {
        const formBody = new URLSearchParams();
        formBody.append('utf8', '✓');
        formBody.append('_method', 'put');
        formBody.append('authenticity_token', csrfToken);
        formBody.append('time_entry[comments]', newComment);

        const formRes = await fetch(`/time_entries/${entryId}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRF-Token': csrfToken
          },
          credentials: 'same-origin',
          body: formBody.toString()
        });

        const redirectedToLogin = formRes.redirected && /\/login/i.test(formRes.url || '');
        if (!redirectedToLogin && (formRes.ok || formRes.status === 200 || formRes.status === 302)) {
          return { ok: true };
        }
      } catch (formErr) {
        console.warn('[RTT] Direct form update failed, trying edit page fetch...', formErr);
        lastError = formErr;
      }
    }

    // 3. Fallback: Fetch entry edit form directly, extract authenticity token, and submit
    try {
      const editPageRes = await fetch(`/time_entries/${entryId}/edit`, {
        credentials: 'same-origin',
        headers: { 'Accept': 'text/html' }
      });
      const editRedirectedToLogin = editPageRes.redirected && /\/login/i.test(editPageRes.url || '');
      if (editPageRes.ok && !editRedirectedToLogin) {
        const html = await editPageRes.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const form = doc.querySelector('form[action*="/time_entries/"]');
        if (form) {
          const action = form.getAttribute('action') || `/time_entries/${entryId}`;
          const formData = new FormData(form);
          formData.set('time_entry[comments]', newComment);
          if (!formData.has('_method')) {
            formData.set('_method', 'put');
          }

          const res = await fetch(action, {
            method: 'POST',
            body: formData,
            credentials: 'same-origin'
          });

          const submitRedirectedToLogin = res.redirected && /\/login/i.test(res.url || '');
          if (!submitRedirectedToLogin && (res.ok || res.status === 200 || res.status === 302)) {
            return { ok: true };
          }
        }
      }
    } catch (editErr) {
      console.warn('[RTT] Edit form submit failed, trying same-origin JSON PUT...', editErr);
      lastError = editErr;
    }

    // 4. Fallback: Same-origin direct JSON PUT with CSRF token
    try {
      const jsonRes = await fetch(`/time_entries/${entryId}.json`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {})
        },
        credentials: 'same-origin',
        body: JSON.stringify({ time_entry: { comments: newComment } })
      });
      if (jsonRes.ok) {
        return { ok: true };
      }
    } catch (jsonErr) {
      console.warn('[RTT] Same-origin JSON PUT failed:', jsonErr);
      lastError = jsonErr;
    }

    const errorDetails = lastError?.message || 'Сървърът не отговори навреме';
    throw new Error(`Неуспешна замяна в отчет #${entryId}: ${errorDetails}. Уверете се, че приложението на localhost:3000 работи или че имате права за редакция в Redmine.`);
  }

  /// <summary>
  /// Displays an error message inside the Find & Replace panel error container.
  /// </summary>
  /// <param name="message">The error message string.</param>
  /// <param name="isHtml">Whether message is safe HTML.</param>
  function showPanelError(message, isHtml = false) {
    const errorEl = document.getElementById('rtt-fr-error');
    if (!errorEl) return;

    if (!message) {
      errorEl.style.display = 'none';
      errorEl.innerHTML = '';
      return;
    }

    errorEl.innerHTML = isHtml ? message : escapeHtml(message);
    errorEl.style.display = 'block';
  }

  /// <summary>
  /// Clears the Find & Replace panel error container.
  /// </summary>
  function clearPanelError() {
    const errorEl = document.getElementById('rtt-fr-error');
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.innerHTML = '';
    }
  }

  /// <summary>
  /// Saves current scroll position and find-replace panel query state into sessionStorage.
  /// </summary>
  function saveScrollAndState() {
    try {
      const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
      sessionStorage.setItem(STORAGE_SCROLL_KEY, String(scrollY));

      const findInput = document.getElementById('rtt-fr-find-input');
      const replaceInput = document.getElementById('rtt-fr-replace-input');
      const regexCheckbox = document.getElementById('rtt-fr-regex');
      const matchCaseCheckbox = document.getElementById('rtt-fr-match-case');

      if (findInput) {
        sessionStorage.setItem(
          STORAGE_STATE_KEY,
          JSON.stringify({
            isOpen: true,
            findText: findInput.value,
            replaceText: replaceInput ? replaceInput.value : '',
            isRegex: regexCheckbox ? regexCheckbox.checked : false,
            matchCase: matchCaseCheckbox ? matchCaseCheckbox.checked : false
          })
        );
      }
    } catch (e) {
      console.warn('[RTT] Could not save scroll/state to sessionStorage:', e);
    }
  }

  /// <summary>
  /// Restores preserved scroll position and find-replace panel state across page reloads.
  /// </summary>
  function restoreScrollAndState() {
    try {
      const savedScroll = sessionStorage.getItem(STORAGE_SCROLL_KEY);
      if (savedScroll !== null) {
        sessionStorage.removeItem(STORAGE_SCROLL_KEY);
        const y = parseFloat(savedScroll);
        if (!isNaN(y)) {
          window.scrollTo({ top: y, behavior: 'instant' });
          requestAnimationFrame(() => {
            window.scrollTo({ top: y, behavior: 'instant' });
            setTimeout(() => {
              window.scrollTo({ top: y, behavior: 'instant' });
            }, 60);
            setTimeout(() => {
              window.scrollTo({ top: y, behavior: 'instant' });
            }, 180);
          });
        }
      }

      const savedStateJson = sessionStorage.getItem(STORAGE_STATE_KEY);
      if (savedStateJson) {
        sessionStorage.removeItem(STORAGE_STATE_KEY);
        const state = JSON.parse(savedStateJson);
        if (state && state.isOpen) {
          openFindReplacePanel(state);
        }
      }
    } catch (e) {
      console.warn('[RTT] Could not restore scroll/state:', e);
    }
  }

  /// <summary>
  /// Renders or updates the in-row preview container for a matching time entry.
  /// </summary>
  /// <param name="tr">The table row.</param>
  /// <param name="td">The comment td.</param>
  /// <param name="rowId">The time entry ID.</param>
  /// <param name="newComment">The computed replacement text.</param>
  function renderRowPreview(tr, td, rowId, newComment) {
    tr.classList.add('rtt-matched-row');

    let container = td.querySelector('.rtt-row-fr-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'rtt-row-fr-container';
      td.appendChild(container);
    }

    const safeDisplay = newComment
      ? escapeHtml(newComment).replace(/\n/g, '<span style="opacity:0.6;font-weight:bold;">↵</span> ')
      : '<em style="opacity:0.5;">(празен коментар)</em>';

    container.innerHTML = `
      <div class="rtt-row-fr-diff" title="Нов текст: ${escapeHtml(newComment)}">
        <span class="rtt-diff-label">Замяна:</span>
        <span class="rtt-diff-arrow">➜</span>
        <span class="rtt-diff-val">${safeDisplay}</span>
      </div>
      <button type="button" class="rtt-row-fr-btn">Замени</button>
    `;

    const replaceBtn = container.querySelector('.rtt-row-fr-btn');
    replaceBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      executeRowReplace(tr, rowId, newComment);
    });
  }

  /// <summary>
  /// Removes preview diff and highlight from a table row.
  /// </summary>
  /// <param name="tr">The table row.</param>
  /// <param name="td">The comment td.</param>
  function clearRowPreview(tr, td) {
    tr.classList.remove('rtt-matched-row');
    const container = td ? td.querySelector('.rtt-row-fr-container') : null;
    if (container) {
      container.remove();
    }
  }

  /// <summary>
  /// Executes a single row comment replacement, preserves scroll and reloads.
  /// </summary>
  /// <param name="tr">The table row element.</param>
  /// <param name="rowId">The time entry ID.</param>
  /// <param name="newComment">The new comment text.</param>
  async function executeRowReplace(tr, rowId, newComment) {
    const btn = tr.querySelector('.rtt-row-fr-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Запазване...';
    }
    clearPanelError();

    try {
      await updateTimeEntryComment(rowId, newComment);
      saveScrollAndState();
      window.location.reload();
    } catch (err) {
      console.error('[RTT] Error updating time entry:', err);
      showPanelError(err.message || String(err));
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Замени';
      }
    }
  }

  /// <summary>
  /// Executes batch comment replacement for all matching time entries.
  /// </summary>
  /// <param name="matches">Array of match objects { rowId, newComment }.</param>
  async function executeReplaceAll(matches) {
    if (!matches || !matches.length) return;
    const confirmed = window.confirm(
      `Сигурни ли сте, че искате да замените коментарите в ${matches.length} отчета?`
    );
    if (!confirmed) return;

    const replaceAllBtn = document.getElementById('rtt-fr-replace-all-btn');
    if (replaceAllBtn) {
      replaceAllBtn.disabled = true;
      replaceAllBtn.textContent = `Замяна 0/${matches.length}...`;
    }
    clearPanelError();

    let successCount = 0;
    const failedIds = [];

    for (let i = 0; i < matches.length; i++) {
      const { rowId, newComment } = matches[i];
      if (replaceAllBtn) {
        replaceAllBtn.textContent = `Замяна ${i + 1}/${matches.length}...`;
      }
      try {
        await updateTimeEntryComment(rowId, newComment);
        successCount++;
      } catch (err) {
        console.error(`[RTT] Failed to update time entry #${rowId}:`, err);
        failedIds.push(rowId);
      }
    }

    if (failedIds.length > 0) {
      showPanelError(`Заменени бяха ${successCount} от ${matches.length} отчета, но възникна грешка при отчети #${failedIds.join(', #')}.`);
      if (replaceAllBtn) {
        replaceAllBtn.disabled = false;
        replaceAllBtn.textContent = `Замени всички (${matches.length})`;
      }
      if (successCount > 0) {
        saveScrollAndState();
        setTimeout(() => window.location.reload(), 1500);
      }
      return;
    }

    saveScrollAndState();
    window.location.reload();
  }

  /// <summary>
  /// Scans time entry table rows, evaluates matches, and updates the preview UI and badge count.
  /// </summary>
  function updateMatches() {
    const findInput = document.getElementById('rtt-fr-find-input');
    const replaceInput = document.getElementById('rtt-fr-replace-input');
    const regexCheckbox = document.getElementById('rtt-fr-regex');
    const matchCaseCheckbox = document.getElementById('rtt-fr-match-case');
    const badge = document.getElementById('rtt-fr-badge');
    const replaceAllBtn = document.getElementById('rtt-fr-replace-all-btn');

    if (!findInput || !replaceInput || !badge) return;

    const findStr = findInput.value;
    const replaceStr = replaceInput.value;
    const isRegex = Boolean(regexCheckbox && regexCheckbox.checked);
    const matchCase = Boolean(matchCaseCheckbox && matchCaseCheckbox.checked);

    clearPanelError();
    findInput.classList.remove('rtt-input-invalid');

    const rows = Array.from(
      document.querySelectorAll('table.time-entries tbody tr, table.list.time-entries tbody tr, tr.time-entry, tr[id^="time_entry-"]')
    ).filter(tr => !tr.classList.contains('total-hours') && !tr.classList.contains('group'));

    currentFrMatches = [];

    if (!findStr) {
      rows.forEach(tr => {
        const td = getCommentCell(tr);
        clearRowPreview(tr, td);
      });
      badge.textContent = '0 съвпадения';
      badge.classList.remove('rtt-has-matches');
      if (replaceAllBtn) {
        replaceAllBtn.disabled = true;
        replaceAllBtn.textContent = 'Замени всички';
      }
      return;
    }

    if (isRegex) {
      try {
        new RegExp(findStr, matchCase ? 'g' : 'gi');
      } catch (err) {
        findInput.classList.add('rtt-input-invalid');

        const rawMsg = err.message || 'Синтактична грешка в регулярния израз';
        const cleanedMsg = rawMsg.replace(/^Invalid regular expression:\s*/i, '');

        let friendlyExplanation = cleanedMsg;
        if (/unterminated character class/i.test(cleanedMsg)) {
          friendlyExplanation = 'Има незатворен клас от символи [...] в регулярния израз.';
        } else if (/unterminated group/i.test(cleanedMsg)) {
          friendlyExplanation = 'Има незатворена група (...) в регулярния израз.';
        } else if (/nothing to repeat/i.test(cleanedMsg)) {
          friendlyExplanation = 'Липсва символ или група преди квантификатора (?, *, +).';
        } else if (/\\ at end of pattern/i.test(cleanedMsg)) {
          friendlyExplanation = 'Има единична обратна наклонена черта \\ в края на израза.';
        } else if (/numbers out of order/i.test(cleanedMsg)) {
          friendlyExplanation = 'Числата в квантификатора {min,max} са в обратен ред.';
        }

        showPanelError(`Грешка в регулярния израз: <strong>${escapeHtml(friendlyExplanation)}</strong><div style="margin-top:3px;font-family:monospace;font-size:11px;opacity:0.85;">${escapeHtml(cleanedMsg)}</div>`, true);

        rows.forEach(tr => {
          const td = getCommentCell(tr);
          clearRowPreview(tr, td);
        });
        badge.textContent = 'Невалиден израз';
        badge.classList.remove('rtt-has-matches');
        if (replaceAllBtn) {
          replaceAllBtn.disabled = true;
          replaceAllBtn.textContent = 'Замени всички';
        }
        return;
      }
    }

    let firstReplacementError = null;

    rows.forEach(tr => {
      const rowId = extractTimeEntryId(tr);
      const td = getCommentCell(tr);
      if (!rowId || !td) {
        clearRowPreview(tr, td);
        return;
      }

      const originalComment = getRowOriginalComment(tr, td);
      const replacementResult = computeReplacement(originalComment, findStr, replaceStr, isRegex, matchCase);

      if (replacementResult && typeof replacementResult === 'object' && replacementResult.error) {
        if (!firstReplacementError) {
          firstReplacementError = replacementResult.error;
        }
        clearRowPreview(tr, td);
        return;
      }

      if (replacementResult != null && typeof replacementResult === 'string') {
        currentFrMatches.push({
          rowId,
          tr,
          td,
          originalComment,
          newComment: replacementResult
        });
        renderRowPreview(tr, td, rowId, replacementResult);
      } else {
        clearRowPreview(tr, td);
      }
    });

    if (firstReplacementError) {
      showPanelError(`Грешка при замяна: ${firstReplacementError}`);
    }

    const matchCount = currentFrMatches.length;
    if (matchCount > 0) {
      badge.textContent = `${matchCount} съвпадение${matchCount === 1 ? '' : 'я'}`;
      badge.classList.add('rtt-has-matches');
      if (replaceAllBtn) {
        replaceAllBtn.disabled = false;
        replaceAllBtn.textContent = `Замени всички (${matchCount})`;
      }
    } else {
      badge.textContent = 'Няма съвпадения';
      badge.classList.remove('rtt-has-matches');
      if (replaceAllBtn) {
        replaceAllBtn.disabled = true;
        replaceAllBtn.textContent = 'Замени всички';
      }
    }
  }

  /// <summary>
  /// Opens and docks the Find & Replace panel above the time entries list.
  /// </summary>
  /// <param name="initialState">Optional saved state to restore.</param>
  function openFindReplacePanel(initialState = {}) {
    let panel = document.getElementById(FR_PANEL_ID);
    const triggerBtn = document.getElementById(FR_TRIGGER_BTN_ID);

    if (panel) {
      const findInput = document.getElementById('rtt-fr-find-input');
      if (findInput) findInput.focus();
      return;
    }

    panel = document.createElement('div');
    panel.id = FR_PANEL_ID;
    panel.className = `rtt-fr-panel ${isDarkTheme() ? 'rtt-dark' : ''}`;

    panel.innerHTML = `
      <div class="rtt-fr-header">
        <div class="rtt-fr-title-group">
          <span class="rtt-fr-title">Търсене и замяна в отчетите</span>
          <span id="rtt-fr-badge" class="rtt-fr-badge">0 съвпадения</span>
        </div>
        <button type="button" id="rtt-fr-close-btn" class="rtt-fr-close-btn" title="Затвори панела">✕</button>
      </div>

      <div id="rtt-fr-error" class="rtt-fr-error" style="display: none;"></div>

      <div class="rtt-fr-inputs-grid">
        <div class="rtt-fr-input-group">
          <label for="rtt-fr-find-input">Търси текст или регулярен израз:</label>
          <input type="text" id="rtt-fr-find-input" class="rtt-fr-input" placeholder="Въведете текст или регулярен израз за търсене..." autocomplete="off">
        </div>
        <div class="rtt-fr-input-group">
          <label for="rtt-fr-replace-input">Замени с:</label>
          <input type="text" id="rtt-fr-replace-input" class="rtt-fr-input" placeholder="Въведете заместващия текст (може да използвате $1 и $2 за групи)..." autocomplete="off">
        </div>
      </div>

      <div class="rtt-fr-controls-row">
        <div class="rtt-fr-checkboxes">
          <label class="rtt-fr-checkbox-label">
            <input type="checkbox" id="rtt-fr-regex"> Регулярен израз
          </label>
          <label class="rtt-fr-checkbox-label">
            <input type="checkbox" id="rtt-fr-match-case"> Различавай главни и малки букви
          </label>
        </div>

        <div class="rtt-fr-actions">
          <button type="button" id="rtt-fr-clear-btn" class="rtt-fr-btn rtt-fr-btn-secondary">Изчисти</button>
          <button type="button" id="rtt-fr-replace-all-btn" class="rtt-fr-btn rtt-fr-btn-primary" disabled>Замени всички</button>
        </div>
      </div>
    `;

    const target = document.querySelector('#query_form, .autoscroll, table.time-entries, #content');
    if (target) {
      target.parentNode.insertBefore(panel, target);
    } else {
      document.body.prepend(panel);
    }

    if (triggerBtn) {
      triggerBtn.classList.add('rtt-active');
    }

    const closeBtn = document.getElementById('rtt-fr-close-btn');
    const clearBtn = document.getElementById('rtt-fr-clear-btn');
    const replaceAllBtn = document.getElementById('rtt-fr-replace-all-btn');
    const findInput = document.getElementById('rtt-fr-find-input');
    const replaceInput = document.getElementById('rtt-fr-replace-input');
    const regexCheckbox = document.getElementById('rtt-fr-regex');
    const matchCaseCheckbox = document.getElementById('rtt-fr-match-case');

    if (closeBtn) {
      closeBtn.addEventListener('click', closeFindReplacePanel);
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (findInput) findInput.value = '';
        if (replaceInput) replaceInput.value = '';
        if (regexCheckbox) regexCheckbox.checked = false;
        if (matchCaseCheckbox) matchCaseCheckbox.checked = false;
        updateMatches();
        if (findInput) findInput.focus();
      });
    }

    if (replaceAllBtn) {
      replaceAllBtn.addEventListener('click', () => {
        executeReplaceAll(currentFrMatches);
      });
    }

    [findInput, replaceInput].forEach(input => {
      if (input) {
        input.addEventListener('input', updateMatches);
      }
    });

    [regexCheckbox, matchCaseCheckbox].forEach(chk => {
      if (chk) {
        chk.addEventListener('change', updateMatches);
      }
    });

    if (initialState) {
      if (initialState.findText && findInput) findInput.value = initialState.findText;
      if (initialState.replaceText && replaceInput) replaceInput.value = initialState.replaceText;
      if (initialState.isRegex && regexCheckbox) regexCheckbox.checked = true;
      if (initialState.matchCase && matchCaseCheckbox) matchCaseCheckbox.checked = true;
      updateMatches();
    }

    if (findInput) {
      findInput.focus();
      findInput.select();
    }
  }

  /// <summary>
  /// Closes the Find & Replace panel and clears all row previews and highlights.
  /// </summary>
  function closeFindReplacePanel() {
    const panel = document.getElementById(FR_PANEL_ID);
    if (panel) {
      panel.remove();
    }

    const triggerBtn = document.getElementById(FR_TRIGGER_BTN_ID);
    if (triggerBtn) {
      triggerBtn.classList.remove('rtt-active');
    }

    const rows = Array.from(
      document.querySelectorAll('table.time-entries tbody tr, table.list.time-entries tbody tr, tr.time-entry, tr[id^="time_entry-"]')
    );
    rows.forEach(tr => {
      const td = getCommentCell(tr);
      clearRowPreview(tr, td);
    });

    currentFrMatches = [];
    try {
      sessionStorage.removeItem(STORAGE_STATE_KEY);
    } catch {}
  }

  /// <summary>
  /// Injects the trigger button on spent time pages and restores state if preserved.
  /// </summary>
  function initTimeEntriesFindReplace() {
    if (document.getElementById(FR_TRIGGER_BTN_ID)) return;

    const triggerBtn = document.createElement('button');
    triggerBtn.id = FR_TRIGGER_BTN_ID;
    triggerBtn.type = 'button';
    triggerBtn.className = 'rtt-fr-trigger-btn';
    triggerBtn.innerHTML = `${SVG_ICONS.search} <span>Търсене и замяна</span>`;
    triggerBtn.title = 'Отворете панела за търсене и замяна в коментарите на отчетите.';

    triggerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const panel = document.getElementById(FR_PANEL_ID);
      if (panel) {
        closeFindReplacePanel();
      } else {
        openFindReplacePanel();
      }
    });

    const contextual = document.querySelector('#content > .contextual, .contextual');
    if (contextual) {
      contextual.insertBefore(triggerBtn, contextual.firstChild);
    } else {
      const target = document.querySelector('#query_form, .autoscroll, table.time-entries, #content');
      if (target) {
        const wrapper = document.createElement('div');
        wrapper.className = 'rtt-fr-fallback-wrapper';
        wrapper.appendChild(triggerBtn);
        target.parentNode.insertBefore(wrapper, target);
      }
    }

    restoreScrollAndState();
  }

  /// <summary>
  /// Initializes the issue timer polling and event listeners on issue pages.
  /// </summary>
  /// <param name="issueId">The current issue ID.</param>
  async function initIssueTimer(issueId) {
    removeButton();

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local && chrome.runtime?.id) {
      try {
        const items = await chrome.storage.local.get({ extensionEnabled: true });
        isEnabled = items.extensionEnabled !== false;
        if (isEnabled) {
          await pollTimer(issueId);
          pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
        }

        storageChangeListener = (changes, area) => {
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
        };
        chrome.storage.onChanged.addListener(storageChangeListener);
      } catch {
        await pollTimer(issueId);
        pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
      }
    } else {
      await pollTimer(issueId);
      pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
    }
  }

  // Register cleanup hook for safe re-injection upon extension update or reload
  window.__rttCleanup = () => {
    if (pollIntervalId) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    if (storageChangeListener && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      try {
        chrome.storage.onChanged.removeListener(storageChangeListener);
      } catch {}
      storageChangeListener = null;
    }
    removeButton();
    closeModal();
    closeFindReplacePanel();
    const triggerBtn = document.getElementById(FR_TRIGGER_BTN_ID);
    if (triggerBtn) triggerBtn.remove();
    document.querySelectorAll('.rtt-fr-fallback-wrapper').forEach((el) => el.remove());
  };

  /// <summary>
  /// Main initialization router: runs issue timer on issue pages and find/replace on time entries.
  /// </summary>
  async function init() {
    const issueId = getIssueId();
    if (issueId) {
      await initIssueTimer(issueId);
    }

    if (isTimeEntriesPage()) {
      initTimeEntriesFindReplace();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
