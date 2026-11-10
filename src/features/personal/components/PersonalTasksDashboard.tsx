import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Title,
  Group,
  Button,
  TextInput,
  Stack,
  Text,
  Paper,
  SegmentedControl,
} from '@mantine/core';
import { IconPlus, IconSearch, IconTrash } from '@tabler/icons-react';
import { usePersonalTasks } from '../../../hooks/usePersonalTasks';
import { PersonalTaskCard } from './PersonalTaskCard';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLanguage } from '../../../contexts/LanguageContext';

/// <summary>
/// Simplified Personal Tasks Dashboard with quick inline task creation,
/// completion checkboxes, and navigation to each task's full-page sticky notes view.
/// </summary>
export const PersonalTasksDashboard: React.FC = () => {
  const {
    tasks,
    addTask,
    toggleComplete,
    deleteTask,
  } = usePersonalTasks();

  const navigate = useNavigate();
  const confirm = useConfirm();
  const { t } = useLanguage();

  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'open' | 'done'>('all');

  /// <summary>
  /// Adds a new personal task from the quick-entry input field.
  /// </summary>
  const handleAddTask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newTaskTitle.trim();
    if (!trimmed) return;
    addTask(trimmed);
    setNewTaskTitle('');
  };

  /// <summary>
  /// Confirms and deletes a personal task.
  /// </summary>
  const handleDelete = async (id: string) => {
    const ok = await confirm({
      message: t('deletePersonalTaskConfirm'),
      confirmText: t('confirmBtn'),
      variant: 'danger',
    });
    if (ok) {
      deleteTask(id);
    }
  };

  /// <summary>
  /// Confirms and clears all completed personal tasks.
  /// </summary>
  const handleClearCompleted = async () => {
    const completedItems = tasks.filter((item) => item.completed);
    if (completedItems.length === 0) return;

    const ok = await confirm({
      message: t('clearDonePersonalConfirm'),
      confirmText: t('confirmBtn'),
      variant: 'danger',
    });
    if (ok) {
      for (const item of completedItems) {
        await deleteTask(item.id);
      }
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((task) => {
        if (filterMode === 'open' && task.completed) return false;
        if (filterMode === 'done' && !task.completed) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const inTitle = task.title.toLowerCase().includes(q);
          const inNotes = task.stickyNotes?.some(
            (n) =>
              (n.title || '').toLowerCase().includes(q) ||
              n.content.toLowerCase().includes(q)
          );
          if (!inTitle && !inNotes) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Active tasks first, then newest first
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return b.createdAt - a.createdAt;
      });
  }, [tasks, filterMode, searchQuery]);

  const openCount = tasks.filter((item) => !item.completed).length;
  const doneCount = tasks.filter((item) => item.completed).length;

  return (
    <Stack gap="lg">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Title order={2}>{t('personalTasksTitle')}</Title>

        {doneCount > 0 && (
          <Button
            variant="subtle"
            color="red"
            size="xs"
            leftSection={<IconTrash size={14} />}
            onClick={handleClearCompleted}
          >
            {t('clearDoneTasksBtn')} ({doneCount})
          </Button>
        )}
      </Group>

      {/* Quick Add & Filter Bar */}
      <Paper p="md" radius="md" withBorder bg="var(--mantine-color-default)">
        <Stack gap="sm">
          <form onSubmit={handleAddTask}>
            <Group gap="sm" wrap="nowrap">
              <TextInput
                placeholder={t('newTaskPlaceholder')}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.currentTarget.value)}
                style={{ flex: 1 }}
              />
              <Button
                type="submit"
                leftSection={<IconPlus size={18} />}
                disabled={!newTaskTitle.trim()}
              >
                {t('addTaskBtn')}
              </Button>
            </Group>
          </form>

          <Group justify="space-between" gap="sm" wrap="wrap">
            <SegmentedControl
              value={filterMode}
              onChange={(v) => setFilterMode(v as 'all' | 'open' | 'done')}
              data={[
                { label: `${t('filterAll')} (${tasks.length})`, value: 'all' },
                { label: `${t('filterOpen')} (${openCount})`, value: 'open' },
                { label: `${t('filterDone')} (${doneCount})`, value: 'done' },
              ]}
            />
            <TextInput
              placeholder={t('searchTasksPlaceholder')}
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ flex: 1, minWidth: 220 }}
            />
          </Group>
        </Stack>
      </Paper>

      {/* Task List */}
      {filteredTasks.length === 0 ? (
        <Paper p="xl" withBorder radius="md" ta="center" bg="var(--mantine-color-default)">
          <Stack align="center" gap="xs" py="sm">
            <Text fw={600}>
              {t('noPersonalTasks')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('addFirstTaskHint')}
            </Text>
          </Stack>
        </Paper>
      ) : (
        <Stack gap="xs">
          {filteredTasks.map((task) => (
            <PersonalTaskCard
              key={task.id}
              task={task}
              onToggleCompleted={toggleComplete}
              onOpenTask={(id) => navigate(`/tasks/${id}`)}
              onDelete={handleDelete}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
};
