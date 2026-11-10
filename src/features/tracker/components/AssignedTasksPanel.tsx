import React, { useState, useEffect } from 'react';
import { Card, Select, Group, Text, Stack, ActionIcon, Loader, Badge, Paper } from '@mantine/core';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { redmineApiRequest } from '../../../services/redmine';
import type { RedmineIssue } from '../../../types';
import { IconListCheck, IconPlayerPlay } from '@tabler/icons-react';
import { useQueue } from '../../../contexts/QueueContext';
import { TaskNoteButton } from '../../../components/common/TaskNoteButton';
import { getTaskNote } from '../../../services/taskNotes';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';

/// <summary>
/// Panel displaying open Redmine issues assigned to the current user per project.
/// </summary>
export const AssignedTasksPanel: React.FC = () => {
  const { allProjects, getProjectSelectData, ensureProjectsLoaded, isLoadingProjects } = useProjects();
  const { addTodo } = useQueue();
  const { t } = useLanguage();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<string | null>('none');
  const [tasks, setTasks] = useState<RedmineIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const projectOptions = React.useMemo(() => {
    return getProjectSelectData(false);
  }, [getProjectSelectData]);

  const handleAddToQueue = (task: RedmineIssue) => {
    const project = allProjects.find(p => p.id.toString() === selectedProjectId);
    const existingNote = getTaskNote(task.id);
    addTodo({
      projectId: selectedProjectId || '',
      projectName: project?.name || `Project ${selectedProjectId}`,
      taskId: task.id.toString(),
      taskSubject: task.subject,
      note: existingNote || '',
    });
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
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  const groupedTasks = React.useMemo(() => {
    if (groupBy === 'none' || !groupBy) {
      return { 'All Tasks': tasks };
    }

    const groups: Record<string, RedmineIssue[]> = {};
    tasks.forEach(task => {
      let groupKey = 'None';
      switch (groupBy) {
        case 'status':
          groupKey = task.status?.name || 'Unknown';
          break;
        case 'tracker':
          groupKey = task.tracker?.name || 'Unknown';
          break;
        case 'priority':
          groupKey = task.priority?.name || 'Unknown';
          break;
        case 'author':
          groupKey = task.author?.name || 'Unknown';
          break;
        case 'category':
          groupKey = task.category?.name || 'None';
          break;
        case 'fixed_version':
          groupKey = task.fixed_version?.name || 'None';
          break;
      }
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });
    return groups;
  }, [tasks, groupBy]);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group gap="xs">
          <IconListCheck size={20} />
          <Text fw={500}>{t('myAssignedTasksTitle')}</Text>
        </Group>
      </Card.Section>

      <Stack mt="md">
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

        {isLoading && (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text c="dimmed">{t('loadingTasks')}</Text>
          </Group>
        )}
        
        {!isLoading && selectedProjectId && tasks.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">{t('noAssignedTasksInProject')}</Text>
        )}
        
        {!isLoading && !selectedProjectId && (
          <Text c="dimmed" ta="center" py="xl">{t('selectProjectToViewTasks')}</Text>
        )}
        
        {!isLoading && tasks.length > 0 && (
          <Stack gap="md">
            {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
              <Paper key={groupName} withBorder p="sm" radius="md" bg="var(--mantine-color-default)">
                {groupBy !== 'none' && (
                  <Group justify="space-between" mb="xs">
                    <Text fw={600} size="sm">{groupName}</Text>
                    <Badge size="sm" variant="light">{groupTasks.length}</Badge>
                  </Group>
                )}
                
                <Stack gap="xs">
                  {groupTasks.map(task => (
                    <Group key={task.id} justify="space-between" wrap="nowrap" style={{ borderBottom: '1px solid var(--mantine-color-default-border)', paddingBottom: '0.25rem' }}>
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
                        <ActionIcon variant="subtle" color="blue" onClick={() => handleAddToQueue(task)} title={t('addToTimerQueueTooltip')} aria-label={t('addToTimerQueueTooltip')}>
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
    </Card>
  );
};
