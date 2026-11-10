/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RedmineIssue {
  id: number;
  subject: string;
  project: {
    id: number;
    name: string;
  };
  status?: {
    id: number;
    name: string;
  };
  tracker?: {
    id: number;
    name: string;
  };
  priority?: {
    id: number;
    name: string;
  };
  author?: {
    id: number;
    name: string;
  };
  category?: {
    id: number;
    name: string;
  };
  /// <summary>Parent issue reference if this issue is a subtask.</summary>
  parent?: {
    id: number;
    subject?: string;
  };
  fixed_version?: {
    id: number;
    name: string;
  };
}

export interface RedmineProject {
  id: number;
  name: string;
}

export interface User {
  id: number;
  firstname: string;
  lastname: string;
  name: string;
}

export interface TimeEntry {
  id: number;
  project: {
    id: number;
    name: string;
  };
  /// <summary>Associated Redmine issue / task details.</summary>
  issue?: {
    id: number;
    subject?: string;
    /// <summary>Parent task reference if this task is a subtask.</summary>
    parent?: {
      id: number;
      subject?: string;
    };
  };
  user: {
    id: number;
    name: string;
  };
  activity: {
    id: number;
    name: string;
  };
  hours: number;
  comments: string;
  spent_on: string;
  created_on: string;
  updated_on: string;
  custom_fields?: Array<{
    id: number;
    name: string;
    value: string;
  }>;
}

export interface IssueStatus {
  id: number;
  name: string;
}

export interface TimeEntryActivity {
  id: number;
  name: string;
  is_default?: boolean;
}

export interface Activity {
  text: string;
  timestamp: Date;
  durationSeconds?: number;
}

export interface Todo {
  id: number;
  note: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskSubject: string;
  activityId?: number;
  activityName?: string;
  // Timer fields (persisted)
  elapsedMs?: number; // total accumulated elapsed milliseconds
  startTime?: number | null; // when running, the epoch ms when started/resumed
  isRunning?: boolean; // whether this todo's timer is currently running
  // Per‑todo performed tasks (persisted)
  activities?: Activity[];
}

export interface TimeLogPreset {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  taskId: string;
  taskSubject: string;
  activityId: string;
  hours: number;
  comments: string;
  isBillable: boolean;
}

export interface CustomField {
  id: number;
  name: string;
  field_format: string;
  possible_values?: string[];
  default_value?: string;
  required?: boolean;
  is_required?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value?: any;
}

/// <summary>
/// Available color themes for personal task sticky notes.
/// </summary>
export type StickyNoteColor = 'yellow' | 'blue' | 'green' | 'pink' | 'purple' | 'orange';

/// <summary>
/// Individual sticky note attached to a personal task.
/// </summary>
export interface PersonalTaskStickyNote {
  id: string;
  title?: string;
  content: string;
  color: StickyNoteColor;
  createdAt: number;
  updatedAt: number;
}

/// <summary>
/// Simplified personal task item with completion checkbox and multiple sticky notes.
/// </summary>
export interface PersonalTask {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
  order: number;
  stickyNotes: PersonalTaskStickyNote[];
}
/// <summary>
/// Model for a note which can be connected to a Redmine task or exist as a general note with labels.
/// </summary>
export interface NoteItem {
  id: string;
  taskId?: string | null;
  taskSubject?: string | null;
  title?: string;
  content: string;
  labels: string[];
  color?: string;
  pinned?: boolean;
  createdAt: number;
  updatedAt: number;
}
