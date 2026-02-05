import {
    state,
    setTimerInterval, setStartTime, setPausedTime, setTotalElapsedTime,
    addActivity, setActivities, setActiveTodoId, setTodos
} from '@/src/state';
import { Activity } from '@/src/types';
import { elements } from '../utils/dom.js';
import { formatTime } from '../utils/helpers.js';
import { showSummary } from './summary.js';
import { renderActivities } from './activities.js';
import { renderTodos, prepareNextTask, saveTodos } from './queue.js';
import { checkConfiguration } from './projects.js';

export function updateTime() {
    const now = Date.now();

    // If a specific todo is active, the main (big) timer should reflect that todo's elapsed time
    if (state.activeTodoId != null) {
        const idx = state.todos.findIndex(t => t.id === state.activeTodoId);
        if (idx >= 0) {
            const todo = state.todos[idx];
            const baseElapsed = todo.elapsedMs || 0;
            const runningStart = todo.startTime ? (now - todo.startTime) : 0;
            const elapsedMs = baseElapsed + Math.max(0, runningStart);
            const elapsedSec = Math.floor(elapsedMs / 1000);
            setTotalElapsedTime(elapsedSec);
            elements.timeDisplay.textContent = formatTime(state.totalElapsedTime);

            // Update the badge on the active todo as well
            const badge = document.getElementById(`todo-time-${todo.id}`);
            if (badge) {
                (badge as HTMLElement).textContent = formatTime(elapsedSec);
            }
        }
    } else if (state.startTime) {
        // Fallback to session-based timer for manual sessions (no active todo)
        const newTotalElapsedTime = (now - state.startTime + state.pausedTime) / 1000;
        setTotalElapsedTime(newTotalElapsedTime);
        elements.timeDisplay.textContent = formatTime(state.totalElapsedTime);
    } else {
        // Nothing to update
        return;
    }

    // Debug: Log time every 10 seconds
    if (Math.floor(state.totalElapsedTime) % 10 === 0) {
        console.log('Timer update:', {
            startTime: state.startTime ? new Date(state.startTime) : null,
            now: new Date(now),
            pausedTime: state.pausedTime,
            totalElapsedTimeSeconds: state.totalElapsedTime,
            totalElapsedTimeFormatted: formatTime(state.totalElapsedTime)
        });
    }

    if (state.activities.length > 0) {
        const durationEl = document.getElementById('current-activity-duration');
        if (durationEl) {
            const previousActivitiesDuration = state.activities
                .slice(0, -1)
                .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
            const currentActivityDuration = state.totalElapsedTime - previousActivitiesDuration;
            durationEl.textContent = `(${formatTime(Math.max(0, currentActivityDuration))})`;
        }
    }
}

export function promptForFirstActivity(initialValue?: string): Promise<string | null> {
    return new Promise((resolve) => {
        // Check if Bootstrap is available
        if (typeof window.bootstrap === 'undefined') {
            console.error('Bootstrap is not loaded');
            resolve(prompt('What task are you performing?', initialValue || '')); // Fallback to native prompt
            return;
        }

        const modal = new (window as any).bootstrap.Modal(elements.firstActivityModal);

        const handleResolve = (value: string | null) => {
            elements.startWithActivityBtn.onclick = null;
            elements.closeFirstActivityModalBtn.onclick = null;
            elements.firstActivityInput.onkeydown = null;
            modal.hide();
            resolve(value);
        }

        const handleStart = () => {
            const text = elements.firstActivityInput.value.trim();
            if (text) {
                handleResolve(text);
            } else {
                elements.firstActivityInput.focus();
            }
        };

        // Pre-populate with initial value (e.g., from todo note)
        elements.firstActivityInput.value = initialValue || '';
        modal.show();

        // Wait for modal to be shown before focusing
        elements.firstActivityModal.addEventListener('shown.bs.modal', () => {
            elements.firstActivityInput.focus();
        }, { once: true });

        elements.startWithActivityBtn.onclick = handleStart;

        elements.closeFirstActivityModalBtn.onclick = () => handleResolve(null);

        elements.firstActivityInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleStart();
            }
        };
    });
}

export async function startTimer() {
    try {
        // Prefer starting the first item in the queue
        if (state.todos.length > 0) {
            await startTimerForTodo(state.todos[0].id);
            return;
        }

        if (state.timerInterval) return; // Already running

        // If we're not resuming, check if we can start
        const isResuming = state.startTime === null && state.pausedTime > 0;
        if (!isResuming) {
            // Check if we have a task either from queue or manual selection
            const hasQueueTask = state.todos.length > 0;
            const hasManualTask = elements.taskSelect.value && elements.projectSelect.value;

            if (!hasQueueTask && !hasManualTask) {
                // Reset button state before showing warning
                elements.startBtn.disabled = false;
                elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                (window as any).showWarning('Please add a task to the Work Queue or select a project and task manually before starting the timer.', 'No Task Selected');
                return;
            }
        }

        // Show immediate feedback to user
        elements.startBtn.disabled = true;
        elements.startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

        if (!isResuming) { // First start of a task
            // Check if we have a task from queue or manual selection
            const hasQueueTask = state.todos.length > 0;

            if (!hasQueueTask) {
                // Use manually selected task
                console.log('Timer starting with manual task selection:', {
                    projectSelectValue: elements.projectSelect.value,
                    taskSelectValue: elements.taskSelect.value,
                    projectInputValue: elements.projectInput.value,
                    taskInputValue: elements.taskInput.value
                });
            }

            const firstActivityText = await promptForFirstActivity();
            if (!firstActivityText) {
                // User cancelled, restore button state
                elements.startBtn.disabled = false;
                elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
                return;
            }

            // Clear previous session's activities
            setActivities([]);
            const newStartTime = Date.now();
            setStartTime(newStartTime);
            setPausedTime(0);
            const initialActivity: Activity = { text: firstActivityText, timestamp: new Date(newStartTime) };
            addActivity(initialActivity);

        } else { // Resuming
            setStartTime(Date.now());
        }

        setTimerInterval(window.setInterval(updateTime, 1000));

        elements.startBtn.disabled = true;
        elements.pauseBtn.disabled = false;
        elements.stopBtn.disabled = false;
        elements.activityInput.disabled = false;
        elements.addActivityBtn.disabled = false;
        elements.projectInput.disabled = true;
        elements.taskInput.disabled = true;
        // Do not disable queue; user can switch timers which will auto‑pause current
        document.title = "▶️ Tracking...";
        renderActivities();
        renderTodos(); // Update the todos display to show the updated queue
    } catch (error) {
        console.error('Error in startTimer:', error);
        // Reset button state in case of error
        elements.startBtn.disabled = false;
        elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (window as any).showError('Failed to start timer: ' + errorMessage, 'Timer Error');
    }
}

export function pauseTimer() {
    if (!state.timerInterval) return; // Not running
    clearInterval(state.timerInterval);
    setTimerInterval(null);

    const now = Date.now();
    // Sync active todo elapsed
    if (state.activeTodoId != null) {
        const idx = state.todos.findIndex(t => t.id === state.activeTodoId);
        if (idx >= 0) {
            const todo = state.todos[idx];
            const startedAt = todo.startTime || state.startTime || now;
            const sessionMs = Math.max(0, now - startedAt);
            const newElapsedMs = (todo.elapsedMs || 0) + sessionMs;
            // Mutate in place (state.todos is mutable array)
            (state.todos as any)[idx] = { ...todo, elapsedMs: newElapsedMs, startTime: null, isRunning: false, activities: [...state.activities] };
            localStorage.setItem('todos', JSON.stringify(state.todos));
        }
    }

    setStartTime(null);
    setPausedTime(0);

    elements.startBtn.disabled = false;
    elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    elements.pauseBtn.disabled = true;
    document.title = "⏸️ Paused | Time Tracker";
    renderActivities();
    renderTodos();
}

export function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
    }
    const now = new Date();

    // Final update to totalElapsedTime if timer was running
    if (state.startTime) {
        const newTotalElapsedTime = (now.getTime() - state.startTime + state.pausedTime) / 1000;
        setTotalElapsedTime(newTotalElapsedTime);
    }

    if (state.activities.length > 0) {
        const lastActivity = state.activities[state.activities.length - 1];
        if (!lastActivity.durationSeconds) { // Only update if not already set by adding another activity
            const previousActivitiesDuration = state.activities
                .slice(0, -1)
                .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
            const newDuration = state.totalElapsedTime - previousActivitiesDuration;
            // Ensure duration is not negative due to floating point issues
            lastActivity.durationSeconds = Math.max(0, newDuration);
        }
    }
    // Mark active todo as not running and accumulate elapsed
    if (state.activeTodoId != null) {
        const idx = state.todos.findIndex(t => t.id === state.activeTodoId);
        if (idx >= 0) {
            const todo = state.todos[idx];
            const startedAt = todo.startTime || state.startTime || now.getTime();
            const sessionMs = Math.max(0, now.getTime() - startedAt);
            const newElapsedMs = (todo.elapsedMs || 0) + sessionMs;
            (state.todos as any)[idx] = { ...todo, elapsedMs: newElapsedMs, startTime: null, isRunning: false, activities: [...state.activities] };
            localStorage.setItem('todos', JSON.stringify(state.todos));
        }
    }
    showSummary();
}

export function resetState(advanceQueue: boolean = false) {
    if (state.timerInterval) clearInterval(state.timerInterval);
    setTimerInterval(null);
    setStartTime(null);
    setPausedTime(0);
    setTotalElapsedTime(0);

    elements.timeDisplay.textContent = '00:00:00';
    elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    elements.pauseBtn.disabled = true;
    elements.stopBtn.disabled = true;
    elements.activityInput.disabled = true;
    elements.addActivityBtn.disabled = true;
    elements.activityInput.value = '';
    elements.activityList.innerHTML = '';
    setActivities([]);
    // Keep queue interactive

    if (advanceQueue) {
        prepareNextTask();
        // Ensure the queue UI reflects the removal immediately
        renderTodos();
    } else {
        // If not advancing, just re-render to re-enable buttons etc.
        renderTodos();
    }

    // If there's no queue, check configuration to repopulate the main form selectors
    if (state.todos.length === 0) {
        // Import and call checkConfiguration when needed
        checkConfiguration();
    }
    document.title = "Redmine Time Tracker";
}

// Start a timer for a specific todo (by id); auto‑pauses any active running timer
export async function startTimerForTodo(todoId: number) {
    const todoIdx = state.todos.findIndex(t => t.id === todoId);
    if (todoIdx < 0) {
        (window as any).showError('Task not found in queue.', 'Start Timer');
        return;
    }

    // Auto‑pause current running timer if different
    if (state.timerInterval && state.activeTodoId !== null && state.activeTodoId !== todoId) {
        pauseTimer();
    }

    setActiveTodoId(todoId);

    // Populate current task display from the todo
    const todo = state.todos[todoIdx];

    // Load this todo's performed tasks into working state
    setActivities((todo.activities && Array.isArray(todo.activities)) ? todo.activities : []);

    const isFirstSession = (state.startTime === null) && (state.pausedTime === 0) && (state.activities.length === 0);
    const isResuming = !isFirstSession;
    elements.projectSelect.value = todo.projectId;
    elements.projectInput.value = todo.projectName;
    elements.taskInput.value = `#${todo.taskId} - ${todo.taskSubject}`;
    const existingOption = Array.from(elements.taskSelect.options).find(opt => opt.value === todo.taskId);
    if (!existingOption) {
        const option = document.createElement('option');
        option.value = todo.taskId;
        option.textContent = `#${todo.taskId} - ${todo.taskSubject}`;
        elements.taskSelect.appendChild(option);
    }
    elements.taskSelect.value = todo.taskId;
    if (todo.activityId) {
        elements.activitySelect.value = String(todo.activityId);
    }

    if (!isResuming) {
        // Pre-populate first activity with the todo's note if available
        const firstActivityText = await promptForFirstActivity(todo.note || undefined);
        if (!firstActivityText) {
            return;
        }
        // Clear previous activities and start a new session
        setActivities([]);
        const newStartTime = Date.now();
        setStartTime(newStartTime);
        setPausedTime(0);
        const initialActivity: Activity = { text: firstActivityText, timestamp: new Date(newStartTime) };
        addActivity(initialActivity);
        // Also seed todo's activities and persist
        (state.todos as any)[todoIdx] = { ...todo, activities: [...state.activities] };
        localStorage.setItem('todos', JSON.stringify(state.todos));
    } else {
        setStartTime(Date.now());
    }

    // Mark this todo as running and set its startTime
    (state.todos as any)[todoIdx] = { ...todo, isRunning: true, startTime: Date.now() };
    localStorage.setItem('todos', JSON.stringify(state.todos));

    setTimerInterval(window.setInterval(updateTime, 1000));
    elements.startBtn.disabled = true;
    elements.pauseBtn.disabled = false;
    elements.stopBtn.disabled = false;
    elements.activityInput.disabled = false;
    elements.addActivityBtn.disabled = false;
    document.title = '▶️ Tracking...';
    renderActivities();
    renderTodos();
}
