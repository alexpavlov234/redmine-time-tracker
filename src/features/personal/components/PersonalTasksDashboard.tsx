import React, { useState, useMemo, useRef } from 'react';
import {
  Stack,
  Group,
  Title,
  Text,
  Button,
  TextInput,
  Select,
  Paper,
  Badge,
} from '@mantine/core';
import {
  IconPlus,
  IconSearch,
  IconChecklist,
  IconCircleDot,
  IconClock,
  IconHourglass,
  IconCheck,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';
import { usePersonalTasks } from '../../../hooks/usePersonalTasks';
import { useQueue } from '../../../contexts/QueueContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { setTaskNote } from '../../../services/taskNotes';
import { PersonalTaskCard } from './PersonalTaskCard';
import { CreatePersonalTaskModal } from './CreatePersonalTaskModal';
import type { PersonalTask, PersonalTaskStatus } from '../../../types';

/// <summary>
/// Dashboard page for managing personal tasks and notes queue with sub-tasks, priorities, and one-click timer activation.
/// </summary>
export const PersonalTasksDashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    setTaskStatus,
    toggleComplete,
    toggleChecklistItem,
    addChecklistItem,
    removeChecklistItem,
    reorderTasks,
  } = usePersonalTasks();

  const { addTodo } = useQueue();
  const confirm = useConfirm();

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PersonalTask | null>(null);

  // Drag and drop state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  /// <summary>
  /// Computes summary metric counters for personal tasks.
  /// </summary>
  const metrics = useMemo(() => {
    const total = tasks.length;
    const notStarted = tasks.filter((t) => (!t.status || t.status === 'not_started') && !t.completed).length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress' && !t.completed).length;
    const awaiting = tasks.filter((t) => t.status === 'awaiting' && !t.completed).length;
    const completed = tasks.filter((t) => t.completed || t.status === 'completed').length;
    return { total, notStarted, inProgress, awaiting, completed };
  }, [tasks]);

  /// <summary>
  /// Filters tasks by status, priority, and text search.
  /// </summary>
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const taskStatus: PersonalTaskStatus =
        task.status || (task.completed ? 'completed' : 'not_started');

      // Status filter
      if (statusFilter !== 'all' && taskStatus !== statusFilter) return false;

      // Priority filter
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchTitle = task.title.toLowerCase().includes(query);
        const matchNotes = (task.notes || '').toLowerCase().includes(query);
        const matchIssue = (task.redmineIssueId || '').toLowerCase().includes(query);
        const matchSubTasks = task.checklist.some((c) => c.text.toLowerCase().includes(query));
        if (!matchTitle && !matchNotes && !matchIssue && !matchSubTasks) return false;
      }

      return true;
    });
  }, [tasks, statusFilter, priorityFilter, searchQuery]);

  /// <summary>
  /// Pushes a personal task directly into the active Timer Queue and redirects to Tracker.
  /// </summary>
  const handleStartTimer = (task: PersonalTask) => {
    if (task.redmineIssueId && task.notes) {
      setTaskNote(task.redmineIssueId, task.notes);
    }

    // Set task to In Progress if it was Not Started
    if (!task.status || task.status === 'not_started') {
      setTaskStatus(task.id, 'in_progress');
    }

    addTodo({
      projectId: task.redmineProjectId || '',
      projectName: task.redmineProjectName || 'Personal Task',
      taskId: task.redmineIssueId || '',
      taskSubject: task.redmineIssueSubject || task.title,
      note: task.notes || task.title,
    });

    navigate('/');
  };

  /// <summary>
  /// Handles deleting a task with user confirmation.
  /// </summary>
  const handleDeleteTask = async (id: string) => {
    const confirmed = await confirm({
      message: 'Are you sure you want to delete this personal task?',
      subtitle: 'This will remove the task and all its sub-tasks.',
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (confirmed) {
      await deleteTask(id);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex: number) => {
    if (dragItemRef.current !== null && dragItemRef.current !== dropIndex) {
      const draggedTask = filteredTasks[dragItemRef.current];
      const targetTask = filteredTasks[dropIndex];
      const originalStartIndex = tasks.findIndex((t) => t.id === draggedTask.id);
      const originalEndIndex = tasks.findIndex((t) => t.id === targetTask.id);

      if (originalStartIndex >= 0 && originalEndIndex >= 0) {
        reorderTasks(originalStartIndex, originalEndIndex);
      }
    }
    setDragIndex(null);
    dragItemRef.current = null;
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    dragItemRef.current = null;
  };

  return (
    <Stack gap="md">
      {/* Header and Quick Actions */}
      <Group justify="space-between" align="center" wrap="wrap">
        <div>
          <Title order={2}>Personal Tasks</Title>
          <Text size="sm" c="dimmed">
            Your task queue and quick reminders.
          </Text>
        </div>

        <Button
          leftSection={<IconPlus size={16} />}
          color="blue"
          onClick={() => {
            setEditingTask(null);
            setIsModalOpen(true);
          }}
        >
          New Task
        </Button>
      </Group>

      {/* Clean, Simple Filter & Search Bar with Compact Status Counts */}
      <Paper withBorder p="xs" radius="md">
        <Group justify="space-between" wrap="wrap" gap="sm">
          <TextInput
            placeholder="Search tasks..."
            leftSection={<IconSearch size={16} />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            style={{ flex: '1 1 220px' }}
            size="sm"
          />

          <Group gap="xs" wrap="wrap">
            <Select
              value={statusFilter}
              onChange={(val) => setStatusFilter(val || 'all')}
              data={[
                { label: `All (${metrics.total})`, value: 'all' },
                { label: `Not Started (${metrics.notStarted})`, value: 'not_started' },
                { label: `In Progress (${metrics.inProgress})`, value: 'in_progress' },
                { label: `Awaiting (${metrics.awaiting})`, value: 'awaiting' },
                { label: `Completed (${metrics.completed})`, value: 'completed' },
              ]}
              size="sm"
              style={{ width: 170 }}
            />

            <Select
              value={priorityFilter}
              onChange={(val) => setPriorityFilter(val || 'all')}
              data={[
                { label: 'All Priorities', value: 'all' },
                { label: '🔴 High', value: 'high' },
                { label: '🟠 Medium', value: 'medium' },
                { label: '⚪ Low', value: 'low' },
              ]}
              size="sm"
              style={{ width: 140 }}
            />
          </Group>
        </Group>

        {/* Minimal status indicator strip */}
        <Group gap="xs" mt="xs" pt="xs" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
          <Badge
            size="sm"
            variant={statusFilter === 'all' ? 'filled' : 'subtle'}
            color="gray"
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter('all')}
          >
            Total: {metrics.total}
          </Badge>
          <Badge
            size="sm"
            variant={statusFilter === 'not_started' ? 'filled' : 'light'}
            color="gray"
            leftSection={<IconCircleDot size={12} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter(statusFilter === 'not_started' ? 'all' : 'not_started')}
          >
            Not Started: {metrics.notStarted}
          </Badge>
          <Badge
            size="sm"
            variant={statusFilter === 'in_progress' ? 'filled' : 'light'}
            color="blue"
            leftSection={<IconClock size={12} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter(statusFilter === 'in_progress' ? 'all' : 'in_progress')}
          >
            In Progress: {metrics.inProgress}
          </Badge>
          <Badge
            size="sm"
            variant={statusFilter === 'awaiting' ? 'filled' : 'light'}
            color="yellow"
            leftSection={<IconHourglass size={12} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter(statusFilter === 'awaiting' ? 'all' : 'awaiting')}
          >
            Awaiting: {metrics.awaiting}
          </Badge>
          <Badge
            size="sm"
            variant={statusFilter === 'completed' ? 'filled' : 'light'}
            color="teal"
            leftSection={<IconCheck size={12} />}
            style={{ cursor: 'pointer' }}
            onClick={() => setStatusFilter(statusFilter === 'completed' ? 'all' : 'completed')}
          >
            Completed: {metrics.completed}
          </Badge>
        </Group>
      </Paper>

      {/* Task Queue List */}
      {filteredTasks.length === 0 ? (
        <Paper withBorder p="xl" radius="md" ta="center">
          <IconChecklist size={36} color="var(--mantine-color-dimmed)" style={{ margin: '0 auto 8px' }} />
          <Text fw={600} size="sm">
            No tasks found
          </Text>
          <Text c="dimmed" size="xs" mt={4}>
            {tasks.length === 0
              ? 'Your queue is empty. Click "New Task" above to add an item.'
              : 'No tasks match the selected filters.'}
          </Text>
        </Paper>
      ) : (
        <Stack gap="xs">
          {filteredTasks.map((task, index) => (
            <PersonalTaskCard
              key={task.id}
              task={task}
              index={index}
              onToggleComplete={toggleComplete}
              onChangeStatus={setTaskStatus}
              onToggleChecklistItem={toggleChecklistItem}
              onAddChecklistItem={addChecklistItem}
              onRemoveChecklistItem={removeChecklistItem}
              onStartTimer={handleStartTimer}
              onEdit={(t) => {
                setEditingTask(t);
                setIsModalOpen(true);
              }}
              onDelete={handleDeleteTask}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              isDragging={dragIndex === index}
            />
          ))}
        </Stack>
      )}

      {/* Create / Edit Modal */}
      {isModalOpen && (
        <CreatePersonalTaskModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setEditingTask(null);
          }}
          onCreate={addTask}
          initialTask={editingTask}
          onUpdate={updateTask}
        />
      )}
    </Stack>
  );
};
