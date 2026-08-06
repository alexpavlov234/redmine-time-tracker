import React, { useState, useMemo } from 'react';
import { Card, Input, Button, Select, type SelectItem } from '../../../components/ui';
import styles from './BulkLogForm.module.scss';
import { Send, CheckCircle2, ListTodo, Trash2, Plus } from 'lucide-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { createTimeEntry, getIssue } from '../../../services/redmine';
import type { RedmineIssue, TimeLogPreset } from '../../../types';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { useToast } from '../../../contexts/ToastContext';
import { usePresets } from '../../../hooks/usePresets';

interface BulkLogFormProps {
  selectedDays: Set<string>;
  onSuccess: () => void;
  onCancel: () => void;
}

export const BulkLogForm: React.FC<BulkLogFormProps> = ({ selectedDays, onSuccess, onCancel }) => {
  const { allProjects } = useProjects();
  const { showSuccess, showError } = useToast();
  const { presets, savePreset, deletePreset } = usePresets();

  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [hours, setHours] = useState('');
  const [comments, setComments] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});

  const [isDeploying, setIsDeploying] = useState(false);
  const [progress, setProgress] = useState(0);

  const [loadedTask, setLoadedTask] = useState<RedmineIssue | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(false);

  const { tasks, isLoading: isLoadingTasks } = useTasksForProject(projectId || null);
  const { activities, isLoading: isLoadingActivities } = useActivitiesForProject(projectId || null);
  const { customFields } = useCustomFields();

  // Initialize custom fields when they load
  React.useEffect(() => {
    if (customFields.length > 0) {
      const initialValues: Record<number, string> = {};
      const billableFieldId = localStorage.getItem('billableFieldId');
      customFields.forEach(field => {
        if (field.id === Number(billableFieldId)) {
          initialValues[field.id] = '1';
        } else {
          initialValues[field.id] = field.default_value || '';
        }
      });
      setCustomFieldValues(initialValues);
    }
  }, [customFields]);

  const projectOptions = useMemo((): SelectItem[] => {
    const options: SelectItem[] = [
      { id: 'my_issues', label: '--- My Assigned Issues ---' }
    ];
    return [...options, ...allProjects.map(p => ({
      id: p.id.toString(),
      label: p.name,
      sublabel: `ID: ${p.id}`
    }))];
  }, [allProjects]);

  const taskOptions = useMemo((): SelectItem[] => {
    const options = tasks.map(t => ({
      id: t.id.toString(),
      label: `#${t.id} - ${t.subject}`,
      sublabel: t.project?.name
    }));
    if (loadedTask && !options.some(o => o.id === loadedTask.id.toString())) {
      options.push({
        id: loadedTask.id.toString(),
        label: `#${loadedTask.id} - ${loadedTask.subject}`,
        sublabel: loadedTask.project?.name
      });
    }
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && preset.taskId && preset.taskSubject && !options.some(o => o.id === preset.taskId)) {
      options.push({
        id: preset.taskId,
        label: `#${preset.taskId} - ${preset.taskSubject}`,
        sublabel: preset.projectName
      });
    }
    return options;
  }, [tasks, loadedTask, presets, selectedPresetId]);

  const selectedProject = projectOptions.find(p => p.id === projectId);
  const selectedTask = taskOptions.find(t => t.id === taskId);

  const handleProjectChange = (item: SelectItem | null) => {
    setProjectId(item?.id.toString() || '');
    if (!item) {
      setTaskId('');
    }
    setActivityId('');
  };

  const handleTaskChange = (item: SelectItem | null) => {
    const newTaskId = item?.id.toString() || '';
    setTaskId(newTaskId);
    
    if (item && !projectId) {
      const task = tasks.find(t => t.id.toString() === item.id) || (loadedTask?.id.toString() === item.id ? loadedTask : null);
      if (task?.project?.id) {
        setProjectId(task.project.id.toString());
      }
    }
  };

  const handleQuickLoad = async (id: string) => {
    if (!id) return;
    setIsLoadingIssue(true);
    try {
      const cleanId = id.replace(/^#/, '').trim();
      const issue = await getIssue(parseInt(cleanId, 10));
      setLoadedTask(issue);
      setTaskId(issue.id.toString());
      if (issue.project) {
        setProjectId(issue.project.id.toString());
      }
      showSuccess(`Loaded task #${issue.id}`);
    } catch (error: any) {
      showError(`Failed to load task #${id}. It may not exist or you lack permission.`);
    } finally {
      setIsLoadingIssue(false);
    }
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      if (preset.projectId) setProjectId(preset.projectId);
      if (preset.taskId) {
        setTaskId(preset.taskId);
      }
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

    const billableFieldId = localStorage.getItem('billableFieldId');

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
    if (!taskId || !activityId || !hours || selectedDays.size === 0) return;

    setIsDeploying(true);
    setProgress(0);

    const days = Array.from(selectedDays).sort();
    let successCount = 0;
    let failCount = 0;

    // Build custom fields
    const payloadCustomFields = Object.entries(customFieldValues)
      .filter(([_, value]) => value !== '')
      .map(([id, value]) => ({
        id: parseInt(id, 10),
        value: value,
      }));

    for (const dateStr of days) {
      try {
        await createTimeEntry({
          hours: parseFloat(hours),
          comments,
          activity_id: parseInt(activityId),
          spent_on: dateStr,
          issue_id: parseInt(taskId),
          project_id: projectId && projectId !== 'my_issues' ? parseInt(projectId) : undefined,
          ...(payloadCustomFields.length > 0 && { custom_fields: payloadCustomFields }),
        });
        successCount++;
        setProgress(Math.round((successCount + failCount) / days.length * 100));
      } catch (err) {
        failCount++;
        setProgress(Math.round((successCount + failCount) / days.length * 100));
        console.error(`Failed to log time for ${dateStr}`, err);
      }
    }

    setIsDeploying(false);

    if (failCount === 0) {
      showSuccess(`Successfully logged time for ${successCount} day${successCount > 1 ? 's' : ''}.`);
    } else {
      showError(`${successCount} succeeded, ${failCount} failed.`);
    }

    onSuccess();
  };

  return (
    <Card
      title={<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><CheckCircle2 size={20} className="text-primary" /> Bulk Log Time</div>}
      headerAction={<span className={styles.badge}>{selectedDays.size} Days Selected</span>}
      className={styles.bulkCard}
    >
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', marginBottom: '1rem' }}>
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
          disabled={!selectedPresetId || isDeploying}
          title="Delete selected preset"
          size="sm"
          style={{ marginBottom: '0.25rem' }}
        />
      </div>

      <hr style={{ opacity: 0.1, marginBottom: '1rem' }} />

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.grid}>
          <Select
            enableAutocomplete
            label="Project"
            placeholder="Search projects..."
            items={projectOptions}
            value={projectId}
            displayValue={selectedProject?.label || ''}
            onItemChange={handleProjectChange}
            disabled={isDeploying}
            fullWidth
            required
          />

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 120px', minWidth: 0 }}>
              <Input
                label="Task ID"
                placeholder="Paste ID..."
                value={taskId}
                onChange={e => {
                  setTaskId(e.target.value);
                }}
                onBlur={() => {
                  if (taskId && taskId !== loadedTask?.id?.toString()) {
                    handleQuickLoad(taskId);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (taskId) handleQuickLoad(taskId);
                  }
                }}
                disabled={isLoadingIssue || isDeploying}
                fullWidth
              />
            </div>
            <div style={{ flex: '2 1 200px', minWidth: 0 }}>
              <Select
                enableAutocomplete
                label="Task Name"
                placeholder={isLoadingTasks ? 'Loading tasks...' : 'Search tasks...'}
                items={taskOptions}
                value={taskId}
                displayValue={selectedTask?.label || (isLoadingIssue ? 'Loading...' : '')}
                onItemChange={handleTaskChange}
                disabled={isLoadingTasks || isDeploying}
                loading={isLoadingTasks || isLoadingIssue}
                fullWidth
                required
              />
            </div>
          </div>

          <Select
            label={isLoadingActivities ? 'Loading...' : 'Activity'}
            value={activityId}
            onChange={e => setActivityId(e.target.value)}
            fullWidth
            disabled={isLoadingActivities || isDeploying}
            required
          >
            <option value="">-- Select activity --</option>
            {activities.map(a => (
              <option key={a.id} value={a.id.toString()}>{a.name}</option>
            ))}
          </Select>

          <Input
            label="Hours per day"
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 8"
            value={hours}
            onChange={e => setHours(e.target.value)}
            disabled={isDeploying}
            required
            fullWidth
          />
        </div>

        <Input
          label="Comments"
          placeholder="What did you work on?"
          value={comments}
          onChange={e => setComments(e.target.value)}
          disabled={isDeploying}
          fullWidth
        />

        {/* Dynamic Custom Fields */}
        {customFields.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ListTodo size={14} /> Custom Fields
            </div>
            <div className={styles.grid}>
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
                        disabled={isDeploying}
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
                      disabled={isDeploying}
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
                        disabled={isDeploying}
                        required={field.is_required || field.required}
                        style={{
                          width: '100%',
                          padding: '0.625rem',
                          borderRadius: '0.5rem',
                          border: '1px solid var(--border-color)',
                          background: 'var(--surface-color)',
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
                    disabled={isDeploying}
                    fullWidth
                    required={field.is_required || field.required}
                    placeholder={`Enter ${field.name.toLowerCase()}...`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {isDeploying && (
          <div className={styles.progressContainer}>
            <div className={styles.progressBar} style={{ width: `${progress}%` }} />
            <span className={styles.progressText}>Logging {progress}%...</span>
          </div>
        )}

        <div className={styles.actions}>
          <div style={{ marginRight: 'auto' }}>
            <Button
              variant="ghost"
              icon={Plus}
              onClick={handleSavePreset}
              disabled={isDeploying}
              type="button"
            >
              Save Preset
            </Button>
          </div>
          <Button variant="ghost" onClick={onCancel} disabled={isDeploying} type="button">Cancel</Button>
          <Button variant="primary" icon={Send} type="submit" disabled={isDeploying || !taskId || !activityId || !hours}>
            {isDeploying ? 'Deploying...' : `Submit across ${selectedDays.size} days`}
          </Button>
        </div>
      </form>
    </Card>
  );
};
