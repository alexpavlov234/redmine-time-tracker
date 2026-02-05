import { TimeEntry, RedmineIssue } from '../types/index.js';

// Configuration for proxy URL
const PROXY_BASE_URL = 'http://localhost:3000/api';
const TIMEOUT_MS = 15000; // 15s default timeout

function withTimeout(controller: AbortController, ms: number) {
    const timer = setTimeout(() => controller.abort(), ms);
    return () => clearTimeout(timer);
}

function normalizeUrl(url: string): string {
    if (!url) return url;
    return url.replace(/\/$/, '');
}

function buildBody(body: object | null | undefined) {
    return body ? JSON.stringify(body) : undefined;
}

function buildHeaders(base: Record<string, string>) {
    const h = new Headers(base);
    // Do NOT log or expose API key in console logs
    return h;
}

function mapHttpError(status: number, statusText: string, errorText: string) {
    let readable = `API Error: ${status} ${statusText}`;
    try {
        const errorJson = JSON.parse(errorText);
        if (errorJson && Array.isArray(errorJson.errors)) {
            readable = `Error: ${errorJson.errors.join(', ')}`;
        } else if (errorJson?.error) {
            readable = `Error: ${errorJson.error}`;
        } else {
            readable += ` - ${errorText}`;
        }
    } catch {
        if (errorText) readable += ` - ${errorText}`;
    }
    if (status === 401) readable += ' (Unauthorized: check your API key)';
    if (status === 403) readable += ' (Forbidden: your API key might not have permissions)';
    if (status === 404) readable += ' (Not found: verify the Redmine URL or endpoint)';
    return new Error(readable);
}

function mapNetworkError(e: unknown, context: 'proxy' | 'direct', redmineUrl: string) {
    const msg = e instanceof Error ? e.message : String(e);
    let hint = '';
    if (context === 'proxy') {
        hint = 'Ensure the local proxy is running (npm run dev:full) and reachable at http://localhost:3000/health.';
    } else {
        // direct
        hint = 'Direct connection failed. Many Redmine servers do not allow CORS; use the local proxy.';
    }
    if (/ENOTFOUND|getaddrinfo|DNS/i.test(msg)) {
        hint = 'DNS resolution failed. Check that the Redmine URL/hostname is correct and reachable.';
    } else if (/self-signed|certificate|SSL/i.test(msg)) {
        hint = 'SSL issue detected. Use the local proxy which ignores self-signed certificates.';
    } else if (/aborted|timeout|The user aborted a request|AbortError/i.test(msg)) {
        hint = 'The request timed out. Check connectivity/VPN and try again.';
    } else if (/Failed to fetch|NetworkError|TypeError/i.test(msg)) {
        // keep default hint per context
    }
    return new Error(`Network error (${context}): ${msg}${hint ? ' — ' + hint : ''}`);
}

export async function redmineApiRequest(endpoint: string, method: string = 'GET', body: object | null = null) {
    const apiKey = localStorage.getItem('redmineApiKey');
    let redmineUrl = localStorage.getItem('redmineUrl') || '';

    if (!apiKey) {
        throw new Error('Redmine API Key not configured.');
    }
    if (!redmineUrl) {
        throw new Error('Redmine URL not configured.');
    }

    redmineUrl = normalizeUrl(redmineUrl);

    // First attempt: via local proxy (recommended path)
    const proxyHeaders = buildHeaders({
        'X-Redmine-API-Key': apiKey,
        'X-Redmine-URL': redmineUrl,
        'Content-Type': 'application/json'
    });
    const proxyController = new AbortController();
    const clearProxyTimeout = withTimeout(proxyController, TIMEOUT_MS);
    try {
        const proxyResp = await fetch(`${PROXY_BASE_URL}${endpoint}`, {
            method,
            headers: proxyHeaders,
            body: buildBody(body),
            signal: proxyController.signal,
        });
        clearProxyTimeout();
        if (!proxyResp.ok) {
            const errorText = await proxyResp.text();
            throw mapHttpError(proxyResp.status, proxyResp.statusText, errorText);
        }
        if (proxyResp.status === 204 || proxyResp.status === 201) return {};
        return proxyResp.json();
    } catch (e) {
        clearProxyTimeout();
        // Only consider direct fallback for HTTPS Redmine to avoid mixed-content and to give a chance if CORS is enabled
        const isHttps = /^https:\/\//i.test(redmineUrl);
        const shouldTryDirect = isHttps;
        // If we shouldn't try direct, rethrow mapped proxy error
        if (!shouldTryDirect) {
            throw mapNetworkError(e, 'proxy', redmineUrl);
        }

        // Try direct HTTPS call (may be blocked by CORS depending on Redmine server)
        const directHeaders = buildHeaders({
            'X-Redmine-API-Key': apiKey,
            'Content-Type': 'application/json'
        });
        const directController = new AbortController();
        const clearDirectTimeout = withTimeout(directController, TIMEOUT_MS);
        try {
            const directUrl = `${redmineUrl}${endpoint}`;
            const directResp = await fetch(directUrl, {
                method,
                headers: directHeaders,
                body: buildBody(body),
                signal: directController.signal,
                // No mode: 'no-cors' because we need JSON; if CORS is blocked, this will throw
            });
            clearDirectTimeout();
            if (!directResp.ok) {
                const errorText = await directResp.text();
                throw mapHttpError(directResp.status, directResp.statusText, errorText);
            }
            if (directResp.status === 204 || directResp.status === 201) return {};
            return directResp.json();
        } catch (e2) {
            clearDirectTimeout();
            // Provide a combined error indicating proxy and direct both failed
            const proxyErr = mapNetworkError(e, 'proxy', redmineUrl).message;
            const directErr = mapNetworkError(e2, 'direct', redmineUrl).message;
            throw new Error(`${proxyErr}\n${directErr}`);
        }
    }
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
    custom_fields?: Array<{ id: number, value: any }>;
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

export async function getWatchedIssues(limit: number = 25): Promise<RedmineIssue[]> {
    try {
        const endpoint = `/issues.json?watcher_id=me&status_id=open&limit=${limit}`;
        const response = await redmineApiRequest(endpoint);
        return response.issues || [];
    } catch (error) {
        console.error('Failed to fetch watched issues:', error);
        return [];
    }
}
