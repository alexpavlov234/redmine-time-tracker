import React, { useState } from 'react';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useQueue } from '../../../contexts/QueueContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { IconPlayerPlay, IconPlayerPause, IconPlayerStop, IconAlertCircle, IconArrowDown } from '@tabler/icons-react';
import { Button, Modal, TextInput, Paper, Group, Text, ActionIcon, Stack } from '@mantine/core';
import { formatTime } from '../../../utils/formatters';

interface TimerBarProps {
  onStop?: () => void;
}

export const TimerBar: React.FC<TimerBarProps> = ({ onStop }) => {
  const { isConfigured } = useSettings();
  const { todos } = useQueue();
  const timer = useQueueTimer();
  const { isRunning, totalElapsedTime, activeTodo } = timer;

  const [showFirstActivityModal, setShowFirstActivityModal] = useState(false);
  const [firstActivityText, setFirstActivityText] = useState('');
  const [pendingTodoId, setPendingTodoId] = useState<number | null>(null);

  const handleStart = async () => {
    if (todos.length === 0) return;
    const firstTodo = todos[0];
    const result = await timer.startTimerForTodo(firstTodo.id);
    if (result === 'needs_prompt') {
      setPendingTodoId(firstTodo.id);
      setFirstActivityText(firstTodo.note || '');
      setShowFirstActivityModal(true);
    }
  };

  const handleFirstActivitySubmit = () => {
    if (!firstActivityText.trim() || pendingTodoId === null) return;
    (timer as any).startAfterPrompt(pendingTodoId, firstActivityText.trim());
    setShowFirstActivityModal(false);
    setFirstActivityText('');
    setPendingTodoId(null);
  };

  const handleFirstActivityCancel = () => {
    setShowFirstActivityModal(false);
    setFirstActivityText('');
    setPendingTodoId(null);
  };

  // Not configured state
  if (!isConfigured) {
    return (
      <Paper shadow="sm" p="md" radius="md" withBorder bg="var(--mantine-color-default)">
        <Group justify="center" c="dimmed">
          <IconAlertCircle size={18} />
          <Text size="sm">Configure your Redmine connection in Settings to start tracking.</Text>
        </Group>
      </Paper>
    );
  }

  // No tasks state
  if (todos.length === 0 && !isRunning) {
    return (
      <Paper shadow="sm" p="md" radius="md" withBorder bg="var(--mantine-color-default)">
        <Group justify="center" c="dimmed">
          <IconArrowDown size={18} />
          <Text size="sm">Add a task using the <Text component="span" fw={700}>Add Task Manually</Text> form to start tracking</Text>
        </Group>
      </Paper>
    );
  }

  // Active task info
  const displayProject = activeTodo?.projectName || (todos.length > 0 ? todos[0].projectName : '');
  const displayTask = activeTodo
    ? `#${activeTodo.taskId} - ${activeTodo.taskSubject}`
    : (todos.length > 0 ? `#${todos[0].taskId} - ${todos[0].taskSubject}` : '');
  const displayActivity = activeTodo?.activityName;

  return (
    <>
      <Paper shadow="sm" p="md" radius="md" withBorder>
        <Group justify="space-between" wrap="nowrap">
          <Stack gap={4} style={{ overflow: 'hidden' }}>
            <Group gap="xs" wrap="nowrap">
              <Text size="sm" fw={600} truncate>{displayProject}</Text>
              {displayActivity && (
                <Text size="xs" c="dimmed" fw={500} style={{ borderLeft: '1px solid var(--mantine-color-default-border)', paddingLeft: '0.5rem' }}>
                  {displayActivity}
                </Text>
              )}
            </Group>
            <Text size="lg" fw={700} truncate>{displayTask}</Text>
          </Stack>

          <Group gap="md" wrap="nowrap">
            <Text
              size="xl"
              fw={700}
              variant="gradient"
              gradient={{ from: 'blue', to: 'cyan', deg: 90 }}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {formatTime(totalElapsedTime)}
            </Text>

            <Group gap="xs" wrap="nowrap">
              {!isRunning ? (
                <ActionIcon variant="filled" color="blue" size="xl" radius="xl" onClick={handleStart}>
                  <IconPlayerPlay size={24} fill="currentColor" />
                </ActionIcon>
              ) : (
                <ActionIcon variant="filled" color="orange" size="xl" radius="xl" onClick={timer.pauseTimer}>
                  <IconPlayerPause size={24} fill="currentColor" />
                </ActionIcon>
              )}

              <ActionIcon
                variant="light"
                color="red"
                size="xl"
                radius="xl"
                onClick={onStop || timer.stopTimer}
                disabled={totalElapsedTime === 0 && !isRunning}
              >
                <IconPlayerStop size={24} fill="currentColor" />
              </ActionIcon>
            </Group>
          </Group>
        </Group>
      </Paper>

      {/* First Activity Prompt Modal */}
      <Modal
        opened={showFirstActivityModal}
        onClose={handleFirstActivityCancel}
        title={<Text fw={600}>What is your first performed task?</Text>}
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Performed task description"
            placeholder="e.g., Investigating bug #123"
            value={firstActivityText}
            onChange={e => setFirstActivityText(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleFirstActivitySubmit(); }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button
              leftSection={<IconPlayerPlay size={16} fill="currentColor" />}
              onClick={handleFirstActivitySubmit}
              disabled={!firstActivityText.trim()}
            >
              Start Tracking
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
