/**
 * Content script injected into Redmine issue pages.
 * Integrates interactive timer controls, status change prompts on start,
 * and activity description prompts on stop.
 */

(function () {
  'use strict';

  const TIMER_API_BASE = 'http://localhost:3000/timer';
  const BUTTON_CONTAINER_ID = 'rtt-injected-timer-button';
  const MODAL_CONTAINER_ID = 'rtt-modal-container';
  let pollIntervalId = null;
  let isEnabled = true;
  let cachedStatuses = null;

  // Clean vector SVG icons (replaces Unicode cartoon emoticons)
  const SVG_ICONS = {
    play: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><path d="M6 4l15 8-15 8V4z"/></svg>',
    stop: '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="vertical-align: -1px;"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    clock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    alert: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -2px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    switch: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: -1px;"><path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/></svg>'
  };

  /**
   * Formats elapsed seconds into HH:MM:SS or MM:SS string.
   * 
   * @param {number} totalSeconds Total seconds elapsed.
   * @returns {string} Formatted time string.
   */
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

  /**
   * Extracts the current Redmine issue ID from the URL.
   * 
   * @returns {string|null} The issue ID, or null if not an issue page.
   */
  function getIssueId() {
    const match = window.location.pathname.match(/\/issues\/(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
    return null;
  }

  /**
   * Extracts the issue subject from the Redmine page DOM.
   * 
   * @returns {string} The subject text.
   */
  function getIssueSubject() {
    const subjectEl = document.querySelector('div.subject h3') ||
                      document.querySelector('#content > h2') ||
                      document.querySelector('h2.inline-flex');
    if (subjectEl) {
      return subjectEl.innerText.trim();
    }
    return document.title.replace(/^[^:]+:\s*/, '').trim();
  }

  /**
   * Extracts the project name from the Redmine page DOM.
   * 
   * @returns {string} The project name.
   */
  function getProjectName() {
    const projectEl = document.querySelector('#header h1') ||
                      document.querySelector('.current-project') ||
                      document.querySelector('#project-menu');
    if (projectEl) {
      return projectEl.innerText.trim();
    }
    return '';
  }

  /**
   * Retrieves the Redmine CSRF token from meta tags or forms.
   * 
   * @returns {string} The CSRF token value.
   */
  function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.getAttribute('content') || '';
    const input = document.querySelector('input[name="authenticity_token"]');
    if (input) return input.value || '';
    return '';
  }

  /**
   * Executes an HTTP request via the extension background service worker.
   * Bypasses Chrome Mixed Content (HTTPS -> HTTP) and Private Network Access restrictions.
   * 
   * @param {string} url The target URL.
   * @param {RequestInit} [options={}] Fetch request options.
   * @returns {Promise<any>} The parsed JSON or text response.
   */
  function apiRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: 'API_REQUEST',
            url,
            options
          },
          (response) => {
            if (chrome.runtime.lastError) {
              return reject(new Error(chrome.runtime.lastError.message));
            }
            if (!response) {
              return reject(new Error('Няма отговор от background скрипта'));
            }
            if (!response.ok) {
              return reject(new Error(response.error || `HTTP ${response.status}: ${response.statusText}`));
            }
            resolve(response.data);
          }
        );
      } else {
        fetch(url, options)
          .then(async (res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
          })
          .then(resolve)
          .catch(reject);
      }
    });
  }

  /**
   * Fetches available issue statuses from Redmine via local proxy API to ensure authentication.
   * 
   * @returns {Promise<Array<{id: number, name: string}>>} List of statuses.
   */
  async function getRedmineStatuses() {
    if (cachedStatuses && cachedStatuses.length > 0) {
      return cachedStatuses;
    }

    try {
      // Query through local proxy which attaches configured API key and avoids browser basic auth prompt
      const data = await apiRequest('http://localhost:3000/api/issue_statuses.json');
      if (data && Array.isArray(data.issue_statuses) && data.issue_statuses.length > 0) {
        cachedStatuses = data.issue_statuses;
        return cachedStatuses;
      }
    } catch {
      // Ignore proxy errors and proceed to fallback
    }

    // Try parsing select in edit form if already rendered in DOM
    const select = document.getElementById('issue_status_id');
    if (select) {
      const statuses = Array.from(select.options)
        .filter(opt => opt.value)
        .map(opt => ({ id: Number(opt.value), name: opt.text }));
      if (statuses.length > 0) {
        cachedStatuses = statuses;
        return cachedStatuses;
      }
    }

    return [
      { id: 2, name: 'В процес на изпълнение (In Progress)' },
      { id: 1, name: 'Нова (New)' },
      { id: 3, name: 'Решена (Resolved)' },
      { id: 4, name: 'Обратна връзка (Feedback)' }
    ];
  }

  /**
   * Updates an issue's status in Redmine using the local proxy API.
   * 
   * @param {string} issueId The issue ID.
   * @param {number|string} statusId The new status ID.
   */
  async function updateIssueStatus(issueId, statusId) {
    if (!statusId) return;
    try {
      await apiRequest(`http://localhost:3000/api/issues/${issueId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue: { status_id: Number(statusId) } })
      });
    } catch (e) {
      console.warn('Could not update status via proxy:', e);
    }
  }

  /**
   * Closes any open modal dialog.
   */
  function closeModal() {
    const existing = document.getElementById(MODAL_CONTAINER_ID);
    if (existing) {
      existing.remove();
    }
  }

  /**
   * Detects whether the current Redmine page is using a dark theme.
   * 
   * @returns {boolean} True if dark background is detected.
   */
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
    } catch {}
    return false;
  }

  /**
   * Displays the modal asking whether to change the issue status before starting the timer.
   * 
   * @param {string} issueId The current issue ID.
   * @param {string} subject The issue subject.
   * @param {string} project The project name.
   * @param {HTMLElement} btn The button element to update.
   */
  async function showStartModal(issueId, subject, project, btn) {
    closeModal();
    const statuses = await getRedmineStatuses();

    const overlay = document.createElement('div');
    overlay.id = MODAL_CONTAINER_ID;
    overlay.className = `rtt-modal-overlay ${isDarkTheme() ? 'rtt-dark' : 'rtt-light'}`;

    let optionsHtml = '<option value="">-- Не променяй статуса --</option>';
    statuses.forEach(s => {
      // Pre-select 'In Progress' if available
      const isDefault = /in\s*progress|в\s*процес/i.test(s.name);
      optionsHtml += `<option value="${s.id}" ${isDefault ? 'selected' : ''}>${s.name}</option>`;
    });

    overlay.innerHTML = `
      <div class="ui-dialog ui-corner-all ui-widget ui-widget-content rtt-modal-dialog" role="dialog">
        <div class="ui-dialog-titlebar ui-corner-all ui-widget-header ui-helper-clearfix rtt-modal-header">
          <span class="ui-dialog-title">Стартиране на таймер</span>
          <a href="javascript:void(0)" class="ui-dialog-titlebar-close rtt-modal-close" id="rtt-close-btn" title="Затвори">&times;</a>
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
            <a href="javascript:void(0)" id="rtt-cancel-start-btn" class="button-cancel">Отказ</a>
          </p>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    document.getElementById('rtt-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('rtt-cancel-start-btn')?.addEventListener('click', closeModal);

    document.getElementById('rtt-confirm-start-btn')?.addEventListener('click', async () => {
      const select = document.getElementById('rtt-status-select');
      const chosenStatusId = select ? select.value : '';

      closeModal();

      // If status selected, update in Redmine via proxy
      if (chosenStatusId) {
        await updateIssueStatus(issueId, chosenStatusId);
      }

      // Start timer on proxy server
      try {
        const data = await apiRequest(`${TIMER_API_BASE}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            issueId: issueId,
            issueSubject: subject,
            projectName: project
          })
        });

        if (data && data.timer) {
          updateButtonUI(btn, data.timer, issueId);
        }
      } catch (err) {
        console.error('Failed to start timer:', err);
      }
    });
  }

  /**
   * Displays the modal asking for an activity note before stopping the timer.
   * 
   * @param {string} issueId The current issue ID.
   * @param {string} subject The issue subject.
   * @param {number} elapsedSeconds Total elapsed seconds.
   * @param {HTMLElement} btn The button element to update.
   */
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
          <a href="javascript:void(0)" class="ui-dialog-titlebar-close rtt-modal-close" id="rtt-close-btn" title="Затвори">&times;</a>
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
            <a href="javascript:void(0)" id="rtt-cancel-stop-btn" class="button-cancel">Отказ</a>
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

    document.getElementById('rtt-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('rtt-cancel-stop-btn')?.addEventListener('click', closeModal);

    const handleStop = async (noteText) => {
      closeModal();
      try {
        const data = await apiRequest(`${TIMER_API_BASE}/stop`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: noteText })
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

  /**
   * Finds the most appropriate container in Redmine to inject the tracking button.
   * 
   * @returns {HTMLElement|null} The container element.
   */
  function findActionToolbar() {
    return document.querySelector('#content > .contextual') ||
           document.querySelector('.contextual') ||
           document.querySelector('#content');
  }

  /**
   * Removes the injected timer button from the DOM.
   */
  function removeButton() {
    const existing = document.getElementById(BUTTON_CONTAINER_ID);
    if (existing) existing.remove();
  }

  /**
   * Updates the button visuals based on the timer response from the proxy server.
   * 
   * @param {HTMLElement} btn The button element to update.
   * @param {object|null} timerState The timer status object or null if offline.
   * @param {string} issueId The current issue ID.
   */
  function updateButtonUI(btn, timerState, issueId) {
    if (!timerState) {
      btn.className = 'rtt-action-button rtt-button-offline';
      btn.innerHTML = `${SVG_ICONS.alert} <span>Таймерът е офлайн</span>`;
      btn.title = 'Сървърът на http://localhost:3000 не отговаря. Стартирайте го с npm run proxy';
      return;
    }

    const isRunning = Boolean(timerState.isRunning);
    const isThisIssue = String(timerState.issueId) === String(issueId);

    if (isRunning && isThisIssue) {
      const now = Date.now();
      const sessionMs = timerState.startTime ? Math.max(0, now - timerState.startTime) : 0;
      const totalSec = Math.floor(((timerState.elapsedMs || 0) + sessionMs) / 1000);
      const formatted = formatSeconds(totalSec);

      btn.className = 'rtt-action-button rtt-button-running';
      btn.innerHTML = `<span class="rtt-pulse-dot rtt-pulse-dot-active"></span> <span class="rtt-time-text">${formatted}</span> <span class="rtt-divider">|</span> <span class="rtt-stop-text">Спри</span>`;
      btn.title = 'Кликнете, за да спрете отчитането на време за тази задача.';
    } else if (isRunning && !isThisIssue) {
      btn.className = 'rtt-action-button rtt-button-switch';
      btn.innerHTML = `${SVG_ICONS.switch} <span>Стартирай тук (#${timerState.issueId})</span>`;
      btn.title = `В момента се отчита задача #${timerState.issueId}. Кликнете, за да превключите към тази задача.`;
    } else {
      btn.className = 'rtt-action-button rtt-button-start';
      btn.innerHTML = `${SVG_ICONS.play} <span>Стартирай таймер</span>`;
      btn.title = 'Кликнете, за да стартирате таймера за тази задача.';
    }
  }

  /**
   * Injects or retrieves the tracking button on the Redmine issue page.
   * 
   * @param {string} issueId The current issue ID.
   * @returns {HTMLElement|null} The button element.
   */
  function ensureButton(issueId) {
    let btn = document.getElementById(BUTTON_CONTAINER_ID);
    if (btn) return btn;

    const toolbar = findActionToolbar();
    if (!toolbar) return null;

    btn = document.createElement('a');
    btn.id = BUTTON_CONTAINER_ID;
    btn.className = 'rtt-action-button rtt-button-start';
    btn.innerHTML = `${SVG_ICONS.clock} <span>Таймер...</span>`;
    btn.href = 'javascript:void(0)';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      try {
        const currentState = await apiRequest(TIMER_API_BASE);

        const isRunningThis = currentState?.isRunning && String(currentState?.issueId) === String(issueId);

        if (isRunningThis) {
          // Trigger Stop Modal asking what was done
          const now = Date.now();
          const sessionMs = currentState.startTime ? Math.max(0, now - currentState.startTime) : 0;
          const totalSec = Math.floor(((currentState.elapsedMs || 0) + sessionMs) / 1000);
          showStopModal(issueId, getIssueSubject(), totalSec, btn);
        } else {
          // Trigger Start Modal asking whether to change status
          showStartModal(issueId, getIssueSubject(), getProjectName(), btn);
        }
      } catch (err) {
        console.error('Redmine Time Tracker Error:', err);
        updateButtonUI(btn, null, issueId);
      }
    });

    if (toolbar.firstChild) {
      toolbar.insertBefore(btn, toolbar.firstChild);
    } else {
      toolbar.appendChild(btn);
    }

    return btn;
  }

  /**
   * Polls the timer proxy server to keep the button label and timer counter updated.
   * 
   * @param {string} issueId The current issue ID.
   */
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

  /**
   * Initializes the content script, observing settings and starting polling.
   */
  function init() {
    const issueId = getIssueId();
    if (!issueId) return;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get({ extensionEnabled: true }, (items) => {
        isEnabled = items.extensionEnabled !== false;
        if (isEnabled) {
          pollTimer(issueId);
          pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
        }
      });

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
    } else {
      pollTimer(issueId);
      pollIntervalId = setInterval(() => pollTimer(issueId), 1000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
