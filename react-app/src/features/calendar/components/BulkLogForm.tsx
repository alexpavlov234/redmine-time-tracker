import React, { useState, useMemo } from 'react';
import { Card, Input, Button, Select, Autocomplete, type AutocompleteItem } from '../../../components/ui';
import styles from './BulkLogForm.module.scss';
import { Send, CheckCircle2 } from 'lucide-react';
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
  const [isBillable, setIsBillable] = useState(true);

  const [isDeploying, setIsDeploying] = useState(false);
  const [progress, setProgress] = useState(0);

  const { tasks, isLoading: isLoadingTasks } = useTasksForProject(projectId || null);
  const { activities, isLoading: isLoadingActivities } = useActivitiesForProject(projectId || null);

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
    const billableFieldId = localStorage.getItem('billableFieldId');
    const customFields: { id: number; value: string }[] = [];
    if (billableFieldId) {
      customFields.push({
        id: parseInt(billableFieldId, 10),
        value: isBillable ? '1' : '0',
      });
    }

    for (const dateStr of days) {
      try {
        await createTimeEntry({
          hours: parseFloat(hours),
          comments,
          activity_id: parseInt(activityId),
          spent_on: dateStr,
          issue_id: parseInt(taskId),
          project_id: projectId && projectId !== 'my_issues' ? parseInt(projectId) : undefined,
          ...(customFields.length > 0 && { custom_fields: customFields }),
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
            loading={isLoadingActivities}
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
            step="0.1"
            min="0.1"
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

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={isBillable} onChange={e => setIsBillable(e.target.checked)} disabled={isDeploying} />
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Billable</span>
        </label>

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
