import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Select, Input, Autocomplete, type AutocompleteItem } from '../../../components/ui';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { usePresets } from '../../../hooks/usePresets';
import { useToast } from '../../../contexts/ToastContext';
import { createTimeEntry, updateTimeEntry } from '../../../services/redmine';
import type { TimeEntry, TimeLogPreset } from '../../../types';
import { Save, Send, Trash2, Plus, ListTodo } from 'lucide-react';
import { useCustomFields } from '../../../hooks/useCustomFields';

interface TimeEntryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** If provided, we're editing an existing entry. Otherwise, creating a new one. */
  editEntry?: TimeEntry | null;
  /** Default date in YYYY-MM-DD format (used when adding a new entry for a specific day) */
  defaultDate?: string;
}

export const TimeEntryFormModal: React.FC<TimeEntryFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editEntry,
  defaultDate,
}) => {
  const { allProjects } = useProjects();
  const { showSuccess, showError } = useToast();
  const { presets, savePreset, deletePreset } = usePresets();
  const formRef = React.useRef<HTMLFormElement>(null);

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [hours, setHours] = useState('');
  const [spentOn, setSpentOn] = useState('');
  const [comments, setComments] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('');

  const { customFields } = useCustomFields();
  const billableFieldId = localStorage.getItem('billableFieldId');

  const { tasks, isLoading: isLoadingTasks } = useTasksForProject(projectId || null);
  const { activities, isLoading: isLoadingActivities } = useActivitiesForProject(projectId || null);

  const isEditing = Boolean(editEntry);

  const projectOptions = useMemo((): AutocompleteItem[] => {
    return allProjects.map(p => ({
      id: p.id.toString(),
      label: p.name,
      sublabel: `ID: ${p.id}`
    }));
  }, [allProjects]);

  const taskOptions = useMemo((): AutocompleteItem[] => {
    return tasks.map(t => ({
      id: t.id.toString(),
      label: `#${t.id} - ${t.subject}`,
      sublabel: t.project?.name
    }));
  }, [tasks]);

  const selectedProject = projectOptions.find(p => p.id === projectId);
  const selectedTask = taskOptions.find(t => t.id === taskId);

  // Populate form when modal opens or entry changes
  useEffect(() => {
    if (!isOpen) return;

    if (editEntry) {
      setProjectId(editEntry.project?.id?.toString() || '');
      setTaskId(editEntry.issue?.id?.toString() || '');
      setActivityId(editEntry.activity?.id?.toString() || '');
      setHours(editEntry.hours.toString());
      setSpentOn(editEntry.spent_on);
      setComments(editEntry.comments || '');

      // Check billable
      const bId = localStorage.getItem('billableFieldId');
      if (bId && editEntry.custom_fields) {
        const billableField = editEntry.custom_fields.find(f => f.id === parseInt(bId));
        setCustomFieldValues(prev => ({
          ...prev,
          [parseInt(bId)]: billableField ? billableField.value : '1'
        }));
      }
    } else {
      // New entry
      setProjectId('');
      setTaskId('');
      setActivityId('');
      setHours('');
      setSpentOn(defaultDate || new Date().toISOString().split('T')[0]);
      setComments('');
      setSelectedPresetId('');

      // Initialize custom field values
      const initialValues: Record<number, string> = {};
      customFields.forEach(field => {
        if (field.id === Number(billableFieldId)) {
          initialValues[field.id] = '1';
        } else {
          initialValues[field.id] = field.default_value || '';
        }
      });
      setCustomFieldValues(initialValues);
    }
  }, [isOpen, editEntry, defaultDate, customFields, billableFieldId]);

  // Update activity dropdown when project changes and activities load
  useEffect(() => {
    if (isOpen && editEntry?.activity?.id) {
      setActivityId(editEntry.activity.id.toString());
    }
  }, [activities]);

  const handleProjectChange = (item: AutocompleteItem | null) => {
    setProjectId(item?.id.toString() || '');
    setTaskId('');
    setActivityId('');
  };

  const handleTaskChange = (item: AutocompleteItem | null) => {
    setTaskId(item?.id.toString() || '');
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      if (preset.projectId) setProjectId(preset.projectId);
      if (preset.taskId) setTaskId(preset.taskId);
      if (preset.activityId) setActivityId(preset.activityId);
      if (preset.hours) setHours(preset.hours.toString());
      if (preset.comments !== undefined) setComments(preset.comments);
      if (preset.isBillable !== undefined) {
        const bId = localStorage.getItem('billableFieldId');
        if (bId) {
          setCustomFieldValues(prev => ({
            ...prev,
            [parseInt(bId)]: preset.isBillable ? '1' : '0'
          }));
        }
      }
    }
  };

  const handleSavePreset = () => {
    const name = prompt("Enter a name for this preset (e.g. 'Standard Day'):");
    if (!name?.trim()) return;

    const project = allProjects.find(p => p.id.toString() === projectId);
    const task = tasks.find(t => t.id.toString() === taskId);

    const newPreset: TimeLogPreset = {
      id: 'preset_' + Date.now(),
      name: name.trim(),
      projectId,
      projectName: project?.name || '',
      taskId,
      taskSubject: task?.subject || '',
      activityId,
      hours: parseFloat(hours) || 0,
      comments,
      isBillable: customFieldValues[Number(billableFieldId)] === '1',
    };

    savePreset(newPreset);
    setSelectedPresetId(newPreset.id);
    showSuccess(`Preset "${name.trim()}" saved.`);
  };

  const handleDeletePreset = () => {
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && confirm(`Delete preset "${preset.name}"?`)) {
      deletePreset(selectedPresetId);
      setSelectedPresetId('');
      showSuccess('Preset deleted.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskId || !activityId || !hours) return;

    setIsSubmitting(true);
    try {
      const payloadCustomFields = Object.entries(customFieldValues)
        .filter(([_, value]) => value !== '')
        .map(([id, value]) => ({
          id: parseInt(id, 10),
          value: value,
        }));

      const data = {
        hours: parseFloat(hours),
        comments: comments.trim(),
        activity_id: parseInt(activityId),
        spent_on: spentOn,
        issue_id: parseInt(taskId),
        project_id: projectId && projectId !== 'my_issues' ? parseInt(projectId) : undefined,
        ...(payloadCustomFields.length > 0 && { custom_fields: payloadCustomFields }),
      };

      if (isEditing && editEntry) {
        await updateTimeEntry(editEntry.id, data);
        showSuccess('Time entry updated!');
      } else {
        await createTimeEntry(data);
        showSuccess('Time entry created!');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      showError(err.message || 'Failed to save time entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Time Entry' : 'Log Time'}
      footer={
        <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
          <Button
            variant="ghost"
            icon={Plus}
            onClick={handleSavePreset}
            disabled={isSubmitting}
            style={{ marginRight: 'auto' }}
          >
            Save Preset
          </Button>
          <Button
            variant="primary"
            icon={isEditing ? Save : Send}
            onClick={() => (formRef.current as any)?.requestSubmit()}
            isLoading={isSubmitting}
            disabled={!taskId || !activityId || !hours || isSubmitting}
          >
            {isEditing ? 'Update' : 'Submit'}
          </Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {!isEditing && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
            <Select
              label="Load Preset"
              value={selectedPresetId}
              onChange={e => handleApplyPreset(e.target.value)}
              fullWidth
            >
              <option value="">-- Choose preset --</option>
              {presets.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button
              variant="danger"
              icon={Trash2}
              onClick={handleDeletePreset}
              disabled={!selectedPresetId}
              title="Delete selected preset"
              size="sm"
              style={{ marginBottom: '0.25rem' }}
            />
          </div>
        )}

        <hr style={{ opacity: 0.1 }} />

        <form ref={formRef} id="time-entry-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Autocomplete
            label="Project"
            placeholder="Search projects..."
            items={projectOptions}
            value={projectId}
            displayValue={selectedProject?.label || ''}
            onChange={handleProjectChange}
            fullWidth
            required
          />

          <Autocomplete
            label="Task *"
            placeholder={isLoadingTasks ? 'Loading tasks...' : 'Search tasks...'}
            items={taskOptions}
            value={taskId}
            displayValue={selectedTask?.label || ''}
            onChange={handleTaskChange}
            disabled={isLoadingTasks || !projectId}
            loading={isLoadingTasks}
            fullWidth
            required
          />

          <Select
            label={isLoadingActivities ? 'Loading...' : 'Activity'}
            value={activityId}
            onChange={e => setActivityId(e.target.value)}
            fullWidth
            disabled={isLoadingActivities || !projectId}
            required
          >
            <option value="">-- Select activity --</option>
            {activities.map(a => (
              <option key={a.id} value={a.id.toString()}>{a.name}</option>
            ))}
          </Select>

          <div style={{ display: 'flex', gap: '1rem' }}>
            <Input
              label="Hours"
              type="number"
              step="any"
              min="0"
              value={hours}
              onChange={e => setHours(e.target.value)}
              required
              fullWidth
            />
            <Input
              label="Date"
              type="date"
              value={spentOn}
              onChange={e => setSpentOn(e.target.value)}
              required
              fullWidth
            />
          </div>

          {/* Dynamic Custom Fields */}
          {customFields.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ListTodo size={14} /> Custom Fields
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                {customFields.map(field => {
                  const value = customFieldValues[field.id] || '';

                  const format = field.field_format || (field as any).format;
                  const isLikelyBool = format === 'bool' || 
                                       format === 'boolean' ||
                                       field.name.toLowerCase().includes('billable') ||
                                       field.name.toLowerCase().includes('billing');

                  if (isLikelyBool) {
                    return (
                      <label key={field.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={value === '1'}
                          onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.checked ? '1' : '0' }))}
                          style={{ width: '1rem', height: '1rem' }}
                        />
                        <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{field.name}</span>
                      </label>
                    );
                  }

                  if (field.field_format === 'list' || field.field_format === 'user' || field.field_format === 'version') {
                    return (
                      <Select
                        key={field.id}
                        label={field.name}
                        value={value}
                        onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                        fullWidth
                        required={field.is_required || field.required}
                      >
                        <option value="">-- Select {field.name} --</option>
                        {field.possible_values?.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </Select>
                    );
                  }

                  if (field.field_format === 'text') {
                    return (
                      <div key={field.id} style={{ gridColumn: '1 / -1' }}>
                        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                          {field.name}{field.is_required ? ' *' : ''}
                        </label>
                        <textarea
                          rows={3}
                          value={value}
                          onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                          required={field.is_required || field.required}
                          style={{
                            width: '100%',
                            padding: '0.625rem',
                            borderRadius: '0.5rem',
                            border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
                            background: 'var(--color-surface, rgba(255,255,255,0.05))',
                            color: 'inherit',
                            fontFamily: 'inherit',
                            fontSize: '0.875rem',
                            resize: 'vertical',
                          }}
                        />
                      </div>
                    );
                  }

                  const inputType = 
                    field.field_format === 'int' ? 'number' :
                    field.field_format === 'float' ? 'number' :
                    field.field_format === 'date' ? 'date' : 'text';

                  return (
                    <Input
                      key={field.id}
                      label={field.name}
                      type={inputType}
                      step={field.field_format === 'float' ? 'any' : undefined}
                      value={value}
                      onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                      fullWidth
                      required={field.is_required || field.required}
                      placeholder={`Enter ${field.name.toLowerCase()}...`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          <Input
            label="Comments"
            placeholder="Optional description"
            value={comments}
            onChange={e => setComments(e.target.value)}
            fullWidth
          />
        </form>
      </div>
    </Modal>
  );
};
