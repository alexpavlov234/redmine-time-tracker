import React, { useState, useRef } from 'react';
import { useQueue } from '../../../contexts/QueueContext';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { IconGripVertical, IconTrash, IconListCheck, IconPlayerPlay, IconPlayerPause, IconExternalLink } from '@tabler/icons-react';
import { formatTime } from '../../../utils/formatters';
import { Card, Button, Group, Text, ActionIcon, Stack, Badge, Paper, Modal, TextInput, Anchor } from '@mantine/core';

import { useSettings } from '../../../contexts/SettingsContext';
import { StatusPromptModal } from '../../tracker/components/StatusPromptModal';

export const WorkQueue: React.FC = () => {
  const { todos, removeTodo, reorderTodos, activeTodoId } = useQueue();
  const { promptStatusOnStart, redmineUrl } = useSettings();
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
    const todo = todos.find(t => t.id === todoId);
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
    const todo = todos.find(t => t.id === promptTodoId);
    (timer as any).startAfterPrompt(promptTodoId, promptText.trim());
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
        ? 'This task is currently being tracked. Are you sure you want to remove it?'
        : 'Are you sure you want to remove this task from the queue?',
      variant: 'danger',
      confirmText: 'Remove',
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
              <Text fw={500}>Work Queue</Text>
            </Group>
            <Badge size="lg" circle>{todos.length}</Badge>
          </Group>
        </Card.Section>

        <Stack mt="md">
          <Text size="sm" c="dimmed">Drag to reorder. First task is active when timer starts.</Text>

          {todos.length === 0 ? (
            <Text c="dimmed" ta="center" py="xl">Your queue is empty. Add a task below to get started.</Text>
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
                        <Group gap={4} wrap="nowrap">
                          <Anchor href={`${redmineUrl}/issues/${todo.taskId}`} target="_blank" size="sm" fw={600} truncate underline="hover">
                            #{todo.taskId} - {todo.taskSubject}
                          </Anchor>
                          <ActionIcon component="a" href={`${redmineUrl}/issues/${todo.taskId}`} target="_blank" size="xs" variant="subtle" color="gray" title="Open in Redmine">
                            <IconExternalLink size={12} />
                          </ActionIcon>
                        </Group>
                        {todo.activityName && <Text size="xs" c="dimmed" truncate>{todo.activityName}</Text>}
                        {todo.note && <Text size="xs" mt={4} truncate>{todo.note}</Text>}
                      </Stack>

                      <Group gap="xs" wrap="nowrap" align="center">
                        {(elapsedSec > 0 || isThisRunning) && (
                          <Text size="sm" fw={700} c={isThisRunning ? 'blue' : 'dimmed'} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {isThisRunning ? formatTime(timer.totalElapsedTime) : formatTime(elapsedSec)}
                          </Text>
                        )}
                        <ActionIcon
                          variant={isThisRunning ? 'light' : 'filled'}
                          color={isThisRunning ? 'orange' : 'blue'}
                          onClick={() => handlePlayPause(todo.id)}
                          aria-label={isThisRunning ? 'Pause' : 'Start'}
                        >
                          {isThisRunning ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          onClick={() => handleDelete(todo.id)}
                          aria-label="Remove task"
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
        title={<Text fw={600}>What is your first performed task?</Text>}
        centered
      >
        <Stack gap="md">
          <TextInput
            placeholder="e.g., Investigating bug #123"
            value={promptText}
            onChange={e => setPromptText(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Enter') handlePromptSubmit(); }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setShowPrompt(false)}>Cancel</Button>
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={handlePromptSubmit}
              disabled={!promptText.trim()}
            >
              Start
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
