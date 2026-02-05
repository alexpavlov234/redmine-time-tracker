import { getTimeEntries, getIssues, updateTimeEntry, deleteTimeEntry, createTimeEntry, redmineApiRequest } from '../services/redmine.js';
import { state } from '../state/index.js';
import { RedmineIssue, TimeEntry } from '../types/index.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showConfirm, showSuccess } from '../utils/ui.js';
import { renderDailyLogCard } from '../components/DailyLogCard.js';
import { getAvailableActivities } from './activitySelector.js';
import { initAutocomplete } from '../utils/autocomplete.js';

const todayLogContainer = document.getElementById('today-log-container') as HTMLDivElement;

// Calendar state
let currentCalendarMonth = new Date();
let calendarEntriesCache: Map<string, TimeEntry[]> = new Map();

let currentBulkTasks: any[] = [];

// Multi-select state
let multiSelectMode = false;
let selectedDays: Set<string> = new Set();
let selectedDayDate: string | null = null;

async function manageTimeEntry(entry: TimeEntry | null, dateStr?: string) {
    const isEdit = !!entry;
    const title = isEdit ? 'Edit Time Entry' : 'Log Time';
    const hoursValue = isEdit ? entry.hours : 8;
    const commentsValue = isEdit ? (entry.comments || '') : '';
    const dateValue = isEdit ? entry.spent_on : (dateStr || formatDate(new Date()));

    // IDs for prepopulation
    let selectedProjectId = isEdit ? entry?.project?.id : null;
    let selectedTaskId = isEdit ? entry?.issue?.id : null;
    let selectedActivityId = isEdit ? entry?.activity?.id : getAvailableActivities().find(a => a.is_default)?.id;

    // Store tasks for the selected project
    let projectTasks: RedmineIssue[] = [];

    // Create modal HTML
    const modalId = 'manage-time-entry-modal';
    const modalHtml = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="manageTimeEntryModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="manageTimeEntryModalLabel">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <form id="manage-time-entry-form">
                            <!-- Project Selection (Autocomplete) -->
                            <div class="mb-3 position-relative">
                                <label for="manage-project-input" class="form-label">Project</label>
                                <input type="text" class="form-control form-control-sm" id="manage-project-input" placeholder="Type to search projects..." autocomplete="off" required>
                                <input type="hidden" id="manage-project-id">
                                <div id="manage-project-list" class="autocomplete-list"></div>
                            </div>

                            <!-- Task Selection (Autocomplete) -->
                            <div class="mb-3 position-relative">
                                <label for="manage-task-search" class="form-label">Task (Issue)</label>
                                <input type="text" class="form-control form-control-sm" id="manage-task-search" placeholder="Select a project first..." autocomplete="off" required disabled>
                                <input type="hidden" id="manage-task-id">
                                <div id="manage-task-list" class="autocomplete-list"></div>
                            </div>

                             <div class="mb-3">
                                <label for="manage-activity" class="form-label">Activity</label>
                                <select class="form-select form-select-sm" id="manage-activity" required>
                                     <option value="">-- Select Activity --</option>
                                    ${getAvailableActivities().map(a => `<option value="${a.id}">${a.name}</option>`).join('')}
                                </select>
                            </div>

                            <div class="row">
                                <div class="col-md-6 mb-3">
                                    <label for="manage-hours" class="form-label">Hours</label>
                                    <input type="number" class="form-control form-control-sm" id="manage-hours" value="${hoursValue}" step="0.25" min="0.25" max="24" required>
                                </div>
                                <div class="col-md-6 mb-3">
                                    <label for="manage-spent-on" class="form-label">Date</label>
                                    <input type="date" class="form-control form-control-sm" id="manage-spent-on" value="${dateValue}" required>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label for="manage-comments" class="form-label">Comments</label>
                                <textarea class="form-control form-control-sm" id="manage-comments" rows="2" placeholder="Optional comment">${commentsValue}</textarea>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="save-time-entry">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append modal to the body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    // Initialize Bootstrap Modal
    const modal = new window.bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    // --- Logic Implementation ---

    const projectInput = document.getElementById('manage-project-input') as HTMLInputElement;
    const projectIdHidden = document.getElementById('manage-project-id') as HTMLInputElement;
    const projectList = document.getElementById('manage-project-list') as HTMLDivElement;

    const taskInput = document.getElementById('manage-task-search') as HTMLInputElement;
    const taskList = document.getElementById('manage-task-list') as HTMLDivElement;
    const taskIdHidden = document.getElementById('manage-task-id') as HTMLInputElement;

    const activitySelect = document.getElementById('manage-activity') as HTMLSelectElement;

    // --- Helper to fetch tasks ---
    const fetchTasksForProject = async (pid: number) => {
        taskInput.disabled = true;
        taskInput.placeholder = 'Loading tasks...';
        projectTasks = []; // Clear

        try {
            const endpoint = `/issues.json?project_id=${pid}&status_id=open&limit=100`;
            const data = await redmineApiRequest(endpoint);
            projectTasks = data.issues || [];

            taskInput.disabled = false;
            taskInput.placeholder = 'Type to search tasks...';
        } catch (error) {
            console.error('Failed to load tasks', error);
            taskInput.placeholder = 'Error loading tasks';
        }
    };

    // --- Pre-population ---
    if (selectedProjectId) {
        projectIdHidden.value = selectedProjectId.toString();
        const proj = state.allProjects.find(p => p.id === selectedProjectId);
        if (proj) {
            projectInput.value = proj.name;
            // Fetch tasks initially if editing or pre-selected
            // Note: This is async, so fields might update moments after modal shows
            fetchTasksForProject(selectedProjectId).then(() => {
                if (selectedTaskId) {
                    taskIdHidden.value = selectedTaskId.toString();
                    // Tasks might be loaded now, try to find issue
                    const issue = projectTasks.find(t => t.id === selectedTaskId) || entry?.issue;
                    if (issue) {
                        taskInput.value = `#${issue.id} ${issue.subject || ''}`;
                    } else {
                        taskInput.value = `#${selectedTaskId}`;
                    }
                }
            });
        }
    }

    // Set other fields that don't depend on async loading
    if (selectedActivityId) {
        activitySelect.value = selectedActivityId.toString();
    }

    // If we have a task ID but no project loaded yet (rare, but possible if entry incomplete), 
    // Fallback if no project selected:
    if (selectedTaskId && !selectedProjectId) {
        taskInput.value = `#${selectedTaskId}`;
        taskIdHidden.value = selectedTaskId.toString();
    }


    // --- Project Autocomplete ---
    initAutocomplete({
        inputEl: projectInput,
        listEl: projectList,
        sourceData: state.allProjects,
        renderItem: (item: any) => item.name,
        filterItem: (item: any, query: string) => item.name.toLowerCase().includes(query),
        onSelect: async (item: any) => {
            projectInput.value = item.name;
            projectIdHidden.value = item.id.toString();
            selectedProjectId = item.id;

            // Reset Task
            taskInput.value = '';
            taskIdHidden.value = '';
            selectedTaskId = null;

            // Fetch Tasks
            await fetchTasksForProject(item.id);
        }
    });

    // --- Task Autocomplete ---
    initAutocomplete({
        inputEl: taskInput,
        listEl: taskList,
        sourceData: () => projectTasks, // Use the local array which gets updated
        renderItem: (item: RedmineIssue) => `
            <div class="autocomplete-item">
                <span class="badge bg-secondary me-2">#${item.id}</span>
                <span class="fw-bold text-truncate" style="max-width: 150px;">${item.project.name}</span>
                <div class="small text-muted text-truncate">${item.subject}</div>
            </div>
        `,
        filterItem: (item: RedmineIssue, query: string) => {
            const search = query.toLowerCase();
            return (
                item.subject.toLowerCase().includes(search) ||
                item.id.toString().includes(search)
            );
        },
        onSelect: (item: RedmineIssue) => {
            taskInput.value = `#${item.id} ${item.subject}`;
            taskIdHidden.value = item.id.toString();
            selectedTaskId = item.id;
        }
    });


    // Handle form submission
    const saveButton = document.getElementById('save-time-entry');
    saveButton?.addEventListener('click', async () => {
        const hoursInput = document.getElementById('manage-hours') as HTMLInputElement;
        const commentsInput = document.getElementById('manage-comments') as HTMLTextAreaElement;
        const spentOnInput = document.getElementById('manage-spent-on') as HTMLInputElement;

        const hours = parseFloat(hoursInput.value);
        const comments = commentsInput.value;
        const spentOn = spentOnInput.value;
        const activityId = parseInt(activitySelect.value);
        const issueId = parseInt(taskIdHidden.value);
        const projectId = parseInt(projectIdHidden.value);

        // Validation
        if (isNaN(hours) || hours <= 0) {
            showError('Please enter valid hours.');
            return;
        }
        if (!projectId) {
            showError('Please select a project.');
            return;
        }
        if (!issueId) {
            showError('Please select a task.');
            return;
        }
        if (!activityId) {
            showError('Please select an activity.');
            return;
        }

        try {
            if (isEdit && entry) {
                await updateTimeEntry(entry.id, {
                    hours,
                    comments,
                    spent_on: spentOn,
                    activity_id: activityId,
                    issue_id: issueId
                });
                showSuccess('Time entry updated successfully.');
            } else {
                // Create New Entry
                await createTimeEntry({
                    hours,
                    comments,
                    spent_on: spentOn,
                    activity_id: activityId,
                    issue_id: issueId,
                    project_id: projectId
                });
                showSuccess('Time entry created successfully.');
            }

            modal.hide();

            // Remove the modal from DOM after hiding
            document.getElementById(modalId)?.addEventListener('hidden.bs.modal', function () {
                modalContainer.remove();
            });

            // Refresh the logged time page and calendar if open
            await refreshCalendarAfterChange();
        } catch (error) {
            showError('Failed to save time entry.');
            console.error(error);
        }
    });

    // Clean up modal when hidden
    document.getElementById(modalId)?.addEventListener('hidden.bs.modal', function () {
        modalContainer.remove();
    });
}

async function deleteTimeEntryHandler(id: number) {
    const confirmed = await showConfirm('Are you sure you want to delete this time entry?', 'This action cannot be undone.');

    if (confirmed) {
        try {
            await deleteTimeEntry(id);
            showSuccess('Time entry deleted successfully.');

            // Refresh the logged time page and calendar if open
            await refreshCalendarAfterChange();
        } catch (error) {
            showError('Failed to delete time entry.');
            console.error(error);
        }
    }
}

async function refreshCalendarAfterChange() {
    // Refresh the entire view (Today + Calendar)
    await initLoggedTimePage();
}

/**
 * Shows a loading spinner in the target list element
 */
function showSpinner(listElement: HTMLElement) {
    // Clear existing content
    listElement.innerHTML = '';

    // Create and add the spinner
    const loadingSpinner = document.createElement('li');
    loadingSpinner.className = 'list-group-item text-center py-3 loading-spinner';
    loadingSpinner.innerHTML = `
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2 text-muted mb-0">Loading time entries...</p>
    `;

    listElement.appendChild(loadingSpinner);
}

/**
 * Hides the loading spinner from the list element
 */
function hideSpinner(listElement: HTMLElement) {
    const spinner = listElement.querySelector('.loading-spinner');
    if (spinner) {
        spinner.remove();
    }
}

export async function initLoggedTimePage() {
    if (!state.user) {
        showError('Could not fetch user information.');
        return;
    }


    try {
        // Show loading spinners
        if (todayLogContainer) showSpinner(todayLogContainer);

        const today = new Date();
        const todayStr = formatDate(today);

        // Limit fetch to just today for the Today Card
        const timeEntries = await getTimeEntries({ from: todayStr, to: todayStr, user_id: state.user.id });

        const issueIdsToFetch = [
            ...new Set(
                timeEntries
                    .filter(entry => entry.issue && !entry.issue.subject && entry.issue.id)
                    .map(entry => entry.issue.id)
            )
        ];

        const issuesMap = new Map<number, RedmineIssue>();
        if (issueIdsToFetch.length > 0) {
            try {
                const issues = await getIssues(issueIdsToFetch);
                issues.forEach((issue: RedmineIssue) => issuesMap.set(issue.id, issue));
            } catch (error) {
                showError('Failed to load some task details.');
                console.error(error);
            }
        }

        // Render Today Card
        renderDailyLogCard({
            container: todayLogContainer,
            title: 'Today',
            entries: timeEntries,
            issuesMap,
            onEdit: (entry) => manageTimeEntry(entry),
            onDelete: deleteTimeEntryHandler
        });

        // Load Calendar View (Always visible now)
        await loadCalendarView();

    } catch (error) {
        // Hide loading spinners in case of error
        const todaySection = document.getElementById('today-log-container') as HTMLElement;
        if (todaySection) hideSpinner(todaySection);

        showError('Failed to load logged time.');
        console.error(error);
    }
}


// =============================================
// CALENDAR VIEW FUNCTIONS
// =============================================

/**
 * Initialize calendar event listeners - called once when page loads
 */
export function initCalendarListeners() {
    const loadCalendarBtn = document.getElementById('load-calendar-btn');
    const prevMonthBtn = document.getElementById('prev-month-btn');
    const nextMonthBtn = document.getElementById('next-month-btn');
    const toggleMultiSelectBtn = document.getElementById('toggle-multiselect-btn');
    const clearSelectionBtn = document.getElementById('clear-selection-btn');

    if (loadCalendarBtn) {
        loadCalendarBtn.addEventListener('click', () => loadCalendarView());
    }

    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => navigateMonth(-1));
    }

    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => navigateMonth(1));
    }

    if (toggleMultiSelectBtn) {
        toggleMultiSelectBtn.addEventListener('click', () => toggleMultiSelect());
    }

    if (clearSelectionBtn) {
        clearSelectionBtn.addEventListener('click', () => clearSelection());
    }

    // Initialize label
    const label = document.getElementById('current-month-label');
    if (label) {
        label.textContent = currentCalendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
    }
}

/**
 * Navigate to previous or next month
 */
async function navigateMonth(offset: number) {
    currentCalendarMonth.setMonth(currentCalendarMonth.getMonth() + offset);
    await loadCalendarView();
}

/**
 * Load and render the calendar view for the current month
 */
async function loadCalendarView() {
    if (!state.user) {
        showError('Could not fetch user information.');
        return;
    }

    const calendarGrid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('current-month-label');
    const dayDetails = document.getElementById('day-details-container');

    if (!calendarGrid || !monthLabel) return;

    // Update month label
    monthLabel.textContent = currentCalendarMonth.toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric'
    });

    // Show loading state
    calendarGrid.innerHTML = `
        <div class="calendar-placeholder text-center py-4">
            <div class="spinner-border text-primary spinner-border-sm" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 mb-0 text-muted small">Loading calendar data...</p>
        </div>
    `;

    // Hide day details while loading
    if (dayDetails) {
        dayDetails.style.display = 'none';
    }
    selectedDayDate = null;

    try {
        // Calculate date range for the month
        const year = currentCalendarMonth.getFullYear();
        const month = currentCalendarMonth.getMonth();

        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);

        const from = formatDate(firstDayOfMonth);
        const to = formatDate(lastDayOfMonth);

        // Fetch time entries for the month
        const timeEntries = await getTimeEntries({ from, to, user_id: state.user.id });

        // Cache entries by date
        calendarEntriesCache.clear();
        timeEntries.forEach(entry => {
            const dateKey = entry.spent_on;
            if (!calendarEntriesCache.has(dateKey)) {
                calendarEntriesCache.set(dateKey, []);
            }
            calendarEntriesCache.get(dateKey)!.push(entry);
        });

        // Render the calendar
        renderCalendar(year, month);


    } catch (error) {
        calendarGrid.innerHTML = `
            <div class="calendar-placeholder text-center py-4 text-danger">
                <i class="fa-solid fa-exclamation-triangle mb-2"></i>
                <p class="mb-0">Failed to load calendar data. Please try again.</p>
            </div>
        `;
        console.error('Calendar load error:', error);
    }
}

/**
 * Render the calendar grid for a given month
 */
function renderCalendar(year: number, month: number) {
    const calendarGrid = document.getElementById('calendar-grid');
    if (!calendarGrid) return;

    const today = new Date();
    const todayStr = formatDate(today);

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const daysInMonth = lastDayOfMonth.getDate();

    // Get the day of week for the first day (0 = Sunday, 1 = Monday, etc.)
    let startDayOfWeek = firstDayOfMonth.getDay();
    // Adjust for Monday start (0 = Monday, 6 = Sunday)
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    let html = '';

    // Day headers (Monday to Sunday)
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    dayNames.forEach(day => {
        html += `<div class="calendar-header-cell">${day}</div>`;
    });

    // Empty cells before the first day
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    // Day cells
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = formatDate(new Date(year, month, day));
        const entries = calendarEntriesCache.get(dateStr) || [];
        const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
        const hasEntries = entries.length > 0;
        const isToday = dateStr === todayStr;
        const isSelected = selectedDays.has(dateStr);

        let classes = 'calendar-day';
        if (hasEntries) classes += ' has-entries';
        if (isToday) classes += ' today';
        if (isSelected) classes += ' multi-selected';

        // In multi-select mode, clicking toggles selection. Otherwise shows details.
        const clickHandler = multiSelectMode
            ? `window.toggleDaySelection('${dateStr}')`
            : `window.showCalendarDayDetails('${dateStr}')`;

        html += `
            <div class="${classes}" data-date="${dateStr}" onclick="${clickHandler}">
                <span class="calendar-day-number">${day}</span>
                ${hasEntries ? `<span class="calendar-day-hours">${totalHours.toFixed(1)}h</span>` : ''}
            </div>
        `;
    }

    // Empty cells after the last day to complete the grid
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 0; i < remainingCells; i++) {
        html += '<div class="calendar-day empty"></div>';
    }

    calendarGrid.innerHTML = html;

    // Update grid class for hover effects
    if (multiSelectMode) {
        calendarGrid.classList.add('multi-select-mode');
    } else {
        calendarGrid.classList.remove('multi-select-mode');
    }
}

/**
 * Show details for a specific day when clicked
 */
export function showCalendarDayDetails(dateStr: string) {
    const dayDetailsContainer = document.getElementById('day-details-container');
    if (!dayDetailsContainer) return;

    if (multiSelectMode && selectedDays.has(dateStr)) {
        // In multiselect mode, clicking unselects
        const dayCell = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if (dayCell) dayCell.classList.remove('multi-selected');
        selectedDays.delete(dateStr);
        updateMultiSelectUI();
        return;
    }

    // Normal mode or clicking unselected day in multiselect (if we decide to allow adding)
    // For now, if multiselect is on, only clicking logic above applies.
    if (multiSelectMode) {
        // Toggle selection logic
        const dayCell = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
        if (selectedDays.has(dateStr)) {
            selectedDays.delete(dateStr);
            if (dayCell) dayCell.classList.remove('multi-selected');
        } else {
            selectedDays.add(dateStr);
            if (dayCell) dayCell.classList.add('multi-selected');
        }
        updateMultiSelectUI();
        return;
    }


    // Clear previous selection highlight
    document.querySelectorAll('.calendar-day.selected').forEach(el => el.classList.remove('selected'));

    const selectedDay = document.querySelector(`.calendar-day[data-date="${dateStr}"]`);
    if (selectedDay) {
        selectedDay.classList.add('selected');
    }

    selectedDayDate = dateStr;

    const entries = calendarEntriesCache.get(dateStr) || [];

    // Format the date for display
    const dateObj = new Date(dateStr + 'T00:00:00');
    const formattedDate = dateObj.toLocaleDateString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    renderDailyLogCard({
        container: dayDetailsContainer,
        title: formattedDate,
        entries: entries,
        issuesMap: new Map(), // Calendar entries already contain issue subtitles
        onEdit: (entry) => manageTimeEntry(entry),
        onDelete: deleteTimeEntryHandler,
        onAdd: (date) => manageTimeEntry(null, date)
    });

    dayDetailsContainer.style.display = 'block';
}

// =============================================
// MULTI-SELECT FUNCTIONS
// =============================================

export function toggleMultiSelect() {
    multiSelectMode = !multiSelectMode;

    const toggleBtn = document.getElementById('toggle-multiselect-btn');
    const selectedCount = document.getElementById('selected-days-count');
    const clearBtn = document.getElementById('clear-selection-btn');
    const bulkLogPanel = document.getElementById('bulk-log-panel');
    const dayDetails = document.getElementById('day-details');

    if (toggleBtn) {
        if (multiSelectMode) {
            toggleBtn.classList.add('active');
            toggleBtn.innerHTML = '<i class="fa-solid fa-check-double me-1"></i>Finish Selection';
        } else {
            toggleBtn.classList.remove('active');
            toggleBtn.innerHTML = '<i class="fa-solid fa-check-double me-1"></i>Select Days';
        }
    }

    // Manage UI visibility
    if (multiSelectMode) {
        if (selectedCount) selectedCount.style.display = 'inline-block';
        if (clearBtn) clearBtn.style.display = 'inline-block';
        if (dayDetails) dayDetails.style.display = 'none'; // Hide single day details
        if (bulkLogPanel) bulkLogPanel.style.display = 'block';

        // Initialize form if showing for the first time
        initBulkLogForm();
    } else {
        if (selectedCount) selectedCount.style.display = 'none';
        if (clearBtn) clearBtn.style.display = 'none';
        if (bulkLogPanel) bulkLogPanel.style.display = 'none';

        // Clear selection when exiting mode? Optional. Let's keep it for now.
        selectedDays.clear();
        updateMultiSelectUI();
    }

    // Re-render calendar to update click handlers and styles
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth();
    renderCalendar(year, month);
}

export function toggleDaySelection(dateStr: string) {
    if (!multiSelectMode) return;

    if (selectedDays.has(dateStr)) {
        selectedDays.delete(dateStr);
    } else {
        selectedDays.add(dateStr);
    }

    updateMultiSelectUI(dateStr);
}

export function clearSelection() {
    selectedDays.clear();
    updateMultiSelectUI();
}

function updateMultiSelectUI(specificDateStr?: string) {
    // efficient DOM update
    if (specificDateStr) {
        const dayEl = document.querySelector(`.calendar-day[data-date="${specificDateStr}"]`);
        if (dayEl) {
            if (selectedDays.has(specificDateStr)) {
                dayEl.classList.add('multi-selected');
            } else {
                dayEl.classList.remove('multi-selected');
            }
        }
    } else {
        // Redraw all selection states (fallback)
        const year = currentCalendarMonth.getFullYear();
        const month = currentCalendarMonth.getMonth();
        renderCalendar(year, month);
    }

    // Update count badge
    const countBadge = document.getElementById('selected-days-count');
    if (countBadge) {
        countBadge.textContent = `${selectedDays.size} selected`;
    }

    updateBulkLogButton();
}

function updateBulkLogButton() {
    const submitBtn = document.getElementById('bulk-submit-btn') as HTMLButtonElement;
    const countSpan = document.getElementById('bulk-submit-count');

    if (submitBtn && countSpan) {
        countSpan.textContent = selectedDays.size.toString();
        submitBtn.disabled = selectedDays.size === 0;
    }
}

// Bulk Log Form Logic

let bulkFormInitialized = false;

function initBulkLogForm() {
    if (bulkFormInitialized) return;

    // Initialize autocomplete for bulk form
    // Note: We're reusing the population logic from projects.ts but specialized for this form
    // Since we don't have direct access to populateTasksForTodoForm with a target, we'll
    // replicate the necessary bits or assume the data is already in state.projects/tasks

    const projectInput = document.getElementById('bulk-project-input') as HTMLInputElement;
    const taskInput = document.getElementById('bulk-task-input') as HTMLInputElement;
    const activitySelect = document.getElementById('bulk-activity-select') as HTMLSelectElement;
    const form = document.getElementById('bulk-log-form') as HTMLFormElement;

    if (!projectInput || !taskInput || !activitySelect || !form) return;

    // Populate activities
    const availableActivities = getAvailableActivities();
    if (availableActivities.length > 0) {
        activitySelect.innerHTML = '<option value="">-- Select Activity --</option>' +
            availableActivities.map(act => `<option value="${act.id}">${act.name}</option>`).join('');
    }

    // Setup autocomplete (simplified version of queue.ts logic)
    setupBulkAutocomplete(projectInput, taskInput);

    // Handle submit
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitBulkTimeEntries();
    });

    bulkFormInitialized = true;
}

function setupBulkAutocomplete(projectInput: HTMLInputElement, taskInput: HTMLInputElement) {
    // Project autocomplete
    const projectList = document.getElementById('bulk-project-list') as HTMLDivElement;
    if (projectList) {
        initAutocomplete({
            inputEl: projectInput,
            listEl: projectList,
            sourceData: state.allProjects,
            renderItem: (item: any) => item.name,
            filterItem: (item: any, query: string) => item.name.toLowerCase().includes(query),
            onSelect: async (item: any) => {
                projectInput.value = item.name;
                projectInput.dataset.projectId = item.id.toString();

                // Enable task input and reset it
                taskInput.disabled = true;
                taskInput.value = '';
                taskInput.placeholder = 'Loading tasks...';
                delete taskInput.dataset.taskId;
                currentBulkTasks = [];

                try {
                    const endpoint = `/issues.json?project_id=${item.id}&status_id=open&limit=100`;
                    const data = await redmineApiRequest(endpoint);
                    currentBulkTasks = data.issues || [];

                    taskInput.disabled = false;
                    taskInput.placeholder = 'Search tasks...';
                } catch (error) {
                    console.error('Failed to load tasks', error);
                    taskInput.placeholder = 'Error loading tasks';
                }
            }
        });
    }

    // Task autocomplete
    const taskList = document.getElementById('bulk-task-list') as HTMLDivElement;
    if (taskList) {
        initAutocomplete({
            inputEl: taskInput,
            listEl: taskList,
            sourceData: () => currentBulkTasks,
            renderItem: (item: any) => `#${item.id} ${item.subject}`,
            filterItem: (item: any, query: string) => {
                return item.subject.toLowerCase().includes(query) || item.id.toString().includes(query);
            },
            onSelect: (item: any) => {
                taskInput.value = `#${item.id} ${item.subject}`;
                taskInput.dataset.taskId = item.id.toString();
            }
        });
    }

    // Helper to close lists when clicking outside is now handled by initAutocomplete
}

async function submitBulkTimeEntries() {
    const statusDiv = document.getElementById('bulk-log-status');
    const submitBtn = document.getElementById('bulk-submit-btn') as HTMLButtonElement;

    if (selectedDays.size === 0) {
        showError('Please select at least one day.');
        return;
    }

    const taskInput = document.getElementById('bulk-task-input') as HTMLInputElement;
    const issueId = taskInput.dataset.taskId;

    const activitySelect = document.getElementById('bulk-activity-select') as HTMLSelectElement;
    const activityId = activitySelect.value;

    const hoursInput = document.getElementById('bulk-hours-input') as HTMLInputElement;
    const hours = parseFloat(hoursInput.value);

    const descInput = document.getElementById('bulk-description-input') as HTMLInputElement;
    const comments = descInput.value.trim();

    const billableCheckbox = document.getElementById('bulk-billable-checkbox') as HTMLInputElement;
    const isBillable = billableCheckbox.checked;

    // Validation
    if (!issueId) {
        if (statusDiv) {
            statusDiv.textContent = 'Please select a valid task.';
            statusDiv.className = 'status-message error';
        }
        return;
    }
    if (!activityId) {
        if (statusDiv) {
            statusDiv.textContent = 'Please select an activity.';
            statusDiv.className = 'status-message error';
        }
        return;
    }
    if (isNaN(hours) || hours <= 0) {
        if (statusDiv) {
            statusDiv.textContent = 'Please enter valid hours.';
            statusDiv.className = 'status-message error';
        }
        return;
    }

    // Submit
    if (statusDiv) {
        statusDiv.textContent = `Submitting time for ${selectedDays.size} days...`;
        statusDiv.className = 'status-message loading';
    }
    submitBtn.disabled = true;

    const billableFieldId = localStorage.getItem('billableFieldId');
    const customFields = [];
    if (billableFieldId) {
        customFields.push({ id: parseInt(billableFieldId), value: isBillable ? "1" : "0" });
    }

    let successCount = 0;
    let failCount = 0;
    const total = selectedDays.size;

    // Process days sequentially to avoid rate limiting
    for (const dateStr of selectedDays) {
        try {
            const payload = {
                time_entry: {
                    issue_id: parseInt(issueId),
                    hours: hours,
                    comments: comments,
                    activity_id: parseInt(activityId),
                    spent_on: dateStr,
                    custom_fields: customFields.length > 0 ? customFields : undefined
                }
            };

            await redmineApiRequest('/time_entries.json', 'POST', payload);
            successCount++;

            if (statusDiv) {
                statusDiv.textContent = `Progress: ${successCount}/${total}...`;
            }

        } catch (error) {
            console.error(`Failed to log time for ${dateStr}:`, error);
            failCount++;
        }
    }

    // Final status
    if (failCount === 0) {
        if (statusDiv) {
            statusDiv.textContent = `Successfully logged time for all ${successCount} days!`;
            statusDiv.className = 'status-message success';
        }

        // Reset and refresh
        setTimeout(() => {
            // Exit multi-select mode
            toggleMultiSelect();
            // Refresh calendar
            loadCalendarView();
            // Refresh recent logs
            initLoggedTimePage();

            if (statusDiv) statusDiv.textContent = '';

            // Clear form inputs
            taskInput.value = '';
            delete taskInput.dataset.taskId;
            descInput.value = '';

        }, 1500);

    } else {
        if (statusDiv) {
            statusDiv.textContent = `Completed with errors. Success: ${successCount}, Failed: ${failCount}. See console for details.`;
            statusDiv.className = 'status-message warning';
        }
        submitBtn.disabled = false;

        // Refresh to show partial success
        loadCalendarView();
    }
}

// Expose functions globally
(window as any).showCalendarDayDetails = showCalendarDayDetails;
(window as any).toggleDaySelection = toggleDaySelection;
