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
/// Card component displaying a single note with labels, metadata, pinning, actions, and formatted rich text.
/// </summary>
export const NoteCard: React.FC<NoteCardProps> = ({
  note,
  onEdit,
  onDelete,
  onTogglePin,
  onSelectLabel,
}) => {
  return (
    <Paper
      withBorder
      p="md"
      radius="md"
      bg="var(--mantine-color-default)"
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        height: '100%',
        borderColor: note.pinned ? 'var(--mantine-color-blue-filled)' : undefined,
      }}
    >
      <Stack gap="xs" style={{ flex: 1 }}>
        {/* Header: Title or Task link + Pin and Actions */}
        <Group justify="space-between" align="flex-start" wrap="nowrap">
          <Box style={{ flex: 1, minWidth: 0 }}>
            {note.taskId ? (
              <Group gap={6} align="center" wrap="wrap" mb={4}>
                <Badge
                  size="sm"
                  variant="filled"
                  color="blue"
                  leftSection={<IconNotes size={12} />}
                >
                  Task #{note.taskId}
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

          <Group gap={4} wrap="nowrap">
            {onTogglePin && (
              <Tooltip label={note.pinned ? 'Unpin note' : 'Pin note to top'}>
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

            <ActionIcon
              variant="subtle"
              color="blue"
              size="sm"
              onClick={() => onEdit(note)}
              title="Edit note"
              aria-label="Edit note"
            >
              <IconEdit size={16} />
            </ActionIcon>

            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={() => onDelete(note.id)}
              title="Delete note"
              aria-label="Delete note"
            >
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Note Content Viewer */}
        <Box style={{ flex: 1 }}>
          <RichTextNoteViewer content={note.content} maxHeight={220} />
        </Box>
      </Stack>

      {/* Footer: Labels & Timestamp */}
      <Stack gap={6} mt="sm">
        {note.labels && note.labels.length > 0 && (
          <Group gap={6} wrap="wrap">
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

        <Text size="xs" c="dimmed">
          Updated: {new Date(note.updatedAt).toLocaleDateString()} {new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </Stack>
    </Paper>
  );
};
