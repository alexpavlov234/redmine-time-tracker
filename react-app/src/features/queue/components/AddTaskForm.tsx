import React, { useState, useMemo } from 'react';
import { Card, Select, Input, Button, Autocomplete, type AutocompleteItem } from '../../../components/ui';
import { useQueue } from '../../../contexts/QueueContext';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import styles from './AddTaskForm.module.scss';
import { PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';

export const AddTaskForm: React.FC = () => {
  const { addTodo } = useQueue();
  const { allProjects } = useProjects();
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [note, setNote] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !taskId) return;

    const project = allProjects.find(p => p.id.toString() === projectId);
    const issue = tasks.find(t => t.id.toString() === taskId);
    const activity = activities.find(a => a.id.toString() === activityId);

    addTodo({
      projectId,
      projectName: project?.name || (projectId === 'my_issues' ? 'My Issues' : `Project ${projectId}`),
      taskId,
      taskSubject: issue?.subject || `Task ${taskId}`,
      activityId: activity?.id,
      activityName: activity?.name,
      note,
    });

    setProjectId('');
    setTaskId('');
    setActivityId('');
    setNote('');
  };

  return (
    <Card
      title={
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <PlusCircle size={20} className="text-primary" />
          Add Task Manually
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      }
      className={styles.addCard}
    >
      {isExpanded && (
        <form onSubmit={handleSubmit} className={styles.formContainer}>
          <div className={styles.grid}>
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
              label="Task"
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
              label={isLoadingActivities ? 'Loading activities...' : 'Activity'}
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              fullWidth
              disabled={isLoadingActivities || !projectId}
              loading={isLoadingActivities}
            >
              <option value="">-- Select activity (optional) --</option>
              {activities.map(a => (
                <option key={a.id} value={a.id.toString()}>{a.name}</option>
              ))}
            </Select>
          </div>

          <Input
            label="Note (optional)"
            placeholder="Add a personal note..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            fullWidth
          />

          <Button type="submit" variant="primary" disabled={!projectId || !taskId || isLoadingTasks}>
            Add to Queue
          </Button>
        </form>
      )}
    </Card>
  );
};

