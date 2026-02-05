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
import { addToQueue, loadTodos, initializeDragAndDrop } from './modules/queue.js';
import { hideSummary, submitTimeToRedmine } from './modules/summary.js';
import { populateTasks, populateTasksForTodoForm } from './modules/projects.js';
import { saveSettings, testConnection, loadSettings } from './modules/settings.js';
import { initializeActivities } from './modules/activitySelector.js';
import { initializeCustomFields } from './modules/customFields.js';
import { initLoggedTimePage, initCalendarListeners } from './modules/loggedTime.js';
import { setUser } from './state';
import { getCurrentUser } from './services/redmine.js';
import { initWatchedIssues } from './modules/watchedIssues.js';

// Initialize calendar listeners (for logged time page)
initCalendarListeners();

async function init() {
    try {
        // Load user settings first
        loadSettings();

        // Set up event listeners
        initializeEventListeners();

        // Initialize the UI
        showPage('tracker');

        // Load data and initialize components
        renderActivities();
        loadTodos(); // This also handles preparing next task and rendering todos
        initializeDragAndDrop();
        populateTasks();
        populateTasksForTodoForm();
        initializeActivities();
        initializeCustomFields();
        initWatchedIssues();

        // Fetch user data after everything else is loaded
        try {
            const user = await getCurrentUser();
            if (user) {
                setUser(user);
            }
        } catch (error) {
            console.error('Failed to fetch user on init:', error);
            // Silent failure - app can still work without user data
        }
    } catch (error) {
        showGlobalError(error instanceof Error ? error.message : 'Failed to initialize application');
    }
}

function initializeEventListeners() {
    // Navigation
    elements.navTracker.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('tracker');
    });

    elements.navSettings.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('settings');
    });

    elements.navLoggedTime.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('logged-time');
        initLoggedTimePage();
    });

    elements.promptLinkToSettings.addEventListener('click', (e) => {
        e.preventDefault();
        showPage('settings');
    });

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

    // Todo list - using only button click handler to prevent double submission
    elements.addToQueueBtn.addEventListener('click', (e) => {
        e.preventDefault();
        addToQueue();
    });

    elements.todoProjectSelect.addEventListener('change', populateTasksForTodoForm);

    // Summary modal
    elements.closeModalBtn.addEventListener('click', hideSummary);
    elements.submitBtn.addEventListener('click', submitTimeToRedmine);

    elements.summaryModal.addEventListener('click', (e) => {
        if (e.target === elements.summaryModal) {
            hideSummary();
        }
    });

    elements.changeStatusCheckbox.addEventListener('change', () => {
        if (elements.statusChangeContainer) {
            elements.statusChangeContainer.style.display =
                elements.changeStatusCheckbox.checked ? 'block' : 'none';
        }
    });

    elements.summaryForm.addEventListener('submit', (e) => {
        e.preventDefault();
        submitTimeToRedmine();
    });

    // Settings
    elements.settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSettings();
    });

    elements.testConnectionBtn.addEventListener('click', testConnection);
}

// Initialize the application
init().catch(showGlobalError);
