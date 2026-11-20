import {
  getIssue,
  createIssue,
  getProjectTrackers,
  getProjectActivities,
  getTimeEntryActivities,
  updateTimeEntry,
  createTimeEntry,
  deleteTimeEntry,
  redmineApiRequest,
} from './redmine';
import type { RedmineIssue, TaskTransferMapping, TimeTransferResult, TimeEntry } from '../types';

export interface ProjectPermissionsResult {
  isAdmin: boolean;
  isSourceManager: boolean;
  isTargetManager: boolean;
  canTransferColleagues: boolean;
  sourceRoles: string[];
  targetRoles: string[];
}

/// <summary>
/// Checks whether the user has project manager or administrator privileges in the source and target projects,
/// allowing them to transfer time entries logged by other colleagues.
/// </summary>
/// <param name="sourceProjectId">Source project identifier.</param>
/// <param name="targetProjectId">Target project identifier.</param>
/// <param name="currentUserId">Optional ID of the current user.</param>
/// <returns>Structured ProjectPermissionsResult.</returns>
export async function checkTransferPermissions(
  sourceProjectId: number | string | null,
  targetProjectId: number | string | null,
  _currentUserId?: number
): Promise<ProjectPermissionsResult> {
  const result: ProjectPermissionsResult = {
    isAdmin: false,
    isSourceManager: false,
    isTargetManager: false,
    canTransferColleagues: false,
    sourceRoles: [],
    targetRoles: [],
  };

  try {
    const response = await redmineApiRequest('/users/current.json?include=memberships');
    const curUser = response?.user;
    if (curUser?.admin) {
      result.isAdmin = true;
      result.isSourceManager = true;
      result.isTargetManager = true;
      result.canTransferColleagues = true;
      return result;
    }

    const memberships = Array.isArray(curUser?.memberships) ? curUser.memberships : [];
    const pmRegex = /(ръководител|manager|pm|lead|администратор|управ|owner|координатор)/i;

    if (sourceProjectId) {
      const sMem = memberships.find((m: any) => String(m.project?.id) === String(sourceProjectId));
      if (sMem && Array.isArray(sMem.roles)) {
        result.sourceRoles = sMem.roles.map((r: any) => r.name);
        result.isSourceManager = sMem.roles.some((r: any) => pmRegex.test(r.name || ''));
      }
    }

    if (targetProjectId) {
      const tMem = memberships.find((m: any) => String(m.project?.id) === String(targetProjectId));
      if (tMem && Array.isArray(tMem.roles)) {
        result.targetRoles = tMem.roles.map((r: any) => r.name);
        result.isTargetManager = tMem.roles.some((r: any) => pmRegex.test(r.name || ''));
      }
    }

    // User can transfer colleagues if they are admin or have manager/lead role in source project
    // (and target project if selected)
    result.canTransferColleagues = result.isAdmin || (result.isSourceManager && (!targetProjectId || result.isTargetManager));
  } catch (err) {
    console.warn('Failed to check transfer permissions:', err);
    // In case of error, assume user might have permissions so we don't artificially block
    result.canTransferColleagues = true;
  }

  return result;
}

interface ActivityOption {
  id: number;
  name: string;
  is_default?: boolean;
}

/// <summary>
/// Clones a source Redmine task into the specified target project, preserving subject,
/// description, priority, and matching tracker.
/// </summary>
/// <param name="sourceTaskId">Numeric ID of the source task to clone.</param>
/// <param name="targetProjectId">Target project ID where the new task will be created.</param>
/// <returns>The newly created RedmineIssue.</returns>
export async function cloneTaskToProject(
  sourceTaskId: number,
  targetProjectId: number | string
): Promise<RedmineIssue> {
  const sourceTask = await getIssue(sourceTaskId, true);
  if (!sourceTask) {
    throw new Error(`Source task #${sourceTaskId} could not be loaded.`);
  }

  // Fetch trackers available in target project
  const targetTrackers = await getProjectTrackers(targetProjectId);

  // Match tracker by name, or fallback to first target tracker
  let matchedTrackerId: number | undefined;
  if (sourceTask.tracker?.name && targetTrackers.length > 0) {
    const found = targetTrackers.find(
      t => t.name.trim().toLowerCase() === sourceTask.tracker!.name.trim().toLowerCase()
    );
    if (found) {
      matchedTrackerId = found.id;
    } else {
      matchedTrackerId = targetTrackers[0].id;
    }
  } else if (targetTrackers.length > 0) {
    matchedTrackerId = targetTrackers[0].id;
  } else if (sourceTask.tracker?.id) {
    matchedTrackerId = sourceTask.tracker.id;
  }

  const rawDescription = sourceTask.description;
  const description = (rawDescription !== undefined && rawDescription !== null)
    ? String(rawDescription)
    : '';

  const basePayload = {
    project_id: targetProjectId,
    subject: sourceTask.subject,
    description: description,
    tracker_id: matchedTrackerId,
  };

  try {
    return await createIssue({
      ...basePayload,
      priority_id: sourceTask.priority?.id,
      assigned_to_id: sourceTask.assigned_to?.id,
    });
  } catch (err: unknown) {
    console.warn(`Initial issue creation failed: ${(err as Error).message}. Retrying without assigned_to_id...`);
    try {
      return await createIssue({
        ...basePayload,
        priority_id: sourceTask.priority?.id,
      });
    } catch {
      console.warn('Second creation attempt failed. Retrying with minimum required fields...');
      try {
        return await createIssue(basePayload);
      } catch (err3) {
        console.warn('Third creation attempt failed. Retrying without tracker_id to allow Redmine default...', err3);
        return await createIssue({
          project_id: targetProjectId,
          subject: sourceTask.subject,
          description: description,
        });
      }
    }
  }
}

/// <summary>
/// Finds an existing task in target project whose subject matches the source subject.
/// </summary>
/// <param name="sourceSubject">Source task subject line.</param>
/// <param name="targetTasks">List of tasks in the target project.</param>
/// <returns>Matching RedmineIssue or undefined.</returns>
export function findMatchingTaskInProject(
  sourceSubject: string,
  targetTasks: RedmineIssue[]
): RedmineIssue | undefined {
  if (!sourceSubject || !targetTasks || targetTasks.length === 0) return undefined;
  const cleanSource = sourceSubject.trim().toLowerCase();
  return targetTasks.find(t => t.subject.trim().toLowerCase() === cleanSource);
}

/// <summary>
/// Rounds a number to two decimal places.
/// </summary>
export function roundHours(val: number): number {
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/// <summary>
/// Calculates transferred and remaining hours with rounding and 0.01 floor guarantees.
/// </summary>
export function calculateEntryHours(
  origHours: number,
  percentage: number
): { transferred: number; remaining: number } {
  const clampedPct = Math.max(1, Math.min(100, percentage));
  if (clampedPct >= 100) {
    return {
      transferred: roundHours(origHours),
      remaining: 0,
    };
  }
  let transferred = roundHours(origHours * (clampedPct / 100));
  if (transferred <= 0 && origHours > 0) {
    transferred = Math.min(origHours, 0.01);
  }
  let remaining = roundHours(origHours - transferred);
  if (remaining < 0) remaining = 0;
  return { transferred, remaining };
}

/// <summary>
/// Safely creates a time entry with progressive fallback if custom fields, user IDs, or activities are rejected.
/// </summary>
async function safeCreateTimeEntry(payload: {
  issue_id: number;
  hours: number;
  spent_on?: string;
  user_id?: number | string;
  activity_id?: number;
  comments?: string;
  custom_fields?: Array<{ id: number; value: any }>;
}): Promise<{ strippedUserId: boolean }> {
  // Attempt 1: Full payload (including user_id for colleague)
  try {
    await createTimeEntry(payload);
    return { strippedUserId: false };
  } catch (err1) {
    console.warn('safeCreateTimeEntry attempt 1 failed:', err1);
  }

  // Attempt 2: Strip custom fields if target project does not share the same schema, keeping user_id
  if (payload.custom_fields && payload.custom_fields.length > 0) {
    try {
      const { custom_fields: _, ...rest } = payload;
      await createTimeEntry(rest);
      return { strippedUserId: false };
    } catch (err2) {
      console.warn('safeCreateTimeEntry attempt 2 (without custom_fields) failed:', err2);
    }
  }

  // Attempt 3: Strip user_id if target project does not allow logging time for other users
  if (payload.user_id !== undefined) {
    try {
      const { user_id: _, custom_fields: __, ...rest } = payload;
      await createTimeEntry(rest);
      return { strippedUserId: true };
    } catch (err3) {
      console.warn('safeCreateTimeEntry attempt 3 (without user_id) failed:', err3);
    }
  }

  // Attempt 4: Minimal payload (issue_id, hours, spent_on, comments)
  await createTimeEntry({
    issue_id: payload.issue_id,
    hours: payload.hours,
    spent_on: payload.spent_on,
    comments: payload.comments,
  });
  return { strippedUserId: payload.user_id !== undefined };
}

export interface TransferProgress {
  current: number;
  total: number;
  stepMessage: string;
  percent: number;
}

export interface ExecuteTransferParams {
  sourceProjectId: string;
  targetProjectId: string;
  globalPercentage: number;
  mappings: TaskTransferMapping[];
  appendCommentNote: boolean;
  onProgress?: (progress: TransferProgress) => void;
}

/// <summary>
/// Executes transfer of logged time entries from source tasks to target tasks in the target project.
/// Handles 100% moves, partial percentage splits, clone-on-demand, and activity mapping.
/// </summary>
export async function executeTimeTransfer(params: ExecuteTransferParams): Promise<TimeTransferResult> {
  const {
    targetProjectId,
    globalPercentage,
    mappings,
    onProgress,
  } = params;

  const result: TimeTransferResult = {
    success: true,
    tasksProcessed: 0,
    entriesMoved: 0,
    entriesSplit: 0,
    tasksCreated: 0,
    totalTransferredHours: 0,
    totalRemainingHours: 0,
    errors: [],
  };

  const selectedMappings = mappings.filter(m => {
    if (!m.selected) return false;
    const activeCount = m.selectedEntryIds !== undefined
      ? m.selectedEntryIds.length
      : m.timeEntries.length;
    return activeCount > 0;
  });

  if (selectedMappings.length === 0) {
    return result;
  }

  // Calculate total work steps
  let totalEntriesCount = 0;
  let missingTasksCount = 0;
  for (const m of selectedMappings) {
    const activeCount = m.selectedEntryIds !== undefined
      ? m.selectedEntryIds.length
      : m.timeEntries.length;
    totalEntriesCount += activeCount;
    if (!m.targetTaskId || m.targetTaskId === 'CREATE_NEW') {
      missingTasksCount++;
    }
  }

  const totalSteps = totalEntriesCount + missingTasksCount;
  let currentStep = 0;

  const reportProgress = (msg: string) => {
    currentStep++;
    if (onProgress) {
      const pct = totalSteps > 0 ? Math.min(100, Math.round((currentStep / totalSteps) * 100)) : 100;
      onProgress({
        current: currentStep,
        total: totalSteps,
        stepMessage: msg,
        percent: pct,
      });
    }
  };

  // Step 1: Pre-fetch target activities to resolve matching activities in target project
  let targetActivities: ActivityOption[] = [];
  try {
    targetActivities = (await getProjectActivities(targetProjectId)) as ActivityOption[];
  } catch {
    targetActivities = [];
  }
  if (!targetActivities || targetActivities.length === 0) {
    try {
      targetActivities = (await getTimeEntryActivities()) as ActivityOption[];
    } catch {
      targetActivities = [];
    }
  }

  const defaultTargetActivityId =
    targetActivities.find(a => a.is_default)?.id ||
    (targetActivities.length > 0 ? targetActivities[0].id : undefined);

  // Helper to map source entry activity to target project
  const resolveTargetActivityId = (sourceActivityId?: number, sourceActivityName?: string): number | undefined => {
    if (!sourceActivityId && !sourceActivityName) return defaultTargetActivityId;

    if (sourceActivityId) {
      const matchById = targetActivities.find(a => a.id === sourceActivityId);
      if (matchById) return matchById.id;
    }

    if (sourceActivityName) {
      const matchByName = targetActivities.find(
        a => a.name?.toLowerCase() === sourceActivityName.toLowerCase()
      );
      if (matchByName) return matchByName.id;
    }

    return defaultTargetActivityId;
  };

  // Step 2: Ensure all selected mappings have a valid target task ID
  for (const mapping of selectedMappings) {
    if (!mapping.targetTaskId || mapping.targetTaskId === 'CREATE_NEW') {
      try {
        reportProgress(`Създаване на задача в целевия проект за #${mapping.sourceTaskId}: "${mapping.sourceTaskSubject}"...`);
        const newIssue = await cloneTaskToProject(mapping.sourceTaskId, targetProjectId);
        mapping.targetTaskId = String(newIssue.id);
        mapping.targetTaskSubject = newIssue.subject;
        mapping.createdTaskId = newIssue.id;
        result.tasksCreated++;
      } catch (cloneErr: unknown) {
        const errorMsg = `Грешка при създаване на задача за #${mapping.sourceTaskId}: ${(cloneErr as Error).message}`;
        mapping.status = 'error';
        mapping.errorMessage = errorMsg;
        result.errors.push(errorMsg);
        continue;
      }
    }
  }

  // Step 3: Process time entries for each selected mapping
  for (const mapping of selectedMappings) {
    const defaultTargetId = mapping.targetTaskId;

    const entriesToProcess = mapping.selectedEntryIds !== undefined
      ? mapping.timeEntries.filter(e => mapping.selectedEntryIds!.includes(e.id))
      : mapping.timeEntries;

    if (entriesToProcess.length === 0) continue;

    let mappingSuccess = true;

    for (const entry of entriesToProcess) {
      const origHours = Number(entry.hours) || 0;
      if (origHours <= 0) continue;

      const targetTaskForEntry = mapping.entryTargetTaskIds?.[entry.id] || defaultTargetId;
      const targetTaskIdNum = parseInt(targetTaskForEntry, 10);
      if (isNaN(targetTaskIdNum) || targetTaskIdNum <= 0) {
        const err = `Невалидна целева задача за запис #${entry.id} (изходна задача #${mapping.sourceTaskId})`;
        mappingSuccess = false;
        result.errors.push(err);
        continue;
      }

      const percentage = mapping.entryPercentages?.[entry.id] ?? mapping.percentage ?? globalPercentage;
      const { transferred: transferredHours, remaining: remainingHours } = calculateEntryHours(origHours, percentage);
      const isFullMove = remainingHours <= 0;

      const actId = resolveTargetActivityId(entry.activity?.id, entry.activity?.name);
      const customFields = entry.custom_fields && entry.custom_fields.length > 0
        ? entry.custom_fields.map(cf => ({ id: cf.id, value: cf.value }))
        : undefined;

      const customComment = mapping.entryComments?.[entry.id];
      const baseComment = customComment !== undefined ? customComment : (entry.comments || '');
      const cleanSpentOn = entry.spent_on ? String(entry.spent_on).split('T')[0] : undefined;

      try {
        const authorName = entry.user?.name ? ` на ${entry.user.name}` : '';

        if (isFullMove) {
          // 100% Transfer: Move the entry directly
          reportProgress(`Прехвърляне на запис (${origHours} ч.)${authorName} от #${mapping.sourceTaskId} към #${targetTaskIdNum}...`);

          // Keep exact original/edited text without adding any transfer notes
          const targetComments = baseComment;

          let movedDirectly = false;
          try {
            await updateTimeEntry(entry.id, {
              issue_id: targetTaskIdNum,
              activity_id: actId,
              comments: targetComments,
              user_id: entry.user?.id,
            });
            movedDirectly = true;
          } catch (moveErr) {
            console.warn(`Direct move failed for entry #${entry.id}, falling back to recreate & delete:`, moveErr);
          }

          if (!movedDirectly) {
            // Fallback: create in target task first, then delete original entry
            const createResult = await safeCreateTimeEntry({
              issue_id: targetTaskIdNum,
              hours: origHours,
              spent_on: cleanSpentOn,
              user_id: entry.user?.id,
              activity_id: actId,
              comments: targetComments,
              custom_fields: customFields,
            });

            if (createResult.strippedUserId && entry.user?.name) {
              result.errors.push(
                `Бележка за запис #${entry.id}: Отчетът бе създаден под Вашия акаунт в целевия проект, тъй като Redmine не позволи записване от името на колегата ${entry.user.name} (проверете правата за отчитане от чуждо име).`
              );
            }

            try {
              await deleteTimeEntry(entry.id);
            } catch (delErr) {
              console.warn(`Could not delete original entry #${entry.id}:`, delErr);
              result.errors.push(
                `Запис #${entry.id}${authorName} бе създаден успешно в задача #${targetTaskIdNum}, но изтриването на оригиналния запис бе отказано от Redmine: ${(delErr as Error).message} (необходими са права за изтриване на чужди отчети в изходния проект).`
              );
            }
          }

          result.entriesMoved++;
          result.totalTransferredHours = roundHours(result.totalTransferredHours + origHours);
        } else {
          // Partial Transfer: Split into transferred portion and remaining portion
          const clampedPct = Math.max(1, Math.min(100, percentage));
          reportProgress(`Разделяне на запис #${entry.id}${authorName} (${clampedPct}%: ${transferredHours} ч. към #${targetTaskIdNum}, остават ${remainingHours} ч.)...`);

          // Both entries keep the exact same text without appending extra notes
          const targetComments = baseComment;
          const remainingComments = baseComment;

          // Step A: Create new entry in target task FIRST
          // If creation fails, the original entry's hours are preserved untouched!
          if (transferredHours > 0) {
            const createResult = await safeCreateTimeEntry({
              issue_id: targetTaskIdNum,
              hours: transferredHours,
              spent_on: cleanSpentOn,
              user_id: entry.user?.id,
              activity_id: actId,
              comments: targetComments,
              custom_fields: customFields,
            });

            if (createResult.strippedUserId && entry.user?.name) {
              result.errors.push(
                `Бележка за запис #${entry.id}: Отчетът бе създаден под Вашия акаунт в целевия проект, тъй като Redmine не позволи записване от името на колегата ${entry.user.name} (проверете правата за отчитане от чуждо име).`
              );
            }
          }

          // Step B: Update original entry with remaining hours only after target creation succeeded
          try {
            await updateTimeEntry(entry.id, {
              hours: remainingHours,
              comments: remainingComments,
            });
          } catch (updErr) {
            console.error(`Failed to decrement original entry #${entry.id}:`, updErr);
            result.errors.push(
              `Внимание: Запис #${entry.id} бе създаден в #${targetTaskIdNum} (${transferredHours} ч.), но намаляването на часовете в оригиналния запис${authorName} не бе позволено от Redmine: ${(updErr as Error).message} (необходими са права за редактиране на чужди отчети в изходния проект).`
            );
          }

          result.entriesSplit++;
          result.totalTransferredHours = roundHours(result.totalTransferredHours + transferredHours);
          result.totalRemainingHours = roundHours(result.totalRemainingHours + remainingHours);
        }
      } catch (entryErr: unknown) {
        console.error(`Error transferring entry #${entry.id}:`, entryErr);
        mappingSuccess = false;
        result.errors.push(`Запис #${entry.id} (задача #${mapping.sourceTaskId}): ${(entryErr as Error).message}`);
      }
    }

    if (mappingSuccess) {
      mapping.status = 'success';
      result.tasksProcessed++;
    } else {
      mapping.status = 'error';
    }
  }

  result.success = result.errors.length === 0;
  return result;
}

export interface SplitEntryInfo {
  isSplit: boolean;
  partnerEntryId: number;
  partnerHours: number;
  partnerSpentOn: string;
  partnerTaskId?: number;
  partnerTaskSubject?: string;
  partnerProjectName?: string;
  partnerComments: string;
  totalHours: number;
  isCrossProject: boolean;
  splitCount: number;
}

/// <summary>
/// Normalizes a comment by trimming, converting to lower case, and stripping legacy transfer note tags.
/// </summary>
export function normalizeComment(text?: string | null): string {
  if (!text) return '';
  return text
    .replace(/\[\s*(?:прехвърлен[^\u005D]*|\d+%\s*прехвърлен[^\u005D]*|transferred[^\u005D]*)\s*\]/gi, '')
    .trim()
    .toLowerCase();
}

/// <summary>
/// Detects time entries that have already been split in two for a given day with matching text.
/// Analyzes entries within the source project and optionally across target project entries.
/// </summary>
export function detectSplitEntries(
  sourceEntries: TimeEntry[],
  targetEntries: TimeEntry[] = []
): Map<number, SplitEntryInfo> {
  const splitMap = new Map<number, SplitEntryInfo>();

  // Combine entries, deduplicating by ID
  const allEntriesMap = new Map<number, { entry: TimeEntry; isTarget: boolean }>();
  sourceEntries.forEach(e => allEntriesMap.set(e.id, { entry: e, isTarget: false }));
  targetEntries.forEach(e => {
    if (!allEntriesMap.has(e.id)) {
      allEntriesMap.set(e.id, { entry: e, isTarget: true });
    }
  });

  // Group entries by: spent_on + user_id + normalized_comment
  const groups = new Map<string, Array<{ entry: TimeEntry; isTarget: boolean }>>();

  allEntriesMap.forEach(({ entry, isTarget }) => {
    const norm = normalizeComment(entry.comments);
    if (!norm) return; // Must have non-empty text to be identified by text

    const cleanDate = entry.spent_on ? String(entry.spent_on).split('T')[0] : '';
    if (!cleanDate) return;

    const userId = entry.user?.id || 'any';
    const key = `${cleanDate}_${userId}_${norm}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push({ entry, isTarget });
  });

  // Analyze groups with 2 or more entries
  groups.forEach(groupList => {
    if (groupList.length >= 2) {
      const totalHours = roundHours(
        groupList.reduce((sum, item) => sum + (Number(item.entry.hours) || 0), 0)
      );

      groupList.forEach(({ entry, isTarget }, idx) => {
        // Find partner (the other entry in the pair, or first other)
        const other = groupList.find((_, i) => i !== idx);
        if (!other) return;

        const partnerEntry = other.entry;
        const isCross = isTarget !== other.isTarget || (entry.project?.id && partnerEntry.project?.id && entry.project.id !== partnerEntry.project.id);

        splitMap.set(entry.id, {
          isSplit: true,
          partnerEntryId: partnerEntry.id,
          partnerHours: Number(partnerEntry.hours) || 0,
          partnerSpentOn: partnerEntry.spent_on,
          partnerTaskId: partnerEntry.issue?.id,
          partnerTaskSubject: partnerEntry.issue?.subject,
          partnerProjectName: partnerEntry.project?.name,
          partnerComments: partnerEntry.comments || '',
          totalHours,
          isCrossProject: Boolean(isCross),
          splitCount: groupList.length,
        });
      });
    }
  });

  return splitMap;
}
