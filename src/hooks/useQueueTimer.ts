import { useState, useCallback, useRef, useEffect } from 'react';
import type { Activity, Todo } from '../types';
import { useQueue } from '../contexts/QueueContext';

interface QueueTimerState {
  isRunning: boolean;
  totalElapsedTime: number;
  activities: Activity[];
  activeTodo: Todo | undefined;
}

interface QueueTimerActions {
  startTimerForTodo: (todoId: number) => Promise<string | null>;
  pauseTimer: () => void;
  stopTimer: () => void;
  addActivity: (text: string) => void;
  resetTimer: (advanceQueue?: boolean) => void;
}

/**
 * OCP-compliant hook: extends base timer concept with per-todo queue awareness.
 * Manages active todo selection, elapsed time per todo, auto-pause on switch,
 * performed tasks list, and timer interval lifecycle.
 */
export const useQueueTimer = (): QueueTimerState & QueueTimerActions => {
  const { todos, activeTodoId, setActiveTodoId, updateTodo, removeTodo, getActiveTodo } = useQueue();

  const activeTodo = getActiveTodo();
  const isRunning = activeTodo?.isRunning || false;

  const calculateElapsed = useCallback(() => {
    const todo = getActiveTodo();
    if (!todo) return 0;
    const baseElapsed = todo.elapsedMs || 0;
    const runningStart = (todo.isRunning && todo.startTime) ? (Date.now() - todo.startTime) : 0;
    return Math.floor((baseElapsed + Math.max(0, runningStart)) / 1000);
  }, [getActiveTodo]);

  const [activities, setActivities] = useState<Activity[]>(() => 
    (activeTodo?.activities && Array.isArray(activeTodo.activities)) ? activeTodo.activities : []
  );
  const [totalElapsedTime, setTotalElapsedTime] = useState(calculateElapsed);

  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Live update function
  const updateTime = useCallback(() => {
    if (activeTodoId == null) return;

    const now = Date.now();
    const todo = getActiveTodo();
    if (!todo) return;

    const baseElapsed = todo.elapsedMs || 0;
    const runningStart = todo.startTime ? (now - todo.startTime) : 0;
    const elapsedMs = baseElapsed + Math.max(0, runningStart);
    const elapsedSec = Math.floor(elapsedMs / 1000);
    setTotalElapsedTime(elapsedSec);
  }, [activeTodoId, getActiveTodo]);

  // Sync local state when context changes
  useEffect(() => {
    const todo = getActiveTodo();
    if (todo) {
      if (JSON.stringify(todo.activities) !== JSON.stringify(activities)) {
        setActivities(todo.activities || []);
      }
      setTotalElapsedTime(calculateElapsed());
    } else {
      setActivities([]);
      setTotalElapsedTime(0);
    }
  }, [activeTodoId, todos, calculateElapsed]);

  // Resume timer on mount/load if it was running
  useEffect(() => {
    const todo = getActiveTodo();
    if (todo?.isRunning && !intervalRef.current) {
      intervalRef.current = window.setInterval(() => updateTime(), 1000);
      updateTime();
    }
  }, [activeTodoId, getActiveTodo, updateTime]);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  const pauseTimer = useCallback(() => {
    if (!intervalRef.current) return;

    clearInterval(intervalRef.current);
    intervalRef.current = null;
    startTimeRef.current = null;

    const now = Date.now();

    if (activeTodoId != null) {
      const todo = getActiveTodo();
      if (todo) {
        const startedAt = todo.startTime || now;
        const sessionMs = Math.max(0, now - startedAt);
        const newElapsedMs = (todo.elapsedMs || 0) + sessionMs;

        updateTodo(activeTodoId, {
          elapsedMs: newElapsedMs,
          startTime: null,
          isRunning: false,
          activities: [...activities],
        });
      }
    }

    document.title = '⏸️ Paused | Time Tracker';
  }, [activeTodoId, getActiveTodo, updateTodo, activities]);

  const startTimerForTodo = useCallback(async (todoId: number): Promise<string | null> => {
    const todoIdx = todos.findIndex(t => t.id === todoId);
    if (todoIdx < 0) return null;

    // Auto-pause current running timer if different
    if (intervalRef.current && activeTodoId !== null && activeTodoId !== todoId) {
      pauseTimer();
    }

    const todo = todos[todoIdx];

    // Set this as active
    setActiveTodoId(todoId);

    // Load this todo's performed tasks
    const todoActivities = (todo.activities && Array.isArray(todo.activities))
      ? todo.activities
      : [];
    setActivities(todoActivities);

    const isFirstSession = todoActivities.length === 0 && (todo.elapsedMs || 0) === 0;

    // If first session, we need the caller to prompt for first activity text
    // Return 'needs_prompt' so the component can show the modal
    if (isFirstSession) {
      return 'needs_prompt';
    }

    // Resuming — start immediately
    const now = Date.now();
    startTimeRef.current = now;

    updateTodo(todoId, {
      isRunning: true,
      startTime: now,
    });

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => updateTime(), 1000);

    document.title = '▶️ Tracking...';
    return null;
  }, [todos, activeTodoId, setActiveTodoId, pauseTimer, updateTodo, updateTime]);

  // Called after the first-activity prompt returns a value
  const startAfterPrompt = useCallback((todoId: number, firstActivityText: string) => {
    const now = Date.now();
    const initialActivity: Activity = { text: firstActivityText, timestamp: new Date(now) };
    const newActivities = [initialActivity];

    setActivities(newActivities);
    startTimeRef.current = now;

    updateTodo(todoId, {
      isRunning: true,
      startTime: now,
      activities: newActivities,
    });

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = window.setInterval(() => updateTime(), 1000);

    document.title = '▶️ Tracking...';
  }, [updateTodo, updateTime]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const now = Date.now();

    if (activeTodoId != null) {
      const todo = getActiveTodo();
      if (todo) {
        const startedAt = todo.startTime || now;
        const sessionMs = Math.max(0, now - startedAt);
        const newElapsedMs = (todo.elapsedMs || 0) + sessionMs;

        updateTodo(activeTodoId, {
          elapsedMs: newElapsedMs,
          startTime: null,
          isRunning: false,
          activities: [...activities],
        });

        setTotalElapsedTime(newElapsedMs / 1000);
      }
    }

    // Finalize last activity duration
    if (activities.length > 0) {
      const lastActivity = activities[activities.length - 1];
      if (!lastActivity.durationSeconds) {
        const previousDuration = activities
          .slice(0, -1)
          .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
        const currentTotal = activeTodoId != null
          ? (getActiveTodo()?.elapsedMs || 0) / 1000
          : totalElapsedTime;
        lastActivity.durationSeconds = Math.max(0, currentTotal - previousDuration);
        setActivities([...activities]);
      }
    }

    startTimeRef.current = null;
    document.title = 'Redmine Time Tracker';
  }, [activeTodoId, getActiveTodo, updateTodo, activities, totalElapsedTime]);

  const addActivity = useCallback((text: string) => {
    if (!text.trim()) return;

    const now = new Date();

    // Finalize previous activity duration
    const updatedActivities = [...activities];
    if (updatedActivities.length > 0) {
      const lastActivity = updatedActivities[updatedActivities.length - 1];
      if (!lastActivity.durationSeconds) {
        const previousDuration = updatedActivities
          .slice(0, -1)
          .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
        lastActivity.durationSeconds = Math.max(0, totalElapsedTime - previousDuration);
      }
    }

    const newActivity: Activity = { text: text.trim(), timestamp: now };
    updatedActivities.push(newActivity);
    setActivities(updatedActivities);

    // Write through to active todo
    if (activeTodoId != null) {
      updateTodo(activeTodoId, { activities: updatedActivities });
    }
  }, [activities, totalElapsedTime, activeTodoId, updateTodo]);

  const resetTimer = useCallback((advanceQueue: boolean = false) => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    startTimeRef.current = null;
    setTotalElapsedTime(0);
    setActivities([]);

    if (advanceQueue && activeTodoId != null) {
      removeTodo(activeTodoId);
    }

    setActiveTodoId(null);
    document.title = 'Redmine Time Tracker';
  }, [activeTodoId, setActiveTodoId, removeTodo]);

  return {
    isRunning,
    totalElapsedTime,
    activities,
    activeTodo,
    startTimerForTodo,
    pauseTimer,
    stopTimer,
    addActivity,
    resetTimer,
    // Expose startAfterPrompt for the first-activity modal flow
    startAfterPrompt,
  } as QueueTimerState & QueueTimerActions & { startAfterPrompt: (todoId: number, text: string) => void };
};
