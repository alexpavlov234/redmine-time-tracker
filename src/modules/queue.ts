import { todos, timerInterval, setTodos, todoFormTasks } from '../state/index.js';
import { Todo } from '../types/index.js';
import { elements } from '../utils/dom.js';
import { showGlobalError } from '../utils/helpers.js';
import { getSelectedActivityId } from './activitySelector.js';

export function loadTodos() {
    const storedTodos = localStorage.getItem('todos');
    if (storedTodos) {
        setTodos(JSON.parse(storedTodos));
    }
}

export function saveTodos() {
    localStorage.setItem('todos', JSON.stringify(todos));
}

export function addToQueue() {
    const projectId = elements.todoProjectSelect.value;
    const taskId = elements.todoTaskSelect.value;
    const note = elements.todoNoteInput.value.trim();

    if (!projectId || !taskId) {
        (window as any).showWarning('Please select a project and a task.', 'Validation Error');
        return;
    }
    
    const selectedTask = todoFormTasks.find(t => t.id.toString() === taskId);
    if (!selectedTask) {
        showGlobalError('Could not find selected task details. Please refresh and try again.');
        return;
    }
    
    // For "My Issues", the project name in the selector is "--- My Assigned Issues ---",
    // but the task itself has the correct project name.
    const projectName = (projectId === 'my_issues') 
        ? selectedTask.project.name
        : elements.todoProjectSelect.options[elements.todoProjectSelect.selectedIndex].text;

    // Get selected activity
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

    todos.push(newTodo);
    saveTodos();
    renderTodos();
    
    // Reset form
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

    // Prepare next task if this is the first one in the queue and timer isn't running
    if (todos.length === 1 && !timerInterval) {
        prepareNextTask();
    }
}

export function deleteTodo(id: number) {
    const isFirstItem = todos.length > 0 && todos[0].id === id;
    const wasTimerRunningForThis = timerInterval && isFirstItem;

    if (wasTimerRunningForThis) {
        (window as any).showWarning("You cannot remove the currently active task. Please stop the timer first.", 'Active Task Warning');
        return;
    }

    const newTodos = todos.filter(t => t.id !== id);
    setTodos(newTodos);
    saveTodos();
    renderTodos();
    
    // If the deleted item was the 'next' one and timer wasn't running, update the main tracker
    if (isFirstItem && !timerInterval) {
        prepareNextTask();
    }
}

export function renderTodos() {
    elements.todoList.innerHTML = '';
    if (todos.length === 0) {
        elements.todoList.innerHTML = `<li class="empty-state">Add tasks to your queue!</li>`;
        if (!timerInterval) {
            prepareNextTask(); // This will reset the main form to editable
        }
    } else {
        todos.forEach((todo) => {
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
                </div>
                <div class="todo-actions">
                    <button class="delete-btn icon-btn" title="Remove from queue"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            
            li.querySelector('.delete-btn')?.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteTodo(todo.id);
            });
    
            elements.todoList.appendChild(li);
        });
    }
}

export function prepareNextTask() {
    if (todos.length > 0 && !timerInterval) {
        const nextTodo = todos[0];
        elements.projectInput.value = nextTodo.projectName;
        elements.taskInput.value = `#${nextTodo.taskId} - ${nextTodo.taskSubject}`;

        // Set the hidden selects' values for submission
        elements.projectSelect.value = nextTodo.projectId;
        elements.taskSelect.value = nextTodo.taskId;
        
        // Set activity if available
        if (nextTodo.activityId) {
            elements.activitySelect.value = nextTodo.activityId.toString();
        }

        // Disable main selectors and enable start
        elements.projectInput.disabled = true;
        elements.taskInput.disabled = true;
        elements.startBtn.disabled = false;
        
        elements.configPrompt.style.display = 'none';
        elements.taskSelectionForm.style.display = 'block';
    } else if (todos.length === 0 && !timerInterval) {
        // No more tasks in queue, reset the form to be editable
        elements.projectInput.value = '';
        elements.taskInput.value = '';
        elements.projectSelect.value = '';
        elements.taskSelect.value = '';
        elements.activitySelect.value = '';

        elements.projectInput.disabled = false;
        elements.taskInput.disabled = true;
        elements.taskInput.placeholder = 'Select a project first';
        elements.startBtn.disabled = true;
    }
}

// Drag and Drop for To-Do Reordering
let draggedItem: HTMLElement | null = null;

export function initializeDragAndDrop() {
    elements.todoList.addEventListener('dragstart', (e) => {
        if (timerInterval || !(e.target instanceof HTMLElement)) return;
        
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

            if (newOrderedIds.length === todos.length) {
                const reorderedTodos = [...todos];
                reorderedTodos.sort((a, b) => newOrderedIds.indexOf(a.id) - newOrderedIds.indexOf(b.id));
                setTodos(reorderedTodos);
                saveTodos();
                // Update the main tracker to show the new top task if timer isn't running
                if (!timerInterval) {
                    prepareNextTask();
                }
            }
            draggedItem = null;
        }
    });

    elements.todoList.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (timerInterval || !draggedItem) return;

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
