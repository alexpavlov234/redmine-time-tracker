import { Activity, Todo, RedmineProject, RedmineIssue, IssueStatus } from '../types/index.js';

// Timer state
export let timerInterval: number | null = null;
export let startTime: number | null = null;
export let pausedTime = 0;
export let totalElapsedTime = 0;

// Data state
export let activities: Activity[] = [];
export let todos: Todo[] = [];
export let allProjects: (RedmineProject | { id: string; name: string })[] = [];
export let allTasks: RedmineIssue[] = [];
export let todoFormTasks: RedmineIssue[] = [];
export let issueStatuses: IssueStatus[] = [];

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

export function resetTimerState() {
    timerInterval = null;
    startTime = null;
    pausedTime = 0;
    totalElapsedTime = 0;
    activities = [];
}
