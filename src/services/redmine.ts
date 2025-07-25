// Configuration for proxy URL
const PROXY_BASE_URL = 'http://localhost:3000/api';

async function handleTestModeRequest(endpoint: string, method: string, body: any): Promise<any> {
    console.log(`[Test Mode] Mocking ${method} ${endpoint}`, body || '');
    await new Promise(resolve => setTimeout(resolve, 300)); // Simulate network delay

    if (endpoint === '/users/current.json') {
        return { user: { firstname: 'Test', lastname: 'User' } };
    }
    if (endpoint === '/projects.json') {
        return {
            projects: [
                { id: 1, name: "Project Alpha (Test)" },
                { id: 2, name: "Project Bravo (Test)" },
                { id: 3, name: "Project Charlie (Test)" },
            ]
        };
    }
    if (endpoint.startsWith('/issues.json')) {
         if (endpoint.includes('assigned_to_id=me')) {
            return {
                issues: [
                    { id: 101, subject: "Fix login button", project: { id: 1, name: 'Project Alpha (Test)' } },
                    { id: 205, subject: "Update branding assets", project: { id: 2, name: 'Project Bravo (Test)' } },
                ]
            };
        }
        const projectId = new URLSearchParams(endpoint.split('?')[1]).get('project_id');
        if (projectId === '1') {
            return {
                issues: [
                    { id: 101, subject: "Fix login button", project: { id: 1, name: 'Project Alpha (Test)' } },
                    { id: 102, subject: "Implement new dashboard widget", project: { id: 1, name: 'Project Alpha (Test)' } },
                ]
            };
        }
         if (projectId === '2') {
            return {
                 issues: [
                    { id: 205, subject: "Update branding assets", project: { id: 2, name: 'Project Bravo (Test)' } },
                 ]
             };
         }
        return { issues: [] };
    }
    if (endpoint === '/time_entries.json' && method === 'POST') {
        return {}; // Success
    }
    if (endpoint.startsWith('/issues/') && method === 'PUT') {
        return {}; // Success
    }
    if (endpoint === '/issue_statuses.json') {
        return {
            issue_statuses: [
                { id: 1, name: "New" },
                { id: 2, name: "In Progress" },
                { id: 3, name: "Resolved" },
                { id: 5, name: "Closed" },
            ]
        };
    }
    if (endpoint === '/enumerations/time_entry_activities.json') {
        return {
            time_entry_activities: [
                { id: 8, name: "Design", is_default: false },
                { id: 9, name: "Development", is_default: true },
                { id: 10, name: "Testing", is_default: false },
                { id: 11, name: "Documentation", is_default: false },
            ]
        };
    }
    
    if (endpoint.includes('/projects.json') && endpoint.includes('include=issue_custom_fields')) {
        return {
            projects: [
                { id: 1, name: "Project Alpha (Test)", identifier: "alpha" },
                { id: 2, name: "Project Bravo (Test)", identifier: "bravo" },
            ]
        };
    }
    
    if (endpoint.includes('/projects/') && endpoint.includes('include=issue_custom_fields')) {
        return {
            project: {
                id: 1,
                name: "Project Alpha (Test)",
                issue_custom_fields: [
                    { id: 101, name: "Time Entry Type", field_format: "list", possible_values: ["Regular", "Overtime", "Holiday"] },
                    { id: 102, name: "Client", field_format: "string" },
                    { id: 103, name: "Billable Rate", field_format: "float" },
                    { id: 104, name: "Work Location", field_format: "list", possible_values: ["Office", "Remote", "Client Site"] },
                ]
            }
        };
    }

    throw new Error(`[Test Mode] Unhandled endpoint: ${endpoint}`);
}

export async function redmineApiRequest(endpoint: string, method: string = 'GET', body: object | null = null) {
    if (localStorage.getItem('isTestMode') === 'true') {
        return handleTestModeRequest(endpoint, method, body);
    }

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

export async function getTimeEntryActivities() {
    try {
        const response = await redmineApiRequest('/enumerations/time_entry_activities.json');
        return response.time_entry_activities || [];
    } catch (error) {
        console.error('Failed to fetch time entry activities:', error);
        return [];
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
        
        // If no time entries exist, return empty array
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
