import React, { useState } from 'react';
import { Card, TextInput, Button, Group, Stack, ActionIcon, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useQueue } from '../../../contexts/QueueContext';
import { useProjects } from '../../../contexts/ProjectsContext';
import type { RedmineIssue } from '../../../types';
import { IconCirclePlus, IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';

export const AddTaskForm: React.FC = () => {
  const { addTodo } = useQueue();
  const { allProjects } = useProjects();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedTask, setSelectedTask] = useState<RedmineIssue | null>(null);

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

  const handleTaskChange = (taskId: string, task?: RedmineIssue | null) => {
    form.setFieldValue('taskId', taskId);
    if (task) {
      setSelectedTask(task);
    } else if (!taskId) {
      setSelectedTask(null);
    }
  };

  const handleSubmit = (values: typeof form.values) => {
    const { projectId, taskId, activityId, note } = values;

    const project = allProjects.find(p => p.id.toString() === projectId);

    addTodo({
      projectId,
      projectName: project?.name || (projectId === 'my_issues' ? 'My Issues' : `Project ${projectId}`),
      taskId,
      taskSubject: selectedTask?.subject || `Task ${taskId}`,
      activityId: activityId ? Number(activityId) : undefined,
      note,
    });

    form.reset();
    setSelectedTask(null);
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
            <ProjectTaskActivityFields
              projectId={form.values.projectId}
              onProjectChange={(val) => {
                form.setFieldValue('projectId', val);
                if (!val) form.setFieldValue('taskId', '');
                form.setFieldValue('activityId', '');
              }}
              taskId={form.values.taskId}
              onTaskChange={handleTaskChange}
              activityId={form.values.activityId}
              onActivityChange={(val) => form.setFieldValue('activityId', val)}
              includeMyIssues={true}
              activityRequired={false}
              projectRequired={true}
              taskRequired={true}
              layout="stacked"
            />

            <TextInput
              label="Note (optional)"
              placeholder="Add a personal note..."
              {...form.getInputProps('note')}
            />

            <Group justify="flex-end">
              <Button type="submit" disabled={!form.values.projectId || !form.values.taskId}>
                Add to Queue
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Card>
  );
};
