import { TimeEntry } from '../types/index.js';

export function renderDailyProjectsSummary(entries: TimeEntry[], container: HTMLElement | null) {
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
