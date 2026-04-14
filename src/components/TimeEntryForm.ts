import { state } from '../state/index.js';
import { RedmineIssue } from '../types/index.js';
import { loadProjectActivities, getAvailableActivities } from '../modules/activitySelector.js';
import { redmineApiRequest } from '../services/redmine.js';
import { initAutocomplete } from '../utils/autocomplete.js';

import { loadPresets, savePreset, deletePreset } from '../modules/presets.js';

export interface TimeEntryFormConfig {
    mode: 'single' | 'bulk';
    container: HTMLElement;
    prefix: string; // e.g. "single-entry", "bulk-entry" to ensure unique IDs
    initialValues?: Partial<{
        projectId: number | string;
        taskId: number | string;
        activityId: number | string;
        hours: number;
        spentOn: string;
        comments: string;
        isBillable: boolean;
    }>;
    onSubmit: (values: any) => Promise<void> | void;
    onCancel?: () => void;
    submitText?: string;
    showCancel?: boolean;
}

export function createTimeEntryForm(config: TimeEntryFormConfig) {
    const { mode, container, prefix, initialValues, onSubmit, onCancel, submitText, showCancel } = config;

    // Build unique IDs
    const idProjectInput = `${prefix}-project-input`;
    const idProjectList = `${prefix}-project-list`;
    const idProjectId = `${prefix}-project-id`;
    
    const idTaskSearch = `${prefix}-task-search`;
    const idTaskList = `${prefix}-task-list`;
    const idTaskId = `${prefix}-task-id`;
    
    const idActivity = `${prefix}-activity`;
    const idHours = `${prefix}-hours`;
    const idSpentOn = `${prefix}-spent-on`;
    const idBillable = `${prefix}-billable`;
    const idComments = `${prefix}-comments`;
    const idPresetSelect = `${prefix}-preset-select`;
    const idSavePresetBtn = `${prefix}-save-preset`;
    const idDeletePresetBtn = `${prefix}-delete-preset`;

    const activities = getAvailableActivities();
    
    let isBillable = initialValues?.isBillable ?? true;
    let commentsValue = initialValues?.comments ?? '';
    let hoursValue = initialValues?.hours ?? '';
    let dateValue = initialValues?.spentOn ?? '';
    
    // Internal state for current tasks
    let currentTasks: RedmineIssue[] = [];
    
    const html = `
        <form class="time-entry-form">
            <!-- Preset controls -->
            <div class="row mb-3 align-items-end">
                <div class="col-8">
                    <label for="${idPresetSelect}" class="form-label form-label-sm fw-medium text-primary"><i class="fa-solid fa-bookmark me-1"></i>Load Preset</label>
                    <div class="input-group input-group-sm">
                        <select class="form-select" id="${idPresetSelect}">
                            <option value="">-- Choose preset --</option>
                        </select>
                        <button type="button" class="btn btn-outline-danger" id="${idDeletePresetBtn}" title="Delete selected preset" disabled>
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="col-4 text-end">
                    <button type="button" class="btn btn-sm btn-outline-primary" id="${idSavePresetBtn}" title="Save current values as a preset">
                        <i class="fa-solid fa-plus me-1"></i>Save Preset
                    </button>
                </div>
            </div>
            
            <hr class="my-3 text-secondary" style="opacity: 0.1;" />

            <!-- Project Selection (Autocomplete) -->
            <div class="mb-3 position-relative">
                <label for="${idProjectInput}" class="form-label fw-medium">Project</label>
                <div class="autocomplete-container">
                    <input type="text" class="form-control form-control-sm" id="${idProjectInput}" placeholder="Type to search projects..." autocomplete="off" required>
                    <div id="${idProjectList}" class="autocomplete-items"></div>
                </div>
                <input type="hidden" id="${idProjectId}">
            </div>

            <!-- Task Selection (Autocomplete) -->
            <div class="mb-3 position-relative">
                <label for="${idTaskSearch}" class="form-label fw-medium">Task (Issue)</label>
                <div class="autocomplete-container">
                    <input type="text" class="form-control form-control-sm" id="${idTaskSearch}" placeholder="Select a project first..." autocomplete="off" required disabled>
                    <div id="${idTaskList}" class="autocomplete-items"></div>
                </div>
                <input type="hidden" id="${idTaskId}">
            </div>

            <div class="mb-3">
                <label for="${idActivity}" class="form-label fw-medium">Activity</label>
                <select class="form-select form-select-sm" id="${idActivity}" required>
                    <option value="">-- Select Activity --</option>
                    ${activities.map((a: any) => `<option value="${a.id}">${a.name}</option>`).join('')}
                </select>
            </div>

            <div class="row">
                <div class="col-md-${mode === 'single' ? '6' : '12'} mb-3">
                    <label for="${idHours}" class="form-label fw-medium">Hours</label>
                    <input type="number" class="form-control form-control-sm" id="${idHours}" value="${hoursValue}" step="0.25" min="0.25" max="24" required>
                </div>
                ${mode === 'single' ? `
                <div class="col-md-6 mb-3">
                    <label for="${idSpentOn}" class="form-label fw-medium">Date</label>
                    <input type="date" class="form-control form-control-sm" id="${idSpentOn}" value="${dateValue}" required>
                </div>
                ` : ''}
                <div class="col-12 mb-3">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="${idBillable}" ${isBillable ? 'checked' : ''}>
                        <label class="form-check-label fw-medium" for="${idBillable}">
                            Billable
                        </label>
                    </div>
                </div>
            </div>

            <div class="mb-3">
                <label for="${idComments}" class="form-label fw-medium">Description</label>
                <textarea class="form-control form-control-sm" id="${idComments}" rows="${mode === 'single' ? '2' : '1'}" placeholder="Optional comment">${commentsValue}</textarea>
            </div>
            
            <div class="d-flex gap-2 justify-content-${mode === 'single' ? 'end' : 'stretch'} mt-4">
                ${showCancel ? `<button type="button" class="btn btn-secondary ${mode === 'bulk' ? 'w-100' : ''}" id="${prefix}-cancel-btn">Cancel</button>` : ''}
                <button type="submit" class="btn btn-primary ${mode === 'bulk' ? 'w-100' : ''}" id="${prefix}-submit-btn">
                    <i class="fa-solid fa-paper-plane me-1"></i>${submitText || 'Save'}
                </button>
            </div>
        </form>
    `;

    container.innerHTML = html;

    // Elements
    const projectInput = document.getElementById(idProjectInput) as HTMLInputElement;
    const projectList = document.getElementById(idProjectList) as HTMLDivElement;
    const projectIdHidden = document.getElementById(idProjectId) as HTMLInputElement;
    
    const taskSearch = document.getElementById(idTaskSearch) as HTMLInputElement;
    const taskList = document.getElementById(idTaskList) as HTMLDivElement;
    const taskIdHidden = document.getElementById(idTaskId) as HTMLInputElement;
    
    const activitySelect = document.getElementById(idActivity) as HTMLSelectElement;
    const hoursInput = document.getElementById(idHours) as HTMLInputElement;
    const spentOnInput = mode === 'single' ? document.getElementById(idSpentOn) as HTMLInputElement : null;
    const billableCheckbox = document.getElementById(idBillable) as HTMLInputElement;
    const commentsInput = document.getElementById(idComments) as HTMLTextAreaElement;
    
    const form = container.querySelector('form') as HTMLFormElement;
    const cancelBtn = document.getElementById(`${prefix}-cancel-btn`);
    
    const presetSelect = document.getElementById(idPresetSelect) as HTMLSelectElement;
    const savePresetBtn = document.getElementById(idSavePresetBtn) as HTMLButtonElement;
    const deletePresetBtn = document.getElementById(idDeletePresetBtn) as HTMLButtonElement;

    // Tasks fetching
    const fetchTasksForProject = async (pid: number | string) => {
        taskSearch.disabled = true;
        taskSearch.placeholder = 'Loading tasks...';
        currentTasks = [];
        
        try {
            let endpoint = '';
            if (pid === 'my_issues') {
                endpoint = `/issues.json?assigned_to_id=me&status_id=open&limit=100`;
            } else {
                endpoint = `/issues.json?project_id=${pid}&status_id=open&limit=100`;
            }
            const data = await redmineApiRequest(endpoint);
            currentTasks = data.issues || [];
            taskSearch.disabled = false;
            taskSearch.placeholder = 'Type to search tasks...';
        } catch (error) {
            console.error('Failed to load tasks', error);
            taskSearch.placeholder = 'Error loading tasks';
        }
    };

    // Pre-population logic
    const applyInitialValues = async () => {
        if (initialValues?.projectId) {
            projectIdHidden.value = initialValues.projectId.toString();
            const proj = state.allProjects.find(p => p.id.toString() === initialValues.projectId?.toString());
            if (proj) {
                projectInput.value = proj.name;
                await fetchTasksForProject(initialValues.projectId);
                
                if (initialValues.taskId) {
                    taskIdHidden.value = initialValues.taskId.toString();
                    const issue = currentTasks.find(t => t.id.toString() === initialValues.taskId?.toString());
                    if (issue) {
                        taskSearch.value = `#${issue.id} - ${issue.subject || ''}`;
                    } else {
                        taskSearch.value = `#${initialValues.taskId}`;
                    }
                }
                
                await loadProjectActivities(initialValues.projectId, activitySelect);
                if (initialValues.activityId) {
                    activitySelect.value = initialValues.activityId.toString();
                }
            }
        } else if (initialValues?.activityId) {
            activitySelect.value = initialValues.activityId.toString();
        }
    };
    
    // Autocomplete setup
    initAutocomplete({
        inputEl: projectInput,
        listEl: projectList,
        sourceData: state.allProjects,
        renderItem: (item: any) => item.name,
        filterItem: (item: any, query: string) => item.name.toLowerCase().includes(query),
        onSelect: async (item: any) => {
            projectInput.value = item.name;
            projectIdHidden.value = item.id.toString();

            // Reset Task
            taskSearch.value = '';
            taskIdHidden.value = '';
            
            await fetchTasksForProject(item.id);
            await loadProjectActivities(item.id, activitySelect);
            
            // Re-apply preset task if it was waiting
            if (pendingPresetTaskSelection && pendingPresetTaskSelection.projectId === item.id.toString()) {
                const issue = currentTasks.find(t => t.id.toString() === pendingPresetTaskSelection!.taskId);
                if (issue) {
                    taskIdHidden.value = issue.id.toString();
                    taskSearch.value = `#${issue.id} - ${issue.subject || ''}`;
                }
                pendingPresetTaskSelection = null;
            }
        }
    });

    initAutocomplete({
        inputEl: taskSearch,
        listEl: taskList,
        sourceData: () => currentTasks,
        renderItem: (item: RedmineIssue) => `#${item.id} - ${item.subject}`,
        filterItem: (item: RedmineIssue, query: string) => {
            const searchString = `#${item.id} ${item.subject}`.toLowerCase();
            return searchString.includes(query.toLowerCase());
        },
        onSelect: (item: RedmineIssue) => {
            taskSearch.value = `#${item.id} - ${item.subject}`;
            taskIdHidden.value = item.id.toString();
        }
    });

    // Form Submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = document.getElementById(`${prefix}-submit-btn`) as HTMLButtonElement;
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i>Saving...';
        
        try {
            await onSubmit({
                projectId: projectIdHidden.value,
                taskId: taskIdHidden.value,
                activityId: activitySelect.value,
                hours: parseFloat(hoursInput.value),
                spentOn: spentOnInput?.value,
                comments: commentsInput.value.trim(),
                isBillable: billableCheckbox.checked
            });
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    });

    if (cancelBtn && onCancel) {
        cancelBtn.addEventListener('click', onCancel);
    }
    
    // --- Preset Features ---
    loadPresets(); // ensure state is hydrated
    
    const renderPresets = () => {
        // preserve current selection if possible
        const selectValue = presetSelect.value;
        presetSelect.innerHTML = '<option value="">-- Choose preset --</option>' +
            state.presets.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
            
        if (state.presets.some(p => p.id === selectValue)) {
            presetSelect.value = selectValue;
            deletePresetBtn.disabled = false;
        } else {
            deletePresetBtn.disabled = true;
        }
    };
    
    let pendingPresetTaskSelection: { projectId: string, taskId: string } | null = null;
    
    presetSelect.addEventListener('change', () => {
        const selectedId = presetSelect.value;
        const preset = state.presets.find(p => p.id === selectedId);
        deletePresetBtn.disabled = !preset;
        
        if (preset) {
            // Apply preset
            // 1. Project
            if (preset.projectId) {
                // If project changed, we must trigger autocomplete fetch manually
                if (projectIdHidden.value !== preset.projectId) {
                     pendingPresetTaskSelection = { projectId: preset.projectId, taskId: preset.taskId };
                     
                     const proj = state.allProjects.find(p => p.id.toString() === preset.projectId);
                     projectInput.value = proj ? proj.name : preset.projectName || preset.projectId;
                     projectIdHidden.value = preset.projectId;
                     
                     // Reset task while loading
                     taskSearch.value = 'Loading preset task...';
                     taskIdHidden.value = '';
                     
                     fetchTasksForProject(preset.projectId).then(() => {
                         loadProjectActivities(preset.projectId, activitySelect).then(() => {
                              if (preset.activityId) activitySelect.value = preset.activityId;
                         });
                         
                         if (pendingPresetTaskSelection) {
                             const issue = currentTasks.find(t => t.id.toString() === pendingPresetTaskSelection!.taskId);
                             if (issue) {
                                  taskSearch.value = `#${issue.id} - ${issue.subject}`;
                                  taskIdHidden.value = issue.id.toString();
                             } else {
                                  taskSearch.value = `#${preset.taskId} - ${preset.taskSubject}`;
                                  taskIdHidden.value = preset.taskId;
                             }
                             pendingPresetTaskSelection = null;
                         }
                     });
                 } else {
                     // Same project, just update task directly if exists
                     if (preset.taskId) {
                         const issue = currentTasks.find(t => t.id.toString() === preset.taskId);
                         taskIdHidden.value = preset.taskId;
                         taskSearch.value = issue ? `#${issue.id} - ${issue.subject}` : `#${preset.taskId} - ${preset.taskSubject}`;
                     } else {
                         taskIdHidden.value = '';
                         taskSearch.value = '';
                     }
                      
                     if (preset.activityId) activitySelect.value = preset.activityId;
                 }
            } else {
                projectIdHidden.value = '';
                projectInput.value = '';
                taskIdHidden.value = '';
                taskSearch.value = '';
                if (preset.activityId) activitySelect.value = preset.activityId;
            }
            
            if (preset.hours) hoursInput.value = preset.hours.toString();
            if (preset.comments !== undefined) commentsInput.value = preset.comments;
            billableCheckbox.checked = preset.isBillable;
        }
    });
    
    savePresetBtn.addEventListener('click', () => {
        const name = prompt("Enter a name for this preset (e.g. 'Client Meeting'):");
        if (!name || name.trim() === '') return;
        
        savePreset({
            id: 'preset_' + Date.now(),
            name: name.trim(),
            projectId: projectIdHidden.value,
            projectName: projectInput.value,
            taskId: taskIdHidden.value,
            taskSubject: taskSearch.value.replace(/^#\d+\s*-\s*/, ''),
            activityId: activitySelect.value,
            hours: parseFloat(hoursInput.value) || 0,
            comments: commentsInput.value,
            isBillable: billableCheckbox.checked
        });
        
        alert(`Preset "${name.trim()}" saved!`);
    });
    
    deletePresetBtn.addEventListener('click', () => {
        const selectedId = presetSelect.value;
        if (!selectedId) return;
        const preset = state.presets.find(p => p.id === selectedId);
        if (preset && confirm(`Delete preset "${preset.name}"?`)) {
            deletePreset(selectedId);
            presetSelect.value = '';
            deletePresetBtn.disabled = true;
        }
    });

    const updatePresetsCallback = () => renderPresets();
    window.addEventListener('presetsUpdated', updatePresetsCallback);
    
    // Initial Render
    renderPresets();
    applyInitialValues();
    
    // Return cleanup fn
    return () => {
        window.removeEventListener('presetsUpdated', updatePresetsCallback);
    };
}
