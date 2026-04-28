import { useCallback } from 'react';
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
  startAfterPrompt: (todoId: number, firstActivityText: string) => void;
}

/**
 * Refactored hook: uses QueueContext for consistent global state.
 */
export const useQueueTimer = (): QueueTimerState & QueueTimerActions => {
  const { 
    todos, 
    activeTodoId, 
    setActiveTodoId, 
    updateTodo, 
    removeTodo, 
    getActiveTodo,
    totalElapsedTime 
  } = useQueue();

  const activeTodo = getActiveTodo();
  const isRunning = activeTodo?.isRunning || false;
  const activities = activeTodo?.activities || [];

  const pauseTimer = useCallback(() => {
    if (activeTodoId == null) return;
    const todo = getActiveTodo();
    if (!todo || !todo.isRunning) return;

    const now = Date.now();
    const startedAt = todo.startTime || now;
    const sessionMs = Math.max(0, now - startedAt);
    const newElapsedMs = (todo.elapsedMs || 0) + sessionMs;

    updateTodo(activeTodoId, {
      elapsedMs: newElapsedMs,
      startTime: null,
      isRunning: false,
    });

    document.title = '⏸️ Paused | Time Tracker';
  }, [activeTodoId, getActiveTodo, updateTodo]);

  const startTimerForTodo = useCallback(async (todoId: number): Promise<string | null> => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return null;

    // Auto-pause current running timer if different
    const currentActive = getActiveTodo();
    if (currentActive && currentActive.isRunning && currentActive.id !== todoId) {
      const now = Date.now();
      const startedAt = currentActive.startTime || now;
      const sessionMs = Math.max(0, now - startedAt);
      const newElapsedMs = (currentActive.elapsedMs || 0) + sessionMs;
      
      updateTodo(currentActive.id, {
        elapsedMs: newElapsedMs,
        startTime: null,
        isRunning: false,
      });
    }

    // Set this as active
    setActiveTodoId(todoId);

    const isFirstSession = (todo.activities?.length || 0) === 0 && (todo.elapsedMs || 0) === 0;

    if (isFirstSession) {
      return 'needs_prompt';
    }

    // Resuming — start immediately
    const now = Date.now();
    updateTodo(todoId, {
      isRunning: true,
      startTime: now,
    });

    document.title = '▶️ Tracking...';
    return null;
  }, [todos, setActiveTodoId, updateTodo, getActiveTodo]);

  const startAfterPrompt = useCallback((todoId: number, firstActivityText: string) => {
    const now = Date.now();
    const initialActivity: Activity = { text: firstActivityText.trim(), timestamp: new Date(now) };

    updateTodo(todoId, {
      isRunning: true,
      startTime: now,
      activities: [initialActivity],
    });

    document.title = '▶️ Tracking...';
  }, [updateTodo]);

  const stopTimer = useCallback(() => {
    if (activeTodoId == null) return;
    const todo = getActiveTodo();
    if (!todo) return;

    const now = Date.now();
    const startedAt = todo.startTime || now;
    const sessionMs = todo.isRunning ? Math.max(0, now - startedAt) : 0;
    const newElapsedMs = (todo.elapsedMs || 0) + sessionMs;
    const currentTotalSec = newElapsedMs / 1000;

    // Finalize activities
    const updatedActivities = [...(todo.activities || [])];
    if (updatedActivities.length > 0) {
      const lastActivity = updatedActivities[updatedActivities.length - 1];
      if (!lastActivity.durationSeconds) {
        const previousDuration = updatedActivities
          .slice(0, -1)
          .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
        lastActivity.durationSeconds = Math.max(0, currentTotalSec - previousDuration);
      }
    }

    updateTodo(activeTodoId, {
      elapsedMs: newElapsedMs,
      startTime: null,
      isRunning: false,
      activities: updatedActivities,
    });

    document.title = 'Redmine Time Tracker';
  }, [activeTodoId, getActiveTodo, updateTodo]);

  const addActivity = useCallback((text: string) => {
    if (!text.trim() || activeTodoId == null) return;
    const todo = getActiveTodo();
    if (!todo) return;

    const now = new Date();
    // Calculate current total time in seconds for duration finalizing
    const currentSessionMs = (todo.isRunning && todo.startTime) ? (Date.now() - todo.startTime) : 0;
    const currentTotalSec = ((todo.elapsedMs || 0) + currentSessionMs) / 1000;

    const updatedActivities = [...(todo.activities || [])];
    if (updatedActivities.length > 0) {
      const lastActivity = updatedActivities[updatedActivities.length - 1];
      if (!lastActivity.durationSeconds) {
        const previousDuration = updatedActivities
          .slice(0, -1)
          .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
        lastActivity.durationSeconds = Math.max(0, currentTotalSec - previousDuration);
      }
    }

    const newActivity: Activity = { text: text.trim(), timestamp: now };
    updatedActivities.push(newActivity);

    updateTodo(activeTodoId, { activities: updatedActivities });
  }, [activeTodoId, getActiveTodo, updateTodo]);

  const resetTimer = useCallback((advanceQueue: boolean = false) => {
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
    startAfterPrompt,
  };
};
