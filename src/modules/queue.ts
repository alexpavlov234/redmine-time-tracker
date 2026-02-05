import { state, setTodos, setActiveTodoId, setActivities } from '@/src/state';
import { resetState } from './timer.js';
import { Todo } from '../types';
import { elements } from '../utils/dom.js';
import { showGlobalError } from '../utils/helpers.js';
import { getSelectedActivityId } from './activitySelector.js';
import { formatTime } from '../utils/helpers.js';
import { startTimerForTodo, pauseTimer as pauseActiveTimer } from './timer.js';

export function loadTodos() {
    const storedTodos = localStorage.getItem('todos');
    if (storedTodos) {
        try {
            const parsedTodos = JSON.parse(storedTodos);
            // Ensure we're loading an array
            if (Array.isArray(parsedTodos)) {
                // Backward-compat: ensure timer fields exist
                const normalized: Todo[] = parsedTodos.map((t: Todo) => {
                    // Rehydrate performed tasks (activities)
                    const acts = Array.isArray((t as any).activities) ? (t as any).activities : [];
                    const rehydratedActs = acts.map((a: any) => ({
                        text: a.text,
                        timestamp: new Date(a.timestamp),
                        durationSeconds: typeof a.durationSeconds === 'number' ? a.durationSeconds : undefined,
                    }));
                    return {
                        ...t,
                        elapsedMs: typeof t.elapsedMs === 'number' ? t.elapsedMs : 0,
                        startTime: typeof t.startTime === 'number' ? t.startTime : null,
                        isRunning: typeof t.isRunning === 'boolean' ? t.isRunning : false,
                        activities: rehydratedActs,
                    } as Todo;
                });
                // Do not keep running state across reloads; preserve elapsed only
                normalized.forEach(t => { t.isRunning = false; t.startTime = null; });
                setTodos(normalized);
            } else {
                setTodos([]);
                localStorage.removeItem('todos');
            }
        } catch (e) {
            console.error('Error parsing stored todos:', e);
            setTodos([]);
            localStorage.removeItem('todos');
        }
    }

    // Restore active todo id if present
    const storedActive = localStorage.getItem('activeTodoId');
    if (storedActive) {
        const id = parseInt(storedActive, 10);
        if (state.todos.some(t => t.id === id)) {
            setActiveTodoId(id);
            // Load performed tasks of the active todo into working state for display
            const active = state.todos.find(t => t.id === id);
            if (active) {
                setActivities((active.activities && Array.isArray(active.activities)) ? active.activities : []);
            }
        } else {
            setActiveTodoId(null);
        }
    }

    // First, prepare the next task to load into a Current Task section if needed
    if (!state.timerInterval && state.todos.length > 0) {
        prepareNextTask();
    }

    // Then render the todos list
    renderTodos();

    // Finally, ensure the start button is enabled if we have tasks
    if (state.todos.length > 0 && !state.timerInterval) {
        setTimeout(() => {
            if (elements.startBtn) {
                elements.startBtn.disabled = false;
            }
        }, 100);
    }
}

export function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(state.todos));
}

export function addToQueue() {
    const projectId = elements.todoProjectSelect.value;
    const taskId = elements.todoTaskSelect.value;
    const note = elements.todoNoteInput.value.trim();

    if (!projectId || !taskId) {
        (window as any).showWarning('Please select a project and a task.', 'Validation Error');
        return;
    }

    const selectedTask = state.todoFormTasks.find(t => t.id.toString() === taskId);
    if (!selectedTask) {
        showGlobalError('Could not find selected task details. Please refresh and try again.');
        return;
    }

    // For "My Issues", the project name in the selector is "--- My Assigned Issues ---",
    // but the task itself has the correct project name.
    const projectName = (projectId === 'my_issues')
        ? selectedTask.project.name
        : elements.todoProjectSelect.options[elements.todoProjectSelect.selectedIndex].text;

    // Get a selected activity
    const activityId = getSelectedActivityId(elements.todoActivitySelect);
    const activityName = activityId ? elements.todoActivitySelect.options[elements.todoActivitySelect.selectedIndex].text : undefined;

    const newTodo: Todo = {
        id: Date.now(),
        note,
        projectId: String(selectedTask.project.id), // Store actual project ID even for "My Issues"
        projectName,
        taskId,
        taskSubject: selectedTask.subject,
        activityId: activityId || undefined,
        activityName
    };

    // Create a fresh copy of the current todos and add the new one
    const updatedTodos = [...state.todos, newTodo];

    // Update state
    setTodos(updatedTodos);

    // Immediately save to localStorage
    saveTodos();

    // Update UI
    renderTodos();

    // Reset form - using setTimeout to prevent validation being triggered during reset
    setTimeout(() => {
        elements.todoProjectInput.value = '';
        elements.todoProjectSelect.value = '';
        elements.todoTaskInput.value = '';
        elements.todoTaskSelect.value = '';
        elements.todoTaskInput.disabled = true;
        elements.todoTaskInput.placeholder = 'Select a project first';
        elements.todoTaskList.innerHTML = '';
        elements.todoNoteInput.value = '';
        elements.todoActivitySelect.value = '';
        elements.todoProjectInput.focus();
    }, 0);

    // Prepare the next task if this is the first one in the queue and the timer isn't running
    if (updatedTodos.length === 1 && !state.timerInterval) {
        prepareNextTask();
    }
}

/**
 * Add a watched issue to the queue directly (for quick-add from watched issues list)
 */
export function addToQueueFromWatched(issueId: string, projectId: string, projectName: string, subject: string) {
    // Get default activity if available
    const todoActivitySelect = document.getElementById('todo-activity-select') as HTMLSelectElement | null;
    let activityId: number | undefined;
    let activityName: string | undefined;

    if (todoActivitySelect && todoActivitySelect.value) {
        activityId = parseInt(todoActivitySelect.value, 10);
        activityName = todoActivitySelect.options[todoActivitySelect.selectedIndex]?.text;
    }

    const newTodo: Todo = {
        id: Date.now(),
        note: '',
        projectId,
        projectName,
        taskId: issueId,
        taskSubject: subject,
        activityId,
        activityName,
        elapsedMs: 0,
        startTime: null,
        isRunning: false,
        activities: []
    };

    const updatedTodos = [...state.todos, newTodo];
    setTodos(updatedTodos);
    saveTodos();
    renderTodos();

    // Show success toast
    (window as any).showSuccess?.(`Added #${issueId} to queue`, 'Task Added');

    // Prepare next task if this is the first one
    if (updatedTodos.length === 1 && !state.timerInterval) {
        prepareNextTask();
    }
}

export function deleteTodo(id: number) {
    const isActive = state.activeTodoId === id;

    // Remove the item from the array and persist immediately
    const newTodos = state.todos.filter(t => t.id !== id);
    setTodos(newTodos);
    saveTodos();

    if (isActive) {
        // Clear active selection and reset timer + performed tasks; prefill the next task if any
        setActiveTodoId(null);
        resetState(true);
        return; // resetState will re-render
    }

    // Refresh the UI
    renderTodos();

    // If the deleted item was the 'next' one and the timer wasn't running, update the main tracker
    if (state.todos.length > 0 && !state.timerInterval) {
        prepareNextTask();
    }
}

export function renderTodos() {
    elements.todoList.innerHTML = '';

    // Update queue count badge
    if (elements.queueCount) {
        elements.queueCount.textContent = state.todos.length.toString();
    }

    if (state.todos.length === 0) {
        elements.todoList.innerHTML = `<li class="empty-state">Add tasks to your queue!</li>`;
        if (!state.timerInterval) {
            prepareNextTask(); // This will reset the main form to editable
        }
    } else {
        state.todos.forEach((todo) => {
            const li = document.createElement('li');
            li.dataset.id = todo.id.toString();
            li.draggable = true;

            li.innerHTML = `
                <span class="todo-drag-handle"><i class="fa-solid fa-grip-vertical"></i></span>
                <div class="todo-content">
                    <div class="todo-header">
                        <span class="todo-project">${todo.projectName}</span>
                        ${todo.activityName ? `<span class="todo-activity"><i class="fa-solid fa-tasks"></i> ${todo.activityName}</span>` : ''}
                    </div>
                    <span class="todo-task" title="#${todo.taskId} - ${todo.taskSubject}">#${todo.taskId} - ${todo.taskSubject}</span>
                    ${todo.note ? `<span class="todo-note" title="${todo.note}"><i class="fa-solid fa-sticky-note"></i> ${todo.note}</span>` : ''}
                    <div class="todo-timer" style="margin-top:4px; display:flex; align-items:center; gap:8px;">
                        <span id="todo-time-${todo.id}" class="badge bg-secondary">${formatTime(Math.floor((todo.elapsedMs || 0) / 1000))}</span>
                        <button type="button" class="icon-btn start-pause-btn" title="${todo.isRunning ? 'Pause' : 'Start'}" draggable="false">
                            ${todo.isRunning ? '<i class="fa-solid fa-pause"></i>' : '<i class="fa-solid fa-play"></i>'}
                        </button>
                    </div>
                </div>
                <div class="todo-actions">
                    <button type="button" class="delete-btn icon-btn" title="Remove from queue" draggable="false"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;

            const deleteBtn = li.querySelector('.delete-btn');
            // Strengthen interaction: block drag initiation on press so the first click always works
            deleteBtn?.addEventListener('mousedown', (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
            // On touch devices also block default to avoid drag/scroll stealing first tap
            (deleteBtn as HTMLElement)?.addEventListener('touchstart', (e: Event) => {
                e.stopPropagation();
                e.preventDefault();
            });
            deleteBtn?.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                const isActive = state.activeTodoId === todo.id;
                const message = isActive
                    ? 'Are you sure you want to delete the CURRENTLY ACTIVE task?\n\nThis will reset the main timer and clear its performed tasks.'
                    : 'Are you sure you want to delete this task from the queue?';
                if (!window.confirm(message)) {
                    return;
                }
                deleteTodo(todo.id);
            });
            // Prevent accidental drag when interacting with the delete button
            deleteBtn?.addEventListener('dragstart', (e) => e.preventDefault());

            // Start/Pause control
            const startPauseBtn = li.querySelector('.start-pause-btn');
            startPauseBtn?.addEventListener('click', async (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (state.activeTodoId === todo.id && state.timerInterval) {
                    // Pause active
                    pauseActiveTimer();
                } else {
                    // Start this todo (auto‑pauses any active)
                    await startTimerForTodo(todo.id);
                }
            });
            startPauseBtn?.addEventListener('dragstart', (e) => e.preventDefault());

            elements.todoList.appendChild(li);
        });
    }
}

export function prepareNextTask() {
    const hasConfig = localStorage.getItem('redmineUrl') && localStorage.getItem('redmineApiKey');

    // Update queue count badge
    if (elements.queueCount) {
        elements.queueCount.textContent = state.todos.length.toString();
    }

    if (state.todos.length > 0 && !state.timerInterval) {
        const nextTodo = state.todos[0];

        // Set the hidden inputs for backward compatibility
        elements.projectInput.value = nextTodo.projectName;
        elements.taskInput.value = `#${nextTodo.taskId} - ${nextTodo.taskSubject}`;

        // Update the display elements
        const projectDisplay = document.getElementById('project-display');
        const taskDisplay = document.getElementById('task-display');
        const activityDisplay = document.getElementById('activity-display');

        if (projectDisplay) projectDisplay.textContent = nextTodo.projectName;
        if (taskDisplay) taskDisplay.textContent = `#${nextTodo.taskId} - ${nextTodo.taskSubject}`;

        // Set the hidden selects' values for submission
        elements.projectSelect.value = nextTodo.projectId;
        elements.taskSelect.value = nextTodo.taskId;

        // Set activity if available
        if (nextTodo.activityId && activityDisplay) {
            elements.activitySelect.value = nextTodo.activityId.toString();
            activityDisplay.textContent = nextTodo.activityName || '';
            activityDisplay.style.display = 'inline';
        } else if (activityDisplay) {
            activityDisplay.style.display = 'none';
        }

        // Enable start button
        elements.startBtn.disabled = false;

        // UI visibility - show timer bar with task info
        elements.configPrompt.style.display = 'none';
        elements.noTaskPrompt.style.display = 'none';
        if (elements.timerBarContent) elements.timerBarContent.style.display = 'flex';

    } else if (state.todos.length === 0 && !state.timerInterval) {
        // No more tasks in the queue
        elements.projectInput.value = '';
        elements.taskInput.value = '';
        elements.projectSelect.value = '';
        elements.taskSelect.value = '';
        elements.activitySelect.value = '';

        // Clear the display elements
        const projectDisplay = document.getElementById('project-display');
        const taskDisplay = document.getElementById('task-display');
        const activityDisplay = document.getElementById('activity-display');

        if (projectDisplay) projectDisplay.textContent = '';
        if (taskDisplay) taskDisplay.textContent = '';
        if (activityDisplay) {
            activityDisplay.textContent = '';
            activityDisplay.style.display = 'none';
        }

        elements.startBtn.disabled = true;

        // UI visibility - show empty state or config prompt
        elements.configPrompt.style.display = hasConfig ? 'none' : 'block';
        elements.noTaskPrompt.style.display = hasConfig ? 'flex' : 'none';
        if (elements.timerBarContent) elements.timerBarContent.style.display = 'none';
    }
}

// Drag and Drop for To-Do Reordering
let draggedItem: HTMLElement | null = null;

export function initializeDragAndDrop() {
    elements.todoList.addEventListener('dragstart', (e) => {
        if (state.timerInterval || !(e.target instanceof HTMLElement)) return;

        draggedItem = e.target as HTMLElement;
        // Use a timeout to allow the browser to render the drag image before hiding the element
        setTimeout(() => {
            if (draggedItem) draggedItem.classList.add('dragging');
        }, 0);
    });

    elements.todoList.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
            const newOrderedIds = Array.from(elements.todoList.children)
                .map(child => Number((child as HTMLElement).dataset.id))
                .filter(id => !isNaN(id));

            if (newOrderedIds.length === state.todos.length) {
                const reorderedTodos = [...state.todos];
                reorderedTodos.sort((a, b) => newOrderedIds.indexOf(a.id) - newOrderedIds.indexOf(b.id));
                setTodos(reorderedTodos);
                saveTodos();
                // Update the main tracker to show the new top task if the timer isn't running
                if (!state.timerInterval) {
                    prepareNextTask();
                }
            }
            draggedItem = null;
        }
    });

    elements.todoList.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (state.timerInterval || !draggedItem) return;

        const target = e.target as HTMLElement;
        const container = target.closest('li');
        if (container && container !== draggedItem) {
            const rect = container.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                elements.todoList.insertBefore(draggedItem, container);
            } else {
                elements.todoList.insertBefore(draggedItem, container.nextSibling);
            }
        }
    });
}
