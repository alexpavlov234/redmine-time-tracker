/// <summary>
/// Script controlling the Chrome extension popup dialog.
/// Allows toggling Redmine toolbar injection, configuring Redmine connection,
/// and viewing/stopping the active timer.
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

  const SVG_STOP = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';

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
  /// Formats elapsed seconds into HH:MM:SS format.
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
      const redmineUrl = redmineUrlInput ? redmineUrlInput.value.trim() : '';
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

      if (chrome?.storage?.local) {
        try {
          await chrome.storage.local.set({ redmineUrl, redmineApiKey: apiKey });
        } catch {
          // Ignore storage errors
        }
      }

      try {
        await fetchWithFallback(CONFIG_API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redmineUrl, apiKey }),
        });

        if (saveStatusEl) {
          saveStatusEl.style.display = 'block';
          setTimeout(() => {
            saveStatusEl.style.display = 'none';
          }, 2500);
        }
      } catch {
        alert('Сървърът на http://localhost:3000 не е достъпен. Стартирайте го с npm run dev.');
      }
    });
  }

  let renderedIssueKey = null;

  /// <summary>
  /// Fetches current timer state and refreshes the popup interface without destroying the Stop button every second.
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
        const currentKey = `running_${data.issueId}`;

        if (renderedIssueKey === currentKey) {
          const displayEl = activeTaskContent.querySelector('.timer-display');
          if (displayEl) {
            displayEl.textContent = formatted;
            return;
          }
        }

        renderedIssueKey = currentKey;
        activeTaskContent.innerHTML = `
          <div class="timer-task" title="${data.issueSubject || ''}">
            #${data.issueId} - ${data.issueSubject || 'Задача'}
          </div>
          <div class="timer-project">${data.projectName || ''}</div>
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
            await fetchWithFallback(`${TIMER_API_BASE}/stop`, { method: 'POST' });
            await refreshTimer();
          });
        }
      } else {
        if (renderedIssueKey !== 'idle') {
          renderedIssueKey = 'idle';
          timerStateLabel.textContent = 'Статус';
          activeTaskContent.innerHTML = `<div class="empty-state">Няма активен таймер в момента.</div>`;
        }
      }
    } catch {
      if (renderedIssueKey !== 'offline') {
        renderedIssueKey = 'offline';
        serverStatusEl.textContent = 'Офлайн';
        serverStatusEl.className = 'badge badge-offline';
        timerStateLabel.textContent = 'Статус';
        activeTaskContent.innerHTML = `
          <div class="empty-state" style="color: #c92a2a;">
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
