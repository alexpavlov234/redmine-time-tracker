import { 
    state,
    setTimerInterval, setStartTime, setPausedTime, setTotalElapsedTime,
    addActivity, setActivities
} from '../state/index.js';
import { Activity } from '../types/index.js';
import { elements } from '../utils/dom.js';
import { formatTime } from '../utils/helpers.js';
import { showSummary } from './summary.js';
import { renderActivities } from './activities.js';
import { renderTodos, prepareNextTask } from './queue.js';
import { checkConfiguration } from './projects.js';

export function updateTime() {
    if (!state.startTime) return;
    const now = Date.now();
    const newTotalElapsedTime = (now - state.startTime + state.pausedTime) / 1000;
    setTotalElapsedTime(newTotalElapsedTime);
    elements.timeDisplay.textContent = formatTime(state.totalElapsedTime);

    // Debug: Log time every 10 seconds
    if (Math.floor(state.totalElapsedTime) % 10 === 0 && Math.floor(state.totalElapsedTime) !== Math.floor((newTotalElapsedTime - 1))) {
        console.log('Timer update:', {
            startTime: new Date(state.startTime),
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

export function promptForFirstActivity(): Promise<string | null> {
    return new Promise((resolve) => {
        // Check if Bootstrap is available
        if (typeof window.bootstrap === 'undefined') {
            console.error('Bootstrap is not loaded');
            resolve(prompt('What are you working on?')); // Fallback to native prompt
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

        elements.firstActivityInput.value = '';
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
                elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
                (window as any).showWarning('Please add a task to the Work Queue or select a project and task manually before starting the timer.', 'No Task Selected');
                return;
            }
        }
        
        // Show immediate feedback to user
        elements.startBtn.disabled = true;
        elements.startBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Starting...';
        
        if (!isResuming) { // First start of a task
            // Check if we have a task from queue or manual selection
            const hasQueueTask = state.todos.length > 0;

            if (hasQueueTask) {
                // Use task from queue
                const nextTodo = state.todos[0];

                // Set the values directly since we already have the task info from the queue
                elements.projectSelect.value = nextTodo.projectId;
                elements.projectInput.value = nextTodo.projectName;
                elements.taskInput.value = `#${nextTodo.taskId} - ${nextTodo.taskSubject}`;
                
                // Ensure the task option exists in the select dropdown
                const existingOption = Array.from(elements.taskSelect.options).find(opt => opt.value === nextTodo.taskId);
                if (!existingOption) {
                    const option = document.createElement('option');
                    option.value = nextTodo.taskId;
                    option.textContent = `#${nextTodo.taskId} - ${nextTodo.taskSubject}`;
                    elements.taskSelect.appendChild(option);
                }
                elements.taskSelect.value = nextTodo.taskId;
                
                console.log('Timer starting with queue task:', {
                    projectId: nextTodo.projectId,
                    taskId: nextTodo.taskId,
                    projectSelectValue: elements.projectSelect.value,
                    taskSelectValue: elements.taskSelect.value
                });
            } else {
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
                elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
                return;
            }

            // Remove the started task from the queue if it came from the queue
            if (hasQueueTask) {
                const { setTodos } = await import('../state/index.js');
                const newTodos = [...state.todos];
                newTodos.shift(); // Remove the first item (the one we just started)
                setTodos(newTodos);
                localStorage.setItem('todos', JSON.stringify(newTodos));
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
        elements.todoList.classList.add('disabled'); // Visually disable queue while tracking
        document.title = "▶️ Tracking...";
        renderActivities();
        renderTodos(); // Update the todos display to show the updated queue
    } catch (error) {
        console.error('Error in startTimer:', error);
        // Reset button state in case of error
        elements.startBtn.disabled = false;
        elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        (window as any).showError('Failed to start timer: ' + errorMessage, 'Timer Error');
    }
}

export function pauseTimer() {
    if (!state.timerInterval) return; // Not running
    clearInterval(state.timerInterval);
    setTimerInterval(null);
    
    const now = new Date();
    const newPausedTime = state.pausedTime + now.getTime() - (state.startTime ?? now.getTime());
    setPausedTime(newPausedTime);
    setStartTime(null);

    elements.startBtn.disabled = false;
    elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Resume';
    elements.pauseBtn.disabled = true;
    document.title = "⏸️ Paused | Time Tracker";
    renderActivities();
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
        if(!lastActivity.durationSeconds) { // Only update if not already set by adding another activity
            const previousActivitiesDuration = state.activities
                .slice(0, -1)
                .reduce((sum, act) => sum + (act.durationSeconds || 0), 0);
            const newDuration = state.totalElapsedTime - previousActivitiesDuration;
            // Ensure duration is not negative due to floating point issues
            lastActivity.durationSeconds = Math.max(0, newDuration);
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
    elements.startBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start';
    elements.pauseBtn.disabled = true;
    elements.stopBtn.disabled = true;
    elements.activityInput.disabled = true;
    elements.addActivityBtn.disabled = true;
    elements.activityInput.value = '';
    elements.activityList.innerHTML = '';
    setActivities([]);
    elements.todoList.classList.remove('disabled');

    if (advanceQueue) {
        prepareNextTask();
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
