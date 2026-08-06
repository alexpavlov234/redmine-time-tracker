import React, { useState, useMemo } from 'react';
import { Card, Group, Text, Button, Stack, ActionIcon, Modal, Select, TextInput, NumberInput, Textarea, Tooltip, Paper, Alert } from '@mantine/core';
import { IconBolt, IconPlus, IconTrash, IconCheck, IconSend } from '@tabler/icons-react';
import { usePresets } from '../../../hooks/usePresets';
import { useQueue } from '../../../contexts/QueueContext';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { redmineApiRequest, getIssue } from '../../../services/redmine';
import type { TimeLogPreset, RedmineIssue } from '../../../types';

const DEFAULT_PRESETS: TimeLogPreset[] = [
  { id: 'default_standup', name: 'Daily Standup (15m)', hours: 0.25, comments: 'Daily team standup meeting', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
  { id: 'default_review', name: 'Code Review (30m)', hours: 0.5, comments: 'Code review & pull request verification', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
  { id: 'default_sync', name: 'Team Sync (1h)', hours: 1.0, comments: 'Project planning & team sync', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
];

export const QuickLogPanel: React.FC<{ onLogSuccess?: () => void }> = ({ onLogSuccess }) => {
  const { presets, savePreset, deletePreset } = usePresets();
  const { todos } = useQueue();
  const { allProjects } = useProjects();

  const [activePreset, setActivePreset] = useState<TimeLogPreset | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states for Quick Log Modal
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [hours, setHours] = useState<number | string>(0.25);
  const [spentOn, setSpentOn] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [comments, setComments] = useState<string>('');
  const [loadedTask, setLoadedTask] = useState<RedmineIssue | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Add Preset Modal
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetProjectId, setNewPresetProjectId] = useState('');
  const [newPresetTaskId, setNewPresetTaskId] = useState('');
  const [newPresetActivityId, setNewPresetActivityId] = useState('');
  const [newPresetHours, setNewPresetHours] = useState<number | string>(0.5);
  const [newPresetComments, setNewPresetComments] = useState('');
  const [statusResult, setStatusResult] = useState<{ success: boolean; message: string } | null>(null);

  const { tasks: projectTasks, isLoading: isLoadingProjectTasks } = useTasksForProject(selectedProjectId || null);
  const { activities: projectActivities, isLoading: isLoadingActivities } = useActivitiesForProject(selectedProjectId || null);
  const { tasks: newPresetTasks } = useTasksForProject(newPresetProjectId || null);
  const { activities: newPresetActivities } = useActivitiesForProject(newPresetProjectId || null);

  const displayPresets = presets.length > 0 ? presets : DEFAULT_PRESETS;

  const projectOptions = useMemo(() => {
    return allProjects.map(p => ({
      value: p.id.toString(),
      label: p.name,
    }));
  }, [allProjects]);

  const taskOptions = useMemo(() => {
    const map = new Map<string, string>();
    // From todos
    todos.forEach(t => map.set(t.taskId, `#${t.taskId} - ${t.taskSubject}`));
    // From project tasks
    projectTasks.forEach(t => map.set(t.id.toString(), `#${t.id} - ${t.subject}`));
    // From active preset
    if (activePreset?.taskId) {
      map.set(activePreset.taskId, `#${activePreset.taskId} - ${activePreset.taskSubject || activePreset.taskId}`);
    }
    // From loaded task
    if (loadedTask) {
      map.set(loadedTask.id.toString(), `#${loadedTask.id} - ${loadedTask.subject}`);
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [projectTasks, todos, activePreset, loadedTask]);

  const handleQuickLoad = async (id: string) => {
    if (!id) return;
    setIsLoadingIssue(true);
    try {
      const cleanId = id.replace(/^#/, '').trim();
      const issue = await getIssue(parseInt(cleanId, 10));
      setLoadedTask(issue);
      setSelectedTaskId(issue.id.toString());
      if (issue.project?.id) {
        setSelectedProjectId(issue.project.id.toString());
      }
    } catch (error: any) {
      // Ignore or handle error
    } finally {
      setIsLoadingIssue(false);
    }
  };

  const handleOpenLogModal = async (preset: TimeLogPreset) => {
    setActivePreset(preset);
    const initialTask = preset.taskId || (todos.length > 0 ? todos[0].taskId : '');
    const initialProject = preset.projectId || (todos.length > 0 ? todos[0].projectId : '');
    
    setSelectedProjectId(initialProject);
    setSelectedTaskId(initialTask);
    setSelectedActivityId(preset.activityId || '');
    setHours(preset.hours || 0.25);
    setComments(preset.comments || preset.name);
    setSpentOn(new Date().toISOString().split('T')[0]);

    if (preset.taskId && (!loadedTask || loadedTask.id.toString() !== preset.taskId)) {
      handleQuickLoad(preset.taskId);
    }

    setIsLogModalOpen(true);
  };

  const handleTaskChange = (val: string | null) => {
    const newTaskId = val || '';
    setSelectedTaskId(newTaskId);

    if (val) {
      const task = projectTasks.find(t => t.id.toString() === val) || 
                   todos.find(t => t.taskId === val) || 
                   (loadedTask?.id.toString() === val ? loadedTask : null);
      
      const pId = task && 'project' in task && task.project?.id ? task.project.id.toString() : 
                  task && 'projectId' in task ? (task as any).projectId : null;
      if (pId) {
        setSelectedProjectId(pId);
      }
    }
  };

  const handleQuickSubmit = async () => {
    if (!selectedTaskId) {
      setStatusResult({ success: false, message: 'Please select a task to log time against.' });
      return;
    }

    const hoursFormatted = typeof hours === 'string' ? parseFloat(hours) : hours;
    if (isNaN(hoursFormatted) || hoursFormatted <= 0) {
      setStatusResult({ success: false, message: 'Please enter valid hours.' });
      return;
    }

    setIsSubmitting(true);
    setStatusResult(null);
    try {
      const timeEntryPayload = {
        time_entry: {
          issue_id: parseInt(selectedTaskId, 10),
          hours: hoursFormatted,
          comments: comments.trim(),
          ...(selectedActivityId && { activity_id: parseInt(selectedActivityId, 10) }),
          spent_on: spentOn,
        },
      };

      await redmineApiRequest('/time_entries.json', 'POST', timeEntryPayload);
      setStatusResult({ success: true, message: `Quick Logged ${hoursFormatted}h successfully!` });
      setTimeout(() => {
        setIsLogModalOpen(false);
        if (onLogSuccess) onLogSuccess();
      }, 500);
    } catch (err: any) {
      setStatusResult({ success: false, message: err.message || 'Failed to quick log time.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveNewPreset = () => {
    if (!newPresetName.trim()) return;
    const hoursNum = typeof newPresetHours === 'string' ? parseFloat(newPresetHours) : newPresetHours;
    const project = allProjects.find(p => p.id.toString() === newPresetProjectId);
    const task = newPresetTasks.find(t => t.id.toString() === newPresetTaskId);

    const newPreset: TimeLogPreset = {
      id: 'preset_' + Date.now(),
      name: newPresetName.trim(),
      projectId: newPresetProjectId,
      projectName: project?.name || '',
      taskId: newPresetTaskId,
      taskSubject: task?.subject || '',
      activityId: newPresetActivityId,
      hours: hoursNum || 0.5,
      comments: newPresetComments.trim(),
      isBillable: true,
    };

    savePreset(newPreset);
    setIsAddModalOpen(false);
    setNewPresetName('');
    setNewPresetProjectId('');
    setNewPresetTaskId('');
    setNewPresetActivityId('');
    setNewPresetComments('');
    setNewPresetHours(0.5);
  };

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Group gap="xs">
              <IconBolt size={20} color="var(--mantine-color-orange-filled)" />
              <Text fw={600}>Quick Log Presets</Text>
            </Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={() => setIsAddModalOpen(true)}
            >
              Add Preset
            </Button>
          </Group>
        </Card.Section>

        <Stack mt="md" gap="xs">
          <Text size="xs" c="dimmed">
            One-click time logging for common recurring activities.
          </Text>

          <Group gap="xs" wrap="wrap">
            {displayPresets.map(preset => (
              <Paper
                key={preset.id}
                withBorder
                p="xs"
                radius="md"
                style={{
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  backgroundColor: 'var(--mantine-color-default)',
                }}
                onClick={() => handleOpenLogModal(preset)}
              >
                <Group gap="xs" wrap="nowrap">
                  <IconBolt size={16} color="var(--mantine-color-orange-filled)" />
                  <Stack gap={0}>
                    <Text size="sm" fw={600}>{preset.name}</Text>
                    <Text size="xs" c="dimmed">
                      {preset.hours}h {preset.taskSubject ? `• #${preset.taskId}` : ''} {preset.comments ? `• ${preset.comments}` : ''}
                    </Text>
                  </Stack>
                  {presets.some(p => p.id === preset.id) && (
                    <Tooltip label="Delete preset">
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePreset(preset.id);
                        }}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Paper>
            ))}
          </Group>
        </Stack>
      </Card>

      {/* Quick Log Action Modal */}
      <Modal
        opened={isLogModalOpen}
        onClose={() => setIsLogModalOpen(false)}
        title={<Text fw={600}>Quick Log Time: {activePreset?.name}</Text>}
        centered
        size="md"
      >
        <Stack gap="md">
          {statusResult && (
            <Alert color={statusResult.success ? 'green' : 'red'}>
              {statusResult.message}
            </Alert>
          )}
          <Select
            label="Project"
            placeholder="Search project..."
            data={projectOptions}
            value={selectedProjectId}
            onChange={v => {
              setSelectedProjectId(v || '');
              setSelectedActivityId('');
            }}
            searchable
            clearable
          />

          <Group grow align="flex-start">
            <TextInput
              label="Task ID"
              placeholder="Paste ID..."
              value={selectedTaskId}
              onChange={e => setSelectedTaskId(e.target.value)}
              onBlur={() => {
                if (selectedTaskId) handleQuickLoad(selectedTaskId);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (selectedTaskId) handleQuickLoad(selectedTaskId);
                }
              }}
              disabled={isLoadingIssue || isSubmitting}
              style={{ flex: 1 }}
            />
            <Select
              label="Task Name"
              placeholder={isLoadingProjectTasks ? 'Loading tasks...' : 'Search tasks...'}
              data={taskOptions}
              value={selectedTaskId}
              onChange={handleTaskChange}
              searchable
              required
              style={{ flex: 2 }}
            />
          </Group>

          <Select
            label="Activity"
            placeholder={isLoadingActivities ? 'Loading activities...' : '-- Select activity --'}
            value={selectedActivityId}
            onChange={v => setSelectedActivityId(v || '')}
            data={projectActivities.map(a => ({ value: a.id.toString(), label: a.name }))}
          />

          <Group grow>
            <NumberInput
              label="Hours to Log"
              value={hours}
              onChange={setHours}
              decimalScale={2}
              step={0.25}
              min={0.1}
              required
            />
            <TextInput
              label="Date"
              type="date"
              value={spentOn}
              onChange={e => setSpentOn(e.target.value)}
              required
            />
          </Group>

          <Textarea
            label="Comments"
            value={comments}
            onChange={e => setComments(e.currentTarget.value)}
            minRows={2}
            autosize
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setIsLogModalOpen(false)}>Cancel</Button>
            <Button
              leftSection={<IconSend size={16} />}
              onClick={handleQuickSubmit}
              loading={isSubmitting}
              color="orange"
            >
              Log Time
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Add Custom Preset Modal */}
      <Modal
        opened={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={<Text fw={600}>Add Quick Log Preset</Text>}
        centered
        size="md"
      >
        <Stack gap="md">
          <TextInput
            label="Preset Name"
            placeholder="e.g. Daily Standup (15m)"
            value={newPresetName}
            onChange={e => setNewPresetName(e.currentTarget.value)}
            required
            data-autofocus
          />

          <Select
            label="Default Project"
            placeholder="-- Optional: Choose Project --"
            data={projectOptions}
            value={newPresetProjectId}
            onChange={v => {
              setNewPresetProjectId(v || '');
              setNewPresetTaskId('');
              setNewPresetActivityId('');
            }}
            searchable
            clearable
          />

          <Select
            label="Default Task"
            placeholder="-- Optional: Choose Task --"
            data={newPresetTasks.map(t => ({ value: t.id.toString(), label: `#${t.id} - ${t.subject}` }))}
            value={newPresetTaskId}
            onChange={v => setNewPresetTaskId(v || '')}
            searchable
            clearable
            disabled={!newPresetProjectId}
          />

          <Select
            label="Default Activity"
            placeholder="-- Optional: Choose Activity --"
            data={newPresetActivities.map(a => ({ value: a.id.toString(), label: a.name }))}
            value={newPresetActivityId}
            onChange={v => setNewPresetActivityId(v || '')}
            disabled={!newPresetProjectId}
            clearable
          />

          <NumberInput
            label="Default Hours"
            value={newPresetHours}
            onChange={setNewPresetHours}
            decimalScale={2}
            step={0.25}
            min={0.1}
            required
          />
          
          <Textarea
            label="Default Comments"
            placeholder="e.g. Daily standup meeting with the team"
            value={newPresetComments}
            onChange={e => setNewPresetComments(e.currentTarget.value)}
          />

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
            <Button
              leftSection={<IconCheck size={16} />}
              onClick={handleSaveNewPreset}
              disabled={!newPresetName.trim()}
            >
              Save Preset
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
