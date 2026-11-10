import { useState, useEffect, useCallback } from 'react';
import type { PersonalTask, PersonalTaskStickyNote, StickyNoteColor } from '../types';
import {
  getLocalPersonalTasks,
  savePersonalTasks,
  syncPersonalTasks,
  subscribeToPersonalTasks,
} from '../services/personalTasks';

/// <summary>
/// Custom React hook for managing simplified personal tasks and their sticky notes.
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
  /// <param name="title">The title of the personal task.</param>
  /// <returns>The newly created PersonalTask.</returns>
  const addTask = useCallback(async (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return null;

    const current = getLocalPersonalTasks();
    const newTask: PersonalTask = {
      id: `pt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: trimmed,
      completed: false,
      createdAt: Date.now(),
      order: 0,
      stickyNotes: [],
    };

    const updated = [newTask, ...current.map((t, idx) => ({ ...t, order: idx + 1 }))];
    setTasks(updated);
    await savePersonalTasks(updated);
    return newTask;
  }, []);

  /// <summary>
  /// Updates an existing personal task's title or completion state.
  /// </summary>
  /// <param name="id">The ID of the task to update.</param>
  /// <param name="updates">Partial fields to update.</param>
  const updateTask = useCallback(async (id: string, updates: Partial<Pick<PersonalTask, 'title' | 'completed'>>) => {
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === id) {
        const nextCompleted = updates.completed !== undefined ? updates.completed : t.completed;
        return {
          ...t,
          ...updates,
          completed: nextCompleted,
          completedAt: nextCompleted ? t.completedAt || Date.now() : undefined,
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
  /// <param name="id">The ID of the task to delete.</param>
  const deleteTask = useCallback(async (id: string) => {
    const current = getLocalPersonalTasks();
    const updated = current.filter((t) => t.id !== id);
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Toggles completion status of a personal task.
  /// </summary>
  /// <param name="id">The ID of the task to toggle.</param>
  const toggleComplete = useCallback(async (id: string) => {
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === id) {
        const nextCompleted = !t.completed;
        return {
          ...t,
          completed: nextCompleted,
          completedAt: nextCompleted ? Date.now() : undefined,
        };
      }
      return t;
    });
    setTasks(updated);
    await savePersonalTasks(updated);
  }, []);

  /// <summary>
  /// Adds a new sticky note to a personal task.
  /// </summary>
  /// <param name="taskId">Target personal task ID.</param>
  /// <param name="noteData">Sticky note content, optional title, and color.</param>
  /// <returns>The created sticky note.</returns>
  const addStickyNote = useCallback(
    async (
      taskId: string,
      noteData: { title?: string; content: string; color?: StickyNoteColor }
    ) => {
      const now = Date.now();
      const newNote: PersonalTaskStickyNote = {
        id: `sn_${now}_${Math.random().toString(36).substring(2, 7)}`,
        title: noteData.title?.trim() || undefined,
        content: noteData.content,
        color: noteData.color || 'yellow',
        createdAt: now,
        updatedAt: now,
      };

      const current = getLocalPersonalTasks();
      const updated = current.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            stickyNotes: [newNote, ...(t.stickyNotes || [])],
          };
        }
        return t;
      });
      setTasks(updated);
      await savePersonalTasks(updated);
      return newNote;
    },
    []
  );

  /// <summary>
  /// Updates an existing sticky note inside a personal task.
  /// </summary>
  /// <param name="taskId">Target personal task ID.</param>
  /// <param name="noteId">Target sticky note ID.</param>
  /// <param name="updates">Partial sticky note fields to update.</param>
  const updateStickyNote = useCallback(
    async (
      taskId: string,
      noteId: string,
      updates: Partial<Pick<PersonalTaskStickyNote, 'title' | 'content' | 'color'>>
    ) => {
      const now = Date.now();
      const current = getLocalPersonalTasks();
      const updated = current.map((t) => {
        if (t.id === taskId) {
          return {
            ...t,
            stickyNotes: (t.stickyNotes || []).map((sn) =>
              sn.id === noteId
                ? {
                    ...sn,
                    ...updates,
                    title: updates.title !== undefined ? updates.title.trim() || undefined : sn.title,
                    updatedAt: now,
                  }
                : sn
            ),
          };
        }
        return t;
      });
      setTasks(updated);
      await savePersonalTasks(updated);
    },
    []
  );

  /// <summary>
  /// Deletes a sticky note from a personal task.
  /// </summary>
  /// <param name="taskId">Target personal task ID.</param>
  /// <param name="noteId">Target sticky note ID.</param>
  const deleteStickyNote = useCallback(async (taskId: string, noteId: string) => {
    const current = getLocalPersonalTasks();
    const updated = current.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          stickyNotes: (t.stickyNotes || []).filter((sn) => sn.id !== noteId),
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
  /// <param name="startIndex">Source index.</param>
  /// <param name="endIndex">Destination index.</param>
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
    toggleComplete,
    addStickyNote,
    updateStickyNote,
    deleteStickyNote,
    reorderTasks,
  };
}
