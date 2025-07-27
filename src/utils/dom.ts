// DOM Elements helper - centralized element references
export const elements = {
    // Global
    globalErrorContainer: document.getElementById('global-error-container') as HTMLDivElement,
    
    // Navigation
    navTracker: document.getElementById('nav-tracker') as HTMLAnchorElement,
    navSettings: document.getElementById('nav-settings') as HTMLAnchorElement,
    navLoggedTime: document.getElementById('nav-logged-time') as HTMLAnchorElement,
    trackerPage: document.getElementById('tracker-page') as HTMLDivElement,
    settingsPage: document.getElementById('settings-page') as HTMLDivElement,
    loggedTimePage: document.getElementById('logged-time-page') as HTMLDivElement,

    // Task Selection
    projectInput: document.getElementById('project-input') as HTMLInputElement,
    projectList: document.getElementById('project-list') as HTMLDivElement,
    taskInput: document.getElementById('task-input') as HTMLInputElement,
    taskList: document.getElementById('task-list') as HTMLDivElement,
    projectSelect: document.getElementById('project-select') as HTMLSelectElement,
    taskSelect: document.getElementById('task-select') as HTMLSelectElement,
    activitySelect: document.getElementById('activity-select') as HTMLSelectElement,
    configPrompt: document.getElementById('config-prompt') as HTMLDivElement,
    taskSelectionForm: document.getElementById('task-selection-form') as HTMLDivElement,
    promptLinkToSettings: document.getElementById('prompt-link-to-settings') as HTMLAnchorElement,

    // Timer
    timeDisplay: document.getElementById('time-display') as HTMLDivElement,
    startBtn: document.getElementById('start-btn') as HTMLButtonElement,
    pauseBtn: document.getElementById('pause-btn') as HTMLButtonElement,
    stopBtn: document.getElementById('stop-btn') as HTMLButtonElement,

    // Activity
    activityInput: document.getElementById('activity-input') as HTMLInputElement,
    addActivityBtn: document.getElementById('add-activity-btn') as HTMLButtonElement,
    activityList: document.getElementById('activity-list') as HTMLUListElement,

    // Work Queue (formerly To-Do)
    todoProjectInput: document.getElementById('todo-project-input') as HTMLInputElement,
    todoProjectList: document.getElementById('todo-project-list') as HTMLDivElement,
    todoProjectSelect: document.getElementById('todo-project-select') as HTMLSelectElement,
    todoTaskInput: document.getElementById('todo-task-input') as HTMLInputElement,
    todoTaskList: document.getElementById('todo-task-list') as HTMLDivElement,
    todoTaskSelect: document.getElementById('todo-task-select') as HTMLSelectElement,
    todoNoteInput: document.getElementById('todo-note-input') as HTMLInputElement,
    todoActivitySelect: document.getElementById('todo-activity-select') as HTMLSelectElement,
    addToQueueBtn: document.getElementById('add-to-queue-btn') as HTMLButtonElement,
    todoList: document.getElementById('todo-list') as HTMLUListElement,
    todoForm: document.getElementById('todo-form') as HTMLFormElement,

    // Logged Time
    todayLog: document.getElementById('today-log') as HTMLUListElement,
    yesterdayLog: document.getElementById('last-log') as HTMLUListElement,
    todayTotalTime: document.getElementById('today-total-time') as HTMLSpanElement,
    yesterdayTotalTime: document.getElementById('last-log-total-time') as HTMLSpanElement,

    // Summary Modal
    summaryModal: document.getElementById('summary-modal') as HTMLDivElement,
    summaryTime: document.getElementById('summary-time') as HTMLSpanElement,
    summaryDetails: document.getElementById('summary-details') as HTMLTextAreaElement,
    summaryActivitySelect: document.getElementById('summary-activity-select') as HTMLSelectElement,
    billableCheckboxSimple: document.getElementById('billable-checkbox-simple') as HTMLInputElement,
    changeStatusCheckbox: document.getElementById('change-status-checkbox') as HTMLInputElement,
    statusChangeContainer: document.getElementById('status-change-container') as HTMLDivElement,
    issueStatusSelect: document.getElementById('issue-status-select') as HTMLSelectElement,
    submitBtn: document.getElementById('submit-btn') as HTMLButtonElement,
    closeModalBtn: document.getElementById('close-modal') as HTMLSpanElement,
    modalStatus: document.getElementById('modal-status') as HTMLDivElement,
    summaryForm: document.getElementById('summary-form') as HTMLFormElement,

    // First Activity Modal
    firstActivityModal: document.getElementById('first-activity-modal') as HTMLDivElement,
    firstActivityInput: document.getElementById('first-activity-input') as HTMLInputElement,
    startWithActivityBtn: document.getElementById('start-with-activity-btn') as HTMLButtonElement,
    closeFirstActivityModalBtn: document.getElementById('close-first-activity-modal') as HTMLSpanElement,

    // Settings
    settingsForm: document.getElementById('settings-form') as HTMLFormElement,
    redmineUrlInput: document.getElementById('redmine-url') as HTMLInputElement,
    redmineApiKeyInput: document.getElementById('redmine-api-key') as HTMLInputElement,
    saveSettingsBtn: document.getElementById('save-settings-btn') as HTMLButtonElement,
    testConnectionBtn: document.getElementById('test-connection-btn') as HTMLButtonElement,
    connectionStatus: document.getElementById('connection-status') as HTMLDivElement,
};
