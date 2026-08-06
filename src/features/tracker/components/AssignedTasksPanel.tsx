import React, { useState, useEffect } from 'react';
import { Card, Select, Group, Text, Stack, ActionIcon, Loader, Badge, Anchor, Paper } from '@mantine/core';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { redmineApiRequest } from '../../../services/redmine';
import type { RedmineIssue } from '../../../types';
import { IconExternalLink, IconListCheck, IconPlayerPlay } from '@tabler/icons-react';
import { useQueue } from '../../../contexts/QueueContext';

export const AssignedTasksPanel: React.FC = () => {
  const { allProjects } = useProjects();
  const { redmineUrl } = useSettings();
  const { addTodo } = useQueue();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const [groupBy, setGroupBy] = useState<string | null>('none');
  const [tasks, setTasks] = useState<RedmineIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch recent time entries to identify recently used projects
  useEffect(() => {
    let cancelled = false;
    redmineApiRequest('/time_entries.json?user_id=me&limit=50')
      .then(data => {
        if (cancelled) return;
        const entries = data.time_entries || [];
        const orderedIds: string[] = [];
        entries.forEach((e: any) => {
          const pid = e.project?.id?.toString();
          if (pid && !orderedIds.includes(pid)) {
            orderedIds.push(pid);
          }
        });
        setRecentProjectIds(orderedIds);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // Build grouped project options with "Recently Used" at the top
  const projectOptions = React.useMemo(() => {
    if (recentProjectIds.length === 0) {
      return allProjects.map(p => ({ value: p.id.toString(), label: p.name }));
    }

    const recentSet = new Set(recentProjectIds);
    const recentProjects = recentProjectIds
      .map(id => allProjects.find(p => p.id.toString() === id))
      .filter((p): p is typeof allProjects[0] => Boolean(p));

    const otherProjects = allProjects.filter(p => !recentSet.has(p.id.toString()));

    return [
      {
        group: 'Recently Used',
        items: recentProjects.map(p => ({ value: p.id.toString(), label: p.name })),
      },
      {
        group: 'All Projects',
        items: otherProjects.map(p => ({ value: p.id.toString(), label: p.name })),
      },
    ];
  }, [allProjects, recentProjectIds]);

  const handleAddToQueue = (task: RedmineIssue) => {
    const project = allProjects.find(p => p.id.toString() === selectedProjectId);
    addTodo({
      projectId: selectedProjectId || '',
      projectName: project?.name || `Project ${selectedProjectId}`,
      taskId: task.id.toString(),
      taskSubject: task.subject,
      note: '',
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
            placeholder="-- Select a Project --"
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            data={projectOptions}
            searchable
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
                      <Group gap="xs" style={{ flex: 1, minWidth: 0 }}>
                        <Anchor href={`${redmineUrl}/issues/${task.id}`} target="_blank" size="sm" fw={500} style={{ whiteSpace: 'nowrap' }}>
                          #{task.id}
                        </Anchor>
                        <Text size="sm" truncate>{task.subject}</Text>
                      </Group>
                      
                      <Group gap={4}>
                        <ActionIcon variant="subtle" color="blue" onClick={() => handleAddToQueue(task)} title="Add to Timer Queue">
                          <IconPlayerPlay size={16} />
                        </ActionIcon>
                        <ActionIcon variant="subtle" color="gray" component="a" href={`${redmineUrl}/issues/${task.id}`} target="_blank" title="Open in Redmine">
                          <IconExternalLink size={16} />
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
