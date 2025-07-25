import { 
    allProjects, allTasks, todoFormTasks,
    setAllProjects, setAllTasks, setTodoFormTasks
} from '../state/index.js';
import { RedmineIssue } from '../types/index.js';
import { elements } from '../utils/dom.js';
import { showGlobalError } from '../utils/helpers.js';
import { redmineApiRequest } from '../services/redmine.js';
import { initAutocomplete } from '../utils/autocomplete.js';

export async function populateProjects() {
    elements.projectInput.placeholder = 'Loading projects...';
    elements.projectInput.disabled = true;
    elements.todoProjectInput.placeholder = 'Loading projects...';
    elements.todoProjectInput.disabled = true;
    elements.taskInput.disabled = true;
    elements.taskInput.value = '';
    elements.taskSelect.innerHTML = '';

    try {
        const data = await redmineApiRequest('/projects.json');
        elements.projectSelect.innerHTML = ''; 
        elements.todoProjectSelect.innerHTML = '<option value="">-- Select a project --</option>';
        
        const myIssuesOption = { id: "my_issues", name: "--- My Assigned Issues ---" };
        const projects = [myIssuesOption, ...data.projects];
        setAllProjects(projects);
        
        allProjects.forEach(proj => {
            const option = document.createElement('option');
            option.value = String(proj.id);
            option.textContent = proj.name;
            elements.projectSelect.appendChild(option.cloneNode(true));
            elements.todoProjectSelect.appendChild(option);
        });

        elements.projectInput.disabled = false;
        elements.projectInput.placeholder = 'Search projects...';
        elements.todoProjectInput.disabled = false;
        elements.todoProjectInput.placeholder = 'Search projects...';

        initAutocomplete({
            inputEl: elements.projectInput,
            listEl: elements.projectList,
            sourceData: allProjects,
            renderItem: (item) => item.name,
            filterItem: (item, query) => item.name.toLowerCase().includes(query),
            onSelect: (item) => {
                elements.projectInput.value = item.name;
                elements.projectSelect.value = String(item.id);
                elements.projectSelect.dispatchEvent(new Event('change'));
            }
        });

        initAutocomplete({
            inputEl: elements.todoProjectInput,
            listEl: elements.todoProjectList,
            sourceData: allProjects,
            renderItem: (item) => item.name,
            filterItem: (item, query) => item.name.toLowerCase().includes(query),
            onSelect: (item) => {
                elements.todoProjectInput.value = item.name;
                elements.todoProjectSelect.value = String(item.id);
                elements.todoProjectSelect.dispatchEvent(new Event('change'));
            }
        });

    } catch (error) {
        const errorMessage = 'Error loading projects';
        elements.projectInput.placeholder = errorMessage;
        elements.todoProjectInput.placeholder = errorMessage;
        showGlobalError('Failed to load projects.', error);
    }
}

export async function populateTasksForSelect(selectElement: HTMLSelectElement, projectId: string): Promise<RedmineIssue[]> {
    let endpoint = '';
    if (projectId === 'my_issues') {
        endpoint = `/issues.json?assigned_to_id=me&status_id=open&limit=100`;
    } else {
        endpoint = `/issues.json?project_id=${projectId}&status_id=open&limit=100`;
    }
    
    const data = await redmineApiRequest(endpoint);
    selectElement.innerHTML = `<option value="">-- Select a task --</option>`;
    if (data.issues.length > 0) {
        data.issues.forEach((issue: RedmineIssue) => {
            const option = document.createElement('option');
            option.value = issue.id.toString();
            option.textContent = `#${issue.id} - ${issue.subject}`;
            if (projectId === 'my_issues') {
                option.textContent = `[${issue.project.name}] ${option.textContent}`;
            }
            selectElement.appendChild(option);
        });
    }
    return data.issues;
}

export async function populateTasks() {
    const selectedProjectValue = elements.projectSelect.value;
    if (!selectedProjectValue) {
        elements.taskInput.value = '';
        elements.taskInput.disabled = true;
        elements.taskSelect.innerHTML = '';
        elements.startBtn.disabled = true;
        return;
    }

    elements.taskInput.placeholder = 'Loading tasks...';
    elements.taskInput.disabled = true;
    elements.startBtn.disabled = true;
    
    try {
        const tasks = await populateTasksForSelect(elements.taskSelect, selectedProjectValue);
        setAllTasks(tasks);
        
        if (allTasks.length === 0) {
            elements.taskInput.placeholder = 'No open tasks found';
            elements.taskInput.value = '';
            elements.taskInput.disabled = true;
            elements.taskSelect.value = '';
            elements.startBtn.disabled = true;
        } else {
            elements.taskInput.disabled = false;
            elements.taskInput.placeholder = 'Search tasks...';
            elements.taskInput.value = '';
            elements.taskSelect.value = '';
            
            initAutocomplete({
                inputEl: elements.taskInput,
                listEl: elements.taskList,
                sourceData: allTasks,
                renderItem: (item) => `#${item.id} - ${item.subject}`,
                filterItem: (item, query) => {
                    const searchString = `#${item.id} ${item.subject}`.toLowerCase();
                    return searchString.includes(query.toLowerCase());
                },
                onSelect: (item) => {
                    elements.taskInput.value = `#${item.id} - ${item.subject}`;
                    elements.taskSelect.value = String(item.id);
                    elements.taskSelect.dispatchEvent(new Event('change'));
                }
            });
        }
    } catch (error) {
        elements.taskInput.placeholder = 'Error loading tasks';
        elements.taskInput.disabled = true;
        showGlobalError(`Failed to load tasks`, error);
    }
}

export async function populateTasksForTodoForm() {
    const projectId = elements.todoProjectSelect.value;
    // Reset task fields
    elements.todoTaskInput.disabled = true;
    elements.todoTaskInput.value = '';
    elements.todoTaskSelect.value = '';
    elements.todoTaskList.innerHTML = '';

    if (projectId) {
        elements.todoTaskInput.placeholder = 'Loading tasks...';
        try {
            const tasks = await populateTasksForSelect(elements.todoTaskSelect, projectId);
            setTodoFormTasks(tasks);
            if (todoFormTasks.length > 0) {
                elements.todoTaskInput.disabled = false;
                elements.todoTaskInput.placeholder = 'Search tasks...';
                initAutocomplete({
                    inputEl: elements.todoTaskInput,
                    listEl: elements.todoTaskList,
                    sourceData: todoFormTasks,
                    renderItem: (item) => `#${item.id} - ${item.subject}`,
                    filterItem: (item, query) => {
                        const searchString = `#${item.id} ${item.subject}`.toLowerCase();
                        return searchString.includes(query.toLowerCase());
                    },
                    onSelect: (item) => {
                        elements.todoTaskInput.value = `#${item.id} - ${item.subject}`;
                        elements.todoTaskSelect.value = String(item.id);
                    }
                });
            } else {
                elements.todoTaskInput.placeholder = 'No open tasks found';
            }
        } catch (error) {
            elements.todoTaskInput.placeholder = 'Error loading tasks';
            showGlobalError(`Failed to load tasks for queue.`, error);
        }
    } else {
        elements.todoTaskInput.placeholder = 'Select a project first';
    }
}

export function checkConfiguration() {
    const isConfigured = (localStorage.getItem('redmineUrl') && localStorage.getItem('redmineApiKey')) || localStorage.getItem('isTestMode') === 'true';

    if (isConfigured) {
        elements.configPrompt.style.display = 'none';
        elements.taskSelectionForm.style.display = 'block';
        if (allProjects.length === 0) {
            populateProjects();
        }
    } else {
        elements.configPrompt.style.display = 'block';
        elements.taskSelectionForm.style.display = 'none';
        elements.startBtn.disabled = true;
    }
}
