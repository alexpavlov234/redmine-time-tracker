import { 
    totalElapsedTime, activities, issueStatuses,
    setIssueStatuses
} from '../state/index.js';
import { elements } from '../utils/dom.js';
import { formatTime, setButtonLoading, showGlobalError } from '../utils/helpers.js';
import { redmineApiRequest } from '../services/redmine.js';
import { getSelectedOrDefaultActivityId } from './activitySelector.js';
import { getCustomFieldValues, resetCustomFields } from './customFields.js';
import { resetState } from './timer.js';

export async function populateIssueStatuses() {
    if (issueStatuses.length > 0) return; 

    try {
        const data = await redmineApiRequest('/issue_statuses.json');
        setIssueStatuses(data.issue_statuses);
        elements.issueStatusSelect.innerHTML = issueStatuses
            .map(status => `<option value="${status.id}">${status.name}</option>`)
            .join('');
    } catch (error) {
        elements.changeStatusCheckbox.checked = false;
        elements.changeStatusCheckbox.disabled = true;
        elements.statusChangeContainer.style.display = 'none';
        showGlobalError('Could not load issue statuses.', error);
    }
}

export function showSummary() {
    const modal = new (window as any).bootstrap.Modal(elements.summaryModal);
    modal.show();
    elements.summaryTime.textContent = formatTime(totalElapsedTime);
    
    // Debug task selection
    console.log('Summary opened - Task selection debug:', {
        taskSelectValue: elements.taskSelect.value,
        taskSelectOptions: Array.from(elements.taskSelect.options).map(opt => ({ value: opt.value, text: opt.text })),
        activitySelectValue: elements.activitySelect.value,
        totalElapsedTime,
        totalElapsedTimeFormatted: formatTime(totalElapsedTime)
    });
    
    // Copy current activity selection to summary modal
    if (elements.activitySelect.value) {
        elements.summaryActivitySelect.value = elements.activitySelect.value;
    }
    
    const detailsText = activities
        .map(act => act.text.trim())
        .filter(text => text)
        .join(', ');
    elements.summaryDetails.value = detailsText;
    
    elements.modalStatus.textContent = '';
    elements.modalStatus.className = 'status-message';
    elements.submitBtn.disabled = false;
    elements.submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit to Redmine';

    // Always show the simple billable checkbox, default to checked
    if (elements.billableCheckboxSimple) {
        elements.billableCheckboxSimple.checked = true; // Default to billable
    }

    elements.changeStatusCheckbox.disabled = false;
    elements.changeStatusCheckbox.checked = false;
    elements.statusChangeContainer.style.display = 'none';
    populateIssueStatuses();
    
    // Reset custom fields to their default values
    resetCustomFields();
}

export function hideSummary() {
    const modal = (window as any).bootstrap.Modal.getInstance(elements.summaryModal);
    if (modal) {
        modal.hide();
    }
}

export async function submitTimeToRedmine() {
    const issueId = elements.taskSelect.value;
    const rawHours = totalElapsedTime / 3600;
    
    // Special formatting logic for hours - always round UP to next 0.05
    let hours: number;
    if (rawHours <= 0) {
        hours = 0.1; // Minimum 0.1 hours if no time tracked
    } else {
        // Round UP to next 0.05 increment
        hours = Math.ceil(rawHours * 20) / 20; // Multiply by 20, ceil, then divide by 20
        
        // Ensure minimum of 0.1
        hours = Math.max(0.1, hours);
    }
    
    const hoursFormatted = parseFloat(hours.toFixed(2));
    const comments = elements.summaryDetails.value.trim();
    const billableFieldId = localStorage.getItem('billableFieldId');

    console.log('Submit validation:', { 
        issueId, 
        totalElapsedTime, 
        totalElapsedTimeInMinutes: totalElapsedTime / 60,
        rawHours,
        hours: hoursFormatted,
        hoursType: typeof hoursFormatted,
        totalElapsedTimeFormatted: formatTime(totalElapsedTime) 
    });
    
    if (!issueId) {
        (window as any).showError('No issue selected. Please select an issue from the dropdown.', 'Submission Error');
        return;
    }
    
    // No need to check for minimum hours since we guarantee at least 0.1

    setButtonLoading(elements.submitBtn, true);
    elements.modalStatus.textContent = '';
    elements.modalStatus.className = 'status-message';

    // Get activity ID from selector or default
    const activityId = getSelectedOrDefaultActivityId(elements.summaryActivitySelect);
    if (!activityId) {
        elements.modalStatus.textContent = 'Error: Please select an activity for the time entry.';
        elements.modalStatus.className = 'status-message error';
        setButtonLoading(elements.submitBtn, false);
        return;
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    const timeEntryPayload: any = {
        time_entry: {
            issue_id: issueId,
            hours: hoursFormatted, // Use the properly formatted hours
            comments: comments,
            activity_id: activityId,
            spent_on: today
        }
    };

    // Add billable custom field if configured, or create a generic one
    const customFieldValues = getCustomFieldValues();
    const customFields: { id: number; value: string }[] = [];
    
    // Check if we have a specific billable field ID configured
    if (billableFieldId) {
        // Use the configured billable field with simple checkbox
        const billableValue = elements.billableCheckboxSimple.checked ? "1" : "0";
        customFields.push({ id: parseInt(billableFieldId, 10), value: billableValue });
    } else {
        // Just log that we don't have a billable field ID
        console.log('No billable field ID configured. Billable value:', elements.billableCheckboxSimple.checked);
    }
    
    // Add other custom fields
    Object.entries(customFieldValues).forEach(([fieldId, value]) => {
        if (value && value.trim() !== '') {
            customFields.push({ id: parseInt(fieldId, 10), value: value.trim() });
        }
    });
    
    // Add custom fields to payload if any exist
    if (customFields.length > 0) {
        timeEntryPayload.time_entry.custom_fields = customFields;
    }
    
    console.log('Time entry payload being sent:', timeEntryPayload);
    
    let timeEntrySuccess = false;
    const statusUpdateAttempted = elements.changeStatusCheckbox.checked && elements.issueStatusSelect.value;

    try {
        // Step 1: Submit time entry
        await redmineApiRequest('/time_entries.json', 'POST', timeEntryPayload);
        timeEntrySuccess = true;

        // Step 2: Update issue status if requested
        if (statusUpdateAttempted) {
            const issueUpdatePayload = {
                issue: {
                    status_id: elements.issueStatusSelect.value
                }
            };
            await redmineApiRequest(`/issues/${issueId}.json`, 'PUT', issueUpdatePayload);
        }

        // All successful
        elements.modalStatus.textContent = 'Time entry submitted successfully!';
        if (statusUpdateAttempted) {
            elements.modalStatus.textContent += ' Issue status updated.';
        }
        elements.modalStatus.classList.add('success');
        setButtonLoading(elements.submitBtn, false, '<i class="fa-solid fa-check"></i> Success!');
        
        // Task was already removed from queue when timer started, so just advance to next
        setTimeout(() => {
            hideSummary();
            resetState(true); // Advance the queue
        }, 1500);

    } catch (error) {
        let errorMessage = '';
        if (timeEntrySuccess) {
            errorMessage = `Time entry submitted, but failed to update status.`;
        } else {
            errorMessage = `Failed to submit time entry.`;
        }
        elements.modalStatus.textContent = errorMessage + ` See console for details.`;
        elements.modalStatus.classList.add('error');
        showGlobalError(errorMessage, error);
        setButtonLoading(elements.submitBtn, false);
    }
}
