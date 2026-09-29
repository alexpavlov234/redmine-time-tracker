/**
 * Background service worker for Redmine Time Tracker extension.
 * Handles API requests to localhost:3000 to bypass browser mixed-content (HTTPS -> HTTP) restrictions.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'API_REQUEST') {
    const { url, options = {} } = message;

    fetch(url, options)
      .then(async (response) => {
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
          data
        });
      })
      .catch((error) => {
        sendResponse({
          ok: false,
          error: error.message || 'Network request failed'
        });
      });

    return true; // Keep message channel open for asynchronous response
  }
});
