import React, { useState, useMemo } from 'react';
import { Card, Select, TextInput, Button, Group, Stack, ActionIcon, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQueue } from '../../../contexts/QueueContext';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { getIssue } from '../../../services/redmine';
import type { RedmineIssue } from '../../../types';
import { IconCirclePlus, IconChevronDown, IconChevronUp } from '@tabler/icons-react';

export const AddTaskForm: React.FC = () => {
  const { addTodo } = useQueue();
  const { allProjects } = useProjects();
  const [isExpanded, setIsExpanded] = useState(false);

  const [loadedTask, setLoadedTask] = useState<RedmineIssue | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(false);

  const form = useForm({
    initialValues: {
      projectId: '',
      taskId: '',
      activityId: '',
      note: '',
    },
    validate: {
      projectId: (value) => (value ? null : 'Project is required'),
      taskId: (value) => (value ? null : 'Task is required'),
    },
  });

  const { tasks, isLoading: isLoadingTasks } = useTasksForProject(form.values.projectId || null);
  const { activities, isLoading: isLoadingActivities } = useActivitiesForProject(form.values.projectId || null);

  const projectOptions = useMemo(() => {
    return [
      { value: 'my_issues', label: '--- My Assigned Issues ---' },
      ...allProjects.map(p => ({
        value: p.id.toString(),
        label: p.name,
      }))
    ];
  }, [allProjects]);

  const taskOptions = useMemo(() => {
    const options = tasks.map(t => ({
      value: t.id.toString(),
      label: `#${t.id} - ${t.subject}`,
    }));
    if (loadedTask && !options.some(o => o.value === loadedTask.id.toString())) {
      options.push({
        value: loadedTask.id.toString(),
        label: `#${loadedTask.id} - ${loadedTask.subject}`,
      });
    }
    return options;
  }, [tasks, loadedTask]);

  const handleQuickLoad = async (id: string) => {
    if (!id) return;
    setIsLoadingIssue(true);
    try {
      const cleanId = id.replace(/^#/, '').trim();
      const issue = await getIssue(parseInt(cleanId, 10));
      setLoadedTask(issue);
      form.setFieldValue('taskId', issue.id.toString());
      if (issue.project) {
        form.setFieldValue('projectId', issue.project.id.toString());
      }
    } catch (error: any) {
      // ignore
    } finally {
      setIsLoadingIssue(false);
    }
  };

  const handleTaskSelect = (val: string | null) => {
    const newTaskId = val || '';
    form.setFieldValue('taskId', newTaskId);
    
    if (val && !form.values.projectId) {
      const task = tasks.find(t => t.id.toString() === val) || (loadedTask?.id.toString() === val ? loadedTask : null);
      if (task?.project?.id) {
        form.setFieldValue('projectId', task.project.id.toString());
      }
    }
  };

  const handleSubmit = (values: typeof form.values) => {
    const { projectId, taskId, activityId, note } = values;

    const project = allProjects.find(p => p.id.toString() === projectId);
    const issue = tasks.find(t => t.id.toString() === taskId) || (loadedTask?.id.toString() === taskId ? loadedTask : null);
    const activity = activities.find(a => a.id.toString() === activityId);

    addTodo({
      projectId,
      projectName: project?.name || (projectId === 'my_issues' ? 'My Issues' : `Project ${projectId}`),
      taskId,
      taskSubject: issue?.subject || `Task ${taskId}`,
      activityId: activity?.id ? Number(activity.id) : undefined,
      activityName: activity?.name,
      note,
    });

    form.reset();
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between" style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => setIsExpanded(!isExpanded)}>
          <Group gap="xs">
            <IconCirclePlus size={20} />
            <Text fw={500}>Add Task Manually</Text>
          </Group>
          <ActionIcon variant="subtle" color="gray">
            {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </ActionIcon>
        </Group>
      </Card.Section>

      {isExpanded && (
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Select
              label="Project"
              placeholder="Search projects..."
              data={projectOptions}
              searchable
              withAsterisk
              {...form.getInputProps('projectId')}
              onChange={(val) => {
                form.setFieldValue('projectId', val || '');
                if (!val) form.setFieldValue('taskId', '');
                form.setFieldValue('activityId', '');
              }}
            />

            <Group grow align="flex-start">
              <TextInput
                label="Task ID"
                placeholder="Paste ID..."
                {...form.getInputProps('taskId')}
                onBlur={() => {
                  if (form.values.taskId && form.values.taskId !== loadedTask?.id?.toString()) {
                    handleQuickLoad(form.values.taskId);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (form.values.taskId) handleQuickLoad(form.values.taskId);
                  }
                }}
                disabled={isLoadingIssue}
                style={{ flex: 1 }}
              />
              <Select
                label="Task Name"
                placeholder={isLoadingTasks ? 'Loading tasks...' : 'Search tasks...'}
                data={taskOptions}
                searchable
                withAsterisk
                disabled={isLoadingTasks}
                {...form.getInputProps('taskId')}
                onChange={handleTaskSelect}
                style={{ flex: 2 }}
              />
            </Group>

            <Select
              label="Activity"
              placeholder={isLoadingActivities ? 'Loading activities...' : '-- Select activity (optional) --'}
              data={activities.map(a => ({ value: a.id.toString(), label: a.name }))}
              disabled={isLoadingActivities || !form.values.projectId}
              {...form.getInputProps('activityId')}
            />

            <TextInput
              label="Note (optional)"
              placeholder="Add a personal note..."
              {...form.getInputProps('note')}
            />

            <Group justify="flex-end">
              <Button type="submit" disabled={!form.values.projectId || !form.values.taskId || isLoadingTasks}>
                Add to Queue
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Card>
  );
};
