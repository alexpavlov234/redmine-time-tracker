import { setIssueStatuses, setAllProjects, setAllTasks } from '../state/index.js';
import { elements } from '../utils/dom.js';
import { setButtonLoading } from '../utils/helpers.js';
import { redmineApiRequest } from '../services/redmine.js';
import { checkConfiguration } from './projects.js';

export function saveSettings() {
    let url = elements.redmineUrlInput.value.trim();
    const apiKey = elements.redmineApiKeyInput.value.trim();

    // Normalize URL: ensure protocol and no trailing slash
    if (url && !/^https?:\/\//i.test(url)) {
        // Default to https when protocol is missing
        url = `https://${url}`;
    }
    if (url) {
        url = url.replace(/\/$/, '');
    }

    localStorage.setItem('redmineUrl', url);
    localStorage.setItem('redmineApiKey', apiKey);
    
    // Invalidate caches
    setIssueStatuses([]);
    setAllProjects([]);
    setAllTasks([]);

    elements.saveSettingsBtn.innerHTML = `<i class="fa-solid fa-check"></i> Saved!`;
    setTimeout(() => {
         elements.saveSettingsBtn.innerHTML = `<i class="fa-solid fa-save"></i> Save Settings`;
    }, 2000);
    
    checkConfiguration();
}

export function loadSettings() {
    const url = localStorage.getItem('redmineUrl');
    const apiKey = localStorage.getItem('redmineApiKey');
    
    if (url) elements.redmineUrlInput.value = url;
    if (apiKey) elements.redmineApiKeyInput.value = apiKey;
    
    checkConfiguration();
}

export async function testConnection() {
    elements.connectionStatus.textContent = 'Testing...';
    elements.connectionStatus.className = 'status-message';
    setButtonLoading(elements.testConnectionBtn, true);

    try {
        const data = await redmineApiRequest('/users/current.json');
        elements.connectionStatus.textContent = `Connection successful! Logged in as ${data.user.firstname} ${data.user.lastname}.`;
        elements.connectionStatus.classList.add('success');
    } catch (error) {
        const errorMessage = (error as Error).message || String(error);
        // Provide actionable guidance depending on common cases
        let hint = '';
        const redmineUrl = localStorage.getItem('redmineUrl') || '';
        const isHttps = /^https:\/\//i.test(redmineUrl);
        if (/proxy|fetch|failed to fetch|network|ECONNREFUSED|ERR_CONNECTION/i.test(errorMessage)) {
            hint = ' Make sure the local proxy is running (npm run dev:full) and reachable at http://localhost:3000/health.';
        } else if (/CORS|Mixed Content/i.test(errorMessage)) {
            hint = ' If your Redmine is HTTP only, you must use the local proxy to avoid browser mixed-content/CORS issues.';
        } else if (/401|unauthorized/i.test(errorMessage)) {
            hint = ' Check that your API key is valid and has access to the Redmine server.';
        } else if (/ENOTFOUND|DNS|getaddrinfo/i.test(errorMessage)) {
            hint = ' Verify the Redmine URL/hostname is correct and reachable from your machine.';
        } else if (/timeout/i.test(errorMessage)) {
            hint = ' The request timed out. Check connectivity/VPN and try again.';
        } else if (/self-signed|certificate|SSL/i.test(errorMessage)) {
            hint = ' Self-signed SSL certificates are supported via the local proxy. Ensure the proxy is running.';
        } else if (!isHttps) {
            hint = ' Tip: Prefer HTTPS URLs. HTTP Redmine requires the local proxy due to browser restrictions.';
        }
        elements.connectionStatus.textContent = `Connection failed: ${errorMessage}${hint ? ' ' + hint : ''}`;
        elements.connectionStatus.classList.add('error');
    } finally {
        setButtonLoading(elements.testConnectionBtn, false);
    }
}
