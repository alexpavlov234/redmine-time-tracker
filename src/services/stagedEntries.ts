import type { StagedTimeEntry } from '../types';
import { createTimeEntry, redmineApiRequest } from './redmine';
import { setLastActivityForTask } from './taskActivity';

const STORAGE_KEY = 'redmine_staged_time_entries';

/// <summary>
/// Loads all staged (committed) time entries from localStorage.
/// </summary>
export function loadStagedEntries(): StagedTimeEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to load staged time entries:', err);
    return [];
  }
}

/// <summary>
/// Persists staged time entries to localStorage.
/// </summary>
export function saveStagedEntries(entries: StagedTimeEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error('Failed to save staged time entries:', err);
  }
}

/// <summary>
/// Generates a unique local identifier for a staged time entry.
/// </summary>
export function generateStagedId(): string {
  return `staged_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/// <summary>
/// Pushes a single staged time entry to Redmine, including optional issue status update.
/// </summary>
export async function pushSingleStagedEntryToRedmine(entry: StagedTimeEntry): Promise<void> {
  const payload: any = {
    hours: entry.hours,
    comments: entry.comments.trim(),
    activity_id: entry.activityId,
    spent_on: entry.spent_on,
    ...(entry.issueId
      ? { issue_id: entry.issueId }
      : entry.projectId
      ? { project_id: entry.projectId }
      : {}),
    ...(entry.custom_fields && entry.custom_fields.length > 0
      ? { custom_fields: entry.custom_fields }
      : {}),
  };

  await createTimeEntry(payload);

  if (entry.statusId && entry.issueId) {
    try {
      await redmineApiRequest(`/issues/${entry.issueId}.json`, 'PUT', {
        issue: { status_id: entry.statusId },
      });
    } catch {
      // Status update failure should not revert the already-created time entry
    }
  }

  if (entry.issueId && entry.activityId) {
    setLastActivityForTask(entry.issueId, String(entry.activityId));
  }
}
