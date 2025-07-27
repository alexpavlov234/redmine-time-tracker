import { getTimeEntries, getIssues, updateTimeEntry, deleteTimeEntry } from '../services/redmine.js';
import { state } from '../state/index.js';
import { RedmineIssue, TimeEntry } from '../types/index.js';
import { formatDate } from '../utils/helpers.js';
import { showError, showConfirm, showSuccess } from '../utils/ui.js';

const todayLog = document.getElementById('today-log') as HTMLUListElement;
const yesterdayLog = document.getElementById('yesterday-log') as HTMLUListElement;
const todayTotalTime = document.getElementById('today-total-time') as HTMLSpanElement;
const yesterdayTotalTime = document.getElementById('yesterday-total-time') as HTMLSpanElement;

function renderTimeEntries(entries: TimeEntry[], element: HTMLUListElement, issuesMap: Map<number, RedmineIssue>) {
    element.innerHTML = '';
    if (entries.length === 0) {
        element.innerHTML = '<li class="list-group-item">No time logged.</li>';
        return;
    }

    entries.forEach(entry => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item py-2'; // Reduced padding

        let taskName = 'No task';
        if (entry.issue && entry.issue.subject) {
            taskName = entry.issue.subject;
        } else if (entry.issue && entry.issue.id) {
            const issue = issuesMap.get(entry.issue.id);
            if (issue) {
                taskName = issue.subject;
            }
        }

        // Create a more compact layout
        const rowDiv = document.createElement('div');
        rowDiv.className = 'd-flex align-items-center justify-content-between';

        // Left side: Project and task info
        const infoDiv = document.createElement('div');
        infoDiv.className = 'text-truncate me-2';
        infoDiv.style.maxWidth = '60%';

        // Task name with tooltip for long names
        const taskNameDiv = document.createElement('div');
        taskNameDiv.className = 'fw-semibold text-truncate';
        taskNameDiv.title = taskName; // Add tooltip
        taskNameDiv.textContent = taskName;

        // Project name on the same line as comments
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'small text-muted d-flex';

        const projectSpan = document.createElement('span');
        projectSpan.className = 'text-truncate';
        projectSpan.title = entry.project.name;
        projectSpan.textContent = entry.project.name;
        detailsDiv.appendChild(projectSpan);

        // Add comments if they exist
        if (entry.comments) {
            const commentsSpan = document.createElement('span');
            commentsSpan.className = 'text-secondary ms-2 text-truncate';
            commentsSpan.title = entry.comments;
            commentsSpan.textContent = `• ${entry.comments}`;
            detailsDiv.appendChild(commentsSpan);
        }

        infoDiv.appendChild(taskNameDiv);
        infoDiv.appendChild(detailsDiv);

        // Hours badge
        const hoursSpan = document.createElement('span');
        hoursSpan.className = 'badge bg-primary rounded-pill mx-2';
        hoursSpan.textContent = `${entry.hours.toFixed(2)}h`;

        // Actions container
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'btn-group btn-group-sm';

        // Edit button
        const editBtn = document.createElement('button');
        editBtn.className = 'btn btn-sm btn-outline-secondary';
        editBtn.innerHTML = '<i class="fa-solid fa-edit"></i>';
        editBtn.title = 'Edit time entry';
        editBtn.style.padding = '0.25rem 0.5rem';
        editBtn.addEventListener('click', () => editTimeEntry(entry));

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.title = 'Delete time entry';
        deleteBtn.style.padding = '0.25rem 0.5rem';
        deleteBtn.addEventListener('click', () => deleteTimeEntryHandler(entry.id));

        // Assemble the components
        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);

        rowDiv.appendChild(infoDiv);
        rowDiv.appendChild(hoursSpan);
        rowDiv.appendChild(actionsDiv);

        listItem.appendChild(rowDiv);
        element.appendChild(listItem);
    });
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
                                <input type="number" class="form-control" id="edit-hours" value="${entry.hours}" step="0.01" min="0.01" max="24" required>
                            </div>
                            <div class="mb-3">
                                <label for="edit-comments" class="form-label">Comments</label>
                                <textarea class="form-control" id="edit-comments" rows="3">${entry.comments || ''}</textarea>
                            </div>
                            <div class="mb-3">
                                <label for="edit-spent-on" class="form-label">Date</label>
                                <input type="date" class="form-control" id="edit-spent-on" value="${entry.spent_on}" required>
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
        const yesterdaySection = document.getElementById('yesterday-log') as HTMLElement;
        if (todaySection) showSpinner(todaySection);
        if (yesterdaySection) showSpinner(yesterdaySection);

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const from = formatDate(yesterday);
        const to = formatDate(today);

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
                issues.forEach(issue => issuesMap.set(issue.id, issue));
            } catch (error) {
                showError('Failed to load some task details.');
                console.error(error);
            }
        }

        const todayEntries = timeEntries.filter(entry => formatDate(new Date(entry.spent_on)) === to);
        const yesterdayEntries = timeEntries.filter(entry => formatDate(new Date(entry.spent_on)) === from);

        // Hide loading spinners
        if (todaySection) hideSpinner(todaySection);
        if (yesterdaySection) hideSpinner(yesterdaySection);

        renderTimeEntries(todayEntries, todayLog, issuesMap);
        renderTimeEntries(yesterdayEntries, yesterdayLog, issuesMap);

        const todayTotal = calculateTotal(todayEntries);
        const yesterdayTotal = calculateTotal(yesterdayEntries);

        todayTotalTime.textContent = `${todayTotal.toFixed(2)} h`;
        yesterdayTotalTime.textContent = `${yesterdayTotal.toFixed(2)} h`;

    } catch (error) {
        // Hide loading spinners in case of error
        const todaySection = document.getElementById('today-log') as HTMLElement;
        const yesterdaySection = document.getElementById('yesterday-log') as HTMLElement;
        if (todaySection) hideSpinner(todaySection);
        if (yesterdaySection) hideSpinner(yesterdaySection);

        showError('Failed to load logged time.');
        console.error(error);
    }
}
