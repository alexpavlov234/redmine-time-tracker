import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Todo } from '../types';

/// <summary>
/// Context contract for managing queued tasks and active timer synchronization.
/// </summary>
interface QueueContextProps {
  todos: Todo[];
  activeTodoId: number | null;
  addTodo: (todo: Omit<Todo, 'id'>) => void;
  removeTodo: (id: number) => void;
  reorderTodos: (startIndex: number, endIndex: number) => void;
  setActiveTodoId: (id: number | null) => void;
  updateTodo: (id: number, updates: Partial<Todo>) => void;
  getActiveTodo: () => Todo | undefined;
  totalElapsedTime: number;
}

const QueueContext = createContext<QueueContextProps | undefined>(undefined);

const STORAGE_KEY = 'todos';
const ACTIVE_TODO_KEY = 'activeTodoId';
const IS_DEV = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const PROXY_TIMER_ENDPOINT = IS_DEV ? 'http://localhost:3000/timer' : '/timer';

/// <summary>
/// Loads persisted todos from browser local storage.
/// </summary>
/// <returns>Array of parsed Todo objects.</returns>
function loadTodosFromStorage(): Todo[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: Record<string, unknown>) => ({
      ...t,
      elapsedMs: typeof t.elapsedMs === 'number' ? t.elapsedMs : 0,
      startTime: typeof t.startTime === 'number' ? t.startTime : null,
      isRunning: typeof t.isRunning === 'boolean' ? t.isRunning : false,
      activities: Array.isArray(t.activities)
        ? (t.activities as Array<Record<string, unknown>>).map((a) => ({
            text: typeof a.text === 'string' ? a.text : '',
            timestamp: a.timestamp ? new Date(a.timestamp as string | number | Date) : new Date(),
            durationSeconds: typeof a.durationSeconds === 'number' ? a.durationSeconds : undefined,
          }))
        : [],
    } as Todo));
  } catch {
    return [];
  }
}

/// <summary>
/// Loads the active todo ID from browser local storage.
/// </summary>
/// <returns>Active todo ID or null.</returns>
function loadActiveTodoIdFromStorage(): number | null {
  const raw = localStorage.getItem(ACTIVE_TODO_KEY);
  if (!raw) return null;
  return parseInt(raw, 10) || null;
}

/// <summary>
/// Builds a serialized broadcast payload for a given active Todo item.
/// </summary>
/// <param name="currentActive">The currently active Todo item, if any.</param>
/// <returns>Serialized JSON string.</returns>
function buildSyncPayload(currentActive: Todo | undefined): string {
  return JSON.stringify({
    isRunning: currentActive ? Boolean(currentActive.isRunning) : false,
    issueId: currentActive?.taskId || null,
    issueSubject: currentActive?.taskSubject || '',
    projectName: currentActive?.projectName || '',
    activityId: currentActive?.activityId || null,
    activityName: currentActive?.activityName || '',
    startTime: currentActive?.startTime || null,
    elapsedMs: currentActive?.elapsedMs || 0,
  });
}

/// <summary>
/// Context provider managing queue tasks, active timer state, and bi-directional sync with the timer server.
/// </summary>
export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [todos, setTodos] = useState<Todo[]>(loadTodosFromStorage);
  const [activeTodoId, setActiveTodoIdState] = useState<number | null>(() => {
    const storedId = loadActiveTodoIdFromStorage();
    const todosFromStorage = loadTodosFromStorage();
    return storedId && todosFromStorage.some((t) => t.id === storedId) ? storedId : null;
  });
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);

  const isSyncingFromServerRef = useRef(false);
  const hasInitialSyncCompletedRef = useRef(false);
  const lastServerUpdatedRef = useRef<number>(0);
  const lastBroadcastRef = useRef<string>('');
  const stateRef = useRef({ todos, activeTodoId });

  useEffect(() => {
    stateRef.current = { todos, activeTodoId };
  }, [todos, activeTodoId]);

  // Persist todos whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

  // Synchronize state with proxy timer server
  useEffect(() => {
    /// <summary>
    /// Polls the local proxy server for background timer synchronization.
    /// Keeps polling even when the tab is in the background so extension actions are never missed.
    /// </summary>
    const pollServerTimer = async () => {
      try {
        const response = await fetch(PROXY_TIMER_ENDPOINT);
        if (!response.ok) {
          hasInitialSyncCompletedRef.current = true;
          return;
        }
        const serverTimer = await response.json();
        if (!serverTimer || typeof serverTimer !== 'object') {
          hasInitialSyncCompletedRef.current = true;
          return;
        }

        const { todos: currentTodos, activeTodoId: currentActiveTodoId } = stateRef.current;
        const currentActive = currentTodos.find((t) => t.id === currentActiveTodoId);
        const serverLastUpdated = typeof serverTimer.lastUpdated === 'number' ? serverTimer.lastUpdated : 0;

        // Case 1: Server timer is RUNNING
        if (serverTimer.isRunning && serverTimer.issueId) {
          const sameIssue = currentActive && String(currentActive.taskId) === String(serverTimer.issueId);

          if (!sameIssue || !currentActive?.isRunning) {
            isSyncingFromServerRef.current = true;
            lastServerUpdatedRef.current = serverLastUpdated;

            const existingIndex = currentTodos.findIndex((t) => String(t.taskId) === String(serverTimer.issueId));
            if (existingIndex >= 0) {
              const targetTodo = currentTodos[existingIndex];
              const syncedTodo: Todo = {
                ...targetTodo,
                isRunning: true,
                startTime: serverTimer.startTime || Date.now(),
                elapsedMs: serverTimer.elapsedMs || 0,
                taskSubject: serverTimer.issueSubject || targetTodo.taskSubject,
                projectName: serverTimer.projectName || targetTodo.projectName,
              };
              lastBroadcastRef.current = buildSyncPayload(syncedTodo);

              setTodos((prev) =>
                prev.map((t) => {
                  if (t.id === targetTodo.id) {
                    return syncedTodo;
                  }
                  if (t.isRunning) {
                    const now = Date.now();
                    const sessionMs = t.startTime ? Math.max(0, now - t.startTime) : 0;
                    return { ...t, isRunning: false, startTime: null, elapsedMs: (t.elapsedMs || 0) + sessionMs };
                  }
                  return t;
                })
              );
              setActiveTodoIdState(targetTodo.id);
              localStorage.setItem(ACTIVE_TODO_KEY, String(targetTodo.id));
            } else {
              const newId = Date.now();
              const newTodo: Todo = {
                id: newId,
                taskId: String(serverTimer.issueId),
                taskSubject: serverTimer.issueSubject || `Task #${serverTimer.issueId}`,
                projectId: '',
                projectName: serverTimer.projectName || 'Redmine Task',
                note: '',
                elapsedMs: serverTimer.elapsedMs || 0,
                startTime: serverTimer.startTime || newId,
                isRunning: true,
                activities: Array.isArray(serverTimer.activities)
                  ? serverTimer.activities.map((a: Record<string, unknown>) => ({
                      text: typeof a.text === 'string' ? a.text : '',
                      timestamp: a.timestamp ? new Date(a.timestamp as number | string) : new Date(),
                      durationSeconds: typeof a.durationSeconds === 'number' ? a.durationSeconds : undefined,
                    }))
                  : [],
              };
              lastBroadcastRef.current = buildSyncPayload(newTodo);

              setTodos((prev) => [
                ...prev.map((t) => {
                  if (t.isRunning) {
                    const now = Date.now();
                    const sessionMs = t.startTime ? Math.max(0, now - t.startTime) : 0;
                    return { ...t, isRunning: false, startTime: null, elapsedMs: (t.elapsedMs || 0) + sessionMs };
                  }
                  return t;
                }),
                newTodo,
              ]);
              setActiveTodoIdState(newId);
              localStorage.setItem(ACTIVE_TODO_KEY, String(newId));
            }

            setTimeout(() => {
              isSyncingFromServerRef.current = false;
            }, 500);
          }
        }
        // Case 2: Server timer is STOPPED, and either local timer was running for that issue OR server has newer stopped session data
        else if (
          !serverTimer.isRunning &&
          serverTimer.issueId &&
          ((currentActive && currentActive.isRunning && String(currentActive.taskId) === String(serverTimer.issueId)) ||
            (serverLastUpdated > lastServerUpdatedRef.current && ((serverTimer.elapsedMs || 0) > 0 || serverTimer.lastNote)))
        ) {
          isSyncingFromServerRef.current = true;
          lastServerUpdatedRef.current = serverLastUpdated;

          const existingIndex = currentTodos.findIndex((t) => String(t.taskId) === String(serverTimer.issueId));
          if (existingIndex >= 0) {
            const targetTodo = currentTodos[existingIndex];
            const updatedActivities = [...(targetTodo.activities || [])];
            if (serverTimer.lastNote && typeof serverTimer.lastNote === 'string') {
              const alreadyPresent = updatedActivities.some(
                (a) => a.text === serverTimer.lastNote && Math.abs(new Date(a.timestamp).getTime() - (serverTimer.lastUpdated || 0)) < 15000
              );
              if (!alreadyPresent) {
                updatedActivities.push({
                  text: serverTimer.lastNote,
                  timestamp: new Date(serverTimer.lastUpdated || Date.now()),
                  durationSeconds: Math.floor((serverTimer.elapsedMs || 0) / 1000),
                });
              }
            }

            const syncedTodo: Todo = {
              ...targetTodo,
              isRunning: false,
              startTime: null,
              elapsedMs: typeof serverTimer.elapsedMs === 'number' ? serverTimer.elapsedMs : targetTodo.elapsedMs,
              activities: updatedActivities,
            };
            lastBroadcastRef.current = buildSyncPayload(syncedTodo);

            setTodos((prev) => prev.map((t) => (t.id === targetTodo.id ? syncedTodo : t)));
            setActiveTodoIdState(targetTodo.id);
            localStorage.setItem(ACTIVE_TODO_KEY, String(targetTodo.id));
          } else if ((serverTimer.elapsedMs || 0) > 0 || serverTimer.lastNote) {
            const newId = Date.now();
            const newTodo: Todo = {
              id: newId,
              taskId: String(serverTimer.issueId),
              taskSubject: serverTimer.issueSubject || `Task #${serverTimer.issueId}`,
              projectId: '',
              projectName: serverTimer.projectName || 'Redmine Task',
              note: serverTimer.lastNote || '',
              elapsedMs: serverTimer.elapsedMs || 0,
              startTime: null,
              isRunning: false,
              activities: serverTimer.lastNote
                ? [
                    {
                      text: serverTimer.lastNote,
                      timestamp: new Date(serverTimer.lastUpdated || newId),
                      durationSeconds: Math.floor((serverTimer.elapsedMs || 0) / 1000),
                    },
                  ]
                : [],
            };
            lastBroadcastRef.current = buildSyncPayload(newTodo);

            setTodos((prev) => [...prev, newTodo]);
            setActiveTodoIdState(newId);
            localStorage.setItem(ACTIVE_TODO_KEY, String(newId));
          }

          setTimeout(() => {
            isSyncingFromServerRef.current = false;
          }, 500);
        } else if (!hasInitialSyncCompletedRef.current) {
          // Initialize lastBroadcastRef to current local state if server is idle so we only broadcast real changes
          lastServerUpdatedRef.current = serverLastUpdated;
          if (!currentActive?.isRunning) {
            lastBroadcastRef.current = buildSyncPayload(currentActive);
          }
        }

        hasInitialSyncCompletedRef.current = true;
      } catch {
        hasInitialSyncCompletedRef.current = true;
      }
    };

    pollServerTimer();
    const interval = setInterval(pollServerTimer, 2000);
    window.addEventListener('focus', pollServerTimer);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', pollServerTimer);
    };
  }, []);

  // Broadcast local changes to proxy server only after initial sync has completed
  useEffect(() => {
    if (!hasInitialSyncCompletedRef.current || isSyncingFromServerRef.current) return;

    const currentActive = todos.find((t) => t.id === activeTodoId);
    const serialized = buildSyncPayload(currentActive);
    if (serialized === lastBroadcastRef.current) return;
    lastBroadcastRef.current = serialized;

    fetch(`${PROXY_TIMER_ENDPOINT}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized,
    }).catch(() => {
      // Proxy server might be offline; fail silently
    });
  }, [todos, activeTodoId]);

  // Global timer interval
  useEffect(() => {
    const syncTime = () => {
      const activeTodo = todos.find((t) => t.id === activeTodoId);
      if (activeTodo && activeTodo.isRunning && activeTodo.startTime) {
        const now = Date.now();
        const baseElapsed = activeTodo.elapsedMs || 0;
        const sessionMs = now - activeTodo.startTime;
        const totalMs = baseElapsed + Math.max(0, sessionMs);
        setTotalElapsedTime(Math.floor(totalMs / 1000));
      } else if (activeTodo) {
        setTotalElapsedTime(Math.floor((activeTodo.elapsedMs || 0) / 1000));
      } else {
        setTotalElapsedTime(0);
      }
    };

    syncTime();
    const interval = setInterval(syncTime, 1000);

    return () => clearInterval(interval);
  }, [todos, activeTodoId]);

  const setActiveTodoId = useCallback((id: number | null) => {
    setActiveTodoIdState(id);
    if (id === null) {
      localStorage.removeItem(ACTIVE_TODO_KEY);
    } else {
      localStorage.setItem(ACTIVE_TODO_KEY, String(id));
    }
  }, []);

  const addTodo = useCallback((todo: Omit<Todo, 'id'>) => {
    const newTodo: Todo = {
      ...todo,
      id: Date.now(),
      elapsedMs: 0,
      startTime: null,
      isRunning: false,
      activities: [],
    };
    setTodos((prev) => [...prev, newTodo]);
  }, []);

  const removeTodo = useCallback((id: number) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setActiveTodoIdState((prevActive) => {
      if (prevActive === id) {
        localStorage.removeItem(ACTIVE_TODO_KEY);
        return null;
      }
      return prevActive;
    });
  }, []);

  const reorderTodos = useCallback((startIndex: number, endIndex: number) => {
    setTodos((prev) => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

  const updateTodo = useCallback((id: number, updates: Partial<Todo>) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)));
  }, []);

  const getActiveTodo = useCallback(() => {
    return todos.find((t) => t.id === activeTodoId);
  }, [todos, activeTodoId]);

  return (
    <QueueContext.Provider
      value={{
        todos,
        activeTodoId,
        addTodo,
        removeTodo,
        reorderTodos,
        setActiveTodoId,
        updateTodo,
        getActiveTodo,
        totalElapsedTime,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};

/// <summary>
/// Hook for accessing the QueueContext.
/// </summary>
export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
};
