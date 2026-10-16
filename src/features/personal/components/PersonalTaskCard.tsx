import React, { useState } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Badge,
  Checkbox,
  ActionIcon,
  Button,
  TextInput,
  Progress,
  Paper,
  Anchor,
  Tooltip,
  Box,
  Menu,
} from '@mantine/core';
import {
  IconGripVertical,
  IconPlayerPlay,
  IconTrash,
  IconEdit,
  IconPlus,
  IconExternalLink,
  IconNotes,
  IconChevronDown,
  IconChevronRight,
  IconCircleDot,
  IconClock,
  IconHourglass,
  IconCheck,
} from '@tabler/icons-react';
import { useSettings } from '../../../contexts/SettingsContext';
import { RichTextNoteViewer } from '../../../components/common/RichTextNoteEditor';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';
import type { PersonalTask, PersonalTaskStatus } from '../../../types';

/// <summary>
/// Properties for configuring the PersonalTaskCard component.
/// </summary>
export interface PersonalTaskCardProps {
  /// <summary>The personal task item model.</summary>
  task: PersonalTask;
  /// <summary>Callback to toggle completion status of the task.</summary>
  onToggleComplete: (id: string) => void;
  /// <summary>Callback to change task status directly.</summary>
  onChangeStatus?: (id: string, status: PersonalTaskStatus) => void;
  /// <summary>Callback to toggle a specific sub-task checklist item.</summary>
  onToggleChecklistItem: (taskId: string, itemId: string) => void;
  /// <summary>Callback to add a sub-task checklist item.</summary>
  onAddChecklistItem: (taskId: string, text: string) => void;
  /// <summary>Callback to delete a sub-task checklist item.</summary>
  onRemoveChecklistItem: (taskId: string, itemId: string) => void;
  /// <summary>Callback to start the timer directly on this task.</summary>
  onStartTimer: (task: PersonalTask) => void;
  /// <summary>Callback to edit task details.</summary>
  onEdit: (task: PersonalTask) => void;
  /// <summary>Callback to delete the task.</summary>
  onDelete: (id: string) => void;
  /// <summary>Index of the card in the list.</summary>
  index: number;
  /// <summary>Drag start handler.</summary>
  onDragStart: (index: number) => void;
  /// <summary>Drag over handler.</summary>
  onDragOver: (e: React.DragEvent, index: number) => void;
  /// <summary>Drop handler.</summary>
  onDrop: (index: number) => void;
  /// <summary>Drag end handler.</summary>
  onDragEnd: () => void;
  /// <summary>Whether this item is being dragged.</summary>
  isDragging?: boolean;
}

/// <summary>
/// Interactive queue item card displaying title, status, priority, due date and collapsed notes / sub-tasks.
/// </summary>
export const PersonalTaskCard: React.FC<PersonalTaskCardProps> = ({
  task,
  onToggleComplete,
  onChangeStatus,
  onToggleChecklistItem,
  onAddChecklistItem,
  onRemoveChecklistItem,
  onStartTimer,
  onEdit,
  onDelete,
  index,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
}) => {
  const { redmineUrl } = useSettings();
  const [isExpanded, setIsExpanded] = useState(false);
  const [newSubTask, setNewSubTask] = useState('');
  const [showSubTaskInput, setShowSubTaskInput] = useState(false);

  const completedCount = task.checklist.filter((c) => c.completed).length;
  const totalChecklist = task.checklist.length;
  const checklistPercentage = totalChecklist > 0 ? Math.round((completedCount / totalChecklist) * 100) : 0;
  const hasDetails = Boolean(
    task.notes ||
    totalChecklist > 0 ||
    task.redmineIssueId ||
    task.redmineIssueSubject ||
    task.redmineProjectName
  );

  /// <summary>
  /// Handles submitting a new sub-task from the inline input.
  /// </summary>
  const handleAddSubTask = () => {
    if (!newSubTask.trim()) return;
    onAddChecklistItem(task.id, newSubTask.trim());
    setNewSubTask('');
  };

  /// <summary>
  /// Determines the badge color for priority.
  /// </summary>
  const getPriorityColor = () => {
    switch (task.priority) {
      case 'high':
        return 'red';
      case 'medium':
        return 'orange';
      case 'low':
        return 'gray';
      default:
        return 'blue';
    }
  };

  /// <summary>
  /// Resolves current status of the task.
  /// </summary>
  const currentStatus: PersonalTaskStatus =
    task.status || (task.completed ? 'completed' : 'not_started');

  /// <summary>
  /// Configures status appearance and human-readable label.
  /// </summary>
  const getStatusConfig = (st: PersonalTaskStatus) => {
    switch (st) {
      case 'in_progress':
        return { label: 'In Progress', color: 'blue', icon: IconClock };
      case 'awaiting':
        return { label: 'Awaiting', color: 'yellow', icon: IconHourglass };
      case 'completed':
        return { label: 'Completed', color: 'teal', icon: IconCheck };
      case 'not_started':
      default:
        return { label: 'Not Started', color: 'gray', icon: IconCircleDot };
    }
  };

  const statusConfig = getStatusConfig(currentStatus);
  const StatusIcon = statusConfig.icon;

  return (
    <Card
      withBorder
      padding="xs"
      radius="md"
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDrop={() => onDrop(index)}
      onDragEnd={onDragEnd}
      bg={task.completed ? 'light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))' : 'var(--mantine-color-default)'}
      style={{
        cursor: 'grab',
        opacity: isDragging ? 0.4 : (task.completed ? 0.75 : 1),
        transition: 'all 0.15s ease',
      }}
    >
      <Stack gap={6}>
        {/* Compact Single-Line Task Header */}
        <Group justify="space-between" align="center" wrap="nowrap">
          <Group gap="xs" wrap="nowrap" align="center" style={{ flex: 1, minWidth: 0 }}>
            <IconGripVertical size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />

            <Checkbox
              checked={task.completed}
              onChange={() => onToggleComplete(task.id)}
              aria-label="Toggle task completion"
              size="sm"
            />

            {/* Task Title (click to expand/collapse if has details) */}
            <Text
              fw={500}
              size="sm"
              truncate="end"
              td={task.completed ? 'line-through' : undefined}
              c={task.completed ? 'dimmed' : undefined}
              style={{
                flex: 1,
                minWidth: 0,
                cursor: hasDetails ? 'pointer' : 'default',
              }}
              onClick={() => hasDetails && setIsExpanded((prev) => !prev)}
            >
              {task.title}
            </Text>

            {/* Clickable Status Badge with Menu */}
            <Menu shadow="md" width={160} position="bottom-start">
              <Menu.Target>
                <Badge
                  size="sm"
                  variant="light"
                  color={statusConfig.color}
                  leftSection={<StatusIcon size={12} />}
                  style={{ cursor: 'pointer', userSelect: 'none', textTransform: 'none' }}
                >
                  {statusConfig.label}
                </Badge>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconCircleDot size={14} color="gray" />}
                  onClick={() => onChangeStatus?.(task.id, 'not_started')}
                >
                  Not Started
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconClock size={14} color="var(--mantine-color-blue-filled)" />}
                  onClick={() => onChangeStatus?.(task.id, 'in_progress')}
                >
                  In Progress
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconHourglass size={14} color="var(--mantine-color-yellow-filled)" />}
                  onClick={() => onChangeStatus?.(task.id, 'awaiting')}
                >
                  Awaiting
                </Menu.Item>
                <Menu.Item
                  leftSection={<IconCheck size={14} color="var(--mantine-color-teal-filled)" />}
                  onClick={() => onChangeStatus?.(task.id, 'completed')}
                >
                  Completed
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>

            {/* Priority Badge */}
            <Badge size="xs" variant="outline" color={getPriorityColor()} style={{ textTransform: 'capitalize' }}>
              {task.priority}
            </Badge>

            {/* Due Date Badge */}
            {task.dueDate && (
              <Badge
                size="xs"
                variant="subtle"
                color={task.dueDate < new Date().toISOString().slice(0, 10) && !task.completed ? 'red' : 'gray'}
              >
                {task.dueDate}
              </Badge>
            )}

            {/* Redmine Link Badge (Compact) */}
            {task.redmineIssueId && (
              <Badge
                size="xs"
                variant="light"
                color="blue"
                style={{
                  height: 18,
                  padding: '0 6px',
                  fontSize: '11px',
                  fontWeight: 500,
                  textTransform: 'none',
                }}
              >
                <Anchor
                  href={`${redmineUrl}/issues/${task.redmineIssueId}`}
                  target="_blank"
                  c="inherit"
                  underline="never"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                >
                  #{task.redmineIssueId} <IconExternalLink size={9} />
                </Anchor>
              </Badge>
            )}

            {/* Sub-tasks counter pill when collapsed */}
            {totalChecklist > 0 && !isExpanded && (
              <Badge size="xs" variant="light" color="gray" style={{ height: 18, padding: '0 5px', fontSize: '10px' }}>
                {completedCount}/{totalChecklist}
              </Badge>
            )}
          </Group>

          {/* Action buttons */}
          <Group gap={4} wrap="nowrap">
            {!task.completed && (
              <Tooltip label="Start Tracking Time">
                <Button
                  size="compact-xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconPlayerPlay size={13} />}
                  onClick={() => onStartTimer(task)}
                >
                  Start
                </Button>
              </Tooltip>
            )}

            {hasDetails && (
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? 'Collapse' : 'Expand'}
              >
                {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
              </ActionIcon>
            )}

            <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => onEdit(task)} title="Edit Task">
              <IconEdit size={16} />
            </ActionIcon>

            <ActionIcon variant="subtle" color="red" size="sm" onClick={() => onDelete(task.id)} title="Delete Task">
              <IconTrash size={16} />
            </ActionIcon>
          </Group>
        </Group>

        {/* Collapsible details: Redmine Info, Notes & Sub-tasks */}
        {isExpanded && (
          <Stack gap="xs" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
            {/* Linked Redmine Task Info Card */}
            {(task.redmineIssueId || task.redmineProjectName || task.redmineIssueSubject) && (
              <Paper withBorder p="xs" radius="sm" bg="var(--mantine-color-default)">
                <Group justify="space-between" align="center" wrap="nowrap">
                  <Group gap="xs" align="center" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                    <Badge size="xs" color="blue" variant="filled">
                      Redmine
                    </Badge>
                    {task.redmineProjectName && (
                      <Text size="xs" fw={600} c="dimmed" truncate="end">
                        {task.redmineProjectName}
                      </Text>
                    )}
                    {task.redmineIssueSubject && (
                      <Text size="xs" truncate="end" style={{ flex: 1 }}>
                        — {task.redmineIssueSubject}
                      </Text>
                    )}
                  </Group>

                  {task.redmineIssueId && (
                    <RedmineIssueLink
                      issueId={task.redmineIssueId}
                      size="xs"
                    />
                  )}
                </Group>
              </Paper>
            )}

            {/* Notes preview with RTF and code fragment support */}
            {task.notes && (
              <Paper withBorder p="xs" radius="sm" bg="var(--mantine-color-default)">
                <Group gap="xs" align="flex-start" wrap="nowrap">
                  <IconNotes size={14} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0, marginTop: 2 }} />
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <RichTextNoteViewer content={task.notes} maxHeight={180} />
                  </Box>
                </Group>
              </Paper>
            )}

            {/* Sub-tasks checklist */}
            <Stack gap={4}>
              {totalChecklist > 0 && (
                <>
                  <Group justify="space-between" align="center">
                    <Text size="xs" fw={600} c="dimmed">
                      Sub-tasks: {completedCount}/{totalChecklist} ({checklistPercentage}%)
                    </Text>
                  </Group>
                  <Progress value={checklistPercentage} size="xs" color="teal" radius="xl" />

                  <Stack gap={2} mt={2}>
                    {task.checklist.map((item) => (
                      <Group key={item.id} justify="space-between" wrap="nowrap" py={2}>
                        <Checkbox
                          size="xs"
                          checked={item.completed}
                          onChange={() => onToggleChecklistItem(task.id, item.id)}
                          label={
                            <Text size="xs" td={item.completed ? 'line-through' : undefined} c={item.completed ? 'dimmed' : undefined}>
                              {item.text}
                            </Text>
                          }
                        />
                        <ActionIcon
                          size="xs"
                          variant="subtle"
                          color="gray"
                          onClick={() => onRemoveChecklistItem(task.id, item.id)}
                          aria-label="Remove checklist item"
                        >
                          <IconTrash size={12} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </Stack>
                </>
              )}

              {/* Add sub-task inline input */}
              {showSubTaskInput ? (
                <Group gap="xs" mt={4}>
                  <TextInput
                    size="xs"
                    placeholder="New sub-task..."
                    value={newSubTask}
                    onChange={(e) => setNewSubTask(e.currentTarget.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubTask();
                      }
                    }}
                    style={{ flex: 1 }}
                    autoFocus
                  />
                  <Button size="compact-xs" onClick={handleAddSubTask}>
                    Add
                  </Button>
                  <Button size="compact-xs" variant="default" onClick={() => setShowSubTaskInput(false)}>
                    Cancel
                  </Button>
                </Group>
              ) : (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="blue"
                  leftSection={<IconPlus size={12} />}
                  onClick={() => setShowSubTaskInput(true)}
                  style={{ alignSelf: 'flex-start' }}
                >
                  Add Sub-task
                </Button>
              )}
            </Stack>
          </Stack>
        )}
      </Stack>
    </Card>
  );
};
