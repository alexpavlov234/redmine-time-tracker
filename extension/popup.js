/**
 * Script controlling the Chrome extension popup dialog.
 * Allows toggling Redmine toolbar injection, configuring Redmine connection,
 * and viewing/stopping the active timer.
 */

document.addEventListener('DOMContentLoaded', () => {
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

  /**
   * Formats elapsed seconds into HH:MM:SS format.
   * 
   * @param {number} totalSeconds Total seconds elapsed.
   * @returns {string} Formatted string.
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

  // Load and bind toggle preference
  if (chrome?.storage?.local) {
    chrome.storage.local.get({ extensionEnabled: true, redmineUrl: '', redmineApiKey: '' }, (data) => {
      toggleEl.checked = data.extensionEnabled !== false;
      if (data.redmineUrl && redmineUrlInput) redmineUrlInput.value = data.redmineUrl;
      if (data.redmineApiKey && apiKeyInput) apiKeyInput.value = data.redmineApiKey;
    });

    toggleEl.addEventListener('change', () => {
      chrome.storage.local.set({ extensionEnabled: toggleEl.checked });
    });
  }

  // Load server config if available
  fetch(CONFIG_API_BASE)
    .then(res => res.ok ? res.json() : null)
    .then(cfg => {
      if (cfg && cfg.redmineUrl && redmineUrlInput && !redmineUrlInput.value) {
        redmineUrlInput.value = cfg.redmineUrl;
      }
    })
    .catch(() => {});

  // Save config handler
  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', async () => {
      const redmineUrl = redmineUrlInput ? redmineUrlInput.value.trim() : '';
      const apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';

      // Save in chrome.storage.local
      if (chrome?.storage?.local) {
        chrome.storage.local.set({ redmineUrl, redmineApiKey: apiKey });
      }

      // Sync to local proxy server
      try {
        await fetch(CONFIG_API_BASE, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ redmineUrl, apiKey })
        });

        if (saveStatusEl) {
          saveStatusEl.style.display = 'block';
          setTimeout(() => {
            saveStatusEl.style.display = 'none';
          }, 2500);
        }
      } catch {
        alert('Сървърът на http://localhost:3000 не е достъпен. Стартирайте го с npm run proxy.');
      }
    });
  }

  /**
   * Fetches current timer state and refreshes the popup interface.
   */
  async function refreshTimer() {
    try {
      const res = await fetch(TIMER_API_BASE);
      if (!res.ok) throw new Error('Server error');

      const data = await res.json();
      serverStatusEl.textContent = 'Свързан';
      serverStatusEl.className = 'badge badge-online';

      if (data && data.isRunning) {
        timerStateLabel.textContent = 'Активен таймер';
        const formatted = formatSeconds(data.currentElapsedSeconds || 0);

        activeTaskContent.innerHTML = `
          <div class="timer-task" title="${data.issueSubject || ''}">
            #${data.issueId} - ${data.issueSubject || 'Задача'}
          </div>
          <div class="timer-project">${data.projectName || ''}</div>
          <div class="timer-display">${formatted}</div>
          <button id="popup-stop-btn" class="btn btn-stop">
            ${SVG_STOP}
            <span>Спри отчитането</span>
          </button>
        `;

        const stopBtn = document.getElementById('popup-stop-btn');
        if (stopBtn) {
          stopBtn.addEventListener('click', async () => {
            stopBtn.disabled = true;
            await fetch(`${TIMER_API_BASE}/stop`, { method: 'POST' });
            refreshTimer();
          });
        }
      } else {
        timerStateLabel.textContent = 'Статус';
        activeTaskContent.innerHTML = `<div class="empty-state">Няма активен таймер в момента.</div>`;
      }
    } catch {
      serverStatusEl.textContent = 'Офлайн';
      serverStatusEl.className = 'badge badge-offline';
      timerStateLabel.textContent = 'Статус';
      activeTaskContent.innerHTML = `
        <div class="empty-state" style="color: #c92a2a;">
          Сървърът на порт 3000 не отговаря.<br>
          Моля, стартирайте proxy сървъра.
        </div>
      `;
    }
  }

  refreshTimer();
  const interval = setInterval(refreshTimer, 1000);
  window.addEventListener('unload', () => clearInterval(interval));
});
