import React from 'react';
import {
  Paper,
  Stack,
  Group,
  Text,
  Badge,
  ActionIcon,
  Box,
  Tooltip,
} from '@mantine/core';
import {
  IconPin,
  IconPinFilled,
  IconEdit,
  IconTrash,
  IconTag,
  IconNotes,
} from '@tabler/icons-react';
import { RichTextNoteViewer } from '../../../components/common/RichTextNoteEditor';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { NoteItem } from '../../../types';

/// <summary>
/// Properties for configuring the NoteCard component.
/// </summary>
export interface NoteCardProps {
  /// <summary>The note item data model.</summary>
  note: NoteItem;
  /// <summary>Callback to trigger editing this note.</summary>
  onEdit: (note: NoteItem) => void;
  /// <summary>Callback to delete this note.</summary>
  onDelete: (noteId: string) => void;
  /// <summary>Callback to toggle pin status on this note.</summary>
  onTogglePin?: (note: NoteItem) => void;
  /// <summary>Callback when clicking a label tag to filter by it.</summary>
  onSelectLabel?: (label: string) => void;
}

/// <summary>
/// Card component displaying a single note with labels, pinning, actions, and formatted rich text.
/// Clicking the card opens the rich text editor.
/// </summary>
export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onEdit,
  onDelete,
  onTogglePin,
  onSelectLabel,
}) => {
  const { language, t } = useLanguage();
  const locale = language === 'bg' ? 'bg-BG' : 'en-US';

  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      className="sticky-note-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        cursor: 'pointer',
        borderColor: note.pinned ? 'var(--mantine-color-blue-filled)' : undefined,
      }}
      onClick={() => onEdit(note)}
    >
      <Stack gap="xs" style={{ flex: 1 }}>
        {/* Header: Title or Task link + Pin and Actions */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
            {note.taskId ? (
              <Group gap={6} align="center" wrap="wrap" mb={4} onClick={(e) => e.stopPropagation()}>
                <Badge
                  size="sm"
                  variant="filled"
                  color="blue"
                  leftSection={<IconNotes size={12} />}
                >
                  #{note.taskId}
                </Badge>
                <RedmineIssueLink
                  issueId={note.taskId}
                  subject={note.taskSubject || undefined}
                  size="sm"
                  fw={600}
                />
              </Group>
            ) : null}

            {note.title && (
              <Text fw={600} size="md" lineClamp={2}>
                {note.title}
              </Text>
            )}
          </Box>

          <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
            {onTogglePin && (
              <Tooltip label={note.pinned ? 'Unpin' : 'Pin'}>
                <ActionIcon
                  variant="subtle"
                  color={note.pinned ? 'blue' : 'gray'}
                  size="sm"
                  onClick={() => onTogglePin(note)}
                  aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                >
                  {note.pinned ? <IconPinFilled size={16} /> : <IconPin size={16} />}
                </ActionIcon>
              </Tooltip>
            )}

            <Tooltip label={t('editNoteTooltip')}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => onEdit(note)}
                aria-label={t('editNoteTooltip')}
              >
                <IconEdit size={16} />
              </ActionIcon>
            </Tooltip>

            <Tooltip label={t('deleteNoteTooltip')}>
              <ActionIcon
                variant="subtle"
                color="red"
                size="sm"
                onClick={() => onDelete(note.id)}
                aria-label={t('deleteNoteTooltip')}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Note Content Viewer */}
        <Box style={{ flex: 1 }}>
          <RichTextNoteViewer content={note.content} maxHeight={220} />
        </Box>
      </Stack>

      {/* Footer: Labels & Timestamp */}
      <Stack gap={6} mt="sm" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        {note.labels && note.labels.length > 0 && (
          <Group gap={6} wrap="wrap" onClick={(e) => e.stopPropagation()}>
            {note.labels.map((lbl) => (
              <Badge
                key={lbl}
                size="xs"
                variant="light"
                color="indigo"
                leftSection={<IconTag size={10} />}
                style={{ cursor: onSelectLabel ? 'pointer' : 'default' }}
                onClick={() => onSelectLabel?.(lbl)}
              >
                {lbl}
              </Badge>
            ))}
          </Group>
        )}

        <Text size="xs" c="dimmed" ta="right">
          {new Date(note.updatedAt).toLocaleString(locale, {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </Stack>
    </Paper>
  );
};
