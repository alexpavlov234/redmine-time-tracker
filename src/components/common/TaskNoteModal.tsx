import React, { useState } from 'react';
import {
  Modal,
  Button,
  Group,
  Stack,
  Text,
  Anchor,
  Paper,
  Badge,
  TextInput,
  TagsInput,
  ActionIcon,
  Box,
  Divider,
} from '@mantine/core';
import {
  IconNotes,
  IconExternalLink,
  IconTrash,
  IconDeviceFloppy,
  IconPlus,
  IconEdit,
  IconX,
  IconTag,
} from '@tabler/icons-react';
import { useSettings } from '../../contexts/SettingsContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { useTaskNotes } from '../../hooks/useTaskNotes';
import { RichTextNoteEditor, RichTextNoteViewer } from './RichTextNoteEditor';
import type { NoteItem } from '../../types';

/// <summary>
/// Properties for configuring the TaskNoteModal dialog.
/// </summary>
export interface TaskNoteModalProps {
  /// <summary>Whether the modal dialog is currently visible.</summary>
  isOpen: boolean;
  /// <summary>Callback invoked to dismiss the modal dialog.</summary>
  onClose: () => void;
  /// <summary>Identifier of the Redmine task / issue.</summary>
  taskId: number | string | null | undefined;
  /// <summary>Optional human-readable subject of the task.</summary>
  taskSubject?: string;
  /// <summary>Optional callback invoked after saving or updating a note.</summary>
  onSaved?: (primaryNote: string) => void;
}

/// <summary>
/// Modal dialog allowing users to view, add, edit, and label multiple notes connected to a specific task.
/// </summary>
export const TaskNoteModal: React.FC<TaskNoteModalProps> = ({
  isOpen,
  onClose,
  taskId,
  taskSubject,
  onSaved,
}) => {
  const { redmineUrl } = useSettings();
  const confirm = useConfirm();
  const { getNotes, saveNoteItem, deleteNoteItem, allLabels } = useTaskNotes();

  const cleanTaskId = taskId ? String(taskId).replace(/^#/, '').trim() : '';
  const notes = getNotes(cleanTaskId);

  // Form / Editor state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [labels, setLabels] = useState<string[]>([]);

  /// <summary>
  /// Opens the form to create a new note for this task.
  /// </summary>
  const handleAddNew = () => {
    setEditingNoteId(null);
    setTitle('');
    setContent('');
    setLabels(['task']);
    setIsEditorOpen(true);
  };

  /// <summary>
  /// Populates the editor to modify an existing note.
  /// </summary>
  const handleEditNote = (note: NoteItem) => {
    setEditingNoteId(note.id);
    setTitle(note.title || '');
    setContent(note.content);
    setLabels(note.labels || []);
    setIsEditorOpen(true);
  };

  /// <summary>
  /// Dismisses and resets the inline editor.
  /// </summary>
  const handleCancelEditor = () => {
    setIsEditorOpen(false);
    setEditingNoteId(null);
    setTitle('');
    setContent('');
    setLabels([]);
  };

  /// <summary>
  /// Saves the active note item and closes the inline editor.
  /// </summary>
  const handleSave = () => {
    if (!content.trim()) return;

    saveNoteItem({
      id: editingNoteId || undefined,
      taskId: cleanTaskId,
      taskSubject: taskSubject || null,
      title: title.trim() || undefined,
      content,
      labels,
    });

    handleCancelEditor();
    onSaved?.(content.trim());
  };

  /// <summary>
  /// Deletes a specific note after user confirmation.
  /// </summary>
  const handleDeleteNote = async (noteId: string) => {
    const isConfirmed = await confirm({
      message: 'Are you sure you want to delete this note?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      variant: 'danger',
    });

    if (isConfirmed) {
      deleteNoteItem(noteId);
      if (editingNoteId === noteId) {
        handleCancelEditor();
      }
    }
  };

  if (!cleanTaskId) return null;

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconNotes size={20} color="var(--mantine-color-blue-filled)" />
          <Text fw={600} size="md">
            #{cleanTaskId} Notes ({notes.length})
          </Text>
        </Group>
      }
      size="calc(100vw - 32px)"
      centered
      styles={{
        content: { maxWidth: '100%' },
        body: { maxHeight: '88vh', overflowY: 'auto', padding: '20px 24px' },
      }}
    >
      <Stack gap="md">
        {/* Task Header & Redmine Link */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Text size="sm" fw={500} lineClamp={2} style={{ flex: 1 }}>
            {taskSubject || `Redmine Task #${cleanTaskId}`}
          </Text>
          {redmineUrl && (
            <Anchor
              href={`${redmineUrl}/issues/${cleanTaskId}`}
              target="_blank"
              size="xs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              Open in Redmine <IconExternalLink size={12} />
            </Anchor>
          )}
        </Group>

        {/* Add Note Button */}
        {!isEditorOpen && (
          <Button
            leftSection={<IconPlus size={16} />}
            variant="light"
            color="blue"
            size="sm"
            onClick={handleAddNew}
          >
            Add New Note
          </Button>
        )}

        {/* Note Editor */}
        {isEditorOpen && (
          <Paper withBorder p="md" radius="md" bg="var(--mantine-color-default)">
            <Stack gap="sm">
              <Group justify="space-between" align="center">
                <Text fw={600} size="sm">
                  {editingNoteId ? 'Edit Note' : 'New Task Note'}
                </Text>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={handleCancelEditor}>
                  <IconX size={16} />
                </ActionIcon>
              </Group>

              <TextInput
                label="Note Title (Optional)"
                placeholder="e.g. Investigation findings, Meeting remarks"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
                size="sm"
              />

              <TagsInput
                label="Labels"
                placeholder="Enter tags and press Enter"
                data={allLabels}
                value={labels}
                onChange={setLabels}
                clearable
                size="sm"
              />

              <RichTextNoteEditor
                label="Note Content"
                value={content}
                onChange={setContent}
                minHeight={150}
              />

              <Group justify="flex-end" gap="xs" mt="xs">
                <Button variant="default" size="sm" onClick={handleCancelEditor}>
                  Cancel
                </Button>
                <Button
                  variant="filled"
                  color="blue"
                  size="sm"
                  leftSection={<IconDeviceFloppy size={16} />}
                  onClick={handleSave}
                  disabled={!content.trim()}
                >
                  Save Note
                </Button>
              </Group>
            </Stack>
          </Paper>
        )}

        <Divider label="Existing Notes" labelPosition="left" />

        {/* List of existing notes */}
        {notes.length === 0 ? (
          <Paper p="xl" withBorder radius="md" bg="var(--mantine-color-default)">
            <Text c="dimmed" size="sm" ta="center">
              No notes for this task yet. Click &quot;Add New Note&quot; to write one.
            </Text>
          </Paper>
        ) : (
          <Stack gap="sm">
            {notes.map((note) => (
              <Paper key={note.id} withBorder p="md" radius="md" bg="var(--mantine-color-default)">
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Box style={{ flex: 1, minWidth: 0 }}>
                      {note.title && (
                        <Text fw={600} size="sm" mb={4}>
                          {note.title}
                        </Text>
                      )}
                      <Group gap={6} wrap="wrap">
                        {note.labels?.map((label) => (
                          <Badge
                            key={label}
                            size="xs"
                            variant="light"
                            color="blue"
                            leftSection={<IconTag size={10} />}
                          >
                            {label}
                          </Badge>
                        ))}
                        <Text size="xs" c="dimmed">
                          {new Date(note.updatedAt).toLocaleString()}
                        </Text>
                      </Group>
                    </Box>

                    <Group gap={4} wrap="nowrap">
                      <ActionIcon
                        variant="subtle"
                        color="blue"
                        size="sm"
                        onClick={() => handleEditNote(note)}
                        title="Edit note"
                      >
                        <IconEdit size={16} />
                      </ActionIcon>
                      <ActionIcon
                        variant="subtle"
                        color="red"
                        size="sm"
                        onClick={() => handleDeleteNote(note.id)}
                        title="Delete note"
                      >
                        <IconTrash size={16} />
                      </ActionIcon>
                    </Group>
                  </Group>

                  <RichTextNoteViewer content={note.content} maxHeight={300} />
                </Stack>
              </Paper>
            ))}
          </Stack>
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="default" size="sm" onClick={onClose}>
            Close
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
