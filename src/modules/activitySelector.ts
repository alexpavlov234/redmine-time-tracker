import { getTimeEntryActivities } from '../services/redmine.js';
import { elements } from '../utils/dom.js';

let availableActivities: any[] = [];
let defaultActivityId: number | null = null;

export async function loadActivities() {
    try {
        availableActivities = await getTimeEntryActivities();

        // Find default activity
        const defaultActivity = availableActivities.find(activity => activity.is_default);
        defaultActivityId = defaultActivity ? defaultActivity.id : (availableActivities.length > 0 ? availableActivities[0].id : null);

        console.log('Loaded activities:', availableActivities);
        console.log('Default activity ID:', defaultActivityId);

        // Populate all activity selectors
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

function populateActivitySelect(selectElement: HTMLSelectElement) {
    selectElement.innerHTML = '';

    if (availableActivities.length === 0) {
        selectElement.innerHTML = '<option value="">-- No activities available --</option>';
        selectElement.disabled = true;
        return;
    }

    // Add default option
    selectElement.innerHTML = '<option value="">-- Select activity --</option>';

    // Add activity options
    availableActivities.forEach(activity => {
        const option = document.createElement('option');
        option.value = activity.id.toString();
        option.textContent = activity.name;
        if (activity.is_default) {
            option.textContent += ' (default)';
        }
        selectElement.appendChild(option);
    });

    // Pre-select default activity if available
    if (defaultActivityId) {
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
