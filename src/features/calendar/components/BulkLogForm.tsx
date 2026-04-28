import React, { useState, useMemo } from 'react';
import { Card, Input, Button, Select, Autocomplete, type AutocompleteItem } from '../../../components/ui';
import styles from './BulkLogForm.module.scss';
import { Send, CheckCircle2, ListTodo } from 'lucide-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { createTimeEntry } from '../../../services/redmine';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { useToast } from '../../../contexts/ToastContext';

interface BulkLogFormProps {
  selectedDays: Set<string>;
  onSuccess: () => void;
  onCancel: () => void;
}

export const BulkLogForm: React.FC<BulkLogFormProps> = ({ selectedDays, onSuccess, onCancel }) => {
  const { allProjects } = useProjects();
  const { showSuccess, showError } = useToast();

  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [hours, setHours] = useState('');
  const [comments, setComments] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});

  const [isDeploying, setIsDeploying] = useState(false);
  const [progress, setProgress] = useState(0);

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

  const projectOptions = useMemo((): AutocompleteItem[] => {
    const options: AutocompleteItem[] = [
      { id: 'my_issues', label: '--- My Assigned Issues ---' }
    ];
    return [...options, ...allProjects.map(p => ({
      id: p.id.toString(),
      label: p.name,
      sublabel: `ID: ${p.id}`
    }))];
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

  const handleProjectChange = (item: AutocompleteItem | null) => {
    setProjectId(item?.id.toString() || '');
    setTaskId('');
    setActivityId('');
  };

  const handleTaskChange = (item: AutocompleteItem | null) => {
    setTaskId(item?.id.toString() || '');
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
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.grid}>
          <Autocomplete
            label="Project"
            placeholder="Search projects..."
            items={projectOptions}
            value={projectId}
            displayValue={selectedProject?.label || ''}
            onChange={handleProjectChange}
            disabled={isDeploying}
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
            disabled={isLoadingTasks || !projectId || isDeploying}
            loading={isLoadingTasks}
            fullWidth
            required
          />

          <Select
            label={isLoadingActivities ? 'Loading...' : 'Activity *'}
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
            label="Hours per day *"
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
          <Button variant="ghost" onClick={onCancel} disabled={isDeploying} type="button">Cancel</Button>
          <Button variant="primary" icon={Send} type="submit" disabled={isDeploying || !taskId || !activityId || !hours}>
            {isDeploying ? 'Deploying...' : `Submit across ${selectedDays.size} days`}
          </Button>
        </div>
      </form>
    </Card>
  );
};
