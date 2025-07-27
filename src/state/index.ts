import { Activity, Todo, RedmineProject, RedmineIssue, IssueStatus, User } from '../types/index.js';

// Timer state
let timerInterval: number | null = null;
let startTime: number | null = null;
let pausedTime = 0;
let totalElapsedTime = 0;

// Data state
let activities: Activity[] = [];
let todos: Todo[] = [];
let allProjects: (RedmineProject | { id: string; name: string })[] = [];
let allTasks: RedmineIssue[] = [];
let todoFormTasks: RedmineIssue[] = [];
let issueStatuses: IssueStatus[] = [];
let user: User | null = null;

export const state = {
  get timerInterval() { return timerInterval; },
  get startTime() { return startTime; },
  get pausedTime() { return pausedTime; },
  get totalElapsedTime() { return totalElapsedTime; },
  get activities() { return activities; },
  get todos() { return todos; },
  get allProjects() { return allProjects; },
  get allTasks() { return allTasks; },
  get todoFormTasks() { return todoFormTasks; },
  get issueStatuses() { return issueStatuses; },
  get user() { return user; },
};

// State setters
export function setTimerInterval(interval: number | null) {
    timerInterval = interval;
}

export function setStartTime(time: number | null) {
    startTime = time;
}

export function setPausedTime(time: number) {
    pausedTime = time;
}

export function setTotalElapsedTime(time: number) {
    totalElapsedTime = time;
}

export function setActivities(newActivities: Activity[]) {
    activities = newActivities;
}

export function addActivity(activity: Activity) {
    activities.push(activity);
}

export function setTodos(newTodos: Todo[]) {
    todos = newTodos;
}

export function setAllProjects(projects: (RedmineProject | { id: string; name: string })[]) {
    allProjects = projects;
}

export function setAllTasks(tasks: RedmineIssue[]) {
    allTasks = tasks;
}

export function setTodoFormTasks(tasks: RedmineIssue[]) {
    todoFormTasks = tasks;
}

export function setIssueStatuses(statuses: IssueStatus[]) {
    issueStatuses = statuses;
}

export function setUser(newUser: User | null) {
    user = newUser;
}

export function resetTimerState() {
    timerInterval = null;
    startTime = null;
    pausedTime = 0;
    totalElapsedTime = 0;
    activities = [];
}
