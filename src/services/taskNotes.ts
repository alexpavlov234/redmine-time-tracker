/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { NoteItem } from '../types';

const STORAGE_KEY = 'redmine_notes_collection';
const LEGACY_STORAGE_KEY = 'redmine_task_notes';
const NOTES_UPDATED_EVENT = 'redmine_notes_updated';

// In-memory cache of all notes
let cachedNotes: NoteItem[] | null = null;

/// <summary>
/// Migrates legacy single-note per task data from localStorage if existing.
/// </summary>
function migrateLegacyNotesIfNeeded(): NoteItem[] {
  try {
    const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!rawLegacy) return [];

    const legacyMap: Record<string, string> = JSON.parse(rawLegacy);
    const converted: NoteItem[] = [];
    const now = Date.now();

    Object.entries(legacyMap).forEach(([taskId, content], idx) => {
      const cleanContent = typeof content === 'string' ? content.trim() : '';
      if (cleanContent) {
        converted.push({
          id: `migrated_${taskId}_${now + idx}`,
          taskId: taskId.replace(/^#/, '').trim(),
          taskSubject: `Task #${taskId}`,
          title: `Note for #${taskId}`,
          content: cleanContent,
          labels: ['task'],
          createdAt: now,
          updatedAt: now,
        });
      }
    });

    if (converted.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(converted));
      // Remove legacy key after successful migration to prevent repeated conversions
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    }
    return converted;
  } catch (err) {
    console.error('Failed to migrate legacy task notes:', err);
    return [];
  }
}

/// <summary>
/// Retrieves all saved notes (both task-linked and general) from localStorage.
/// </summary>
/// <returns>Array of NoteItem items.</returns>
export function getAllNotes(): NoteItem[] {
  if (cachedNotes) {
    return cachedNotes;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cachedNotes = JSON.parse(raw);
      return cachedNotes || [];
    }

    // Check if legacy data exists and migrate it
    const migrated = migrateLegacyNotesIfNeeded();
    if (migrated.length > 0) {
      cachedNotes = migrated;
      return cachedNotes;
    }
  } catch (error) {
    console.error('Failed to load notes from storage:', error);
  }
  cachedNotes = [];
  return cachedNotes;
}

/// <summary>
/// Saves the full array of NoteItem items to localStorage and dispatches a change event.
/// </summary>
/// <param name="notes">Array of NoteItem items to persist.</param>
export function saveAllNotes(notes: NoteItem[]): void {
  cachedNotes = notes;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
    window.dispatchEvent(new CustomEvent(NOTES_UPDATED_EVENT));
  } catch (error) {
    console.error('Failed to persist notes:', error);
  }
}

/// <summary>
/// Retrieves all notes associated with a given task ID.
/// </summary>
/// <param name="taskId">The ID of the task or issue.</param>
/// <returns>Array of NoteItem records attached to the specified task.</returns>
export function getNotesForTask(taskId: number | string | undefined | null): NoteItem[] {
  if (!taskId) return [];
  const cleanId = String(taskId).replace(/^#/, '').trim();
  if (!cleanId) return [];
  const all = getAllNotes();
  return all
    .filter((n) => n.taskId === cleanId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/// <summary>
/// Retrieves all general notes that are not associated with any task.
/// </summary>
/// <returns>Array of general NoteItem records.</returns>
export function getGeneralNotes(): NoteItem[] {
  const all = getAllNotes();
  return all
    .filter((n) => !n.taskId)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt - a.updatedAt);
}

/// <summary>
/// Retrieves all unique labels used across notes.
/// </summary>
/// <returns>Array of label strings sorted alphabetically.</returns>
export function getAllUniqueLabels(): string[] {
  const all = getAllNotes();
  const labelSet = new Set<string>();
  all.forEach((note) => {
    note.labels?.forEach((l) => {
      const clean = l.trim();
      if (clean) labelSet.add(clean);
    });
  });
  return Array.from(labelSet).sort((a, b) => a.localeCompare(b));
}

/// <summary>
/// Saves a new note or updates an existing note by ID.
/// </summary>
/// <param name="noteData">Partial note properties with required content.</param>
/// <returns>The created or updated NoteItem.</returns>
export function upsertNote(noteData: {
  id?: string;
  taskId?: string | null;
  taskSubject?: string | null;
  title?: string;
  content: string;
  labels?: string[];
  color?: string;
  pinned?: boolean;
}): NoteItem {
  const all = [...getAllNotes()];
  const now = Date.now();
  const cleanTaskId = noteData.taskId ? String(noteData.taskId).replace(/^#/, '').trim() : null;

  if (noteData.id) {
    const existingIndex = all.findIndex((n) => n.id === noteData.id);
    if (existingIndex >= 0) {
      const updated: NoteItem = {
        ...all[existingIndex],
        ...noteData,
        taskId: cleanTaskId,
        labels: noteData.labels ?? all[existingIndex].labels ?? [],
        updatedAt: now,
      };
      all[existingIndex] = updated;
      saveAllNotes(all);
      return updated;
    }
  }

  const newNote: NoteItem = {
    id: noteData.id || `note_${now}_${Math.random().toString(36).substring(2, 9)}`,
    taskId: cleanTaskId,
    taskSubject: noteData.taskSubject || null,
    title: noteData.title?.trim() || '',
    content: noteData.content,
    labels: noteData.labels || [],
    color: noteData.color,
    pinned: noteData.pinned ?? false,
    createdAt: now,
    updatedAt: now,
  };

  all.unshift(newNote);
  saveAllNotes(all);
  return newNote;
}

/// <summary>
/// Deletes a specific note by its ID.
/// </summary>
/// <param name="noteId">Unique identifier of the note to delete.</param>
export function deleteNote(noteId: string): void {
  const all = getAllNotes().filter((n) => n.id !== noteId);
  saveAllNotes(all);
}

/// <summary>
/// Subscribes to notes update events across components and browser windows.
/// </summary>
/// <param name="callback">Listener invoked when any note is updated, added, or deleted.</param>
/// <returns>Unsubscribe cleanup function.</returns>
export function subscribeToNotes(callback: () => void): () => void {
  const handleCustomEvent = () => {
    cachedNotes = null;
    callback();
  };
  const handleStorageEvent = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) {
      cachedNotes = null;
      callback();
    }
  };

  window.addEventListener(NOTES_UPDATED_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    window.removeEventListener(NOTES_UPDATED_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorageEvent);
  };
}

// ---------------------------------------------------------------------------
// Backward-compatibility adapters for legacy consumers expecting getTaskNote / setTaskNote / deleteTaskNote
// ---------------------------------------------------------------------------

/// <summary>
/// Backward-compatible getter returning the text of the primary/latest note for a task.
/// </summary>
/// <param name="taskId">The ID of the task or issue.</param>
/// <returns>The latest note string or empty string if not found.</returns>
export function getTaskNote(taskId: number | string | undefined | null): string {
  const taskNotes = getNotesForTask(taskId);
  if (taskNotes.length === 0) return '';
  return taskNotes[0].content || '';
}

/// <summary>
/// Backward-compatible setter updating the latest note or creating a new note for a task.
/// </summary>
/// <param name="taskId">The ID of the task or issue.</param>
/// <param name="note">The note text content to persist.</param>
export function setTaskNote(taskId: number | string, note: string): void {
  const cleanId = String(taskId).replace(/^#/, '').trim();
  if (!cleanId) return;

  const existing = getNotesForTask(cleanId);
  const trimmed = note.trim();

  if (!trimmed) {
    // Delete all notes for this task
    const all = getAllNotes().filter((n) => n.taskId !== cleanId);
    saveAllNotes(all);
    return;
  }

  if (existing.length > 0) {
    upsertNote({
      id: existing[0].id,
      taskId: cleanId,
      content: trimmed,
    });
  } else {
    upsertNote({
      taskId: cleanId,
      content: trimmed,
      labels: ['task'],
    });
  }
}

/// <summary>
/// Backward-compatible method removing all notes connected to a task.
/// </summary>
/// <param name="taskId">The ID of the task or issue.</param>
export function deleteTaskNote(taskId: number | string): void {
  const cleanId = String(taskId).replace(/^#/, '').trim();
  if (!cleanId) return;
  const all = getAllNotes().filter((n) => n.taskId !== cleanId);
  saveAllNotes(all);
}

/// <summary>
/// Backward-compatible subscription to task note updates.
/// </summary>
export const subscribeToTaskNotes = subscribeToNotes;

/// <summary>
/// Backward-compatible helper returning a map of taskId to latest note string.
/// </summary>
export function getAllTaskNotes(): Record<string, string> {
  const all = getAllNotes();
  const map: Record<string, string> = {};
  all.forEach((n) => {
    if (n.taskId && !map[n.taskId]) {
      map[n.taskId] = n.content;
    }
  });
  return map;
}
