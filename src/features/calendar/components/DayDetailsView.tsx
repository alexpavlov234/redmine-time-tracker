import React, { useMemo } from 'react';
import type { TimeEntry } from '../../../types';
import { Card, Button, Group, Text, Progress, Stack, ActionIcon, Badge, Paper, Anchor } from '@mantine/core';
import { IconClock, IconEdit, IconTrash, IconPlus, IconExternalLink } from '@tabler/icons-react';
import { useSettings } from '../../../contexts/SettingsContext';

interface DayDetailsViewProps {
  dateStr: string;
  entries: TimeEntry[];
  projectColorMap: Map<string, string>;
  onClose: () => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entryId: number) => void;
  onAdd: (dateStr: string) => void;
}

export const DayDetailsView: React.FC<DayDetailsViewProps> = ({
  dateStr,
  entries,
  projectColorMap,
  onClose,
  onEdit,
  onDelete,
  onAdd,
}) => {
  const getProjectColor = (projectName: string): string => {
    return projectColorMap.get(projectName) || 'blue';
  };
  const { redmineUrl } = useSettings();
  const dateObj = new Date(dateStr + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  // Group entries by project
  const groupedByProject = useMemo(() => {
    const map = new Map<string, { totalHours: number; items: TimeEntry[] }>();
    entries.forEach((entry) => {
      const projName = entry.project?.name || 'General / No Project';
      if (!map.has(projName)) {
        map.set(projName, { totalHours: 0, items: [] });
      }
      const group = map.get(projName)!;
      group.totalHours += entry.hours;
      group.items.push(entry);
    });
    return Array.from(map.entries());
  }, [entries]);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconClock size={20} color="var(--mantine-color-blue-filled)" />
            <Text fw={600}>{formattedDate}</Text>
          </Group>
          <Badge size="lg" color={totalHours >= 8 ? 'green' : 'blue'}>{totalHours.toFixed(1)}h Total</Badge>
        </Group>
      </Card.Section>

      <Stack gap="md" mt="md" style={{ flex: 1, overflowY: 'auto' }}>
        {groupedByProject.length > 0 && (
          <Stack gap="sm">
            {groupedByProject.map(([name, group]) => {
              const percentage = totalHours > 0 ? (group.totalHours / totalHours) * 100 : 0;
              const color = getProjectColor(name);
              return (
                <div key={name}>
                  <Group justify="space-between" mb={4}>
                    <Text size="sm" fw={600} c={`${color}.7`}>{name}</Text>
                    <Text size="sm" c="dimmed" fw={600}>{group.totalHours.toFixed(1)}h ({percentage.toFixed(0)}%)</Text>
                  </Group>
                  <Progress value={percentage} color={color} size="sm" radius="xl" />
                </div>
              );
            })}
          </Stack>
        )}

        {entries.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">No time logged on this day.</Text>
        ) : (
          <Stack gap="xs">
            {groupedByProject.map(([projectName, group]) => {
              const color = getProjectColor(projectName);
              return (
                <Paper
                  key={projectName}
                  withBorder
                  radius="md"
                  p="xs"
                  style={{
                    backgroundColor: 'var(--mantine-color-body)',
                    borderLeft: `4px solid var(--mantine-color-${color}-filled)`,
                  }}
                >
                  <Group justify="space-between" mb={6} style={{ borderBottom: '1px solid var(--mantine-color-default-border)', paddingBottom: '4px' }}>
                    <Text size="xs" fw={700} tt="uppercase" c={`${color}.7`}>{projectName}</Text>
                    <Badge variant="light" color={color} size="xs">{group.totalHours.toFixed(1)}h</Badge>
                  </Group>

                  <Stack gap={4}>
                    {group.items.map((entry) => (
                      <Paper key={entry.id} withBorder p="6px 8px" radius="sm">
                        <Group justify="space-between" align="center" wrap="nowrap">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={6} align="center" wrap="nowrap">
                              {entry.issue?.id ? (
                                <>
                                  <Anchor href={`${redmineUrl}/issues/${entry.issue.id}`} target="_blank" size="sm" fw={600} truncate underline="hover" style={{ flex: 1, minWidth: 0 }}>
                                    #{entry.issue.id} {entry.issue.subject || ''}
                                  </Anchor>
                                  <ActionIcon component="a" href={`${redmineUrl}/issues/${entry.issue.id}`} target="_blank" size="18px" variant="subtle" color="gray" title="Open in Redmine" style={{ flexShrink: 0 }}>
                                    <IconExternalLink size={12} />
                                  </ActionIcon>
                                </>
                              ) : (
                                <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>General Entry</Text>
                              )}

                              {entry.activity?.name && (
                                <Badge variant="outline" color="gray" size="xs" style={{ flexShrink: 0, textTransform: 'none', height: 18, fontSize: 10 }}>
                                  {entry.activity.name}
                                </Badge>
                              )}

                              <Badge variant="filled" color={color} size="xs" style={{ flexShrink: 0, height: 18, fontSize: 10 }}>
                                {entry.hours}h
                              </Badge>
                            </Group>

                            {entry.comments && (
                              <Text size="11px" c="dimmed" mt={2} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>
                                {entry.comments}
                              </Text>
                            )}
                          </div>

                          <Group gap={2} style={{ flexShrink: 0, marginLeft: 6 }}>
                            <ActionIcon variant="subtle" size="20px" onClick={() => onEdit(entry)} aria-label="Edit entry">
                              <IconEdit size={13} />
                            </ActionIcon>
                            <ActionIcon variant="subtle" size="20px" color="red" onClick={() => onDelete(entry.id)} aria-label="Delete entry">
                              <IconTrash size={13} />
                            </ActionIcon>
                          </Group>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}

        <Group justify="space-between" mt="auto" pt="md">
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
