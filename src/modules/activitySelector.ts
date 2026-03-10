import { getTimeEntryActivities, getProjectActivities } from '../services/redmine.js';
import { elements } from '../utils/dom.js';

let availableActivities: any[] = [];
let defaultActivityId: number | null = null;

export async function loadActivities() {
    try {
        availableActivities = await getTimeEntryActivities();

        // Find default activity
        const defaultActivity = availableActivities.find(activity => activity.is_default);
        defaultActivityId = defaultActivity ? defaultActivity.id : (availableActivities.length > 0 ? availableActivities[0].id : null);

        // Populate all activity selectors with global activities initially
        populateActivitySelect(elements.activitySelect);
        populateActivitySelect(elements.todoActivitySelect);
        populateActivitySelect(elements.summaryActivitySelect);

        return availableActivities;
    } catch (error) {
        console.error('Failed to load activities:', error);

        // Show error in all selectors
        showActivityLoadError(elements.activitySelect);
        showActivityLoadError(elements.todoActivitySelect);
        showActivityLoadError(elements.summaryActivitySelect);

        return [];
    }
}

/**
 * Load activities for a specific project and populate the given select element.
 * Falls back to global activities if the project-specific fetch fails.
 */
export async function loadProjectActivities(projectId: string | number, selectElement: HTMLSelectElement): Promise<any[]> {
    // Skip for special pseudo-projects like "my_issues"
    if (!projectId || projectId === 'my_issues') {
        populateActivitySelect(selectElement);
        return availableActivities;
    }

    try {
        const projectActivities = await getProjectActivities(projectId);

        if (projectActivities.length > 0) {
            populateActivitySelectWithActivities(selectElement, projectActivities);
            return projectActivities;
        } else {
            // Fallback to global activities if project returns empty
            populateActivitySelect(selectElement);
            return availableActivities;
        }
    } catch (error) {
        console.error(`Failed to load project activities for ${projectId}, falling back to global:`, error);
        populateActivitySelect(selectElement);
        return availableActivities;
    }
}

function populateActivitySelect(selectElement: HTMLSelectElement) {
    populateActivitySelectWithActivities(selectElement, availableActivities);
}

function populateActivitySelectWithActivities(selectElement: HTMLSelectElement, activities: any[]) {
    // Preserve current selection to restore if possible
    const previousValue = selectElement.value;

    selectElement.innerHTML = '';

    if (activities.length === 0) {
        selectElement.innerHTML = '<option value="">-- No activities available --</option>';
        selectElement.disabled = true;
        return;
    }

    // Add default option
    selectElement.innerHTML = '<option value="">-- Select activity --</option>';

    // Find default in this activity list
    const localDefault = activities.find(a => a.is_default);

    // Add activity options
    activities.forEach(activity => {
        const option = document.createElement('option');
        option.value = activity.id.toString();
        option.textContent = activity.name;
        if (activity.is_default) {
            option.textContent += ' (default)';
        }
        selectElement.appendChild(option);
    });

    // Try to restore previous selection if still available
    if (previousValue && activities.some(a => a.id.toString() === previousValue)) {
        selectElement.value = previousValue;
    } else if (localDefault) {
        selectElement.value = localDefault.id.toString();
    } else if (defaultActivityId && activities.some(a => a.id === defaultActivityId)) {
        selectElement.value = defaultActivityId.toString();
    }

    selectElement.disabled = false;
}

function showActivityLoadError(selectElement: HTMLSelectElement) {
    selectElement.innerHTML = '<option value="">-- Error loading activities --</option>';
    selectElement.disabled = true;
}

export function getSelectedActivityId(selectElement: HTMLSelectElement): number | null {
    const value = selectElement.value;
    return value ? parseInt(value, 10) : null;
}

export function getDefaultActivityId(): number | null {
    return defaultActivityId;
}

export function getSelectedOrDefaultActivityId(selectElement: HTMLSelectElement): number | null {
    return getSelectedActivityId(selectElement) || getDefaultActivityId();
}

export function getAvailableActivities(): any[] {
    return availableActivities;
}

// Initialize activities when module loads
export function initializeActivities() {
    return loadActivities();
}
