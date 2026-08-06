import React from 'react';
import type { TimeEntry } from '../../../types';
import { Card, Button, Group, Text, Progress, Stack, ActionIcon, Badge, Paper } from '@mantine/core';
import { IconClock, IconEdit, IconTrash, IconPlus } from '@tabler/icons-react';

interface DayDetailsViewProps {
  dateStr: string;
  entries: TimeEntry[];
  onClose: () => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entryId: number) => void;
  onAdd: (dateStr: string) => void;
}

export const DayDetailsView: React.FC<DayDetailsViewProps> = ({
  dateStr,
  entries,
  onClose,
  onEdit,
  onDelete,
  onAdd,
}) => {
  const dateObj = new Date(dateStr + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  const projectSummary = entries.reduce<Record<string, number>>((acc, e) => {
    const name = e.project?.name || 'Unknown';
    acc[name] = (acc[name] || 0) + e.hours;
    return acc;
  }, {});

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconClock size={20} color="var(--mantine-color-blue-filled)" />
            <Text fw={600}>{formattedDate}</Text>
          </Group>
          <Badge size="lg" color="blue">{totalHours.toFixed(1)}h Total</Badge>
        </Group>
      </Card.Section>

      <Stack gap="md" mt="md">
        {Object.keys(projectSummary).length > 0 && (
          <Stack gap="sm">
            {Object.entries(projectSummary).map(([name, hours]) => {
              const percentage = totalHours > 0 ? (hours / totalHours) * 100 : 0;
              return (
                <div key={name}>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm" fw={500}>{name}</Text>
                    <Text size="sm" c="dimmed">{hours.toFixed(1)}h</Text>
                  </Group>
                  <Progress value={percentage} color="blue" size="sm" />
                </div>
              );
            })}
          </Stack>
        )}

        {entries.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No time logged on this day.</Text>
        ) : (
          <Stack gap="sm">
            {entries.map((entry) => (
              <Paper key={entry.id} withBorder p="sm" radius="md">
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Group justify="space-between" mb={4}>
                      <Text size="sm" fw={600} truncate>{entry.project?.name || 'Unknown Project'}</Text>
                      <Badge variant="light">{entry.hours}h</Badge>
                    </Group>
                    <Text size="sm" c="dimmed" truncate>#{entry.issue?.id} - {entry.issue?.subject || 'Unknown Task'}</Text>
                    {entry.comments && <Text size="sm" mt="xs" style={{ whiteSpace: 'pre-wrap' }}>{entry.comments}</Text>}
                    <Text size="xs" c="dimmed" mt="xs">Activity: {entry.activity?.name || 'General'}</Text>
                  </div>
                  <Stack gap="xs" style={{ flexShrink: 0 }}>
                    <ActionIcon variant="light" onClick={() => onEdit(entry)} aria-label="Edit entry">
                      <IconEdit size={16} />
                    </ActionIcon>
                    <ActionIcon variant="light" color="red" onClick={() => onDelete(entry.id)} aria-label="Delete entry">
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Stack>
                </Group>
              </Paper>
            ))}
          </Stack>
        )}

        <Group justify="space-between" mt="md">
          <Button variant="default" onClick={onClose}>
            Close
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => onAdd(dateStr)}>
            Log Time Here
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
