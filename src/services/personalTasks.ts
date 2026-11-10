import type { PersonalTask, PersonalTaskStickyNote, StickyNoteColor } from '../types';

const STORAGE_KEY = 'redmine_personal_tasks';
const PERSONAL_TASKS_EVENT = 'redmine_personal_tasks_updated';
const IS_DEV = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const PROXY_TASKS_ENDPOINT = IS_DEV ? 'http://localhost:3000/personal-tasks' : '/personal-tasks';

const VALID_COLORS: StickyNoteColor[] = ['yellow', 'blue', 'green', 'pink', 'purple', 'orange'];

// In-memory cache
let cachedPersonalTasks: PersonalTask[] | null = null;

/// <summary>
/// Migrates legacy personal task records (containing single notes, checklists, statuses, priorities, or Redmine fields)
/// into the simplified PersonalTask schema with multiple sticky notes.
/// </summary>
/// <param name="rawList">Raw array of task objects from storage or server.</param>
/// <returns>Object containing the normalized PersonalTask array and a flag indicating whether migration occurred.</returns>
export function migratePersonalTasks(rawList: unknown[]): { tasks: PersonalTask[]; migrated: boolean } {
  let migrated = false;
  const now = Date.now();

  const tasks: PersonalTask[] = rawList
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item, idx) => {
      const hasLegacyFields =
        'notes' in item ||
        'priority' in item ||
        'status' in item ||
        'checklist' in item ||
        'dueDate' in item ||
        'redmineIssueId' in item ||
        'redmineIssueSubject' in item ||
        'redmineProjectId' in item ||
        'redmineProjectName' in item;

      if (hasLegacyFields || !Array.isArray(item.stickyNotes)) {
        migrated = true;
      }

      const createdAt = typeof item.createdAt === 'number' ? item.createdAt : now;
      const stickyNotes: PersonalTaskStickyNote[] = [];

      // Preserve existing stickyNotes if present
      if (Array.isArray(item.stickyNotes)) {
        item.stickyNotes.forEach((sn: unknown, snIdx: number) => {
          if (sn && typeof sn === 'object') {
            const noteObj = sn as Record<string, unknown>;
            const rawColor = String(noteObj.color || 'yellow') as StickyNoteColor;
            stickyNotes.push({
              id: String(noteObj.id || `sn_${createdAt}_${snIdx}`),
              title: typeof noteObj.title === 'string' && noteObj.title.trim() ? noteObj.title.trim() : undefined,
              content: String(noteObj.content || ''),
              color: VALID_COLORS.includes(rawColor) ? rawColor : 'yellow',
              createdAt: typeof noteObj.createdAt === 'number' ? noteObj.createdAt : createdAt,
              updatedAt: typeof noteObj.updatedAt === 'number' ? noteObj.updatedAt : createdAt,
            });
          }
        });
      }

      // Migrate legacy single `notes` field into a yellow sticky note
      if (typeof item.notes === 'string' && item.notes.trim()) {
        const legacyContent = item.notes.trim();
        const alreadyExists = stickyNotes.some((sn) => sn.content === legacyContent);
        if (!alreadyExists) {
          stickyNotes.push({
            id: `sn_migrated_note_${item.id || idx}`,
            content: legacyContent,
            color: 'yellow',
            createdAt,
            updatedAt: createdAt,
          });
        }
      }

      // Migrate legacy Redmine linkage info into a blue sticky note
      const issueId = typeof item.redmineIssueId === 'string' ? item.redmineIssueId.trim() : '';
      const issueSubject = typeof item.redmineIssueSubject === 'string' ? item.redmineIssueSubject.trim() : '';
      const projectName = typeof item.redmineProjectName === 'string' ? item.redmineProjectName.trim() : '';
      if (issueId || issueSubject || projectName) {
        const parts: string[] = [];
        if (projectName) parts.push(`Проект: ${projectName}`);
        if (issueId) parts.push(`Задача: #${issueId}`);
        if (issueSubject) parts.push(issueSubject);
        const redmineContent = parts.join('\n');
        const alreadyExists = stickyNotes.some((sn) => sn.content === redmineContent);
        if (!alreadyExists && redmineContent) {
          stickyNotes.push({
            id: `sn_migrated_redmine_${item.id || idx}`,
            title: issueId ? `Redmine #${issueId}` : 'Redmine',
            content: redmineContent,
            color: 'blue',
            createdAt,
            updatedAt: createdAt,
          });
        }
      }

      // Migrate legacy checklist items into green sticky notes
      if (Array.isArray(item.checklist) && item.checklist.length > 0) {
        item.checklist.forEach((chk: unknown, cIdx: number) => {
          if (chk && typeof chk === 'object') {
            const chkObj = chk as Record<string, unknown>;
            const text = typeof chkObj.text === 'string' ? chkObj.text.trim() : '';
            if (text && !stickyNotes.some((sn) => sn.content === text)) {
              stickyNotes.push({
                id: String(chkObj.id || `sn_migrated_chk_${item.id || idx}_${cIdx}`),
                content: text,
                color: 'green',
                createdAt,
                updatedAt: createdAt,
              });
            }
          }
        });
      }

      const isCompleted = Boolean(item.completed || item.status === 'completed');

      return {
        id: String(item.id || `pt_${now}_${idx}`),
        title: String(item.title || '').trim() || 'Задача',
        completed: isCompleted,
        createdAt,
        completedAt: typeof item.completedAt === 'number' ? item.completedAt : isCompleted ? createdAt : undefined,
        order: typeof item.order === 'number' ? item.order : idx,
        stickyNotes,
      };
    });

  return { tasks, migrated };
}

/// <summary>
/// Reads personal tasks synchronously from browser localStorage and migrates legacy structures if needed.
/// </summary>
/// <returns>Array of parsed and migrated PersonalTask items.</returns>
export function getLocalPersonalTasks(): PersonalTask[] {
  if (cachedPersonalTasks) {
    return cachedPersonalTasks;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const { tasks, migrated } = migratePersonalTasks(parsed);
        cachedPersonalTasks = tasks;
        if (migrated) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        }
        return tasks;
      }
    }
  } catch (error) {
    console.error('Failed to read personal tasks from localStorage:', error);
  }
  cachedPersonalTasks = [];
  return cachedPersonalTasks;
}

/// <summary>
/// Persists personal tasks array to localStorage, notifies listeners, and syncs to proxy server.
/// </summary>
/// <param name="tasks">Array of PersonalTask items to persist.</param>
export async function savePersonalTasks(tasks: PersonalTask[]): Promise<void> {
  cachedPersonalTasks = tasks;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent(PERSONAL_TASKS_EVENT));
  } catch (storageError) {
    console.error('Failed to save personal tasks locally:', storageError);
  }

  // Asynchronously back up to local proxy server
  try {
    await fetch(PROXY_TASKS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tasks),
      priority: 'low',
    } as RequestInit);
  } catch {
    // Proxy server might be offline; fail silently
  }
}

/// <summary>
/// Loads personal tasks, synchronizing and migrating data with the server proxy if available.
/// </summary>
/// <returns>Array of personal tasks.</returns>
export async function syncPersonalTasks(): Promise<PersonalTask[]> {
  const local = getLocalPersonalTasks();

  try {
    const resp = await fetch(PROXY_TASKS_ENDPOINT, { priority: 'low' } as RequestInit);
    if (resp.ok) {
      const rawServerTasks = await resp.json();
      if (Array.isArray(rawServerTasks) && rawServerTasks.length > 0) {
        const { tasks: serverTasks, migrated: serverMigrated } = migratePersonalTasks(rawServerTasks);

        if (local.length === 0) {
          cachedPersonalTasks = serverTasks;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serverTasks));
          window.dispatchEvent(new CustomEvent(PERSONAL_TASKS_EVENT));
          if (serverMigrated) {
            await savePersonalTasks(serverTasks);
          }
          return serverTasks;
        } else if (serverMigrated) {
          await savePersonalTasks(local);
        }
      }
    }
  } catch {
    // Proxy server offline
  }

  return local;
}

/// <summary>
/// Subscribes to personal tasks updates across tabs and components.
/// </summary>
/// <param name="callback">Listener invoked on task updates.</param>
/// <returns>Unsubscribe cleanup function.</returns>
export function subscribeToPersonalTasks(callback: () => void): () => void {
  const handleCustomEvent = () => {
    cachedPersonalTasks = null;
    callback();
  };
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedPersonalTasks = null;
      callback();
    }
  };

  window.addEventListener(PERSONAL_TASKS_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(PERSONAL_TASKS_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}
