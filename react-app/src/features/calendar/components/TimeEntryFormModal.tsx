import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Select, Input, Autocomplete, type AutocompleteItem } from '../../../components/ui';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { usePresets } from '../../../hooks/usePresets';
import { useToast } from '../../../contexts/ToastContext';
import { createTimeEntry, updateTimeEntry } from '../../../services/redmine';
import type { TimeEntry, TimeLogPreset } from '../../../types';
import { Save, Send, Bookmark, Trash2, Plus } from 'lucide-react';

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

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [hours, setHours] = useState('');
  const [spentOn, setSpentOn] = useState('');
  const [comments, setComments] = useState('');
  const [isBillable, setIsBillable] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState('');

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
      const billableFieldId = localStorage.getItem('billableFieldId');
      if (billableFieldId && editEntry.custom_fields) {
        const billableField = editEntry.custom_fields.find(f => f.id === parseInt(billableFieldId));
        setIsBillable(billableField ? billableField.value === '1' : true);
      }
    } else {
      // New entry
      setProjectId('');
      setTaskId('');
      setActivityId('');
      setHours('');
      setSpentOn(defaultDate || new Date().toISOString().split('T')[0]);
      setComments('');
      setIsBillable(true);
      setSelectedPresetId('');
    }
  }, [isOpen, editEntry, defaultDate]);

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
      if (preset.isBillable !== undefined) setIsBillable(preset.isBillable);
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
      isBillable,
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
      const billableFieldId = localStorage.getItem('billableFieldId');
      const customFields: { id: number; value: any }[] = [];
      if (billableFieldId) {
        customFields.push({
          id: parseInt(billableFieldId),
          value: isBillable ? '1' : '0',
        });
      }

      const data = {
        hours: parseFloat(hours),
        comments: comments.trim(),
        activity_id: parseInt(activityId),
        spent_on: spentOn,
        issue_id: parseInt(taskId),
        project_id: projectId && projectId !== 'my_issues' ? parseInt(projectId) : undefined,
        ...(customFields.length > 0 && { custom_fields: customFields }),
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
            onClick={() => document.getElementById('time-entry-form')?.requestSubmit()}
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
              icon={Bookmark}
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

        <form id="time-entry-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
            loading={isLoadingActivities}
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
              step="0.25"
              min="0.1"
              max="24"
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

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={isBillable} onChange={e => setIsBillable(e.target.checked)} />
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Billable</span>
          </label>

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
