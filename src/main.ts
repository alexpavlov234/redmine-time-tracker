/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Import Bootstrap bundle (includes Popper.js)
import * as bootstrap from 'bootstrap';

// Make Bootstrap available globally
(window as any).bootstrap = bootstrap;

// Import UI utilities (theme management and toast system)
import './utils/ui.ts';

import { elements } from './utils/dom.js';
import { showPage, showGlobalError } from './utils/helpers.js';
import { startTimer, pauseTimer, stopTimer } from './modules/timer.js';
import { addActivityToState, renderActivities } from './modules/activities.js';
import { addToQueue, loadTodos, renderTodos, prepareNextTask, initializeDragAndDrop } from './modules/queue.js';
import { hideSummary, submitTimeToRedmine } from './modules/summary.js';
import { populateTasks, populateTasksForTodoForm } from './modules/projects.js';
import { saveSettings, testConnection, loadSettings, setTestModeState } from './modules/settings.js';
import { initializeActivities } from './modules/activitySelector.js';
import { initializeCustomFields } from './modules/customFields.js';
import * as stateFunctions from './state/index.js';

function init() {
    // Bootstrap is now directly imported and available
    console.log('Bootstrap loaded:', typeof window.bootstrap !== 'undefined');
    
    // Navigation
    elements.navTracker.addEventListener('click', (e) => { e.preventDefault(); showPage('tracker'); });
    elements.navSettings.addEventListener('click', (e) => { e.preventDefault(); showPage('settings'); });
    elements.promptLinkToSettings.addEventListener('click', (e) => { e.preventDefault(); showPage('settings'); });

    // Timer controls
    elements.startBtn.addEventListener('click', startTimer);
    elements.pauseBtn.addEventListener('click', pauseTimer);
    elements.stopBtn.addEventListener('click', stopTimer);

    // Activity log
    elements.addActivityBtn.addEventListener('click', () => addActivityToState());
    elements.activityInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addActivityToState();
        }
    });

    // Work Queue
    elements.addToQueueBtn.addEventListener('click', addToQueue);
    elements.todoProjectSelect.addEventListener('change', populateTasksForTodoForm);

    // Summary Modal
    elements.closeModalBtn.addEventListener('click', hideSummary);
    elements.submitBtn.addEventListener('click', submitTimeToRedmine);
    elements.summaryModal.addEventListener('click', (e) => {
        if (e.target === elements.summaryModal) hideSummary();
    });
    elements.changeStatusCheckbox.addEventListener('change', () => {
        elements.statusChangeContainer.style.display = elements.changeStatusCheckbox.checked ? 'block' : 'none';
    });
    
    // Settings
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.testConnectionBtn.addEventListener('click', testConnection);
    elements.testModeToggle.addEventListener('change', (e) => {
        const isEnabled = (e.target as HTMLInputElement).checked;
        localStorage.setItem('isTestMode', String(isEnabled));
        // Reset caches
        stateFunctions.setIssueStatuses([]);
        stateFunctions.setAllProjects([]);
        stateFunctions.setAllTasks([]);
        setTestModeState(isEnabled);
    });

    // Main task selection
    elements.projectSelect.addEventListener('change', populateTasks);
    elements.taskSelect.addEventListener('change', () => {
        // This button state is primarily managed by prepareNextTask when using the queue.
        // This event listener handles the case where the user is manually selecting a task without the queue.
        import('./state/index.js').then(({ todos }) => {
            elements.startBtn.disabled = !elements.taskSelect.value || todos.length > 0;
        });
    });

    // Initialize drag and drop for todos
    initializeDragAndDrop();
    initializeActivities(); // Initialize activities selector

    // Global error handling
    window.addEventListener('unhandledrejection', function(event) {
        console.error('Unhandled Promise Rejection:', event.reason);
        showGlobalError('An unexpected promise rejection occurred.', event.reason);
    });

    window.addEventListener('error', function(event) {
        console.error('Global Error:', event.error);
        showGlobalError('A script error occurred on the page.', event.error || event.message);
    });

    // Initial Load
    loadSettings(); // This calls setTestModeState, which calls checkConfiguration
    loadTodos();
    renderTodos();
    prepareNextTask();
    
    // Initialize activities
    initializeActivities().catch(error => {
        console.warn('Failed to initialize activities:', error);
    });
    
    // Initialize custom fields
    initializeCustomFields().catch(error => {
        console.warn('Failed to initialize custom fields:', error);
    });
    
    // Try to auto-detect billable field if not configured
    if (!localStorage.getItem('billableFieldId')) {
        import('./services/redmine.js').then(({ detectBillableField }) => {
            detectBillableField().catch(error => {
                console.warn('Failed to auto-detect billable field:', error);
            });
        });
    }

    
    renderActivities();
}

init();
