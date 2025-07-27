import { TimeEntry } from '../types/index.js';

// Configuration for proxy URL
const PROXY_BASE_URL = 'http://localhost:3000/api';

export async function redmineApiRequest(endpoint: string, method: string = 'GET', body: object | null = null) {
    const apiKey = localStorage.getItem('redmineApiKey');
    const redmineUrl = localStorage.getItem('redmineUrl');

    if (!apiKey) {
        throw new Error('Redmine API Key not configured.');
    }
    
    if (!redmineUrl) {
        throw new Error('Redmine URL not configured.');
    }

    const headers = new Headers({
        'X-Redmine-API-Key': apiKey,
        'X-Redmine-URL': redmineUrl, // Send the URL to the proxy
        'Content-Type': 'application/json'
    });

    const config: RequestInit = {
        method,
        headers,
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    // Use proxy instead of direct URL
    const finalUrl = `${PROXY_BASE_URL}${endpoint}`;
    const response = await fetch(finalUrl, config);

    if (!response.ok) {
        const errorText = await response.text();
        let readableError = `API Error: ${response.status} ${response.statusText}`;
        console.error('Redmine API Error Details:', {
            status: response.status,
            statusText: response.statusText,
            responseText: errorText,
            endpoint,
            method,
            body
        });
        try {
            const errorJson = JSON.parse(errorText);
            if (errorJson && Array.isArray(errorJson.errors)) {
                readableError = `Error: ${errorJson.errors.join(', ')}`;
            } else {
                readableError += ` - ${errorText}`;
            }
        } catch(e) {
            readableError += ` - ${errorText}`;
        }
        throw new Error(readableError);
    }

    if (response.status === 204 || response.status === 201) {
        return {};
    }

    return response.json();
}

export async function getCurrentUser() {
    try {
        const response = await redmineApiRequest('/users/current.json');
        return response.user;
    } catch (error) {
        console.error('Could not fetch user information', error);
        throw error;
    }
}

export async function getTimeEntries(params: { from: string, to: string, user_id: number }): Promise<TimeEntry[]> {
    const { from, to, user_id } = params;
    // Note: Redmine API `to` and `from` are inclusive.
    const endpoint = `/time_entries.json?user_id=${user_id}&from=${from}&to=${to}&limit=100&include=issue`;
    try {
        const response = await redmineApiRequest(endpoint);
        return response.time_entries || [];
    } catch (error) {
        console.error('Failed to fetch time entries:', error);
        throw error; // Re-throw to be handled by the caller
    }
}

export async function getIssues(ids: number[]) {
    if (ids.length === 0) {
        return [];
    }
    try {
        const response = await redmineApiRequest(`/issues.json?issue_id=${ids.join(',')}&limit=${ids.length}`);
        return response.issues;
    } catch (error) {
        console.error(`Could not fetch issues`, error);
        throw error;
    }
}

export async function getIssue(id: number) {
    try {
        const response = await redmineApiRequest(`/issues/${id}.json`);
        return response.issue;
    } catch (error) {
        console.error(`Could not fetch issue #${id}`, error);
        throw error;
    }
}

export async function getTimeEntryActivities() {
    try {
        const response = await redmineApiRequest('/enumerations/time_entry_activities.json');
        return response.time_entry_activities || [];
    } catch (error) {
        console.error('Failed to fetch time entry activities:', error);
        return [];
    }
}

export async function updateTimeEntry(id: number, data: {
    hours?: number;
    comments?: string;
    activity_id?: number;
    spent_on?: string;
    issue_id?: number;
    project_id?: number;
    custom_fields?: Array<{id: number, value: any}>;
}) {
    try {
        const body = { time_entry: data };
        await redmineApiRequest(`/time_entries/${id}.json`, 'PUT', body);
        return true;
    } catch (error) {
        console.error(`Failed to update time entry #${id}:`, error);
        throw error;
    }
}

export async function deleteTimeEntry(id: number) {
    try {
        await redmineApiRequest(`/time_entries/${id}.json`, 'DELETE');
        return true;
    } catch (error) {
        console.error(`Failed to delete time entry #${id}:`, error);
        throw error;
    }
}

export async function getTimeEntryCustomFields() {
    try {
        // First, try to get time entry custom fields
        // Unfortunately, Redmine doesn't have a direct API for time entry custom fields
        // We need to get them from a time entry or infer from project settings
        
        // Let's try to get custom fields from any existing time entry
        const timeEntriesResponse = await redmineApiRequest('/time_entries.json?limit=1&include=custom_fields');
        
        if (timeEntriesResponse.time_entries && timeEntriesResponse.time_entries.length > 0) {
            const timeEntry = timeEntriesResponse.time_entries[0];
            if (timeEntry.custom_fields) {
                return timeEntry.custom_fields;
            }
        }
        
        // If no time entries exist, return an empty array
        return [];
    } catch (error) {
        console.error('Failed to fetch time entry custom fields:', error);
        return [];
    }
}

export async function detectBillableField() {
    try {
        const customFields = await getTimeEntryCustomFields();
        
        // Look for fields that might be billable
        const billableField = customFields.find((field: any) => 
            field.name && (
                field.name.toLowerCase().includes('billable') ||
                field.name.toLowerCase().includes('billing') ||
                field.name.toLowerCase().includes('bill')
            )
        );
        
        if (billableField) {
            console.log('Auto-detected billable field:', billableField);
            localStorage.setItem('billableFieldId', billableField.id.toString());
            return billableField;
        }
        
        return null;
    } catch (error) {
        console.error('Failed to detect billable field:', error);
        return null;
    }
}
