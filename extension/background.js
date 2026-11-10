/// <summary>
/// Background service worker for Redmine Time Tracker extension.
/// Proxies API requests to localhost:3000 (with 127.0.0.1 fallback) to bypass browser mixed-content
/// and Private Network Access restrictions, and re-injects content scripts on extension reload.
/// </summary>

/// <summary>
/// Executes a fetch call against the target localhost URL, falling back to 127.0.0.1 if localhost resolution fails.
/// </summary>
/// <param name="url">Target endpoint URL.</param>
/// <param name="options">Fetch configuration options.</param>
/// <returns>The resolved Response object.</returns>
async function fetchWithFallback(url, options = {}) {
  try {
    return await fetch(url, options);
  } catch (primaryError) {
    if (url.includes('http://localhost:3000')) {
      const fallbackUrl = url.replace('http://localhost:3000', 'http://127.0.0.1:3000');
      return await fetch(fallbackUrl, options);
    }
    throw primaryError;
  }
}

/// <summary>
/// Re-injects content script and stylesheet into already open Redmine issue tabs upon extension install or reload.
/// </summary>
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const tabs = await chrome.tabs.query({ url: '*://*/*issues/*' });
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ['content.css'],
        });
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js'],
        });
      } catch {
        // Ignore restricted or unloaded tabs
      }
    }
  } catch {
    // Ignore tab query errors
  }
});

/// <summary>
/// Listens for API_REQUEST messages from content scripts and popup, executing the HTTP request in the service worker context.
/// </summary>
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'API_REQUEST') {
    (async () => {
      const { url, options = {} } = message;
      try {
        const response = await fetchWithFallback(url, options);
        const text = await response.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }

        sendResponse({
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          data,
        });
      } catch (error) {
        sendResponse({
          ok: false,
          error: error?.message || 'Network request failed',
        });
      }
    })();

    return true; // Keep message channel open for asynchronous response
  }
});
