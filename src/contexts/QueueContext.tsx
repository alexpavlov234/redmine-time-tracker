import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import type { Todo } from '../types';

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

/**
 * Loads persisted todos from browser local storage.
 * 
 * @returns Array of parsed Todo objects.
 */
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
        ? (t.activities as Array<Record<string, unknown>>).map(a => ({
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

/**
 * Loads the active todo ID from browser local storage.
 * 
 * @returns Active todo ID or null.
 */
function loadActiveTodoIdFromStorage(): number | null {
  const raw = localStorage.getItem(ACTIVE_TODO_KEY);
  if (!raw) return null;
  return parseInt(raw, 10) || null;
}

/**
 * Context provider managing queue tasks, active timer state, and bi-directional sync with the timer server.
 */
export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [todos, setTodos] = useState<Todo[]>(loadTodosFromStorage);
  const [activeTodoId, setActiveTodoIdState] = useState<number | null>(() => {
    const storedId = loadActiveTodoIdFromStorage();
    const todosFromStorage = loadTodosFromStorage();
    // Only restore if the todo still exists
    return storedId && todosFromStorage.some(t => t.id === storedId) ? storedId : null;
  });
  const [totalElapsedTime, setTotalElapsedTime] = useState(0);

  const isSyncingFromServerRef = useRef(false);
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
    /// Polls the local proxy server for background timer synchronization with low network priority.
    /// </summary>
    const pollServerTimer = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;

      try {
        const response = await fetch(PROXY_TIMER_ENDPOINT, { priority: 'low' } as RequestInit);
        if (!response.ok) return;
        const serverTimer = await response.json();
        if (!serverTimer || typeof serverTimer !== 'object') return;

        const { todos: currentTodos, activeTodoId: currentActiveTodoId } = stateRef.current;
        const currentActive = currentTodos.find(t => t.id === currentActiveTodoId);

        // Case 1: Server timer is RUNNING
        if (serverTimer.isRunning && serverTimer.issueId) {
          const sameIssue = currentActive && String(currentActive.taskId) === String(serverTimer.issueId);

          if (!sameIssue || !currentActive?.isRunning) {
            isSyncingFromServerRef.current = true;

            const existingIndex = currentTodos.findIndex(t => String(t.taskId) === String(serverTimer.issueId));
            if (existingIndex >= 0) {
              const targetTodo = currentTodos[existingIndex];
              setTodos(prev => prev.map(t => {
                if (t.id === targetTodo.id) {
                  return {
                    ...t,
                    isRunning: true,
                    startTime: serverTimer.startTime || Date.now(),
                    elapsedMs: serverTimer.elapsedMs || 0,
                    taskSubject: serverTimer.issueSubject || t.taskSubject,
                    projectName: serverTimer.projectName || t.projectName,
                  };
                }
                if (t.isRunning) {
                  const now = Date.now();
                  const sessionMs = t.startTime ? Math.max(0, now - t.startTime) : 0;
                  return { ...t, isRunning: false, startTime: null, elapsedMs: (t.elapsedMs || 0) + sessionMs };
                }
                return t;
              }));
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
                activities: [],
              };
              setTodos(prev => [
                ...prev.map(t => {
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
        // Case 2: Server timer is STOPPED, but local timer is running for that issue
        else if (!serverTimer.isRunning && currentActive && currentActive.isRunning) {
          if (String(currentActive.taskId) === String(serverTimer.issueId)) {
            isSyncingFromServerRef.current = true;
            setTodos(prev => prev.map(t => {
              if (t.id === currentActive.id) {
                const updatedActivities = [...(t.activities || [])];
                if (serverTimer.lastNote && typeof serverTimer.lastNote === 'string') {
                  const alreadyPresent = updatedActivities.some(
                    a => a.text === serverTimer.lastNote && Math.abs(new Date(a.timestamp).getTime() - (serverTimer.lastUpdated || 0)) < 10000
                  );
                  if (!alreadyPresent) {
                    updatedActivities.push({
                      text: serverTimer.lastNote,
                      timestamp: new Date(serverTimer.lastUpdated || Date.now()),
                      durationSeconds: Math.floor((serverTimer.elapsedMs || 0) / 1000),
                    });
                  }
                }

                return {
                  ...t,
                  isRunning: false,
                  startTime: null,
                  elapsedMs: typeof serverTimer.elapsedMs === 'number' ? serverTimer.elapsedMs : t.elapsedMs,
                  activities: updatedActivities,
                };
              }
              return t;
            }));
            setTimeout(() => {
              isSyncingFromServerRef.current = false;
            }, 500);
          }
        }
      } catch {
        // Proxy server might be temporarily offline; fail silently
      }
    };

    pollServerTimer();
    const interval = setInterval(pollServerTimer, 5000);
    window.addEventListener('focus', pollServerTimer);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', pollServerTimer);
    };
  }, []);

  // Broadcast local changes to proxy server
  useEffect(() => {
    if (isSyncingFromServerRef.current) return;

    const currentActive = todos.find(t => t.id === activeTodoId);
    const payload = {
      isRunning: currentActive ? Boolean(currentActive.isRunning) : false,
      issueId: currentActive?.taskId || null,
      issueSubject: currentActive?.taskSubject || '',
      projectName: currentActive?.projectName || '',
      activityId: currentActive?.activityId || null,
      activityName: currentActive?.activityName || '',
      startTime: currentActive?.startTime || null,
      elapsedMs: currentActive?.elapsedMs || 0,
    };

    const serialized = JSON.stringify(payload);
    if (serialized === lastBroadcastRef.current) return;
    lastBroadcastRef.current = serialized;

    fetch(`${PROXY_TIMER_ENDPOINT}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serialized,
      priority: 'low',
    } as RequestInit).catch(() => {
      // Proxy server might be offline; fail silently
    });
  }, [todos, activeTodoId]);

  // Global timer interval
  useEffect(() => {
    const syncTime = () => {
      const activeTodo = todos.find(t => t.id === activeTodoId);
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

    syncTime(); // Sync immediately
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
    setTodos(prev => [...prev, newTodo]);
  }, []);

  const removeTodo = useCallback((id: number) => {
    setTodos(prev => prev.filter(t => t.id !== id));
    setActiveTodoIdState(prevActive => {
      if (prevActive === id) {
        localStorage.removeItem(ACTIVE_TODO_KEY);
        return null;
      }
      return prevActive;
    });
  }, []);

  const reorderTodos = useCallback((startIndex: number, endIndex: number) => {
    setTodos(prev => {
      const result = Array.from(prev);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return result;
    });
  }, []);

  const updateTodo = useCallback((id: number, updates: Partial<Todo>) => {
    setTodos(prev =>
      prev.map(t => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  const getActiveTodo = useCallback(() => {
    return todos.find(t => t.id === activeTodoId);
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

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (!context) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
};
