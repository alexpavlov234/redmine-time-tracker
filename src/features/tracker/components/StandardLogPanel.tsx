import React, { useState } from 'react';
import { Card, Group, Text, Stack, Paper, Tooltip, ActionIcon } from '@mantine/core';
import { IconBolt, IconTrash } from '@tabler/icons-react';
import { usePresets } from '../../../hooks/usePresets';
import { useLanguage } from '../../../contexts/LanguageContext';
import { TimeEntryFormModal } from '../../calendar/components/TimeEntryFormModal';
import type { TimeLogPreset } from '../../../types';

/// <summary>
/// Panel offering customizable time-logging presets.
/// </summary>
export const StandardLogPanel: React.FC<{ onLogSuccess?: () => void }> = ({ onLogSuccess }) => {
  const { presets, deletePreset } = usePresets();
  const { t } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<TimeLogPreset | null>(null);

  const defaultPresets: TimeLogPreset[] = [
    { id: 'default_standup', name: t('presetStandupName'), hours: 0.25, comments: t('presetStandupComment'), isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
    { id: 'default_review', name: t('presetReviewName'), hours: 0.5, comments: t('presetReviewComment'), isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
    { id: 'default_sync', name: t('presetSyncName'), hours: 1.0, comments: t('presetSyncComment'), isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
  ];

  const displayPresets = presets.length > 0 ? presets : defaultPresets;

  const handleOpenModal = (preset?: TimeLogPreset) => {
    setSelectedPreset(preset || null);
    setIsModalOpen(true);
  };

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Card.Section withBorder inheritPadding py="xs">
          <Group gap="xs">
            <IconBolt size={20} color="var(--mantine-color-orange-filled)" />
            <Text fw={600}>{t('presetsDivider')}</Text>
          </Group>
        </Card.Section>

        <Stack mt="md" gap="sm">
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
                onClick={() => handleOpenModal(preset)}
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
                    <Tooltip label={t('deletePresetTooltip')}>
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

      {isModalOpen && (
        <TimeEntryFormModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedPreset(null);
          }}
          onSuccess={() => {
            setIsModalOpen(false);
            setSelectedPreset(null);
            if (onLogSuccess) onLogSuccess();
          }}
          initialPresetId={selectedPreset?.id || null}
          initialPreset={selectedPreset}
        />
      )}
    </>
  );
};
