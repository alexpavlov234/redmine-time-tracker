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
  issue: {
    id: number;
    subject: string;
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
}
