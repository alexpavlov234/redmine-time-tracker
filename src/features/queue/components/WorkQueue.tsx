import React, { useState, useRef } from 'react';
import { useQueue } from '../../../contexts/QueueContext';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { IconGripVertical, IconTrash, IconListCheck, IconPlayerPlay, IconPlayerPause } from '@tabler/icons-react';
import { formatTime } from '../../../utils/formatters';
import { Card, Button, Group, Text, ActionIcon, Stack, Badge, Paper, Modal, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';

import { useSettings } from '../../../contexts/SettingsContext';
import { StatusPromptModal } from '../../tracker/components/StatusPromptModal';
import { TaskNoteButton } from '../../../components/common/TaskNoteButton';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';

/// <summary>
/// Drag-and-drop work queue component for managing and tracking queued Redmine tasks.
/// </summary>
export const WorkQueue: React.FC = () => {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { todos, removeTodo, reorderTodos, activeTodoId, updateTodo } = useQueue();
  const { promptStatusOnStart } = useSettings();
  const { t } = useLanguage();
  const timer = useQueueTimer();
  const confirm = useConfirm();

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  // First activity prompt state
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptTodoId, setPromptTodoId] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');

  // Status prompt state
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusTaskId, setStatusTaskId] = useState<string | null>(null);
  const [statusTaskSubject, setStatusTaskSubject] = useState<string>('');

  const handlePlayPause = async (todoId: number) => {
    const todo = todos.find(item => item.id === todoId);
    if (!todo) return;

    if (activeTodoId === todoId && timer.isRunning) {
      timer.pauseTimer();
      return;
    }

    const result = await timer.startTimerForTodo(todoId);
    if (result === 'needs_prompt') {
      setPromptTodoId(todoId);
      setPromptText(todo.note || '');
      setShowPrompt(true);
    } else if (promptStatusOnStart && todo.taskId) {
      setStatusTaskId(todo.taskId);
      setStatusTaskSubject(todo.taskSubject);
      setShowStatusModal(true);
    }
  };

  const handlePromptSubmit = () => {
    if (!promptText.trim() || promptTodoId === null) return;
    const todo = todos.find(item => item.id === promptTodoId);
    timer.startAfterPrompt(promptTodoId, promptText.trim());
    setShowPrompt(false);
    setPromptText('');
    setPromptTodoId(null);

    if (promptStatusOnStart && todo?.taskId) {
      setStatusTaskId(todo.taskId);
      setStatusTaskSubject(todo.taskSubject);
      setShowStatusModal(true);
    }
  };

  const handleDelete = async (id: number) => {
    const isActive = activeTodoId === id;
    const confirmed = await confirm({
      message: isActive
        ? t('removeActiveTaskConfirm')
        : t('removeTaskConfirm'),
      variant: 'danger',
      confirmText: t('removeBtn'),
    });
    if (confirmed) {
      if (isActive) {
        timer.resetTimer(false);
      }
      removeTodo(id);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragItemRef.current !== null && dragItemRef.current !== index) {
      reorderTodos(dragItemRef.current, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  return (
    <>
      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Card.Section withBorder inheritPadding py="xs">
          <Group justify="space-between">
            <Group gap="xs">
              <IconListCheck size={20} />
              <Text fw={500}>{t('workQueueTitle')}</Text>
            </Group>
            {todos.length > 0 && <Badge size="sm" variant="light">{todos.length}</Badge>}
          </Group>
        </Card.Section>

        <Stack mt="md">
          {todos.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">{t('emptyQueueText')}</Text>
          ) : (
            <Stack gap="xs">
              {todos.map((todo, index) => {
                const isActive = activeTodoId === todo.id;
                const isThisRunning = isActive && timer.isRunning;
                const elapsedSec = Math.floor((todo.elapsedMs || 0) / 1000);

                return (
                  <Paper
                    key={todo.id}
                    withBorder
                    p="sm"
                    radius="md"
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDrop={() => handleDrop(index)}
                    onDragEnd={handleDragEnd}
                    style={{
                      cursor: 'grab',
                      transition: 'all 0.2s',
                      backgroundColor: isActive 
                        ? 'var(--mantine-color-blue-light)' 
                        : (dragOverIndex === index ? 'var(--mantine-color-gray-light)' : 'var(--mantine-color-default)'),
                      opacity: dragIndex === index ? 0.5 : 1,
                      borderColor: isActive ? 'var(--mantine-color-blue-filled)' : undefined
                    }}
                  >
                    <Group wrap="nowrap" align="center">
                      <IconGripVertical size={16} color="var(--mantine-color-dimmed)" style={{ flexShrink: 0 }} />

                      <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                        <Text size="xs" fw={700} c="dimmed" tt="uppercase" truncate>{todo.projectName}</Text>
                        <RedmineIssueLink
                          issueId={todo.taskId}
                          subject={todo.taskSubject}
                          size="sm"
                          fw={600}
                        />
                        {todo.activityName && <Text size="xs" c="dimmed" truncate>{todo.activityName}</Text>}
                      </Stack>

                      <Group gap="xs" wrap="nowrap" align="center">
                        <TaskNoteButton
                          taskId={todo.taskId}
                          taskSubject={todo.taskSubject}
                          size="md"
                          onNoteUpdated={(newNote) => updateTodo(todo.id, { note: newNote })}
                        />

                        {(elapsedSec > 0 || isThisRunning) && (
                          <Text size="sm" fw={700} c={isThisRunning ? 'blue' : 'dimmed'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {isThisRunning ? formatTime(timer.totalElapsedTime) : formatTime(elapsedSec)}
                          </Text>
                        )}
                        <ActionIcon
                          variant={isThisRunning ? 'light' : 'filled'}
                          color={isThisRunning ? 'orange' : 'blue'}
                          onClick={() => handlePlayPause(todo.id)}
                          aria-label={isThisRunning ? t('pauseTimerTooltip') : t('startTrackingTooltip')}
                        >
                          {isThisRunning ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => handleDelete(todo.id)}
                          aria-label={t('removeBtn')}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Paper>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Card>

      <Modal
        opened={showPrompt}
        onClose={() => setShowPrompt(false)}
        title={<Text fw={600}>{t('firstPerformedTaskQuestion')}</Text>}
        size="80%"
        fullScreen={isMobile}
        centered
      >
        <Stack gap="md">
          <TextInput
            placeholder={t('performedTaskPlaceholder')}
            value={promptText}
            onChange={e => setPromptText(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Enter') handlePromptSubmit(); }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowPrompt(false)}>{t('cancelBtn')}</Button>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={handlePromptSubmit}
              disabled={!promptText.trim()}
            >
              {t('startTrackingBtn')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      <StatusPromptModal
        isOpen={showStatusModal}
        taskId={statusTaskId}
        taskSubject={statusTaskSubject}
        onClose={() => setShowStatusModal(false)}
        onConfirmStart={() => {}}
      />
    </>
  );
};
