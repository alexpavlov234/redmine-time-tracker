import { redmineApiRequest } from './redmine';

// In-memory cache for fast lookup during the current session
const taskActivityCache = new Map<string, string>();
let cachedUserLastActivity: string | null = null;

/// <summary>
/// Retrieves the last activity ID logged by the current user across all tasks/projects.
/// Checks memory cache, then localStorage, and finally queries Redmine API.
/// </summary>
/// <returns>Activity ID string or null if none found.</returns>
export async function getLastUserActivity(): Promise<string | null> {
  // 1. Check in-memory cache
  if (cachedUserLastActivity) {
    return cachedUserLastActivity;
  }

  // 2. Check localStorage
  try {
    const localVal = localStorage.getItem('last_user_activity');
    if (localVal) {
      cachedUserLastActivity = localVal;
      return localVal;
    }
  } catch {
    // ignore storage errors
  }

  // 3. Query Redmine for user's last time entries
  try {
    const data = await redmineApiRequest('/time_entries.json?user_id=me&limit=1');
    const entries = data?.time_entries || [];
    if (entries.length > 0 && entries[0].activity?.id) {
      const actId = String(entries[0].activity.id);
      setLastUserActivity(actId);
      return actId;
    }
  } catch (err) {
    console.warn('Could not fetch user last activity from Redmine:', err);
  }

  return null;
}

/// <summary>
/// Saves the last activity ID used by the current user in memory and localStorage.
/// </summary>
/// <param name="activityId">The activity identifier.</param>
export function setLastUserActivity(activityId: number | string): void {
  const cleanActId = String(activityId).trim();
  if (!cleanActId) return;

  cachedUserLastActivity = cleanActId;
  try {
    localStorage.setItem('last_user_activity', cleanActId);
  } catch {
    // ignore storage errors
  }
}

/// <summary>
/// Retrieves the last activity ID used for a given task/issue.
/// Priority:
/// 1. Task-specific activity from memory / localStorage.
/// 2. User's last time entry specifically on this issue in Redmine.
/// 3. User's last logged activity anywhere (from memory / localStorage / Redmine).
/// 4. Any last time entry on this issue by another user.
/// </summary>
/// <param name="taskId">The ID of the task or issue.</param>
/// <returns>Activity ID string or null if not found.</returns>
export async function getLastActivityForTask(taskId: number | string): Promise<string | null> {
  const cleanId = String(taskId).replace(/^#/, '').trim();
  if (!cleanId) return getLastUserActivity();

  // 1. Check in-memory task cache
  if (taskActivityCache.has(cleanId)) {
    return taskActivityCache.get(cleanId)!;
  }

  // 2. Check localStorage for this task
  try {
    const localVal = localStorage.getItem(`last_activity_${cleanId}`);
    if (localVal) {
      taskActivityCache.set(cleanId, localVal);
      return localVal;
    }
  } catch {
    // ignore storage errors
  }

  // 3. Query Redmine for user's last time entry on this specific issue
  try {
    const data = await redmineApiRequest(`/time_entries.json?issue_id=${cleanId}&user_id=me&limit=1`);
    const entries = data?.time_entries || [];
    if (entries.length > 0 && entries[0].activity?.id) {
      const actId = String(entries[0].activity.id);
      setLastActivityForTask(cleanId, actId);
      return actId;
    }
  } catch (err) {
    console.warn(`Could not fetch user's last activity for issue #${cleanId}:`, err);
  }

  // 4. Fallback: Check user's last activity across all tasks
  const userGeneralActivity = await getLastUserActivity();
  if (userGeneralActivity) {
    return userGeneralActivity;
  }

  // 5. Fallback: Query Redmine for any last time entry on this issue by anyone
  try {
    const generalData = await redmineApiRequest(`/time_entries.json?issue_id=${cleanId}&limit=1`);
    const genEntries = generalData?.time_entries || [];
    if (genEntries.length > 0 && genEntries[0].activity?.id) {
      const actId = String(genEntries[0].activity.id);
      setLastActivityForTask(cleanId, actId);
      return actId;
    }
  } catch (err) {
    console.warn(`Could not fetch general last activity for issue #${cleanId}:`, err);
  }

  return null;
}

/// <summary>
/// Stores the last used activity ID for a given task/issue in memory and localStorage,
/// and updates the user's global last activity.
/// </summary>
/// <param name="taskId">The ID of the task or issue.</param>
/// <param name="activityId">The ID of the chosen activity.</param>
export function setLastActivityForTask(taskId: number | string, activityId: number | string): void {
  const cleanTaskId = String(taskId).replace(/^#/, '').trim();
  const cleanActId = String(activityId).trim();
  if (!cleanActId) return;

  setLastUserActivity(cleanActId);

  if (cleanTaskId) {
    taskActivityCache.set(cleanTaskId, cleanActId);
    try {
      localStorage.setItem(`last_activity_${cleanTaskId}`, cleanActId);
    } catch {
      // ignore storage errors
    }
  }
}
