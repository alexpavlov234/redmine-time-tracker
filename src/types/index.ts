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
  description?: string;
  assigned_to?: {
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
  admin?: boolean;
  login?: string;
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
  activityName?: string;
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

/// <summary>
/// Status of task cloning or preparation for time transfer.
/// </summary>
export type TaskTransferStatus = 'idle' | 'cloning' | 'ready' | 'success' | 'error';

/// <summary>
/// Mapping configuration for a single task whose logged time is to be transferred.
/// </summary>
export interface TaskTransferMapping {
  /// <summary>Source task numeric ID.</summary>
  sourceTaskId: number;
  /// <summary>Source task subject / title.</summary>
  sourceTaskSubject: string;
  /// <summary>Tracker name of the source task.</summary>
  sourceTrackerName?: string;
  /// <summary>Total hours logged on this task in the filtered period.</summary>
  totalLoggedHours: number;
  /// <summary>Number of time entries found for this task.</summary>
  entryCount: number;
  /// <summary>Underlying time entries to transfer.</summary>
  timeEntries: TimeEntry[];
  /// <summary>Specific time entry IDs selected for transfer within this task.</summary>
  selectedEntryIds?: number[];
  /// <summary>Custom percentage override per individual time entry ID.</summary>
  entryPercentages?: Record<number, number>;
  /// <summary>Custom target task ID override per individual time entry ID.</summary>
  entryTargetTaskIds?: Record<number, string>;
  /// <summary>Custom comment / description override per individual time entry ID.</summary>
  entryComments?: Record<number, string>;
  /// <summary>Target task ID string (or empty if unassigned).</summary>
  targetTaskId: string;
  /// <summary>Target task subject if selected or newly created.</summary>
  targetTaskSubject?: string;
  /// <summary>Selected transfer percentage (defaults to global percentage, can be customized).</summary>
  percentage?: number;
  /// <summary>Whether this task is selected for transfer.</summary>
  selected: boolean;
  /// <summary>Current transfer/creation status.</summary>
  status: TaskTransferStatus;
  /// <summary>Error message if cloning or transfer failed for this specific task.</summary>
  errorMessage?: string;
  /// <summary>ID of newly created clone task in target project if created.</summary>
  createdTaskId?: number;
}

/// <summary>
/// Summary report returned upon completion of time transfer.
/// </summary>
export interface TimeTransferResult {
  success: boolean;
  tasksProcessed: number;
  entriesMoved: number;
  entriesSplit: number;
  tasksCreated: number;
  totalTransferredHours: number;
  totalRemainingHours: number;
  errors: string[];
}

/// <summary>
/// Locally committed (staged) time entry prepared for later batch submission ("push") to Redmine.
/// </summary>
export interface StagedTimeEntry {
  /// <summary>Unique local identifier for the staged entry.</summary>
  localId: string;
  /// <summary>Redmine project ID string (optional if issueId is provided).</summary>
  projectId: string;
  /// <summary>Project display name for calendar and day details.</summary>
  projectName: string;
  /// <summary>Optional Redmine issue / task ID.</summary>
  issueId?: number;
  /// <summary>Optional Redmine issue subject for display.</summary>
  issueSubject?: string;
  /// <summary>Redmine activity ID.</summary>
  activityId: number;
  /// <summary>Activity display name.</summary>
  activityName: string;
  /// <summary>Logged hours.</summary>
  hours: number;
  /// <summary>Work description / comments.</summary>
  comments: string;
  /// <summary>Date string formatted as YYYY-MM-DD.</summary>
  spent_on: string;
  /// <summary>Optional custom fields payload.</summary>
  custom_fields?: Array<{ id: number; value: string | number }>;
  /// <summary>Optional issue status ID to update upon push.</summary>
  statusId?: string;
  /// <summary>Creation timestamp in epoch milliseconds.</summary>
  createdAt: number;
  /// <summary>Last error message if a previous push attempt failed.</summary>
  lastError?: string;
}


