import { getTimeEntries, getIssues, updateTimeEntry, deleteTimeEntry, createTimeEntry, redmineApiRequest } from '../services/redmine.js';
import { state } from '../state/index.js';
import { RedmineIssue, TimeEntry } from '../types/index.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showConfirm, showSuccess } from '../utils/ui.js';
import { renderDailyLogCard } from '../components/DailyLogCard.js';
import { createTimeEntryForm } from '../components/TimeEntryForm.js';
import { getAvailableActivities } from './activitySelector.js';


const todayLogContainer = document.getElementById('today-log-container') as HTMLDivElement;

// Calendar state
let currentCalendarMonth = new Date();
let calendarEntriesCache: Map<string, TimeEntry[]> = new Map();
let calendarIssuesCache: Map<number, RedmineIssue> = new Map();



// Multi-select state
let multiSelectMode = false;
let selectedDays: Set<string> = new Set();


async function manageTimeEntry(entry: TimeEntry | null, dateStr?: string) {
    const isEdit = !!entry;
    const title = isEdit ? 'Edit Time Entry' : 'Log Time';
    const hoursValue = isEdit ? entry.hours : 8;
    const commentsValue = isEdit ? (entry.comments || '') : '';
    const dateValue = isEdit ? entry.spent_on : (dateStr || formatDate(new Date()));

    // Determine billable state
    const billableFieldId = localStorage.getItem('billableFieldId');
    let isBillable = true; // Default

    if (isEdit && entry && entry.custom_fields && billableFieldId) {
        const fieldId = parseInt(billableFieldId, 10);
        const field = entry.custom_fields.find(f => f.id === fieldId);
        if (field) {
            isBillable = field.value === '1' || field.value === 'true';
        }
    } else if (isEdit && entry && !billableFieldId) {
        // If we don't know the ID but are editing, we can't be sure, so default to true or try to find by name? 
        // For now, stick to default true if config is missing to be safe, or maybe check existing logic
        isBillable = true;
    }


    // IDs for prepopulation
    let selectedProjectId = isEdit ? entry?.project?.id : null;
    let selectedTaskId = isEdit ? entry?.issue?.id : null;
    let selectedActivityId = isEdit ? entry?.activity?.id : getAvailableActivities().find(a => a.is_default)?.id;

    // Create modal HTML shell
    const modalId = 'manage-time-entry-modal';
    const modalHtml = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="manageTimeEntryModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="manageTimeEntryModalLabel">${title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body" id="manage-time-entry-form-container">
                        <!-- Form will be injected here -->
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

    const formContainer = document.getElementById('manage-time-entry-form-container') as HTMLElement;
    
    // Inject dynamic component
    createTimeEntryForm({
        mode: 'single',
        container: formContainer,
        prefix: 'manage',
        submitText: 'Save',
        showCancel: true,
        initialValues: {
            projectId: selectedProjectId || undefined,
            taskId: selectedTaskId || undefined,
            activityId: selectedActivityId || undefined,
            hours: hoursValue,
            comments: commentsValue,
            spentOn: dateValue,
            isBillable
        },
        onCancel: () => {
             modal.hide();
        },
        onSubmit: async (values: any) => {
            const { projectId, taskId, activityId, hours, spentOn, comments, isBillable } = values;

            // Validation
            if (isNaN(hours) || hours <= 0) {
                showError('Please enter valid hours.');
                throw new Error('Invalid hours');
            }
            if (!projectId) {
                showError('Please select a project.');
                throw new Error('Project missing');
            }
            if (!taskId) {
                showError('Please select a task.');
                throw new Error('Task missing');
            }
            if (!activityId) {
                showError('Please select an activity.');
                throw new Error('Activity missing');
            }

            try {
                // Prepare custom fields (Billable)
                const customFields: { id: number; value: any }[] = [];
                if (billableFieldId) {
                    customFields.push({
                        id: parseInt(billableFieldId, 10),
                        value: isBillable ? "1" : "0"
                    });
                }

                if (isEdit && entry) {
                    await updateTimeEntry(entry.id, {
                        hours,
                        comments,
                        spent_on: spentOn,
                        activity_id: parseInt(activityId),
                        issue_id: parseInt(taskId),
                        custom_fields: customFields
                    });
                    showSuccess('Time entry updated successfully.');
                } else {
                    // Create New Entry
                    await createTimeEntry({
                        hours,
                        comments,
                        spent_on: spentOn,
                        activity_id: parseInt(activityId),
                        issue_id: parseInt(taskId),
                        project_id: parseInt(projectId),
                        custom_fields: customFields
                    });
                    showSuccess('Time entry created successfully.');
                }

                modal.hide();
                await refreshCalendarAfterChange();
            } catch (error) {
                showError('Failed to save time entry.');
                console.error(error);
                throw error;
            }
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
            dateIso: todayStr,
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

        // --- NEW: Fetch missing issue details for the whole month ---
        // Identify issues that have an ID but no subject in the time entry
        const issueIdsToFetch = new Set<number>();
        timeEntries.forEach(entry => {
            if (entry.issue && entry.issue.id && !entry.issue.subject) {
                issueIdsToFetch.add(entry.issue.id);
            }
        });

        // Clear previous issue cache for the calendar (or merge?)
        // Let's clear to be safe and fresh for the month view
        calendarIssuesCache.clear();

        if (issueIdsToFetch.size > 0) {
            const ids = Array.from(issueIdsToFetch);

            // Chunking to avoid URL too long errors
            const chunkSize = 20; // Safe chunk size
            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                try {
                    const issues = await getIssues(chunk);
                    issues.forEach((issue: RedmineIssue) => calendarIssuesCache.set(issue.id, issue));
                } catch (err) {
                    console.error('Failed to fetch chunk of issues', err);
                    // Continue to next chunk
                }
            }
        }

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
        dateIso: dateStr,
        entries: entries,
        issuesMap: calendarIssuesCache, // Pass the cache here
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
    if (submitBtn) {
        submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane me-1"></i>Log Time for ${selectedDays.size} Days`;
        submitBtn.disabled = selectedDays.size === 0;
    }
}

// Bulk Log Form Logic

let bulkFormCleanup: (() => void) | null = null;
let bulkFormInitialized = false;

function initBulkLogForm() {
    if (bulkFormInitialized) return;

    const container = document.getElementById('bulk-log-form-container');
    if (!container) return;

    if (bulkFormCleanup) bulkFormCleanup();

    bulkFormCleanup = createTimeEntryForm({
        mode: 'bulk',
        container,
        prefix: 'bulk',
        submitText: `Log Time for ${selectedDays.size} Days`,
        onSubmit: async (values) => {
            await submitBulkTimeEntries(values);
        }
    });

    bulkFormInitialized = true;
}

// We still need a method to handle the loop
async function submitBulkTimeEntries(values: any) {
    const statusDiv = document.getElementById('bulk-log-status');
    const { taskId, activityId, hours, comments, isBillable } = values;

    if (selectedDays.size === 0) {
        showError('Please select at least one day.');
        throw new Error('No selected days');
    }

    if (!taskId) {
        showError('Please select a valid task.');
        throw new Error('No task');
    }
    if (!activityId) {
        showError('Please select an activity.');
        throw new Error('No activity');
    }
    if (isNaN(hours) || hours <= 0) {
        showError('Please enter valid hours.');
        throw new Error('Invalid hours');
    }

    if (statusDiv) {
        statusDiv.textContent = `Submitting time for ${selectedDays.size} days...`;
        statusDiv.className = 'status-message loading';
    }

    const billableFieldId = localStorage.getItem('billableFieldId');
    const customFields = [];
    if (billableFieldId) {
        customFields.push({ id: parseInt(billableFieldId), value: isBillable ? "1" : "0" });
    }

    let successCount = 0;
    let failCount = 0;
    const total = selectedDays.size;

    for (const dateStr of selectedDays) {
        try {
            const payload = {
                time_entry: {
                    issue_id: parseInt(taskId),
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

    if (failCount === 0) {
        if (statusDiv) {
            statusDiv.textContent = `Successfully logged time for all ${successCount} days!`;
            statusDiv.className = 'status-message success';
        }

        setTimeout(() => {
            toggleMultiSelect();
            loadCalendarView();
            initLoggedTimePage();

            if (statusDiv) statusDiv.textContent = '';
            
            // Re-initialize later natively
            bulkFormInitialized = false; 
            const container = document.getElementById('bulk-log-form-container');
            if(container) container.innerHTML = '';
        }, 1500);

    } else {
        if (statusDiv) {
            statusDiv.textContent = `Completed with errors. Success: ${successCount}, Failed: ${failCount}. See console for details.`;
            statusDiv.className = 'status-message warning';
        }
        loadCalendarView();
        throw new Error('Completed with errors');
    }
}

// Expose functions globally
(window as any).showCalendarDayDetails = showCalendarDayDetails;
(window as any).toggleDaySelection = toggleDaySelection;
