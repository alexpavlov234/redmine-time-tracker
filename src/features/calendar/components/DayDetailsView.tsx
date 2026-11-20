import React, { useMemo } from 'react';
import type { TimeEntry, StagedTimeEntry, TimeLogPreset } from '../../../types';
import { Card, Button, Group, Text, Progress, Stack, ActionIcon, Badge, Paper, Tooltip, Alert } from '@mantine/core';
import { IconClock, IconEdit, IconTrash, IconPlus, IconCopy, IconGitCommit, IconCloudUpload, IconSend, IconAlertCircle, IconGripVertical, IconBolt } from '@tabler/icons-react';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { usePresets } from '../../../hooks/usePresets';
import { formatDisplayDate } from '../../../utils/formatters';

export const CALENDAR_ENTRY_DRAG_MIME = 'application/x-redmine-time-entry';

export type DraggedCalendarEntry =
  | { kind: 'pushed'; entry: TimeEntry }
  | { kind: 'staged'; entry: StagedTimeEntry };

interface DayDetailsViewProps {
  dateStr: string;
  entries: TimeEntry[];
  stagedEntries?: StagedTimeEntry[];
  projectColorMap: Map<string, string>;
  onClose: () => void;
  onEdit: (entry: TimeEntry) => void;
  onCopy?: (entry: TimeEntry) => void;
  onDelete: (entryId: number) => void;
  onAdd: (dateStr: string) => void;
  onEditStaged?: (entry: StagedTimeEntry) => void;
  onDeleteStaged?: (localId: string) => void;
  onPushStagedEntry?: (localId: string) => void;
  onPushDay?: (dateStr: string) => void;
  isPushing?: boolean;
  draggingEntryKey?: string | null;
  onEntryDragStart?: (payload: DraggedCalendarEntry, key: string) => void;
  onEntryDragEnd?: () => void;
  onApplyPreset?: (dateStr: string, preset: TimeLogPreset) => void;
  onQuickCommitPreset?: (dateStr: string, preset: TimeLogPreset) => void;
}

export const DayDetailsView: React.FC<DayDetailsViewProps> = ({
  dateStr,
  entries,
  stagedEntries = [],
  projectColorMap,
  onClose,
  onEdit,
  onCopy,
  onDelete,
  onAdd,
  onEditStaged,
  onDeleteStaged,
  onPushStagedEntry,
  onPushDay,
  isPushing = false,
  draggingEntryKey = null,
  onEntryDragStart,
  onEntryDragEnd,
  onApplyPreset,
  onQuickCommitPreset,
}) => {
  const { language, t } = useLanguage();
  const confirmDialog = useConfirm();
  const { presets, deletePreset } = usePresets();
  const getProjectColor = (projectName: string): string => {
    return projectColorMap.get(projectName) || 'blue';
  };
  const formattedDate = formatDisplayDate(dateStr, language, { weekday: 'long' });

  const defaultPresets = useMemo<TimeLogPreset[]>(
    () => [
      { id: 'default_standup', name: t('presetStandupName'), hours: 0.25, comments: t('presetStandupComment'), isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
      { id: 'default_review', name: t('presetReviewName'), hours: 0.5, comments: t('presetReviewComment'), isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
      { id: 'default_sync', name: t('presetSyncName'), hours: 1.0, comments: t('presetSyncComment'), isBillable: true, projectId: '', projectName: '', taskId: '', taskSubject: '', activityId: '' },
    ],
    [t]
  );

  const displayPresets = presets.length > 0 ? presets : defaultPresets;

  const handleDeletePreset = async (e: React.MouseEvent, preset: TimeLogPreset) => {
    e.stopPropagation();
    const confirmed = await confirmDialog({
      message: `${t('deletePresetConfirmPrefix')} „${preset.name}“?`,
      variant: 'danger',
      confirmText: t('deleteBtn'),
      cancelText: t('cancelBtn'),
    });
    if (confirmed) {
      deletePreset(preset.id);
    }
  };

  const handleDragStart = (e: React.DragEvent, payload: DraggedCalendarEntry, key: string) => {
    e.dataTransfer.setData(CALENDAR_ENTRY_DRAG_MIME, key);
    e.dataTransfer.setData('text/plain', key);
    e.dataTransfer.effectAllowed = 'copy';
    onEntryDragStart?.(payload, key);
  };

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
  const stagedTotalHours = stagedEntries.reduce((sum, e) => sum + e.hours, 0);

  // Group entries by project
  const groupedByProject = useMemo(() => {
    const map = new Map<string, { totalHours: number; items: TimeEntry[] }>();
    entries.forEach((entry) => {
      const projName = entry.project?.name || t('generalNoProject');
      if (!map.has(projName)) {
        map.set(projName, { totalHours: 0, items: [] });
      }
      const group = map.get(projName)!;
      group.totalHours += entry.hours;
      group.items.push(entry);
    });
    return Array.from(map.entries());
  }, [entries, t]);

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconClock size={20} color="var(--mantine-color-blue-filled)" />
            <Text fw={600}>{formattedDate}</Text>
          </Group>
          <Group gap="xs">
            {stagedTotalHours > 0 && (
              <Badge size="lg" color="orange" variant="light" leftSection={<IconGitCommit size={13} />}>
                +{stagedTotalHours.toFixed(1)}h {t('stagedBadgeLabel')}
              </Badge>
            )}
            <Badge size="lg" color={totalHours >= 8 ? 'green' : 'blue'}>{totalHours.toFixed(1)}h {t('totalLabelSuffix')}</Badge>
          </Group>
        </Group>
      </Card.Section>

      <Stack gap="md" mt="md" style={{ flex: 1, overflowY: 'auto' }}>
        {/* Staged (Committed) Entries Section */}
        {stagedEntries.length > 0 && (
          <Paper
            withBorder
            radius="md"
            p="sm"
            style={{
              backgroundColor: 'var(--mantine-color-orange-light)',
              border: '1.5px dashed var(--mantine-color-orange-filled)',
            }}
          >
            <Group justify="space-between" mb="xs" wrap="wrap" gap="xs">
              <Group gap={6}>
                <IconGitCommit size={16} color="var(--mantine-color-orange-filled)" />
                <Text size="xs" fw={700} tt="uppercase" c="orange.8">
                  {t('stagedSectionTitle')} ({stagedEntries.length})
                </Text>
                <Badge size="xs" color="orange" variant="filled">
                  {stagedTotalHours.toFixed(1)}h
                </Badge>
              </Group>
              {onPushDay && (
                <Button
                  size="compact-xs"
                  color="orange"
                  leftSection={<IconCloudUpload size={14} />}
                  onClick={() => onPushDay(dateStr)}
                  loading={isPushing}
                >
                  {t('pushDayBtn')} ({stagedEntries.length})
                </Button>
              )}
            </Group>

            <Stack gap={6}>
              {stagedEntries.map((entry) => {
                const dragKey = `staged:${entry.localId}`;
                return (
                <Paper
                  key={entry.localId}
                  withBorder
                  p="6px 8px"
                  radius="sm"
                  bg="var(--mantine-color-body)"
                  draggable={!isPushing}
                  className={`calendar-draggable-entry${draggingEntryKey === dragKey ? ' is-dragging' : ''}`}
                  onDragStart={(e) => handleDragStart(e, { kind: 'staged', entry }, dragKey)}
                  onDragEnd={() => onEntryDragEnd?.()}
                >
                  <Group justify="space-between" align="center" wrap="nowrap" gap={6}>
                    <Tooltip label={t('dragEntryToCalendarHint')} openDelay={350}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          color: 'var(--mantine-color-dimmed)',
                          flexShrink: 0,
                          cursor: 'grab',
                        }}
                      >
                        <IconGripVertical size={14} />
                      </span>
                    </Tooltip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Group gap={6} align="center" wrap="nowrap">
                        <Badge variant="light" color="orange" size="xs" style={{ flexShrink: 0, textTransform: 'none' }}>
                          {entry.projectName}
                        </Badge>
                        {entry.issueId ? (
                          <RedmineIssueLink
                            issueId={entry.issueId}
                            subject={entry.issueSubject}
                            size="sm"
                            fw={600}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                        ) : (
                          <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>{t('generalEntryLabel')}</Text>
                        )}
                        {entry.activityName && (
                          <Badge variant="outline" color="gray" size="xs" style={{ flexShrink: 0, textTransform: 'none', height: 18, fontSize: 10 }}>
                            {entry.activityName}
                          </Badge>
                        )}
                        <Badge variant="filled" color="orange" size="xs" style={{ flexShrink: 0, height: 18, fontSize: 10 }}>
                          {entry.hours}h
                        </Badge>
                      </Group>

                      {entry.comments && (
                        <Text size="11px" c="dimmed" mt={2} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.2 }}>
                          {entry.comments}
                        </Text>
                      )}

                      {entry.statusId && (
                        <Text size="10px" c="orange.7" mt={2} fs="italic">
                          • {t('stagedStatusUpdateHint')}
                        </Text>
                      )}

                      {entry.lastError && (
                        <Alert icon={<IconAlertCircle size={12} />} color="red" p="4px 8px" mt={4} radius="xs">
                          <Text size="11px">{entry.lastError}</Text>
                        </Alert>
                      )}
                    </div>

                    <Group gap={2} style={{ flexShrink: 0, marginLeft: 6 }}>
                      {onPushStagedEntry && (
                        <Tooltip label={t('pushEntryTooltip')}>
                          <ActionIcon
                            variant="subtle"
                            size="22px"
                            color="green"
                            onClick={() => onPushStagedEntry(entry.localId)}
                            disabled={isPushing}
                            aria-label={t('pushEntryTooltip')}
                          >
                            <IconSend size={13} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {onEditStaged && (
                        <ActionIcon
                          variant="subtle"
                          size="22px"
                          onClick={() => onEditStaged(entry)}
                          disabled={isPushing}
                          aria-label={t('editEntryTooltip')}
                          title={t('editEntryTooltip')}
                        >
                          <IconEdit size={13} />
                        </ActionIcon>
                      )}
                      {onDeleteStaged && (
                        <ActionIcon
                          variant="subtle"
                          size="22px"
                          color="red"
                          onClick={() => onDeleteStaged(entry.localId)}
                          disabled={isPushing}
                          aria-label={t('deleteEntryTooltip')}
                          title={t('deleteEntryTooltip')}
                        >
                          <IconTrash size={13} />
                        </ActionIcon>
                      )}
                    </Group>
                  </Group>
                </Paper>
                );
              })}
            </Stack>
          </Paper>
        )}

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

        {entries.length === 0 && stagedEntries.length === 0 ? (
          <Text c="dimmed" ta="center" py="xl">{t('noTimeLoggedOnDay')}</Text>
        ) : entries.length === 0 ? null : (
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
                    {group.items.map((entry) => {
                      const dragKey = `pushed:${entry.id}`;
                      return (
                      <Paper
                        key={entry.id}
                        withBorder
                        p="6px 8px"
                        radius="sm"
                        draggable
                        className={`calendar-draggable-entry${draggingEntryKey === dragKey ? ' is-dragging' : ''}`}
                        onDragStart={(e) => handleDragStart(e, { kind: 'pushed', entry }, dragKey)}
                        onDragEnd={() => onEntryDragEnd?.()}
                      >
                        <Group justify="space-between" align="center" wrap="nowrap" gap={6}>
                          <Tooltip label={t('dragEntryToCalendarHint')} openDelay={350}>
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                color: 'var(--mantine-color-dimmed)',
                                flexShrink: 0,
                                cursor: 'grab',
                              }}
                            >
                              <IconGripVertical size={14} />
                            </span>
                          </Tooltip>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Group gap={6} align="center" wrap="nowrap">
                              {entry.issue?.id ? (
                                <RedmineIssueLink
                                  issueId={entry.issue.id}
                                  subject={entry.issue.subject}
                                  size="sm"
                                  fw={600}
                                  style={{ flex: 1, minWidth: 0 }}
                                />
                              ) : (
                                <Text size="sm" c="dimmed" truncate style={{ flex: 1 }}>{t('generalEntryLabel')}</Text>
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
                            {onCopy && (
                              <ActionIcon variant="subtle" size="20px" color="blue" onClick={() => onCopy(entry)} aria-label={t('copyEntryTooltip')} title={t('copyEntryTooltip')}>
                                <IconCopy size={13} />
                              </ActionIcon>
                            )}
                            <ActionIcon variant="subtle" size="20px" onClick={() => onEdit(entry)} aria-label={t('editEntryTooltip')} title={t('editEntryTooltip')}>
                              <IconEdit size={13} />
                            </ActionIcon>
                            <ActionIcon variant="subtle" size="20px" color="red" onClick={() => onDelete(entry.id)} aria-label={t('deleteEntryTooltip')} title={t('deleteEntryTooltip')}>
                              <IconTrash size={13} />
                            </ActionIcon>
                          </Group>
                        </Group>
                      </Paper>
                      );
                    })}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        )}

        {/* Presets Section */}
        <Paper withBorder radius="md" p="xs" bg="var(--mantine-color-default)">
          <Group justify="space-between" align="center" mb={6} wrap="wrap" gap={4}>
            <Group gap={6} wrap="nowrap">
              <IconBolt size={15} color="var(--mantine-color-orange-filled)" />
              <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                {t('presetsDivider')}
              </Text>
            </Group>
            <Text size="11px" c="dimmed">
              {t('dayPresetsClickHint')}
            </Text>
          </Group>

          <Group gap={6} wrap="wrap">
            {displayPresets.map((preset) => {
              const isUserSaved = presets.some((p) => p.id === preset.id);
              const canQuickCommit = Boolean((preset.projectId || preset.taskId) && preset.activityId && preset.hours > 0);
              const metaText = [preset.projectName, preset.taskId ? `#${preset.taskId}` : '', preset.comments]
                .filter(Boolean)
                .join(' • ');

              return (
                <Paper
                  key={preset.id}
                  withBorder
                  px={8}
                  py={5}
                  radius="sm"
                  bg="var(--mantine-color-body)"
                  style={{ cursor: 'pointer' }}
                  onClick={() => onApplyPreset?.(dateStr, preset)}
                >
                  <Group gap={6} wrap="nowrap">
                    <IconBolt size={13} color="var(--mantine-color-orange-filled)" style={{ flexShrink: 0 }} />
                    <Stack gap={0} style={{ minWidth: 0 }}>
                      <Group gap={4} wrap="nowrap">
                        <Text size="xs" fw={600} truncate maw={180}>
                          {preset.name}
                        </Text>
                        <Badge size="xs" variant="light" color="blue" style={{ height: 16, fontSize: 10, flexShrink: 0 }}>
                          {preset.hours}h
                        </Badge>
                      </Group>
                      {metaText && (
                        <Text size="10px" c="dimmed" truncate maw={220}>
                          {metaText}
                        </Text>
                      )}
                    </Stack>

                    <Group gap={2} wrap="nowrap" style={{ flexShrink: 0 }}>
                      {canQuickCommit && onQuickCommitPreset && (
                        <Tooltip label={t('presetQuickCommitTooltip')}>
                          <ActionIcon
                            size="20px"
                            variant="light"
                            color="orange"
                            disabled={isPushing}
                            onClick={(e) => {
                              e.stopPropagation();
                              onQuickCommitPreset(dateStr, preset);
                            }}
                            aria-label={t('presetQuickCommitTooltip')}
                          >
                            <IconGitCommit size={13} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                      {isUserSaved && (
                        <Tooltip label={t('deletePresetTooltip')}>
                          <ActionIcon
                            size="20px"
                            variant="subtle"
                            color="red"
                            onClick={(e) => handleDeletePreset(e, preset)}
                            aria-label={t('deletePresetTooltip')}
                          >
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>
                </Paper>
              );
            })}
          </Group>
        </Paper>

        <Group justify="space-between" mt="auto" pt="md">
          <Button variant="default" onClick={onClose}>
            {t('closeBtn')}
          </Button>
          <Button leftSection={<IconPlus size={16} />} onClick={() => onAdd(dateStr)}>
            {t('logTimeHereBtn')}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
