import React, { useState, useEffect } from 'react';
import {
  Modal,
  TextInput,
  Select,
  Button,
  Group,
  Stack,
  Text,
  ActionIcon,
  Divider,
} from '@mantine/core';
import { IconPlus, IconTrash, IconListCheck, IconCalendar } from '@tabler/icons-react';
import { DatePickerInput } from '@mantine/dates';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';
import { RichTextNoteEditor } from '../../../components/common/RichTextNoteEditor';
import type { PersonalTask, PersonalTaskPriority, RedmineIssue } from '../../../types';

/// <summary>
/// Properties for configuring the CreatePersonalTaskModal dialog.
/// </summary>
export interface CreatePersonalTaskModalProps {
  /// <summary>Whether the modal dialog is currently visible.</summary>
  isOpen: boolean;
  /// <summary>Callback invoked to dismiss the modal dialog.</summary>
  onClose: () => void;
  /// <summary>Callback invoked when a new task is created.</summary>
  onCreate: (taskData: {
    title: string;
    notes?: string;
    priority?: PersonalTaskPriority;
    status?: import('../../../types').PersonalTaskStatus;
    dueDate?: string;
    redmineIssueId?: string;
    redmineIssueSubject?: string;
    redmineProjectId?: string;
    redmineProjectName?: string;
    checklist?: string[];
  }) => Promise<unknown> | void;
  /// <summary>Optional task to edit if in edit mode.</summary>
  initialTask?: PersonalTask | null;
  /// <summary>Callback invoked when updating an existing task.</summary>
  onUpdate?: (id: string, updates: Partial<PersonalTask>) => Promise<void>;
}

/// <summary>
/// Modal dialog for creating and editing personal queue tasks with checklists, priorities,
/// rich text notes with code fragments, and Redmine project/issue search linkage.
/// </summary>
export const CreatePersonalTaskModal: React.FC<CreatePersonalTaskModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  initialTask,
  onUpdate,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<PersonalTaskPriority>('medium');
  const [status, setStatus] = useState<import('../../../types').PersonalTaskStatus>('not_started');
  const [dueDate, setDueDate] = useState('');
  const [linkedProjectId, setLinkedProjectId] = useState<string>('');
  const [linkedTaskId, setLinkedTaskId] = useState<string>('');
  const [linkedIssue, setLinkedIssue] = useState<RedmineIssue | null>(null);
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (initialTask) {
        setTitle(initialTask.title);
        setNotes(initialTask.notes || '');
        setPriority(initialTask.priority);
        setStatus(initialTask.status || (initialTask.completed ? 'completed' : 'not_started'));
        setDueDate(initialTask.dueDate || '');
        setLinkedProjectId(initialTask.redmineProjectId || '');
        setLinkedTaskId(initialTask.redmineIssueId || '');
        setLinkedIssue(null);
        setChecklistItems(initialTask.checklist.map((c) => c.text));
      } else {
        setTitle('');
        setNotes('');
        setPriority('medium');
        setStatus('not_started');
        setDueDate('');
        setLinkedProjectId('');
        setLinkedTaskId('');
        setLinkedIssue(null);
        setChecklistItems([]);
      }
      setNewChecklistText('');
    }
  }, [isOpen, initialTask]);

  /// <summary>
  /// Adds a new checklist string item to the pending list.
  /// </summary>
  const handleAddChecklistItem = () => {
    if (!newChecklistText.trim()) return;
    setChecklistItems((prev) => [...prev, newChecklistText.trim()]);
    setNewChecklistText('');
  };

  /// <summary>
  /// Removes a checklist item by index.
  /// </summary>
  const handleRemoveChecklistItem = (index: number) => {
    setChecklistItems((prev) => prev.filter((_, i) => i !== index));
  };

  /// <summary>
  /// Submits the modal form either creating or updating a personal task.
  /// </summary>
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const cleanIssueId = linkedTaskId.replace(/^#/, '').trim();
    const linkedIssueId = cleanIssueId || undefined;
    const linkedIssueSubject =
      linkedIssue?.subject ||
      (initialTask && initialTask.redmineIssueId === cleanIssueId
        ? initialTask.redmineIssueSubject
        : undefined);
    const linkedProjId =
      linkedProjectId ||
      (linkedIssue?.project?.id ? String(linkedIssue.project.id) : undefined) ||
      (initialTask && initialTask.redmineIssueId === cleanIssueId
        ? initialTask.redmineProjectId
        : undefined);
    const linkedProjName =
      linkedIssue?.project?.name ||
      (initialTask && initialTask.redmineIssueId === cleanIssueId
        ? initialTask.redmineProjectName
        : undefined);

    if (initialTask && onUpdate) {
      await onUpdate(initialTask.id, {
        title: title.trim(),
        notes: notes.trim(),
        priority,
        status,
        dueDate: dueDate || undefined,
        redmineIssueId: linkedIssueId,
        redmineIssueSubject: linkedIssueSubject,
        redmineProjectId: linkedProjId,
        redmineProjectName: linkedProjName,
        checklist: checklistItems.map((text, idx) => {
          const existing = initialTask.checklist[idx];
          return {
            id: existing?.id || `item_${Date.now()}_${idx}`,
            text,
            completed: existing?.completed || false,
          };
        }),
      });
    } else {
      await onCreate({
        title: title.trim(),
        notes: notes.trim(),
        priority,
        status,
        dueDate: dueDate || undefined,
        redmineIssueId: linkedIssueId,
        redmineIssueSubject: linkedIssueSubject,
        redmineProjectId: linkedProjId,
        redmineProjectName: linkedProjName,
        checklist: checklistItems,
      });
    }

    onClose();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconListCheck size={22} color="var(--mantine-color-blue-filled)" />
          <Text fw={600} size="md">
            {initialTask ? 'Edit Task' : 'New Task'}
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
      <form onSubmit={handleSubmit}>
        <Stack gap="md">
          <TextInput
            label="Title"
            placeholder="Task title..."
            value={title}
            onChange={(e) => setTitle(e.currentTarget.value)}
            required
            data-autofocus
          />

          <Group grow align="flex-start">
            <Select
              label="Status"
              value={status}
              onChange={(val) => setStatus((val as import('../../../types').PersonalTaskStatus) || 'not_started')}
              data={[
                { value: 'not_started', label: '⚪ Not Started' },
                { value: 'in_progress', label: '🔵 In Progress' },
                { value: 'awaiting', label: '🟠 Awaiting' },
                { value: 'completed', label: '🟢 Completed' },
              ]}
            />

            <Select
              label="Priority"
              value={priority}
              onChange={(val) => setPriority((val as PersonalTaskPriority) || 'medium')}
              data={[
                { value: 'high', label: '🔴 High Priority' },
                { value: 'medium', label: '🟠 Medium Priority' },
                { value: 'low', label: '⚪ Low Priority' },
              ]}
            />

            <DatePickerInput
              label="Due Date"
              placeholder="Pick due date"
              value={dueDate || null}
              onChange={(val) => setDueDate(val || '')}
              leftSection={<IconCalendar size={16} />}
              clearable
            />
          </Group>

          {/* Rich text & code fragment note editor */}
          <RichTextNoteEditor
            label="Notes"
            value={notes}
            onChange={setNotes}
            minHeight={140}
          />

          <Divider label="Redmine Task" labelPosition="center" />

          {/* Unified Project & Task Search Component */}
          <ProjectTaskActivityFields
            projectId={linkedProjectId}
            onProjectChange={(val) => {
              setLinkedProjectId(val);
              if (!val) {
                setLinkedTaskId('');
                setLinkedIssue(null);
              }
            }}
            taskId={linkedTaskId}
            onTaskChange={(val, issue) => {
              setLinkedTaskId(val);
              if (issue) {
                setLinkedIssue(issue);
                if (issue.project?.id) {
                  setLinkedProjectId(String(issue.project.id));
                }
              }
            }}
            activityId=""
            onActivityChange={() => {}}
            hideActivity={true}
            includeMyIssues={true}
            projectRequired={false}
            taskRequired={false}
            layout="stacked"
          />

          <Divider label="Checklist" labelPosition="center" />

          {checklistItems.length > 0 && (
            <Stack gap="xs">
              {checklistItems.map((item, idx) => (
                <Group key={idx} justify="space-between" wrap="nowrap">
                  <Text size="sm">&bull; {item}</Text>
                  <ActionIcon
                    size="xs"
                    color="red"
                    variant="subtle"
                    onClick={() => handleRemoveChecklistItem(idx)}
                    aria-label="Remove item"
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          )}

          <Group align="flex-end" wrap="nowrap">
            <TextInput
              placeholder="New checklist item..."
              value={newChecklistText}
              onChange={(e) => setNewChecklistText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddChecklistItem();
                }
              }}
              style={{ flex: 1 }}
            />
            <Button
              variant="light"
              leftSection={<IconPlus size={14} />}
              onClick={handleAddChecklistItem}
              disabled={!newChecklistText.trim()}
            >
              Add
            </Button>
          </Group>

          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" color="blue" disabled={!title.trim()}>
              {initialTask ? 'Save' : 'Create'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
};
