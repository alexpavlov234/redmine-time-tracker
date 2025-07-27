import { setIssueStatuses, setAllProjects, setAllTasks } from '../state/index.js';
import { elements } from '../utils/dom.js';
import { setButtonLoading } from '../utils/helpers.js';
import { redmineApiRequest } from '../services/redmine.js';
import { checkConfiguration } from './projects.js';

export function saveSettings() {
    const url = elements.redmineUrlInput.value.trim();
    const apiKey = elements.redmineApiKeyInput.value.trim();
    const billableId = elements.billableFieldIdInput.value.trim();

    localStorage.setItem('redmineUrl', url);
    localStorage.setItem('redmineApiKey', apiKey);
    if (billableId) {
        localStorage.setItem('billableFieldId', billableId);
    } else {
        localStorage.removeItem('billableFieldId');
    }
    
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

export function setTestModeState(enabled: boolean) {
    elements.redmineUrlInput.disabled = enabled;
    elements.redmineApiKeyInput.disabled = enabled;
    elements.billableFieldIdInput.disabled = enabled;
    elements.testConnectionBtn.disabled = enabled;

    if (enabled) {
        elements.connectionStatus.textContent = 'Test Mode is active. Connection to Redmine is bypassed.';
        elements.connectionStatus.className = 'status-message info';
    } else {
        elements.connectionStatus.textContent = '';
        elements.connectionStatus.className = 'status-message';
    }
    checkConfiguration();
}

export function loadSettings() {
    const isTestMode = localStorage.getItem('isTestMode') === 'true';
    const url = localStorage.getItem('redmineUrl');
    const apiKey = localStorage.getItem('redmineApiKey');
    const billableId = localStorage.getItem('billableFieldId');
    
    elements.testModeCheckbox.checked = isTestMode;
    if (url) elements.redmineUrlInput.value = url;
    if (apiKey) elements.redmineApiKeyInput.value = apiKey;
    if (billableId) elements.billableFieldIdInput.value = billableId;
    
    setTestModeState(isTestMode);
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
        const errorMessage = (error as Error).message;
        elements.connectionStatus.textContent = `Connection failed: ${errorMessage}`;
        elements.connectionStatus.classList.add('error');
    } finally {
        setButtonLoading(elements.testConnectionBtn, false);
    }
}
