import type { PersonalTask } from '../types';

const STORAGE_KEY = 'redmine_personal_tasks';
const PERSONAL_TASKS_EVENT = 'redmine_personal_tasks_updated';
const IS_DEV = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const PROXY_TASKS_ENDPOINT = IS_DEV ? 'http://localhost:3000/personal-tasks' : '/personal-tasks';

// In-memory cache
let cachedPersonalTasks: PersonalTask[] | null = null;

/// <summary>
/// Reads personal tasks synchronously from browser localStorage.
/// </summary>
/// <returns>Array of parsed PersonalTask items.</returns>
export function getLocalPersonalTasks(): PersonalTask[] {
  if (cachedPersonalTasks) {
    return cachedPersonalTasks;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        cachedPersonalTasks = parsed;
        return parsed;
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
/// Loads personal tasks, synchronizing with the server proxy if available.
/// </summary>
/// <returns>Array of personal tasks.</returns>
export async function syncPersonalTasks(): Promise<PersonalTask[]> {
  const local = getLocalPersonalTasks();

  try {
    const resp = await fetch(PROXY_TASKS_ENDPOINT, { priority: 'low' } as RequestInit);
    if (resp.ok) {
      const serverTasks = await resp.json();
      if (Array.isArray(serverTasks) && serverTasks.length > 0) {
        // If local is empty, or server has newer items, adopt server tasks
        if (local.length === 0) {
          cachedPersonalTasks = serverTasks;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(serverTasks));
          window.dispatchEvent(new CustomEvent(PERSONAL_TASKS_EVENT));
          return serverTasks;
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
