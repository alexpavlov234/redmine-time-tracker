import { state, setWatchedIssues, setMyIssues } from '@/src/state';
import { getWatchedIssues, getMyIssues } from '../services/redmine.js';
import { addToQueueFromWatched } from './queue.js';
import { RedmineIssue } from '../types/index.js';

const browserContainer = document.getElementById('task-browser-list') as HTMLElement | null;
const refreshBtn = document.getElementById('refresh-task-browser-btn') as HTMLButtonElement | null;
const searchInput = document.getElementById('task-browser-search') as HTMLInputElement | null;

// Statuses we want to show (Bulgarian names as used in user's Redmine)
const ALLOWED_STATUSES = ['Изпълнение', 'Нова', 'New', 'In Progress'];

let mergedIssues: RedmineIssue[] = [];

export async function loadTaskBrowser() {
    if (!browserContainer) return;

    const hasConfig = localStorage.getItem('redmineUrl') && localStorage.getItem('redmineApiKey');
    if (!hasConfig) {
        browserContainer.innerHTML = `<div class="text-center text-muted py-3">Configure Redmine in Settings first</div>`;
        return;
    }

    browserContainer.innerHTML = `<div class="text-center text-muted py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading tasks...</div>`;

    try {
        // Fetch both watched and assigned issues in parallel
        const [watched, assigned] = await Promise.all([
            getWatchedIssues(50),
            getMyIssues(50)
        ]);

        setWatchedIssues(watched);
        setMyIssues(assigned);

        // Merge and deduplicate by issue ID
        const issueMap = new Map<number, RedmineIssue>();
        for (const issue of [...watched, ...assigned]) {
            if (!issueMap.has(issue.id)) {
                issueMap.set(issue.id, issue);
            }
        }

        // Filter by allowed statuses (if status is available; if not, include the issue)
        mergedIssues = Array.from(issueMap.values()).filter(issue => {
            if (!issue.status) return true;
            return ALLOWED_STATUSES.some(s => s.toLowerCase() === issue.status!.name.toLowerCase());
        });

        renderTaskBrowser();
    } catch (error) {
        console.error('Failed to load task browser:', error);
        browserContainer.innerHTML = `<div class="text-center text-danger py-3">Failed to load tasks</div>`;
    }
}

function renderTaskBrowser(filterQuery: string = '') {
    if (!browserContainer) return;

    const query = filterQuery.toLowerCase().trim();

    // Filter issues by query
    let filtered = mergedIssues;
    if (query) {
        filtered = mergedIssues.filter(issue =>
            issue.subject.toLowerCase().includes(query) ||
            issue.project.name.toLowerCase().includes(query) ||
            `#${issue.id}`.includes(query)
        );
    }

    if (filtered.length === 0) {
        browserContainer.innerHTML = `<div class="text-center text-muted py-3">${query ? 'No tasks match your search' : 'No tasks found'}</div>`;
        return;
    }

    // Group by project
    const grouped = new Map<string, { projectId: number; issues: RedmineIssue[] }>();
    for (const issue of filtered) {
        const key = issue.project.name;
        if (!grouped.has(key)) {
            grouped.set(key, { projectId: issue.project.id, issues: [] });
        }
        grouped.get(key)!.issues.push(issue);
    }

    // Sort projects alphabetically
    const sortedProjects = Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    // Check which issues are already in the queue
    const queuedTaskIds = new Set(state.todos.map(t => t.taskId));

    let html = '';
    for (const [projectName, { issues }] of sortedProjects) {
        // Auto-expand when searching, collapsed by default otherwise
        const isExpanded = query.length > 0;
        html += `<div class="task-browser-project-group${isExpanded ? ' expanded' : ''}">`;
        html += `<div class="task-browser-project-header">
            <i class="fa-solid fa-chevron-right task-browser-chevron"></i>
            ${escapeHtml(projectName)}<span class="task-browser-project-count">${issues.length}</span>
        </div>`;
        html += `<div class="task-browser-project-issues" style="${isExpanded ? '' : 'display: none;'}">`;
        for (const issue of issues) {
            const inQueue = queuedTaskIds.has(String(issue.id));
            const statusLabel = issue.status ? issue.status.name : '';
            html += `
                <div class="task-browser-item${inQueue ? ' in-queue' : ''}"
                     data-issue-id="${issue.id}"
                     data-project-id="${issue.project.id}"
                     data-project-name="${escapeHtml(issue.project.name)}"
                     data-subject="${escapeHtml(issue.subject)}">
                    <div class="task-browser-item-info">
                        <span class="task-browser-item-id">#${issue.id}</span>
                        <span class="task-browser-item-subject">${escapeHtml(issue.subject)}</span>
                        ${statusLabel ? `<span class="task-browser-item-status">${escapeHtml(statusLabel)}</span>` : ''}
                    </div>
                    <button type="button" class="task-browser-add-btn" title="${inQueue ? 'Already in queue' : 'Add to queue'}" ${inQueue ? 'disabled' : ''}>
                        <i class="fa-solid ${inQueue ? 'fa-check' : 'fa-plus'}"></i>
                    </button>
                </div>
            `;
        }
        html += `</div></div>`;
    }

    browserContainer.innerHTML = html;

    // Attach toggle listeners for project headers
    browserContainer.querySelectorAll('.task-browser-project-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.task-browser-project-group') as HTMLElement;
            if (!group) return;
            const issuesEl = group.querySelector('.task-browser-project-issues') as HTMLElement;
            if (!issuesEl) return;
            const isNowExpanded = group.classList.toggle('expanded');
            issuesEl.style.display = isNowExpanded ? '' : 'none';
        });
    });

    // Attach click listeners for issue items
    browserContainer.querySelectorAll('.task-browser-item:not(.in-queue)').forEach(item => {
        const el = item as HTMLElement;
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const issueId = el.dataset.issueId || '';
            const projectId = el.dataset.projectId || '';
            const projectName = el.dataset.projectName || '';
            const subject = el.dataset.subject || '';
            addToQueueFromWatched(issueId, projectId, projectName, subject);
            // Mark as in-queue immediately
            el.classList.add('in-queue');
            const btn = el.querySelector('.task-browser-add-btn') as HTMLButtonElement;
            if (btn) {
                btn.disabled = true;
                btn.title = 'Already in queue';
                btn.innerHTML = '<i class="fa-solid fa-check"></i>';
            }
        });
    });
}

export function initTaskBrowser() {
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => loadTaskBrowser());
    }

    if (searchInput) {
        let debounce: number;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = window.setTimeout(() => {
                renderTaskBrowser(searchInput.value);
            }, 200);
        });
    }

    loadTaskBrowser();
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
