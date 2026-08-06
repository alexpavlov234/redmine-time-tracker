import React, { useState } from 'react';
import { Card, Group, Text, Button, Stack, Paper, Tooltip, ActionIcon } from '@mantine/core';
import { IconBolt, IconTrash, IconClock } from '@tabler/icons-react';
import { usePresets } from '../../../hooks/usePresets';
import { TimeEntryFormModal } from '../../calendar/components/TimeEntryFormModal';
import type { TimeLogPreset } from '../../../types';

const DEFAULT_PRESETS: TimeLogPreset[] = [
  { id: 'default_standup', name: 'Daily Standup (15m)', hours: 0.25, comments: 'Daily team standup meeting', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
  { id: 'default_review', name: 'Code Review (30m)', hours: 0.5, comments: 'Code review & pull request verification', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
  { id: 'default_sync', name: 'Team Sync (1h)', hours: 1.0, comments: 'Project planning & team sync', isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
];

export const StandardLogPanel: React.FC<{ onLogSuccess?: () => void }> = ({ onLogSuccess }) => {
  const { presets, deletePreset } = usePresets();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  const displayPresets = presets.length > 0 ? presets : DEFAULT_PRESETS;

  const handleOpenModal = (presetId?: string) => {
    setSelectedPresetId(presetId || null);
    setIsModalOpen(true);
  };

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Group gap="xs">
              <IconBolt size={20} color="var(--mantine-color-orange-filled)" />
              <Text fw={600}>Direct Time Log & Presets</Text>
            </Group>
            <Button
              size="xs"
              variant="light"
              leftSection={<IconClock size={14} />}
              onClick={() => handleOpenModal()}
            >
              Log Time
            </Button>
          </Group>
        </Card.Section>

        <Stack mt="md" gap="xs">
          <Text size="xs" c="dimmed">
            Click any preset shortcut or "Log Time" to open the standard time logging modal.
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
                onClick={() => handleOpenModal(preset.id)}
              >
                <Group gap="xs" wrap="nowrap">
                  <IconBolt size={14} color="var(--mantine-color-orange-filled)" />
                  <Stack gap={0}>
                    <Text size="sm" fw={600}>{preset.name}</Text>
                    <Text size="xs" c="dimmed">
                      {preset.hours}h {preset.comments ? `• ${preset.comments}` : ''}
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

      <TimeEntryFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => {
          setIsModalOpen(false);
          if (onLogSuccess) onLogSuccess();
        }}
        initialPresetId={selectedPresetId}
      />
    </>
  );
};
