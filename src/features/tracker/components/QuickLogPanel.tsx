import React, { useState } from 'react';
import { Card, Group, Text, Button, Stack, ActionIcon, Modal, Select, TextInput, NumberInput, Textarea, Tooltip, Paper } from '@mantine/core';
import { IconBolt, IconPlus, IconTrash, IconCheck, IconSend } from '@tabler/icons-react';
import { usePresets } from '../../../hooks/usePresets';
import { useQueue } from '../../../contexts/QueueContext';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { redmineApiRequest } from '../../../services/redmine';
import { notifications } from '@mantine/notifications';
import type { TimeLogPreset } from '../../../types';

const DEFAULT_PRESETS: TimeLogPreset[] = [
  { id: 'default_standup', name: 'Daily Standup (15m)', hours: 0.25, comments: 'Daily team standup meeting', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
  { id: 'default_review', name: 'Code Review (30m)', hours: 0.5, comments: 'Code review & pull request verification', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
  { id: 'default_sync', name: 'Team Sync (1h)', hours: 1.0, comments: 'Project planning & team sync', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
];

export const QuickLogPanel: React.FC<{ onLogSuccess?: () => void }> = ({ onLogSuccess }) => {
  const { presets, savePreset, deletePreset } = usePresets();
  const { todos } = useQueue();

  const [activePreset, setActivePreset] = useState<TimeLogPreset | null>(null);
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Form states for Quick Log Modal
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedActivityId, setSelectedActivityId] = useState<string>('');
  const [hours, setHours] = useState<number | string>(0.25);
  const [comments, setComments] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states for Add Preset Modal
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetHours, setNewPresetHours] = useState<number | string>(0.5);
  const [newPresetComments, setNewPresetComments] = useState('');

  const { activities: projectActivities } = useActivitiesForProject(selectedProjectId || null);

  const displayPresets = presets.length > 0 ? presets : DEFAULT_PRESETS;

  const handleOpenLogModal = (preset: TimeLogPreset) => {
    setActivePreset(preset);
    const initialTask = preset.taskId || (todos.length > 0 ? todos[0].taskId : '');
    const initialProject = preset.projectId || (todos.length > 0 ? todos[0].projectId : '');
    setSelectedProjectId(initialProject);
    setSelectedTaskId(initialTask);
    setSelectedActivityId(preset.activityId || '');
    setHours(preset.hours || 0.25);
    setComments(preset.comments || preset.name);
    setIsLogModalOpen(true);
  };

  const handleQuickSubmit = async () => {
    if (!selectedTaskId) {
      notifications.show({ title: 'Error', message: 'Please select a task to log time against.', color: 'red' });
      return;
    }

    const hoursFormatted = typeof hours === 'string' ? parseFloat(hours) : hours;
    if (isNaN(hoursFormatted) || hoursFormatted <= 0) {
      notifications.show({ title: 'Error', message: 'Please enter valid hours.', color: 'red' });
      return;
    }

    setIsSubmitting(true);
    try {
      const timeEntryPayload = {
        time_entry: {
          issue_id: selectedTaskId,
          hours: hoursFormatted,
          comments: comments.trim(),
          ...(selectedActivityId && { activity_id: parseInt(selectedActivityId) }),
          spent_on: new Date().toISOString().split('T')[0],
        },
      };

      await redmineApiRequest('/time_entries.json', 'POST', timeEntryPayload);
      notifications.show({ title: 'Success', message: `Quick Logged ${hoursFormatted}h successfully!`, color: 'green' });
      setIsLogModalOpen(false);
      if (onLogSuccess) onLogSuccess();
    } catch (err: any) {
      notifications.show({ title: 'Error', message: err.message || 'Failed to quick log time.', color: 'red' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveNewPreset = () => {
    if (!newPresetName.trim()) return;
    const hoursNum = typeof newPresetHours === 'string' ? parseFloat(newPresetHours) : newPresetHours;
    const newPreset: TimeLogPreset = {
      id: 'preset_' + Date.now(),
      name: newPresetName.trim(),
      hours: hoursNum || 0.5,
      comments: newPresetComments.trim(),
      isBillable: true,
      projectId: '',
      projectName: '',
      taskId: '',
      taskSubject: '',
      activityId: '',
    };

    savePreset(newPreset);
    notifications.show({ title: 'Success', message: `Preset "${newPresetName.trim()}" saved!`, color: 'green' });
    setIsAddModalOpen(false);
    setNewPresetName('');
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
                    <Text size="xs" c="dimmed">{preset.hours}h {preset.comments ? `• ${preset.comments}` : ''}</Text>
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
      >
        <Stack gap="md">
          <Select
            label="Select Task"
            placeholder="-- Choose task to log time on --"
            value={selectedTaskId}
            onChange={v => {
              setSelectedTaskId(v || '');
              const todo = todos.find(t => t.taskId === v);
              if (todo) setSelectedProjectId(todo.projectId);
            }}
            data={todos.map(t => ({ value: t.taskId, label: `#${t.taskId} - ${t.taskSubject}` }))}
            required
          />

          <NumberInput
            label="Hours to Log"
            value={hours}
            onChange={setHours}
            decimalScale={2}
            step={0.25}
            min={0.1}
            required
          />

          {projectActivities.length > 0 && (
            <Select
              label="Activity"
              placeholder="-- Select activity --"
              value={selectedActivityId}
              onChange={v => setSelectedActivityId(v || '')}
              data={projectActivities.map(a => ({ value: a.id.toString(), label: a.name }))}
            />
          )}

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
