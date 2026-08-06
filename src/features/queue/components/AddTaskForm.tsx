import React, { useState, useMemo } from 'react';
import { Card, Select, Input, Button, type SelectItem } from '../../../components/ui';
import { useQueue } from '../../../contexts/QueueContext';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { getIssue } from '../../../services/redmine';
import type { RedmineIssue } from '../../../types';
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

  const [loadedTask, setLoadedTask] = useState<RedmineIssue | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(false);

  const { tasks, isLoading: isLoadingTasks } = useTasksForProject(projectId || null);
  const { activities, isLoading: isLoadingActivities } = useActivitiesForProject(projectId || null);

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
    return options;
  }, [tasks, loadedTask]);

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
    } catch (error: any) {
      // ignore
    } finally {
      setIsLoadingIssue(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId || !taskId) return;

    const project = allProjects.find(p => p.id.toString() === projectId);
    const issue = tasks.find(t => t.id.toString() === taskId) || (loadedTask?.id.toString() === taskId ? loadedTask : null);
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
            <Select
              enableAutocomplete
              label="Project"
              placeholder="Search projects..."
              items={projectOptions}
              value={projectId}
              displayValue={selectedProject?.label || ''}
              onItemChange={handleProjectChange}
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
                disabled={isLoadingIssue}
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
                disabled={isLoadingTasks}
                loading={isLoadingTasks || isLoadingIssue}
                fullWidth
                required
              />
            </div>
          </div>

            <Select
              label={isLoadingActivities ? 'Loading activities...' : 'Activity'}
              value={activityId}
              onChange={(e) => setActivityId(e.target.value)}
              fullWidth
              disabled={isLoadingActivities || !projectId}
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

