import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Stack,
  Group,
  Title,
  Text,
  Button,
  ActionIcon,
  Checkbox,
  TextInput,
  SimpleGrid,
  Paper,
  Tooltip,
  Badge,
  Box,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconPlus,
  IconTrash,
  IconEdit,
  IconCheck,
  IconX,
  IconNote,
} from '@tabler/icons-react';
import { usePersonalTasks } from '../../../hooks/usePersonalTasks';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import {
  RichTextNoteEditor,
  RichTextNoteViewer,
} from '../../../components/common/RichTextNoteEditor';
import type { PersonalTaskStickyNote } from '../../../types';

/// <summary>
/// Full-page view for a single personal task, featuring inline title editing,
/// completion toggle, and rich-text sticky notes that switch to RichTextNoteEditor on click.
/// </summary>
export const PersonalTaskDetailView: React.FC = () => {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t, language } = useLanguage();

  const {
    tasks,
    toggleComplete,
    updateTask,
    deleteTask,
    addStickyNote,
    updateStickyNote,
    deleteStickyNote,
  } = usePersonalTasks();

  const task = tasks.find((item) => item.id === taskId);

  // Task title inline editing state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  // New sticky note composer state
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');

  // Sticky note inline editing state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteTitle, setEditNoteTitle] = useState('');
  const [editNoteContent, setEditNoteContent] = useState('');

  if (!task) {
    return (
      <Stack align="center" gap="md" py="xl">
        <Text size="lg" fw={600}>{t('taskNotFound')}</Text>
        <Button
          leftSection={<IconArrowLeft size={16} />}
          variant="light"
          onClick={() => navigate('/tasks')}
        >
          {t('backToTasksBtn')}
        </Button>
      </Stack>
    );
  }

  /// <summary>
  /// Starts inline editing of the task title.
  /// </summary>
  const startEditingTitle = () => {
    setTitleDraft(task.title);
    setIsEditingTitle(true);
  };

  /// <summary>
  /// Commits the edited task title.
  /// </summary>
  const saveTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed) {
      updateTask(task.id, { title: trimmed });
    }
    setIsEditingTitle(false);
  };

  /// <summary>
  /// Confirms and deletes the entire personal task, returning to the tasks list.
  /// </summary>
  const handleDeleteTask = async () => {
    const ok = await confirm({
      message: t('deletePersonalTaskConfirm'),
      confirmText: t('confirmBtn'),
      variant: 'danger',
    });
    if (ok) {
      deleteTask(task.id);
      navigate('/tasks');
    }
  };

  /// <summary>
  /// Adds a new rich-text sticky note to the current task.
  /// </summary>
  const handleCreateNote = () => {
    if (!newNoteTitle.trim() && !newNoteContent.trim()) return;
    addStickyNote(task.id, {
      title: newNoteTitle.trim(),
      content: newNoteContent.trim(),
    });
    setNewNoteTitle('');
    setNewNoteContent('');
    setIsAddingNote(false);
  };

  /// <summary>
  /// Opens a sticky note in inline RichTextNoteEditor mode.
  /// </summary>
  const startEditingNote = (note: PersonalTaskStickyNote) => {
    setEditingNoteId(note.id);
    setEditNoteTitle(note.title || '');
    setEditNoteContent(note.content || '');
  };

  /// <summary>
  /// Saves edits to the currently active sticky note.
  /// </summary>
  const handleSaveNoteEdit = (noteId: string) => {
    updateStickyNote(task.id, noteId, {
      title: editNoteTitle.trim(),
      content: editNoteContent.trim(),
    });
    setEditingNoteId(null);
  };

  /// <summary>
  /// Confirms and deletes a sticky note from the task.
  /// </summary>
  const handleDeleteNote = async (noteId: string) => {
    const ok = await confirm({
      message: t('deleteStickyConfirm'),
      confirmText: t('confirmBtn'),
      variant: 'danger',
    });
    if (ok) {
      deleteStickyNote(task.id, noteId);
    }
  };

  const locale = language === 'bg' ? 'bg-BG' : 'en-US';

  return (
    <Stack gap="lg">
      {/* Top bar: Back button + Task actions */}
      <Group justify="space-between" align="center">
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={18} />}
          onClick={() => navigate('/tasks')}
          px="xs"
        >
          {t('backToTasksBtn')}
        </Button>

        <Button
          variant="subtle"
          color="red"
          size="xs"
          leftSection={<IconTrash size={14} />}
          onClick={handleDeleteTask}
        >
          {t('deleteBtnTooltip')}
        </Button>
      </Group>

      {/* Task Header Card */}
      <Paper withBorder p="md" radius="md" bg="var(--mantine-color-default)">
        <Group align="center" gap="md" wrap="nowrap">
          <Checkbox
            size="lg"
            checked={task.completed}
            onChange={() => toggleComplete(task.id)}
            color="teal"
          />

          {isEditingTitle ? (
            <Group gap="xs" style={{ flex: 1 }} wrap="nowrap">
              <TextInput
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.currentTarget.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') setIsEditingTitle(false);
                }}
                size="md"
                style={{ flex: 1 }}
                autoFocus
              />
              <ActionIcon color="teal" variant="filled" size="lg" onClick={saveTitle}>
                <IconCheck size={18} />
              </ActionIcon>
              <ActionIcon
                color="gray"
                variant="subtle"
                size="lg"
                onClick={() => setIsEditingTitle(false)}
              >
                <IconX size={18} />
              </ActionIcon>
            </Group>
          ) : (
            <Group gap="xs" style={{ flex: 1 }} align="center">
              <Title
                order={3}
                style={{
                  textDecoration: task.completed ? 'line-through' : 'none',
                  opacity: task.completed ? 0.6 : 1,
                  cursor: 'pointer',
                  wordBreak: 'break-word',
                }}
                onClick={startEditingTitle}
              >
                {task.title}
              </Title>
              <Tooltip label={t('editNoteTooltip')}>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="sm"
                  onClick={startEditingTitle}
                >
                  <IconEdit size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
          )}
        </Group>
      </Paper>

      {/* Sticky Notes Section Header */}
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={4}>{t('stickyNotesHeading')}</Title>
          {task.stickyNotes.length > 0 && (
            <Badge variant="light" color="blue" size="md">
              {task.stickyNotes.length}
            </Badge>
          )}
        </Group>

        {!isAddingNote && (
          <Button
            leftSection={<IconPlus size={16} />}
            size="sm"
            onClick={() => setIsAddingNote(true)}
          >
            {t('newStickyNoteBtn')}
          </Button>
        )}
      </Group>

      {/* New Sticky Note Composer (with RichTextNoteEditor) */}
      {isAddingNote && (
        <Paper
          withBorder
          p="md"
          radius="md"
          className="sticky-note-card"
        >
          <Stack gap="sm">
            <TextInput
              placeholder={t('stickyNoteTitlePlaceholder')}
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.currentTarget.value)}
              styles={{
                input: {
                  fontWeight: 600,
                },
              }}
            />
            <RichTextNoteEditor
              value={newNoteContent}
              onChange={setNewNoteContent}
              minHeight={160}
              autoFocus
            />
            <Group justify="flex-end" align="center" gap="xs">
              <Button
                variant="default"
                size="xs"
                onClick={() => {
                  setIsAddingNote(false);
                  setNewNoteTitle('');
                  setNewNoteContent('');
                }}
              >
                {t('cancelBtn')}
              </Button>
              <Button
                size="xs"
                leftSection={<IconCheck size={14} />}
                onClick={handleCreateNote}
                disabled={!newNoteTitle.trim() && !newNoteContent.trim()}
              >
                {t('saveNoteBtn')}
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      {/* Sticky Notes Grid */}
      {task.stickyNotes.length === 0 && !isAddingNote ? (
        <Paper withBorder p="xl" radius="md" ta="center" bg="var(--mantine-color-default)">
          <Stack align="center" gap="sm" py="md">
            <IconNote size={36} color="var(--mantine-color-gray-5)" />
            <Text fw={500} c="dimmed">
              {t('noStickyNotesEmpty')}
            </Text>
            <Button
              variant="light"
              size="sm"
              leftSection={<IconPlus size={16} />}
              onClick={() => setIsAddingNote(true)}
            >
              {t('addFirstStickyBtn')}
            </Button>
          </Stack>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {task.stickyNotes.map((note) => {
            const isEditing = editingNoteId === note.id;

            return (
              <Paper
                key={note.id}
                withBorder
                p="md"
                radius="md"
                className="sticky-note-card"
                style={{
                  minHeight: 170,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  cursor: isEditing ? 'default' : 'pointer',
                  gridColumn: isEditing ? '1 / -1' : undefined,
                }}
                onClick={() => {
                  if (!isEditing) startEditingNote(note);
                }}
              >
                {isEditing ? (
                  <Stack gap="sm" style={{ flex: 1 }} onClick={(e) => e.stopPropagation()}>
                    <TextInput
                      placeholder={t('stickyNoteTitlePlaceholder')}
                      value={editNoteTitle}
                      onChange={(e) => setEditNoteTitle(e.currentTarget.value)}
                      size="sm"
                      styles={{ input: { fontWeight: 600 } }}
                    />
                    <RichTextNoteEditor
                      value={editNoteContent}
                      onChange={setEditNoteContent}
                      minHeight={160}
                      autoFocus
                    />
                    <Group justify="flex-end" align="center" mt="xs" gap="xs">
                      <Button
                        variant="default"
                        size="xs"
                        onClick={() => setEditingNoteId(null)}
                      >
                        {t('cancelBtn')}
                      </Button>
                      <Button
                        size="xs"
                        leftSection={<IconCheck size={14} />}
                        onClick={() => handleSaveNoteEdit(note.id)}
                      >
                        {t('saveChangesBtn')}
                      </Button>
                    </Group>
                  </Stack>
                ) : (
                  <>
                    <Stack gap="xs" style={{ flex: 1 }}>
                      <Group justify="space-between" align="flex-start" wrap="nowrap">
                        <Text
                          fw={600}
                          size="md"
                          style={{ wordBreak: 'break-word', flex: 1 }}
                        >
                          {note.title || ''}
                        </Text>
                        <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                          <Tooltip label={t('editNoteTooltip')}>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="sm"
                              onClick={() => startEditingNote(note)}
                            >
                              <IconEdit size={15} />
                            </ActionIcon>
                          </Tooltip>
                          <Tooltip label={t('deleteNoteTooltip')}>
                            <ActionIcon
                              variant="subtle"
                              color="red"
                              size="sm"
                              onClick={() => handleDeleteNote(note.id)}
                            >
                              <IconTrash size={15} />
                            </ActionIcon>
                          </Tooltip>
                        </Group>
                      </Group>

                      <Box style={{ flex: 1 }}>
                        <RichTextNoteViewer content={note.content} />
                      </Box>
                    </Stack>

                    <Group
                      justify="flex-end"
                      align="center"
                      mt="sm"
                      pt="xs"
                      style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}
                    >
                      <Text size="xs" c="dimmed">
                        {new Date(note.updatedAt).toLocaleString(locale, {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                    </Group>
                  </>
                )}
              </Paper>
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
};
