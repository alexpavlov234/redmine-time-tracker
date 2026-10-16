import React, { useState, useEffect } from 'react';
import { Card, Select, Group, Text, Stack, ActionIcon, Loader, Badge, Paper } from '@mantine/core';
import { useProjects } from '../../../contexts/ProjectsContext';
import { redmineApiRequest } from '../../../services/redmine';
import type { RedmineIssue } from '../../../types';
import { IconListCheck, IconPlayerPlay } from '@tabler/icons-react';
import { useQueue } from '../../../contexts/QueueContext';
import { TaskNoteButton } from '../../../components/common/TaskNoteButton';
import { getTaskNote } from '../../../services/taskNotes';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';

export const AssignedTasksPanel: React.FC = () => {
  const { allProjects, getProjectSelectData, ensureProjectsLoaded, isLoadingProjects } = useProjects();
  const { addTodo } = useQueue();
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
          <Text fw={500}>My Assigned Tasks</Text>
        </Group>
      </Card.Section>

      <Stack mt="md">
        <Group grow align="flex-end">
          <Select
            label="Project"
            placeholder={isLoadingProjects ? 'Loading projects...' : '-- Select a Project --'}
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            onDropdownOpen={ensureProjectsLoaded}
            onClick={ensureProjectsLoaded}
            data={projectOptions}
            searchable
            nothingFoundMessage={isLoadingProjects ? 'Loading projects...' : 'No projects found'}
            rightSection={isLoadingProjects ? <Loader size="xs" /> : undefined}
          />
          <Select
            label="Group By"
            value={groupBy}
            onChange={setGroupBy}
            disabled={!selectedProjectId || isLoading}
            data={[
              { value: 'none', label: '-- Group By: None --' },
              { value: 'status', label: 'Status' },
              { value: 'tracker', label: 'Tracker' },
              { value: 'priority', label: 'Priority' },
              { value: 'author', label: 'Author' },
              { value: 'category', label: 'Category' },
              { value: 'fixed_version', label: 'Target Version' },
            ]}
          />
        </Group>

        {isLoading && (
          <Group justify="center" py="xl">
            <Loader size="sm" />
            <Text c="dimmed">Loading tasks...</Text>
          </Group>
        )}
        
        {!isLoading && selectedProjectId && tasks.length === 0 && (
          <Text c="dimmed" ta="center" py="xl">No tasks assigned to you in this project.</Text>
        )}
        
        {!isLoading && !selectedProjectId && (
          <Text c="dimmed" ta="center" py="xl">Please select a project to view tasks.</Text>
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
                        <ActionIcon variant="subtle" color="blue" onClick={() => handleAddToQueue(task)} title="Add to Timer Queue" aria-label="Add to Timer Queue">
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
