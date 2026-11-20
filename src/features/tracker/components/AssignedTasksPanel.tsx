import React, { useState, useEffect, useMemo } from 'react';
import {
  Card,
  Select,
  Group,
  Text,
  Stack,
  ActionIcon,
  Loader,
  Badge,
  Paper,
  SegmentedControl,
  TextInput,
  Button,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { redmineApiRequest } from '../../../services/redmine';
import type { RedmineIssue } from '../../../types';
import { IconListCheck, IconPlayerPlay, IconSearch, IconX } from '@tabler/icons-react';
import { useQueue } from '../../../contexts/QueueContext';
import { TaskNoteButton } from '../../../components/common/TaskNoteButton';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';
import { getTaskNote, setTaskNote } from '../../../services/taskNotes';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';

/// <summary>
/// Unified tasks panel combining assigned Redmine issues per project (with search & grouping)
/// and manual task addition by ID / project into the work queue.
/// </summary>
export const AssignedTasksPanel: React.FC = () => {
  const { allProjects, getProjectSelectData, ensureProjectsLoaded, isLoadingProjects } = useProjects();
  const { addTodo } = useQueue();
  const { t } = useLanguage();

  const [mode, setMode] = useState<'assigned' | 'manual'>('assigned');

  // Assigned tasks state
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<string | null>('none');
  const [searchFilter, setSearchFilter] = useState('');
  const [tasks, setTasks] = useState<RedmineIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Manual add state
  const [selectedManualTask, setSelectedManualTask] = useState<RedmineIssue | null>(null);
  const manualForm = useForm({
    initialValues: {
      projectId: '',
      taskId: '',
      activityId: '',
      note: '',
    },
    validate: {
      projectId: (value) => (value ? null : t('validationProjectRequired')),
      taskId: (value) => (value ? null : t('validationTaskRequired')),
    },
  });

  const projectOptions = useMemo(() => {
    return getProjectSelectData(false);
  }, [getProjectSelectData]);

  const handleAddAssignedToQueue = (task: RedmineIssue) => {
    const project = allProjects.find((p) => p.id.toString() === selectedProjectId);
    const existingNote = getTaskNote(task.id);
    addTodo({
      projectId: selectedProjectId || '',
      projectName: project?.name || `Project ${selectedProjectId}`,
      taskId: task.id.toString(),
      taskSubject: task.subject,
      note: existingNote || '',
    });
  };

  const handleManualTaskChange = (taskId: string, task?: RedmineIssue | null) => {
    manualForm.setFieldValue('taskId', taskId);
    if (task) {
      setSelectedManualTask(task);
    } else if (!taskId) {
      setSelectedManualTask(null);
    }
    if (taskId && !manualForm.values.note) {
      const existing = getTaskNote(taskId);
      if (existing) {
        manualForm.setFieldValue('note', existing);
      }
    }
  };

  const handleManualSubmit = (values: typeof manualForm.values) => {
    const { projectId, taskId, activityId, note } = values;

    if (note && taskId) {
      setTaskNote(taskId, note);
    }

    const project = allProjects.find((p) => p.id.toString() === projectId);

    addTodo({
      projectId,
      projectName: project?.name || (projectId === 'my_issues' ? t('myIssuesFallback') : `#${projectId}`),
      taskId,
      taskSubject: selectedManualTask?.subject || `#${taskId}`,
      activityId: activityId ? Number(activityId) : undefined,
      note,
    });

    manualForm.reset();
    setSelectedManualTask(null);
  };

  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([]);
      return;
    }

    let cancelled = false;

    const fetchTasks = async () => {
      setIsLoading(true);
      try {
        const endpoint = `/issues.json?project_id=${selectedProjectId}&assigned_to_id=me&status_id=open&limit=100`;
        const data = await redmineApiRequest(endpoint);
        if (!cancelled) {
          setTasks(data.issues || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load my tasks for project:', err);
          setTasks([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchTasks();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const filteredTasks = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (task) =>
        task.subject.toLowerCase().includes(q) ||
        String(task.id).includes(q) ||
        `#${task.id}`.includes(q)
    );
  }, [tasks, searchFilter]);

  const groupedTasks = useMemo(() => {
    if (groupBy === 'none' || !groupBy) {
      return { [t('allTasksFallback')]: filteredTasks };
    }

    const groups: Record<string, RedmineIssue[]> = {};
    filteredTasks.forEach((task) => {
      let groupKey = t('noneFallback');
      switch (groupBy) {
        case 'status':
          groupKey = task.status?.name || t('unknownFallback');
          break;
        case 'tracker':
          groupKey = task.tracker?.name || t('unknownFallback');
          break;
        case 'priority':
          groupKey = task.priority?.name || t('unknownFallback');
          break;
        case 'author':
          groupKey = task.author?.name || t('unknownFallback');
          break;
        case 'category':
          groupKey = task.category?.name || t('noneFallback');
          break;
        case 'fixed_version':
          groupKey = task.fixed_version?.name || t('noneFallback');
          break;
      }
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });
    return groups;
  }, [filteredTasks, groupBy, t]);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between" align="center" wrap="wrap" gap="xs">
          <Group gap="xs">
            <IconListCheck size={20} />
            <Text fw={600}>{t('myAssignedTasksTitle')}</Text>
          </Group>

          <SegmentedControl
            size="xs"
            radius="md"
            value={mode}
            onChange={(val) => setMode(val as 'assigned' | 'manual')}
            data={[
              { label: t('tasksTabAssigned'), value: 'assigned' },
              { label: t('tasksTabManual'), value: 'manual' },
            ]}
          />
        </Group>
      </Card.Section>

      {mode === 'assigned' ? (
        <Stack mt="md" gap="sm">
          <Group grow align="flex-end">
            <Select
              label={t('projectLabel')}
              placeholder={isLoadingProjects ? t('loadingProjects') : t('selectProjectPlaceholder')}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
              onDropdownOpen={ensureProjectsLoaded}
              onClick={ensureProjectsLoaded}
              data={projectOptions}
              searchable
              nothingFoundMessage={isLoadingProjects ? t('loadingProjects') : t('noProjectsFound')}
              rightSection={isLoadingProjects ? <Loader size="xs" /> : undefined}
            />
            <Select
              label={t('groupByLabel')}
              value={groupBy}
              onChange={setGroupBy}
              disabled={!selectedProjectId || isLoading}
              data={[
                { value: 'none', label: t('groupByNone') },
                { value: 'status', label: t('groupByStatus') },
                { value: 'tracker', label: t('groupByTracker') },
                { value: 'priority', label: t('groupByPriority') },
                { value: 'author', label: t('groupByAuthor') },
                { value: 'category', label: t('groupByCategory') },
                { value: 'fixed_version', label: t('groupByTargetVersion') },
              ]}
            />
          </Group>

          {selectedProjectId && tasks.length > 0 && (
            <TextInput
              size="xs"
              placeholder={t('filterAssignedPlaceholder')}
              leftSection={<IconSearch size={14} />}
              rightSection={
                searchFilter ? (
                  <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearchFilter('')}>
                    <IconX size={12} />
                  </ActionIcon>
                ) : null
              }
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.currentTarget.value)}
            />
          )}

          {isLoading && (
            <Group justify="center" py="xl">
              <Loader size="sm" />
              <Text c="dimmed">{t('loadingTasks')}</Text>
            </Group>
          )}

          {!isLoading && selectedProjectId && tasks.length === 0 && (
            <Text c="dimmed" ta="center" py="xl">
              {t('noAssignedTasksInProject')}
            </Text>
          )}

          {!isLoading && !selectedProjectId && (
            <Text c="dimmed" ta="center" py="xl">
              {t('selectProjectToViewTasks')}
            </Text>
          )}

          {!isLoading && selectedProjectId && tasks.length > 0 && filteredTasks.length === 0 && (
            <Text c="dimmed" ta="center" py="md" size="sm">
              {t('noItemsFound')}
            </Text>
          )}

          {!isLoading && filteredTasks.length > 0 && (
            <Stack gap="md">
              {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
                <Paper key={groupName} withBorder p="sm" radius="md" bg="var(--mantine-color-default)">
                  {groupBy !== 'none' && (
                    <Group justify="space-between" mb="xs">
                      <Text fw={600} size="sm">
                        {groupName}
                      </Text>
                      <Badge size="sm" variant="light">
                        {groupTasks.length}
                      </Badge>
                    </Group>
                  )}

                  <Stack gap="xs">
                    {groupTasks.map((task) => (
                      <Group
                        key={task.id}
                        justify="space-between"
                        wrap="nowrap"
                        style={{
                          borderBottom: '1px solid var(--mantine-color-default-border)',
                          paddingBottom: '0.25rem',
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <RedmineIssueLink
                            issueId={task.id}
                            subject={task.subject}
                            size="sm"
                            fw={500}
                          />
                        </div>

                        <Group gap={4} wrap="nowrap">
                          <TaskNoteButton taskId={task.id} taskSubject={task.subject} size="sm" />
                          <ActionIcon
                            variant="subtle"
                            color="blue"
                            onClick={() => handleAddAssignedToQueue(task)}
                            title={t('addToTimerQueueTooltip')}
                            aria-label={t('addToTimerQueueTooltip')}
                          >
                            <IconPlayerPlay size={16} />
                          </ActionIcon>
                        </Group>
                      </Group>
                    ))}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      ) : (
        <form onSubmit={manualForm.onSubmit(handleManualSubmit)}>
          <Stack gap="md" mt="md">
            <ProjectTaskActivityFields
              projectId={manualForm.values.projectId}
              onProjectChange={(val) => {
                manualForm.setFieldValue('projectId', val);
                if (!val) manualForm.setFieldValue('taskId', '');
                manualForm.setFieldValue('activityId', '');
              }}
              taskId={manualForm.values.taskId}
              onTaskChange={handleManualTaskChange}
              activityId={manualForm.values.activityId}
              onActivityChange={(val) => manualForm.setFieldValue('activityId', val)}
              includeMyIssues={true}
              activityRequired={false}
              projectRequired={true}
              taskRequired={true}
              layout="stacked"
            />

            <TextInput
              label={t('noteOptionalLabel')}
              placeholder={t('noteOptionalPlaceholder')}
              {...manualForm.getInputProps('note')}
            />

            <Group justify="flex-end">
              <Button type="submit" disabled={!manualForm.values.projectId || !manualForm.values.taskId}>
                {t('addToQueueBtn')}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Card>
  );
};
