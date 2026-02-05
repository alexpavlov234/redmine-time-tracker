import { state, setWatchedIssues } from '@/src/state';
import { getWatchedIssues } from '../services/redmine.js';
import { addToQueueFromWatched } from './queue.js';

const watchedListContainer = document.getElementById('watched-issues-list') as HTMLElement | null;
const refreshBtn = document.getElementById('refresh-watched-btn') as HTMLButtonElement | null;

export async function loadWatchedIssues() {
    if (!watchedListContainer) return;

    // Check if configured
    const hasConfig = localStorage.getItem('redmineUrl') && localStorage.getItem('redmineApiKey');
    if (!hasConfig) {
        watchedListContainer.innerHTML = `<div class="text-center text-muted py-2">Configure Redmine in Settings first</div>`;
        return;
    }

    // Show loading state
    watchedListContainer.innerHTML = `<div class="text-center text-muted py-2"><i class="fa-solid fa-spinner fa-spin me-2"></i>Loading...</div>`;

    try {
        const issues = await getWatchedIssues();
        setWatchedIssues(issues);
        renderWatchedIssues();
    } catch (error) {
        console.error('Failed to load watched issues:', error);
        watchedListContainer.innerHTML = `<div class="text-center text-danger py-2">Failed to load watched issues</div>`;
    }
}

export function renderWatchedIssues() {
    if (!watchedListContainer) return;

    const issues = state.watchedIssues;

    if (issues.length === 0) {
        watchedListContainer.innerHTML = `<div class="text-center text-muted py-2">No watched issues found</div>`;
        return;
    }

    watchedListContainer.innerHTML = issues.map(issue => `
        <div class="watched-issue-item" data-issue-id="${issue.id}" data-project-id="${issue.project.id}" data-project-name="${escapeHtml(issue.project.name)}" data-subject="${escapeHtml(issue.subject)}">
            <div class="watched-issue-main">
                <span class="watched-issue-project">${escapeHtml(issue.project.name)}</span>
                <span class="watched-issue-title" title="#${issue.id} - ${escapeHtml(issue.subject)}">
                    <span class="watched-issue-id">#${issue.id}</span> ${escapeHtml(issue.subject)}
                </span>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary watched-add-btn" title="Add to queue">
                <i class="fa-solid fa-plus"></i>
            </button>
        </div>
    `).join('');

    // Add event listeners for add to queue buttons
    watchedListContainer.querySelectorAll('.watched-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const item = (e.target as HTMLElement).closest('.watched-issue-item') as HTMLElement;
            if (item) {
                const issueId = item.dataset.issueId || '';
                const projectId = item.dataset.projectId || '';
                const projectName = item.dataset.projectName || '';
                const subject = item.dataset.subject || '';
                addToQueueFromWatched(issueId, projectId, projectName, subject);
            }
        });
    });

    // Also allow clicking anywhere on the item to add
    watchedListContainer.querySelectorAll('.watched-issue-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if ((e.target as HTMLElement).closest('.add-to-queue-btn')) return;
            const el = item as HTMLElement;
            const issueId = el.dataset.issueId || '';
            const projectId = el.dataset.projectId || '';
            const projectName = el.dataset.projectName || '';
            const subject = el.dataset.subject || '';
            addToQueueFromWatched(issueId, projectId, projectName, subject);
        });
    });
}

export function initWatchedIssues() {
    // Setup refresh button
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadWatchedIssues();
        });
    }

    // Initial load
    loadWatchedIssues();
}

function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
