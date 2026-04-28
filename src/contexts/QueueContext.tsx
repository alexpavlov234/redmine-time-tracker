import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
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
}

const QueueContext = createContext<QueueContextProps | undefined>(undefined);

const STORAGE_KEY = 'todos';
const ACTIVE_TODO_KEY = 'activeTodoId';

function loadTodosFromStorage(): Todo[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: any) => ({
      ...t,
      elapsedMs: typeof t.elapsedMs === 'number' ? t.elapsedMs : 0,
      startTime: typeof t.startTime === 'number' ? t.startTime : null,
      isRunning: typeof t.isRunning === 'boolean' ? t.isRunning : false,
      activities: Array.isArray(t.activities)
        ? t.activities.map((a: any) => ({
            text: a.text,
            timestamp: new Date(a.timestamp),
            durationSeconds: typeof a.durationSeconds === 'number' ? a.durationSeconds : undefined,
          }))
        : [],
    }));
  } catch {
    return [];
  }
}

function loadActiveTodoIdFromStorage(): number | null {
  const raw = localStorage.getItem(ACTIVE_TODO_KEY);
  if (!raw) return null;
  return parseInt(raw, 10) || null;
}

export const QueueProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [todos, setTodos] = useState<Todo[]>(loadTodosFromStorage);
  const [activeTodoId, setActiveTodoIdState] = useState<number | null>(() => {
    const storedId = loadActiveTodoIdFromStorage();
    const todosFromStorage = loadTodosFromStorage();
    // Only restore if the todo still exists
    return storedId && todosFromStorage.some(t => t.id === storedId) ? storedId : null;
  });

  // Persist todos whenever they change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  }, [todos]);

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
