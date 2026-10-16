import { useState, useEffect, useCallback } from 'react';
import type { PersonalTask, PersonalTaskPriority } from '../types';
import {
  getLocalPersonalTasks,
  savePersonalTasks,
  syncPersonalTasks,
  subscribeToPersonalTasks,
} from '../services/personalTasks';

/// <summary>
/// Custom React hook for managing the user's personal tasks and notes queue.
/// Supports priorities, sub-task checklists, Redmine links, and reordering.
/// </summary>
export function usePersonalTasks() {
  const [tasks, setTasks] = useState<PersonalTask[]>(getLocalPersonalTasks);

  useEffect(() => {
    syncPersonalTasks().then(setTasks);
    return subscribeToPersonalTasks(() => {
      setTasks(getLocalPersonalTasks());
    });
  }, []);

  /// <summary>
  /// Adds a new personal task to the top of the queue.
  /// </summary>
  const addTask = useCallback(
    async (taskData: {
      title: string;
      notes?: string;
      priority?: PersonalTaskPriority;
      status?: import('../types').PersonalTaskStatus;
      dueDate?: string;
      redmineIssueId?: string;
      redmineIssueSubject?: string;
      redmineProjectId?: string;
      redmineProjectName?: string;
      checklist?: string[];
    }) => {
      const current = getLocalPersonalTasks();
      const initialStatus = taskData.status || 'not_started';
      const isCompleted = initialStatus === 'completed';
      const newTask: PersonalTask = {
        id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: taskData.title.trim(),
        notes: taskData.notes?.trim() || '',
        priority: taskData.priority || 'medium',
        status: initialStatus,
        dueDate: taskData.dueDate || undefined,
        completed: isCompleted,
        createdAt: Date.now(),
        completedAt: isCompleted ? Date.now() : undefined,
        redmineIssueId: taskData.redmineIssueId?.replace(/^#/, '').trim() || undefined,
        redmineIssueSubject: taskData.redmineIssueSubject?.trim() || undefined,
        redmineProjectId: taskData.redmineProjectId || undefined,
        redmineProjectName: taskData.redmineProjectName || undefined,
        checklist: (taskData.checklist || []).map((text, idx) => ({
          id: `item_${Date.now()}_${idx}`,
          text: text.trim(),
          completed: false,
        })),
        order: 0,
      };

      const updated = [newTask, ...current.map((t, idx) => ({ ...t, order: idx + 1 }))];
      setTasks(updated);
      await savePersonalTasks(updated);
      return newTask;
    },
    []
  );

  /// <summary>
  /// Updates an existing personal task with partial fields.
  /// </summary>
  const updateTask = useCallback(async (id: string, updates: Partial<PersonalTask>) => {
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === id) {
        const next = { ...t, ...updates };
        if (updates.status) {
          next.completed = updates.status === 'completed';
          if (updates.status === 'completed' && !next.completedAt) {
            next.completedAt = Date.now();
          } else if (updates.status !== 'completed') {
            next.completedAt = undefined;
          }
        }
        return next;
      }
      return t;
    });
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Changes status of a personal task directly.
  /// </summary>
  const setTaskStatus = useCallback(async (id: string, status: import('../types').PersonalTaskStatus) => {
    const current = getLocalPersonalTasks();
    const isCompleted = status === 'completed';
    const updated = current.map((t) => {
      if (t.id === id) {
        return {
          ...t,
          status,
          completed: isCompleted,
          completedAt: isCompleted ? Date.now() : undefined,
        };
      }
      return t;
    });
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Deletes a personal task from the queue.
  /// </summary>
  const deleteTask = useCallback(async (id: string) => {
    const current = getLocalPersonalTasks();
    const updated = current.filter((t) => t.id !== id);
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Toggles completion status of a personal task.
  /// </summary>
  const toggleComplete = useCallback(async (id: string) => {
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === id) {
        const nextCompleted = !t.completed;
        const nextStatus: import('../types').PersonalTaskStatus = nextCompleted ? 'completed' : 'not_started';
        return {
          ...t,
          completed: nextCompleted,
          status: nextStatus,
          completedAt: nextCompleted ? Date.now() : undefined,
        };
      }
      return t;
    });
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Toggles completion status of a specific sub-task checklist item.
  /// </summary>
  const toggleChecklistItem = useCallback(async (taskId: string, itemId: string) => {
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          checklist: t.checklist.map((item) =>
            item.id === itemId ? { ...item, completed: !item.completed } : item
          ),
        };
      }
      return t;
    });
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Adds a new sub-task item to a task's checklist.
  /// </summary>
  const addChecklistItem = useCallback(async (taskId: string, text: string) => {
    if (!text.trim()) return;
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          checklist: [
            ...t.checklist,
            { id: `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, text: text.trim(), completed: false },
          ],
        };
      }
      return t;
    });
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Removes a sub-task item from a task's checklist.
  /// </summary>
  const removeChecklistItem = useCallback(async (taskId: string, itemId: string) => {
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          checklist: t.checklist.filter((item) => item.id !== itemId),
        };
      }
      return t;
    });
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Reorders tasks in the queue after a drag-and-drop operation.
  /// </summary>
  const reorderTasks = useCallback(async (startIndex: number, endIndex: number) => {
    const current = [...getLocalPersonalTasks()];
    const [moved] = current.splice(startIndex, 1);
    current.splice(endIndex, 0, moved);
    const updated = current.map((t, idx) => ({ ...t, order: idx }));
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  return {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    setTaskStatus,
    toggleComplete,
    toggleChecklistItem,
    addChecklistItem,
    removeChecklistItem,
    reorderTasks,
  };
}
