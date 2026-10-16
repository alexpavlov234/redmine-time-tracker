import type { RedmineIssue, TimeEntry, CustomField } from '../types';

// Configuration for proxy URL
const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const PROXY_BASE_URL = IS_DEV ? 'http://localhost:3000/api' : '/api'; // Fallback or configurable in the future
const TIMEOUT_MS = 60000; // 60s timeout

function withTimeout(controller: AbortController, ms: number) {
    const timer = setTimeout(() => controller.abort(), ms);
    return () => clearTimeout(timer);
}

function normalizeUrl(url: string): string {
    if (!url) return url;
    return url.replace(/\/$/, '');
}

/**
 * Serializes request body to JSON, applying time_entry payload sanitization if present.
 * 
 * @param body Object payload to serialize.
 * @returns JSON string or undefined.
 */
function buildBody(body: object | null | undefined) {
    if (body && typeof body === 'object' && 'time_entry' in body && (body as any).time_entry) {
        body = {
            ...body,
            time_entry: sanitizeTimeEntryData((body as any).time_entry)
        };
    }
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

    const err = new Error(readable);
    (err as any).isHttpError = true;
    (err as any).status = status;
    return err;
}

function mapNetworkError(e: unknown, context: 'proxy' | 'direct') {
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

// Map of in-flight GET requests to prevent duplicate concurrent network calls for the same endpoint
const inFlightGetRequests = new Map<string, Promise<any>>();

/// <summary>
/// Executes a Redmine REST API request via the local proxy (with direct HTTPS fallback)
/// and deduplicates identical concurrent GET requests.
/// </summary>
/// <param name="endpoint">API endpoint path starting with '/'.</param>
/// <param name="method">HTTP method ('GET', 'POST', 'PUT', 'DELETE').</param>
/// <param name="body">Optional request payload object.</param>
/// <returns>Parsed JSON response object.</returns>
export async function redmineApiRequest(endpoint: string, method: string = 'GET', body: object | null = null) {
    const upperMethod = method.toUpperCase();
    if (upperMethod === 'GET' && inFlightGetRequests.has(endpoint)) {
        return inFlightGetRequests.get(endpoint)!;
    }

    const executeRequest = async () => {
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
                method: upperMethod,
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
        } catch (e: any) {
            clearProxyTimeout();

            // If Redmine responded through proxy with an HTTP error (422, 403, etc.), rethrow directly
            if (e?.isHttpError) {
                throw e;
            }
            // Only consider direct fallback for HTTPS Redmine to avoid mixed-content and to give a chance if CORS is enabled
            const isHttps = /^https:\/\//i.test(redmineUrl);
            const shouldTryDirect = isHttps;
            // If we shouldn't try direct, rethrow mapped proxy error
            if (!shouldTryDirect) {
                throw mapNetworkError(e, 'proxy');
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
                    method: upperMethod,
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
                const proxyErr = mapNetworkError(e, 'proxy').message;
                const directErr = mapNetworkError(e2, 'direct').message;
                throw new Error(`${proxyErr}\n${directErr}`);
            }
        }
    };

    if (upperMethod === 'GET') {
        const promise = executeRequest().finally(() => {
            inFlightGetRequests.delete(endpoint);
        });
        inFlightGetRequests.set(endpoint, promise);
        return promise;
    }

    return executeRequest();
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
    const endpoint = `/time_entries.json?user_id=${user_id}&from=${from}&to=${to}&limit=100&include=issue,custom_fields`;
    try {
        const response = await redmineApiRequest(endpoint);
        return response.time_entries || [];
    } catch (error) {
        console.error('Failed to fetch time entries:', error);
        throw error; // Re-throw to be handled by the caller
    }
}

// Global in-memory cache for Redmine issues to avoid redundant network requests
const issueCache = new Map<number, RedmineIssue>();

/// <summary>
/// Populates the global in-memory issue cache with an array of already fetched Redmine issues.
/// </summary>
/// <param name="issues">Array of RedmineIssue objects to store in cache.</param>
export function cacheIssues(issues: RedmineIssue[]): void {
    for (const issue of issues) {
        if (issue && typeof issue.id === 'number') {
            issueCache.set(issue.id, issue);
        }
    }
}

/// <summary>
/// Retrieves Redmine issues by their IDs with in-memory caching, automatic batching,
/// and automatic resolution of parent tasks so that parent subjects and hierarchy are fully populated.
/// </summary>
/// <param name="ids">Array of issue IDs to retrieve.</param>
/// <param name="resolveParents">Whether to automatically fetch and link parent issues recursively.</param>
/// <returns>Array of retrieved RedmineIssue objects with parents populated.</returns>
export async function getIssues(ids: number[], resolveParents: boolean = true): Promise<RedmineIssue[]> {
    if (ids.length === 0) {
        return [];
    }
    
    // Find missing IDs
    const missingIds = ids.filter(id => !issueCache.has(id));
    
    if (missingIds.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < missingIds.length; i += batchSize) {
            const batch = missingIds.slice(i, i + batchSize);
            try {
                const response = await redmineApiRequest(`/issues.json?issue_id=${batch.join(',')}&status_id=*&limit=${batch.length}`);
                const fetchedIssues = response.issues || [];
                
                // Populate cache
                fetchedIssues.forEach((issue: RedmineIssue) => {
                    issueCache.set(issue.id, issue);
                });
            } catch (error) {
                console.error('Could not fetch batch of issues', error);
            }
        }
    }

    // Resolve parent issues if requested (only for the requested IDs chain)
    if (resolveParents) {
        let depth = 0;
        const maxDepth = 3;
        const visitedParents = new Set<number>(ids);
        let currentFrontierIds = [...ids];

        while (depth < maxDepth && currentFrontierIds.length > 0) {
            depth++;
            const missingParentIds: number[] = [];
            const nextFrontierIds: number[] = [];

            for (const id of currentFrontierIds) {
                const cached = issueCache.get(id);
                const parentId = cached?.parent?.id;
                if (parentId && !visitedParents.has(parentId)) {
                    visitedParents.add(parentId);
                    nextFrontierIds.push(parentId);
                    if (!issueCache.has(parentId)) {
                        missingParentIds.push(parentId);
                    }
                }
            }

            currentFrontierIds = nextFrontierIds;

            if (missingParentIds.length > 0) {
                const batchSize = 100;
                for (let i = 0; i < missingParentIds.length; i += batchSize) {
                    const batch = missingParentIds.slice(i, i + batchSize);
                    try {
                        const response = await redmineApiRequest(`/issues.json?issue_id=${batch.join(',')}&status_id=*&limit=${batch.length}`);
                        const fetchedIssues = response.issues || [];
                        fetchedIssues.forEach((issue: RedmineIssue) => {
                            issueCache.set(issue.id, issue);
                        });
                    } catch (error) {
                        console.error('Could not fetch batch of parent issues', error);
                    }
                }
            }
        }

        // Link parent subjects for the visited issues
        for (const id of visitedParents) {
            const cached = issueCache.get(id);
            if (cached?.parent?.id) {
                const parentIssue = issueCache.get(cached.parent.id);
                if (parentIssue && parentIssue.subject) {
                    cached.parent.subject = parentIssue.subject;
                }
            }
        }
    }
    
    // Return combined result from cache (including newly fetched ones)
    return ids.map(id => issueCache.get(id)).filter(Boolean) as RedmineIssue[];
}

/// <summary>
/// Retrieves a single Redmine issue by ID, checking the in-memory cache first.
/// </summary>
/// <param name="id">Numeric issue ID.</param>
/// <returns>The resolved RedmineIssue object.</returns>
export async function getIssue(id: number) {
    if (issueCache.has(id)) {
        return issueCache.get(id)!;
    }
    try {
        const response = await redmineApiRequest(`/issues/${id}.json`);
        if (response.issue && response.issue.id) {
            issueCache.set(response.issue.id, response.issue);
        }
        return response.issue;
    } catch (error) {
        console.error(`Could not fetch issue #${id}`, error);
        throw error;
    }
}

// In-memory caches for global and project-specific time entry activities
let cachedGlobalActivities: any[] | null = null;
const projectActivitiesCache = new Map<string, any[]>();

/// <summary>
/// Retrieves global time entry activities with in-memory session caching.
/// </summary>
/// <returns>Array of time entry activity options.</returns>
export async function getTimeEntryActivities(): Promise<any[]> {
    if (cachedGlobalActivities !== null) {
        return cachedGlobalActivities;
    }
    try {
        const response = await redmineApiRequest('/enumerations/time_entry_activities.json');
        const activities: any[] = response.time_entry_activities || [];
        cachedGlobalActivities = activities;
        return activities;
    } catch (error) {
        console.error('Failed to fetch time entry activities:', error);
        return [];
    }
}

/// <summary>
/// Retrieves all time entries for a given user or task across a date range with automatic pagination and issue subject enrichment.
/// </summary>
/// <param name="params">Query parameters including date range, user ID, and optional task/issue ID.</param>
/// <returns>Array of all retrieved and enriched TimeEntry objects.</returns>
export async function getAllUserTimeEntries(params: {
    from?: string;
    to?: string;
    user_id?: number | string;
    issue_id?: number | string;
    project_id?: number | string;
}): Promise<TimeEntry[]> {
    const { from, to, user_id, issue_id, project_id } = params;
    let queryParams = 'limit=100&include=issue,custom_fields';
    if (user_id) queryParams += `&user_id=${user_id}`;
    if (from) queryParams += `&from=${from}`;
    if (to) queryParams += `&to=${to}`;
    if (issue_id) queryParams += `&issue_id=${issue_id}`;
    if (project_id) queryParams += `&project_id=${project_id}`;

    const allEntries: TimeEntry[] = [];
    let offset = 0;
    let totalCount = Infinity;

    try {
        while (allEntries.length < totalCount) {
            const url = `/time_entries.json?${queryParams}&offset=${offset}`;
            const response = await redmineApiRequest(url);
            const entries: TimeEntry[] = Array.isArray(response.time_entries) ? response.time_entries : [];

            totalCount = typeof response.total_count === 'number' ? response.total_count : entries.length;
            allEntries.push(...entries);

            if (entries.length === 0 || allEntries.length >= totalCount) {
                break;
            }

            offset += entries.length;
        }
    } catch (error) {
        console.error('Failed to fetch user time entries:', error);
        throw error;
    }

    // Enrich entries with issue subjects and parent tasks using cache
    const missingIssueIds = Array.from(
        new Set(
            allEntries
                .filter(e => e.issue?.id && !e.issue.subject)
                .map(e => e.issue!.id)
        )
    );

    if (missingIssueIds.length > 0) {
        try {
            const issues = await getIssues(missingIssueIds, true);
            const issueMap = new Map<number, RedmineIssue>();
            issues.forEach(i => issueMap.set(i.id, i));

            allEntries.forEach(entry => {
                if (entry.issue?.id && issueMap.has(entry.issue.id)) {
                    const found = issueMap.get(entry.issue.id)!;
                    entry.issue.subject = found.subject;
                    if (found.parent) {
                        entry.issue.parent = found.parent;
                    }
                    if (!entry.project && found.project) {
                        entry.project = found.project;
                    }
                }
            });
        } catch (enrichError) {
            console.warn('Could not enrich all issue subjects:', enrichError);
        }
    }

    return allEntries;
}

/// <summary>
/// Retrieves time entry activities configured for a specific project, with in-memory caching.
/// </summary>
/// <param name="projectId">Project identifier.</param>
/// <returns>Array of project-specific time entry activities.</returns>
export async function getProjectActivities(projectId: string | number) {
    const key = String(projectId);
    if (projectActivitiesCache.has(key)) {
        return projectActivitiesCache.get(key)!;
    }
    try {
        const response = await redmineApiRequest(`/projects/${projectId}.json?include=time_entry_activities`);
        const activities = response.project?.time_entry_activities || [];
        projectActivitiesCache.set(key, activities);
        return activities;
    } catch (error) {
        console.error(`Failed to fetch activities for project ${projectId}:`, error);
        return [];
    }
}

/**
 * Sanitizes time entry data before sending to Redmine REST API.
 * Ensures issue_id/project_id/hours/activity_id are cleanly parsed and validated.
 * 
 * @param data Raw time entry input data.
 * @returns Sanitized object ready for JSON serialization.
 */
export function sanitizeTimeEntryData(data: Record<string, any>): Record<string, any> {
    const clean: Record<string, any> = {};

    // 1. Sanitize issue_id
    if (data.issue_id !== undefined && data.issue_id !== null && data.issue_id !== '') {
        const cleanIssueStr = String(data.issue_id).replace(/^#/, '').trim();
        const parsedIssue = parseInt(cleanIssueStr, 10);
        if (!isNaN(parsedIssue) && parsedIssue > 0) {
            clean.issue_id = parsedIssue;
        }
    }

    // 2. Sanitize project_id
    if (data.project_id !== undefined && data.project_id !== null && data.project_id !== '' && data.project_id !== 'my_issues') {
        const cleanProjStr = String(data.project_id).trim();
        if (cleanProjStr) {
            const parsedProj = parseInt(cleanProjStr, 10);
            const validProj = !isNaN(parsedProj) ? parsedProj : cleanProjStr;
            // Redmine API rule: if issue_id is present, Redmine automatically resolves the project from the issue.
            // Sending project_id alongside issue_id can cause "Project is invalid" if project_id doesn't match the issue's project.
            if (!clean.issue_id) {
                clean.project_id = validProj;
            }
        }
    }

    // 3. Sanitize hours
    if (data.hours !== undefined && data.hours !== null && data.hours !== '') {
        const hoursNum = typeof data.hours === 'string' ? parseFloat(data.hours) : Number(data.hours);
        if (!isNaN(hoursNum)) {
            clean.hours = hoursNum;
        }
    }

    // 4. Sanitize activity_id
    if (data.activity_id !== undefined && data.activity_id !== null && data.activity_id !== '') {
        const parsedAct = parseInt(String(data.activity_id), 10);
        if (!isNaN(parsedAct) && parsedAct > 0) {
            clean.activity_id = parsedAct;
        }
    }

    if (data.comments !== undefined) clean.comments = data.comments;
    if (data.spent_on !== undefined) clean.spent_on = data.spent_on;
    if (data.custom_fields !== undefined) clean.custom_fields = data.custom_fields;

    return clean;
}

/**
 * Updates an existing time entry in Redmine.
 * 
 * @param id The time entry ID to update.
 * @param data Updated time entry fields.
 * @returns True if successful.
 */
export async function updateTimeEntry(id: number, data: {
    hours?: number;
    comments?: string;
    activity_id?: number;
    spent_on?: string;
    issue_id?: number | string;
    project_id?: number | string;
    custom_fields?: Array<{ id: number, value: any }>;
}) {
    try {
        const body = { time_entry: sanitizeTimeEntryData(data) };
        await redmineApiRequest(`/time_entries/${id}.json`, 'PUT', body);
        return true;
    } catch (error) {
        console.error(`Failed to update time entry #${id}:`, error);
        throw error;
    }
}

/**
 * Creates a new time entry in Redmine.
 * 
 * @param data Time entry details.
 * @returns True if successful.
 */
export async function createTimeEntry(data: {
    hours: number;
    comments?: string;
    activity_id?: number;
    spent_on?: string;
    issue_id?: number | string;
    project_id?: number | string;
    custom_fields?: Array<{ id: number, value: any }>;
}) {
    try {
        const body = { time_entry: sanitizeTimeEntryData(data) };
        await redmineApiRequest('/time_entries.json', 'POST', body);
        return true;
    } catch (error) {
        console.error('Failed to create time entry:', error);
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

// In-memory cache for detected time entry custom fields
let cachedCustomFields: CustomField[] | null = null;

/// <summary>
/// Retrieves custom fields applicable to time entries, caching the result in memory.
/// </summary>
/// <returns>Array of CustomField definitions.</returns>
export async function getTimeEntryCustomFields(): Promise<CustomField[]> {
    if (cachedCustomFields !== null) {
        return cachedCustomFields;
    }

    let scannedSuccessfully = false;
    // Try scanning recent entries first - this works for non-admins!
    try {
        const timeEntriesResponse = await redmineApiRequest('/time_entries.json?limit=10&include=custom_fields');
        scannedSuccessfully = true;
        if (timeEntriesResponse.time_entries) {
            const entryWithFields = timeEntriesResponse.time_entries.find((e: any) => 
                e.custom_fields && e.custom_fields.length > 0
            );
            if (entryWithFields) {
                cachedCustomFields = entryWithFields.custom_fields;
                return cachedCustomFields!;
            }
        }
    } catch {
        console.warn('Scanning recent entries failed, trying admin API...');
    }

    // Fallback to official API (requires admin permissions)
    try {
        const response = await redmineApiRequest('/custom_fields.json');
        cachedCustomFields = response.custom_fields.filter((f: any) => f.type === 'TimeEntryCustomField' || f.customized_type === 'time_entry');
        return cachedCustomFields!;
    } catch (error) {
        if (scannedSuccessfully) {
            // Non-admin user with no custom fields on recent entries; cache empty array to avoid hammering server
            cachedCustomFields = [];
            return [];
        }
        console.error('All custom field detection methods failed.');
        throw error;
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
