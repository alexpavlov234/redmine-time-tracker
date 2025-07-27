import { getTimeEntries, getIssues, updateTimeEntry, deleteTimeEntry } from '../services/redmine.js';
import { state } from '../state/index.js';
import { RedmineIssue, TimeEntry } from '../types/index.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showConfirm, showSuccess } from '../utils/ui.js';

const todayLog = document.getElementById('today-log') as HTMLUListElement;
const lastLog = document.getElementById('last-log') as HTMLUListElement;
const todayTotalTime = document.getElementById('today-total-time') as HTMLSpanElement;
const lastLogTotalTime = document.getElementById('last-log-total-time') as HTMLSpanElement;
const lastLoggedDayTitle = document.getElementById('last-logged-day-title') as HTMLHeadingElement;
const todayProjectsSummary = document.getElementById('today-projects-summary') as HTMLDivElement;
const lastDayProjectsSummary = document.getElementById('last-day-projects-summary') as HTMLDivElement;

function renderTimeEntries(entries: TimeEntry[], element: HTMLUListElement, issuesMap: Map<number, RedmineIssue>) {
    element.innerHTML = '';
    if (entries.length === 0) {
        element.innerHTML = '<li class="list-group-item">No time logged.</li>';
        return;
    }

    entries.forEach(entry => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item py-2';

        let taskName = 'No task';
        if (entry.issue && entry.issue.subject) {
            taskName = entry.issue.subject;
        } else if (entry.issue && entry.issue.id) {
            const issue = issuesMap.get(entry.issue.id);
            if (issue) {
                taskName = issue.subject;
            }
        }

        const rowDiv = document.createElement('div');
        rowDiv.className = 'd-flex align-items-start justify-content-between';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'me-2';
        infoDiv.style.flex = '1';
        infoDiv.style.minWidth = '0';

        const commentDiv = document.createElement('div');
        commentDiv.className = 'fw-semibold';
        commentDiv.style.whiteSpace = 'pre-wrap';
        commentDiv.style.wordBreak = 'break-word';
        commentDiv.textContent = entry.comments || taskName;
        infoDiv.appendChild(commentDiv);

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'small text-muted';

        const projectSpan = document.createElement('span');
        projectSpan.className = 'd-block text-truncate';
        projectSpan.title = entry.project.name;
        projectSpan.textContent = `Project: ${entry.project.name}`;
        detailsDiv.appendChild(projectSpan);

        if (entry.comments) {
            const taskSpan = document.createElement('span');
            taskSpan.className = 'd-block text-truncate';
            taskSpan.title = taskName;
            taskSpan.textContent = `Task: ${taskName}`;
            detailsDiv.appendChild(taskSpan);
        }

        infoDiv.appendChild(detailsDiv);

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'd-flex flex-column align-items-end';

        const hoursSpan = document.createElement('span');
        hoursSpan.className = 'badge bg-primary rounded-pill mb-2';
        hoursSpan.textContent = `${entry.hours.toFixed(2)}h`;
        controlsDiv.appendChild(hoursSpan);

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'btn-group btn-group-sm';

        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline-secondary';
        editBtn.innerHTML = '<i class="fa-solid fa-edit"></i>';
        editBtn.title = 'Edit time entry';
        editBtn.style.padding = '0.25rem 0.5rem';
        editBtn.addEventListener('click', () => editTimeEntry(entry));
        actionsDiv.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.title = 'Delete time entry';
        deleteBtn.style.padding = '0.25rem 0.5rem';
        deleteBtn.addEventListener('click', () => deleteTimeEntryHandler(entry.id));
        actionsDiv.appendChild(deleteBtn);

        controlsDiv.appendChild(actionsDiv);

        rowDiv.appendChild(infoDiv);
        rowDiv.appendChild(controlsDiv);

        listItem.appendChild(rowDiv);
        element.appendChild(listItem);
    });
}

function renderDailyProjectsSummary(entries: TimeEntry[], container: HTMLDivElement) {
    if (!container) return;

    if (entries.length === 0) {
        container.innerHTML = ''; // No summary if no entries
        return;
    }

    const projectHours = new Map<string, number>();

    entries.forEach(entry => {
        const projectName = entry.project.name;
        const currentHours = projectHours.get(projectName) || 0;
        projectHours.set(projectName, currentHours + entry.hours);
    });

    const sortedProjects = [...projectHours.entries()].sort((a, b) => b[1] - a[1]);

    if (sortedProjects.length === 0) {
        container.innerHTML = '';
        return;
    }

    const summaryHtml = sortedProjects.map(([projectName, totalHours]) => {
        return `
            <div class="d-flex justify-content-between align-items-center py-1 small">
                <span class="text-truncate text-muted" title="${projectName}">${projectName}</span>
                <span class="fw-bold text-muted">${totalHours.toFixed(2)}h</span>
            </div>
        `;
    }).join('');

    container.innerHTML = summaryHtml;
}

function calculateTotal(entries: TimeEntry[]): number {
    return entries.reduce((total, entry) => total + entry.hours, 0);
}

async function editTimeEntry(entry: TimeEntry) {
    // Create modal HTML
    const modalId = 'edit-time-entry-modal';
    const modalHtml = `
        <div class="modal fade" id="${modalId}" tabindex="-1" aria-labelledby="editTimeEntryModalLabel" aria-hidden="true">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="editTimeEntryModalLabel">Edit Time Entry</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <form id="edit-time-entry-form">
                            <div class="mb-3">
                                <label for="edit-hours" class="form-label">Hours</label>
                                <input type="number" class="form-control form-control-sm" id="edit-hours" value="${entry.hours}" step="0.01" min="0.01" max="24" required>
                            </div>
                            <div class="mb-3">
                                <label for="edit-comments" class="form-label">Comments</label>
                                <textarea class="form-control form-control-sm" id="edit-comments" rows="3">${entry.comments || ''}</textarea>
                            </div>
                            <div class="mb-3">
                                <label for="edit-spent-on" class="form-label">Date</label>
                                <input type="date" class="form-control form-control-sm" id="edit-spent-on" value="${entry.spent_on}" required>
                            </div>
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="save-time-entry">Save Changes</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Append modal to the body
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer);

    // Show the modal
    const modal = new window.bootstrap.Modal(document.getElementById(modalId));
    modal.show();

    // Handle form submission
    const saveButton = document.getElementById('save-time-entry');
    saveButton?.addEventListener('click', async () => {
        const hoursInput = document.getElementById('edit-hours') as HTMLInputElement;
        const commentsInput = document.getElementById('edit-comments') as HTMLTextAreaElement;
        const spentOnInput = document.getElementById('edit-spent-on') as HTMLInputElement;

        const hours = parseFloat(hoursInput.value);
        const comments = commentsInput.value;
        const spentOn = spentOnInput.value;

        if (isNaN(hours) || hours <= 0) {
            showError('Please enter valid hours.');
            return;
        }

        try {
            await updateTimeEntry(entry.id, {
                hours,
                comments,
                spent_on: spentOn
            });

            showSuccess('Time entry updated successfully.');
            modal.hide();

            // Remove the modal from DOM after hiding
            document.getElementById(modalId)?.addEventListener('hidden.bs.modal', function () {
                modalContainer.remove();
            });

            // Refresh the logged time page
            await initLoggedTimePage();
        } catch (error) {
            showError('Failed to update time entry.');
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

            // Refresh the logged time page
            await initLoggedTimePage();
        } catch (error) {
            showError('Failed to delete time entry.');
            console.error(error);
        }
    }
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
        const todaySection = document.getElementById('today-log') as HTMLElement;
        const yesterdaySection = document.getElementById('last-log') as HTMLElement;
        if (todaySection) showSpinner(todaySection);
        if (yesterdaySection) showSpinner(yesterdaySection);
        if (todayProjectsSummary) todayProjectsSummary.innerHTML = '<p class="text-muted small">Loading summary...</p>';
        if (lastDayProjectsSummary) lastDayProjectsSummary.innerHTML = '<p class="text-muted small">Loading summary...</p>';

        const today = new Date();
        const to = formatDate(today);

        const fromDate = new Date();
        fromDate.setDate(today.getDate() - 30); // Look back 30 days
        const from = formatDate(fromDate);

        const timeEntries = await getTimeEntries({ from, to, user_id: state.user.id });

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

        const todayEntries = timeEntries.filter(entry => formatDate(new Date(entry.spent_on)) === to);
        const otherEntries = timeEntries.filter(entry => formatDate(new Date(entry.spent_on)) !== to);

        let lastLoggedDayEntries: TimeEntry[] = [];
        if (otherEntries.length > 0) {
            const lastLoggedDate = otherEntries.reduce((max, entry) => entry.spent_on > max ? entry.spent_on : max, otherEntries[0].spent_on);
            lastLoggedDayEntries = otherEntries.filter(entry => entry.spent_on === lastLoggedDate);

            if (lastLoggedDayTitle) {
                const date = new Date(lastLoggedDate);
                const userTimezoneOffset = date.getTimezoneOffset() * 60000;
                const adjustedDate = new Date(date.getTime() + userTimezoneOffset);
                lastLoggedDayTitle.textContent = adjustedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
            }
        } else {
            if (lastLoggedDayTitle) {
                lastLoggedDayTitle.textContent = 'Older Entries';
            }
        }

        // Hide loading spinners
        if (todaySection) hideSpinner(todaySection);
        if (yesterdaySection) hideSpinner(yesterdaySection);

        renderDailyProjectsSummary(todayEntries, todayProjectsSummary);
        renderDailyProjectsSummary(lastLoggedDayEntries, lastDayProjectsSummary);

        renderTimeEntries(todayEntries, todayLog, issuesMap);
        renderTimeEntries(lastLoggedDayEntries, lastLog, issuesMap);

        const todayTotal = calculateTotal(todayEntries);
        const yesterdayTotal = calculateTotal(lastLoggedDayEntries);

        todayTotalTime.textContent = `${todayTotal.toFixed(2)} h`;
        lastLogTotalTime.textContent = `${yesterdayTotal.toFixed(2)} h`;

    } catch (error) {
        // Hide loading spinners in case of error
        const todaySection = document.getElementById('today-log') as HTMLElement;
        const yesterdaySection = document.getElementById('last-log') as HTMLElement;
        if (todaySection) hideSpinner(todaySection);
        if (yesterdaySection) hideSpinner(yesterdaySection);

        showError('Failed to load logged time.');
        console.error(error);
    }
}
