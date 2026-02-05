import { TimeEntry, RedmineIssue } from '../types/index.js';
import { renderDailyProjectsSummary } from './ProjectSummary.js';

interface DailyLogCardOptions {
    container: HTMLElement;
    title: string;
    entries: TimeEntry[];
    issuesMap: Map<number, RedmineIssue>;
    onEdit: (entry: TimeEntry) => void;
    onDelete: (entryId: number) => void;
    onAdd?: (date: string) => void;
}

export function renderDailyLogCard(options: DailyLogCardOptions) {
    const { container, title, entries, issuesMap, onEdit, onDelete, onAdd } = options;

    if (!container) return;

    // Clear container
    container.innerHTML = '';

    // Create Card Structure
    const card = document.createElement('div');
    card.className = 'card h-100';

    // Card Body
    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    // Header Row (Title + Optional Add Button)
    const headerRow = document.createElement('div');
    headerRow.className = 'd-flex justify-content-between align-items-center mb-3';

    // Title
    const cardTitle = document.createElement('h5');
    cardTitle.className = 'card-title mb-0';
    cardTitle.textContent = title;
    headerRow.appendChild(cardTitle);

    // Add Button
    if (onAdd) {
        const addBtn = document.createElement('button');
        addBtn.className = 'btn btn-sm btn-outline-primary';
        addBtn.innerHTML = '<i class="fa-solid fa-plus me-1"></i>Log Time';
        addBtn.title = 'Add time entry for this day';

        // Try to parse date from title or context if possible, otherwise pass generic
        // For Calendar details, title is usually the formatted date. 
        // We'll rely on the caller to handle the context, but here we can pass the title as a hint if needed
        // The simplest way is to let the click handler use the closure variable if available at call site,
        // but here we are in a generic component.
        // Ideally, DailyLogCard should receive the raw date string too if it needs to pass it back.
        // For now, we'll pass the title string which might be a date.
        addBtn.addEventListener('click', () => onAdd(title));

        headerRow.appendChild(addBtn);
    }

    cardBody.appendChild(headerRow);

    // Project Summary (Confusion Matrix/Badges)
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'mb-3';
    renderDailyProjectsSummary(entries, summaryDiv);
    cardBody.appendChild(summaryDiv);

    // Entries List
    const list = document.createElement('ul');
    list.className = 'list-group list-group-flush';
    renderEntriesList(entries, list, issuesMap, onEdit, onDelete);
    cardBody.appendChild(list);

    card.appendChild(cardBody);

    // Card Footer (Total Time)
    const cardFooter = document.createElement('div');
    cardFooter.className = 'card-footer d-flex justify-content-between align-items-center';

    const totalLabel = document.createElement('strong');
    totalLabel.textContent = 'Total:';

    const totalValue = document.createElement('span');
    totalValue.className = 'fw-bold';
    totalValue.textContent = formatTotalTime(entries);

    cardFooter.appendChild(totalLabel);
    cardFooter.appendChild(totalValue);
    card.appendChild(cardFooter);

    // Append complete card to container
    container.appendChild(card);
}

function renderEntriesList(
    entries: TimeEntry[],
    listElement: HTMLUListElement,
    issuesMap: Map<number, RedmineIssue>,
    onEdit: (entry: TimeEntry) => void,
    onDelete: (entryId: number) => void
) {
    if (entries.length === 0) {
        listElement.innerHTML = '<li class="list-group-item text-muted">No time logged.</li>';
        return;
    }

    entries.forEach(entry => {
        const listItem = document.createElement('li');
        listItem.className = 'list-group-item py-2';

        let taskName = 'No task';
        let taskId = entry.issue ? entry.issue.id : null;
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
            taskSpan.textContent = `Task: #${taskId} ${taskName}`;
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
        editBtn.addEventListener('click', () => onEdit(entry));
        actionsDiv.appendChild(editBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
        deleteBtn.title = 'Delete time entry';
        deleteBtn.style.padding = '0.25rem 0.5rem';
        deleteBtn.addEventListener('click', () => onDelete(entry.id));
        actionsDiv.appendChild(deleteBtn);

        controlsDiv.appendChild(actionsDiv);

        rowDiv.appendChild(infoDiv);
        rowDiv.appendChild(controlsDiv);

        listItem.appendChild(rowDiv);
        listElement.appendChild(listItem);
    });
}

function formatTotalTime(entries: TimeEntry[]): string {
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const hours = Math.floor(totalHours);
    const minutes = Math.round((totalHours - hours) * 60);
    return `${hours}h ${minutes}m`;
}
