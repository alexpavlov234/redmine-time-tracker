import React, { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Group,
  Stack,
  TextInput,
  TagsInput,
  Switch,
  SegmentedControl,
  Text,
} from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { RichTextNoteEditor } from '../../../components/common/RichTextNoteEditor';
import { useTaskNotes } from '../../../hooks/useTaskNotes';
import type { NoteItem } from '../../../types';

/// <summary>
/// Properties for configuring the NoteEditModal component.
/// </summary>
export interface NoteEditModalProps {
  /// <summary>Whether the modal is visible.</summary>
  isOpen: boolean;
  /// <summary>Callback to dismiss the modal.</summary>
  onClose: () => void;
  /// <summary>The note item being edited, or null for creating a new note.</summary>
  note: NoteItem | null;
  /// <summary>Pre-filled task ID if creating note in the context of a task.</summary>
  defaultTaskId?: string;
  /// <summary>Pre-filled task subject if available.</summary>
  defaultTaskSubject?: string;
}

/// <summary>
/// Modal dialog for creating and editing general and task-linked notes with titles, labels, pinning, and rich content.
/// </summary>
export const NoteEditModal: React.FC<NoteEditModalProps> = ({
  isOpen,
  onClose,
  note,
  defaultTaskId,
  defaultTaskSubject,
}) => {
  const { saveNoteItem, allLabels } = useTaskNotes();

  const [noteType, setNoteType] = useState<'general' | 'task'>('general');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [taskId, setTaskId] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (note) {
        setTitle(note.title || '');
        setContent(note.content || '');
        setLabels(note.labels || []);
        setTaskId(note.taskId || '');
        setTaskSubject(note.taskSubject || '');
        setPinned(note.pinned || false);
        setNoteType(note.taskId ? 'task' : 'general');
      } else {
        setTitle('');
        setContent('');
        setLabels(defaultTaskId ? ['task'] : ['general']);
        setTaskId(defaultTaskId || '');
        setTaskSubject(defaultTaskSubject || '');
        setPinned(false);
        setNoteType(defaultTaskId ? 'task' : 'general');
      }
    }
  }, [isOpen, note, defaultTaskId, defaultTaskSubject]);

  /// <summary>
  /// Handles submitting the note data to persistent storage.
  /// </summary>
  const handleSave = () => {
    if (!content.trim()) return;

    const isTask = noteType === 'task';
    const cleanTaskId = isTask && taskId ? taskId.replace(/^#/, '').trim() : null;

    saveNoteItem({
      id: note?.id,
      title: title.trim() || undefined,
      content,
      labels,
      taskId: cleanTaskId,
      taskSubject: isTask ? taskSubject.trim() || null : null,
      pinned,
    });

    onClose();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Text fw={600} size="md">
          {note ? 'Edit Note' : 'Create Note'}
        </Text>
      }
      size="calc(100vw - 32px)"
      centered
      styles={{
        content: { maxWidth: '100%' },
        body: { maxHeight: '88vh', overflowY: 'auto', padding: '20px 24px' },
      }}
    >
      <Stack gap="md">
        <SegmentedControl
          value={noteType}
          onChange={(val) => setNoteType(val as 'general' | 'task')}
          data={[
            { label: 'General Note', value: 'general' },
            { label: 'Task-Connected Note', value: 'task' },
          ]}
        />

        {noteType === 'task' && (
          <Group grow align="flex-start">
            <TextInput
              label="Task ID / Issue #"
              placeholder="e.g. 12345"
              value={taskId}
              onChange={(e) => setTaskId(e.currentTarget.value)}
              required
            />
            <TextInput
              label="Task Subject (Optional)"
              placeholder="e.g. Bugfix for login form"
              value={taskSubject}
              onChange={(e) => setTaskSubject(e.currentTarget.value)}
            />
          </Group>
        )}

        <TextInput
          label="Title (Optional)"
          placeholder="e.g. Daily Standup Ideas, Architecture Notes"
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
        />

        <TagsInput
          label="Labels"
          placeholder="Type label and press Enter"
          data={allLabels}
          value={labels}
          onChange={setLabels}
          clearable
        />

        <Switch
          label="Pin this note to the top"
          checked={pinned}
          onChange={(e) => setPinned(e.currentTarget.checked)}
        />

        <RichTextNoteEditor
          label="Note Content"
          value={content}
          onChange={setContent}
          minHeight={200}
        />

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            leftSection={<IconDeviceFloppy size={16} />}
            onClick={handleSave}
            disabled={!content.trim()}
          >
            Save Note
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
