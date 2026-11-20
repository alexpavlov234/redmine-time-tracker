/// <summary>
/// Script controlling the Chrome extension popup dialog.
/// Allows toggling Redmine toolbar injection, configuring Redmine connection,
/// starting a quick timer without a task, and viewing/stopping the active timer.
/// </summary>

document.addEventListener('DOMContentLoaded', async () => {
  const TIMER_API_BASE = 'http://localhost:3000/timer';
  const CONFIG_API_BASE = 'http://localhost:3000/config';

  const toggleEl = document.getElementById('toggle-enabled');
  const serverStatusEl = document.getElementById('server-status');
  const timerStateLabel = document.getElementById('timer-state-label');
  const activeTaskContent = document.getElementById('active-task-content');

  const redmineUrlInput = document.getElementById('cfg-redmine-url');
  const apiKeyInput = document.getElementById('cfg-api-key');
  const saveConfigBtn = document.getElementById('btn-save-config');
  const saveStatusEl = document.getElementById('cfg-save-status');

  const SVG_PLAY = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l15 8-15 8V4z"/></svg>';
  const SVG_STOP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';

  /// <summary>
  /// Escapes unsafe characters before inserting dynamic text into HTML.
  /// </summary>
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
  /// Displays inline save feedback below the settings form.
  /// </summary>
  function showSaveStatus(message, isWarning = false) {
    if (!saveStatusEl) return;
    saveStatusEl.textContent = message;
    saveStatusEl.className = isWarning ? 'save-status is-warning' : 'save-status';
    saveStatusEl.style.display = 'block';
    setTimeout(() => {
      saveStatusEl.style.display = 'none';
    }, 3500);
  }

  /// <summary>
  /// Performs a fetch call to localhost:3000 with automatic 127.0.0.1 fallback.
  /// </summary>
  /// <param name="url">Target URL.</param>
  /// <param name="options">Fetch options.</param>
  /// <returns>The Response object.</returns>
  async function fetchWithFallback(url, options = {}) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (url.includes('http://localhost:3000')) {
        const fallbackUrl = url.replace('http://localhost:3000', 'http://127.0.0.1:3000');
        return await fetch(fallbackUrl, options);
      }
      throw err;
    }
  }

  /// <summary>
  /// Formats elapsed seconds into HH:MM:SS or MM:SS format.
  /// </summary>
  /// <param name="totalSeconds">Total seconds elapsed.</param>
  /// <returns>Formatted string.</returns>
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

  // Load and bind toggle preference
  if (chrome?.storage?.local) {
    try {
      const data = await chrome.storage.local.get({ extensionEnabled: true, redmineUrl: '', redmineApiKey: '' });
      if (toggleEl) toggleEl.checked = data.extensionEnabled !== false;
      if (data.redmineUrl && redmineUrlInput) redmineUrlInput.value = data.redmineUrl;
      if (data.redmineApiKey && apiKeyInput) apiKeyInput.value = data.redmineApiKey;
    } catch {
      // Ignore storage read errors
    }

    if (toggleEl) {
      toggleEl.addEventListener('change', async () => {
        try {
          await chrome.storage.local.set({ extensionEnabled: toggleEl.checked });
        } catch {
          // Ignore storage write errors
        }
      });
    }
  }

  // Load server config if available
  (async () => {
    try {
      const res = await fetchWithFallback(CONFIG_API_BASE);
      if (res.ok) {
        const cfg = await res.json();
        if (cfg && cfg.redmineUrl && redmineUrlInput && !redmineUrlInput.value) {
          redmineUrlInput.value = cfg.redmineUrl;
        }
      }
    } catch {
      // Server may be offline
    }
  })();

  // Save config handler
  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
      const redmineUrl = redmineUrlInput ? redmineUrlInput.value.replace(/\/+$/, '').trim() : '';
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
      if (redmineUrlInput) redmineUrlInput.value = redmineUrl;

      if (chrome?.storage?.local) {
        try {
          await chrome.storage.local.set({ redmineUrl, redmineApiKey: apiKey });
        } catch {
          // Ignore storage errors
        }
      }

      try {
        const res = await fetchWithFallback(CONFIG_API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redmineUrl, apiKey }),
        });
        if (!res.ok) {
          throw new Error('Server rejected config');
        }
        showSaveStatus('Настройките бяха запазени успешно!', false);
      } catch {
        showSaveStatus(
          'Настройките бяха запазени локално в разширението, но локалният сървър на порт 3000 все още не отговаря.',
          true
        );
      }
    });
  }

  let renderedIssueKey = null;

  /// <summary>
  /// Fetches current timer state and refreshes the popup interface without destroying interactive buttons every second.
  /// </summary>
  async function refreshTimer() {
    try {
      const res = await fetchWithFallback(TIMER_API_BASE);
      if (!res.ok) throw new Error('Server error');

      const data = await res.json();
      serverStatusEl.textContent = 'Свързан';
      serverStatusEl.className = 'badge badge-online';

      if (data && data.isRunning) {
        timerStateLabel.textContent = 'Активен таймер';
        const formatted = formatSeconds(data.currentElapsedSeconds || 0);
        const hasIssueId = data.issueId !== null && data.issueId !== undefined && String(data.issueId).trim() !== '';
        const currentKey = `running_${hasIssueId ? data.issueId : 'notask'}`;

        if (renderedIssueKey === currentKey) {
          const displayEl = activeTaskContent.querySelector('.timer-display');
          if (displayEl) {
            displayEl.textContent = formatted;
            return;
          }
        }

        renderedIssueKey = currentKey;
        const safeSubject = escapeHtml(data.issueSubject || '');
        const safeProject = escapeHtml(data.projectName || '');
        const taskHeading = hasIssueId
          ? `#${escapeHtml(data.issueId)} - ${safeSubject || 'Задача'}`
          : `${safeSubject || 'Работа без задача'}`;

        activeTaskContent.innerHTML = `
          <div class="timer-task" title="${safeSubject}">
            ${taskHeading}
          </div>
          <div class="timer-project">${safeProject}</div>
          <div class="timer-display">${formatted}</div>
          <button id="popup-stop-btn" class="btn btn-stop" type="button">
            ${SVG_STOP}
            <span>Спри отчитането</span>
          </button>
        `;

        const stopBtn = document.getElementById('popup-stop-btn');
        if (stopBtn) {
          stopBtn.addEventListener('click', async () => {
            stopBtn.disabled = true;
            try {
              await fetchWithFallback(`${TIMER_API_BASE}/stop`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
              });
              await refreshTimer();
            } catch {
              // Ignore and re-enable button so user can retry
            } finally {
              if (document.body.contains(stopBtn)) {
                stopBtn.disabled = false;
              }
            }
          });
        }
      } else {
        if (renderedIssueKey !== 'idle') {
          renderedIssueKey = 'idle';
          timerStateLabel.textContent = 'Статус';
          activeTaskContent.innerHTML = `
            <div class="empty-state">В момента няма активен таймер.</div>
            <button id="popup-start-notask-btn" class="btn btn-start-notask" type="button">
              ${SVG_PLAY}
              <span>Старт без задача</span>
            </button>
          `;

          const startNoTaskBtn = document.getElementById('popup-start-notask-btn');
          if (startNoTaskBtn) {
            startNoTaskBtn.addEventListener('click', async () => {
              startNoTaskBtn.disabled = true;
              try {
                await fetchWithFallback(`${TIMER_API_BASE}/start`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    issueId: null,
                    issueSubject: 'Работа без задача',
                    projectName: 'Обща дейност',
                  }),
                });
                await refreshTimer();
              } catch {
                // Keep button usable if server call fails
              } finally {
                if (document.body.contains(startNoTaskBtn)) {
                  startNoTaskBtn.disabled = false;
                }
              }
            });
          }
        }
      }
    } catch {
      if (renderedIssueKey !== 'offline') {
        renderedIssueKey = 'offline';
        serverStatusEl.textContent = 'Офлайн';
        serverStatusEl.className = 'badge badge-offline';
        timerStateLabel.textContent = 'Статус';
        activeTaskContent.innerHTML = `
          <div class="empty-state" style="color: #e03131;">
            Сървърът на порт 3000 не отговаря.<br>
            Моля, стартирайте приложението с npm run dev.
          </div>
        `;
      }
    }
  }

  await refreshTimer();
  const interval = setInterval(refreshTimer, 1000);
  window.addEventListener('unload', () => clearInterval(interval));
});
