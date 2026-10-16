import { useState, useEffect, useCallback } from 'react';
import type { NoteItem } from '../types';
import {
  getAllNotes,
  getNotesForTask,
  getGeneralNotes,
  getAllUniqueLabels,
  upsertNote,
  deleteNote,
  getTaskNote,
  setTaskNote,
  deleteTaskNote,
  subscribeToNotes,
} from '../services/taskNotes';

/// <summary>
/// Custom React hook for accessing and managing task notes and general notes.
/// Automatically updates when notes change in other components or windows.
/// </summary>
/// <returns>Object containing note records, collections, and helper mutation actions.</returns>
export function useTaskNotes() {
  const [allNotes, setAllNotes] = useState<NoteItem[]>(getAllNotes);

  useEffect(() => {
    return subscribeToNotes(() => {
      setAllNotes(getAllNotes());
    });
  }, []);

  /// <summary>
  /// Retrieves all notes connected to a specific task.
  /// </summary>
  /// <param name="taskId">The ID of the task or issue.</param>
  /// <returns>Array of NoteItem records.</returns>
  const getNotes = useCallback((taskId: number | string | undefined | null): NoteItem[] => {
    return getNotesForTask(taskId);
  }, []);

  /// <summary>
  /// Retrieves the latest primary note string for a given task ID (backwards-compatible).
  /// </summary>
  /// <param name="taskId">The ID of the task or issue.</param>
  /// <returns>The note string or empty string.</returns>
  const getNote = useCallback((taskId: number | string | undefined | null): string => {
    return getTaskNote(taskId);
  }, []);

  /// <summary>
  /// Saves or updates the primary note for a given task ID (backwards-compatible).
  /// </summary>
  /// <param name="taskId">The ID of the task or issue.</param>
  /// <param name="note">The note text.</param>
  const saveNote = useCallback((taskId: number | string, note: string) => {
    setTaskNote(taskId, note);
  }, []);

  /// <summary>
  /// Deletes all notes connected to a task ID (backwards-compatible).
  /// </summary>
  /// <param name="taskId">The ID of the task or issue.</param>
  const removeNote = useCallback((taskId: number | string) => {
    deleteTaskNote(taskId);
  }, []);

  /// <summary>
  /// Creates a new note or updates an existing note by ID.
  /// </summary>
  const saveNoteItem = useCallback((noteData: {
    id?: string;
    taskId?: string | null;
    taskSubject?: string | null;
    title?: string;
    content: string;
    labels?: string[];
    color?: string;
    pinned?: boolean;
  }) => {
    return upsertNote(noteData);
  }, []);

  /// <summary>
  /// Deletes a specific note by ID.
  /// </summary>
  const deleteNoteItem = useCallback((noteId: string) => {
    deleteNote(noteId);
  }, []);

  /// <summary>
  /// Retrieves all general notes that have no task connection.
  /// </summary>
  const generalNotes = getGeneralNotes();

  /// <summary>
  /// Retrieves all unique tags/labels across all notes.
  /// </summary>
  const allLabels = getAllUniqueLabels();

  return {
    allNotes,
    generalNotes,
    allLabels,
    getNotes,
    getNote,
    saveNote,
    removeNote,
    saveNoteItem,
    deleteNoteItem,
  };
}
