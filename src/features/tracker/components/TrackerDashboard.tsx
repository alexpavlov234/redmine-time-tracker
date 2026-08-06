import React, { useState, useCallback } from 'react';
import { TimerBar } from '../../timer/components/TimerBar';
import { WorkQueue } from '../../queue/components/WorkQueue';
import { AddTaskForm } from '../../queue/components/AddTaskForm';
import { SummaryModal } from './SummaryModal';
import { AssignedTasksPanel } from './AssignedTasksPanel';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { Card, Button, TextInput, Group, Stack, Badge, Text, List, ThemeIcon } from '@mantine/core';
import { IconClipboardList, IconPlus, IconCheck } from '@tabler/icons-react';

/** "Performed Tasks" panel showing activities logged during the timer session */
const PerformedTasks: React.FC = () => {
  const timer = useQueueTimer();
  const [newActivityText, setNewActivityText] = useState('');

  const handleAddActivity = () => {
    if (!newActivityText.trim()) return;
    timer.addActivity(newActivityText.trim());
    setNewActivityText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddActivity();
    }
  };

  if (!timer.activeTodo) return null;

  const formatDuration = (secs?: number) => {
    if (!secs || secs <= 0) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconClipboardList size={20} />
            <Text fw={500}>Performed Tasks</Text>
          </Group>
          <Badge size="lg" circle>{timer.activities.length}</Badge>
        </Group>
      </Card.Section>

      <Stack mt="md">
        {timer.activities.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center" py="md">
            No performed tasks recorded yet. Add one below.
          </Text>
        ) : (
          <List
            spacing="sm"
            size="sm"
            center
            icon={
              <ThemeIcon color="teal" size={24} radius="xl">
                <IconCheck size={16} />
              </ThemeIcon>
            }
          >
            {timer.activities.map((act, i) => (
              <List.Item key={i}>
                <Group justify="space-between">
                  <Text>{act.text}</Text>
                  {act.durationSeconds !== undefined && act.durationSeconds > 0 && (
                    <Text size="xs" c="dimmed" fw={500}>
                      {formatDuration(act.durationSeconds)}
                    </Text>
                  )}
                </Group>
              </List.Item>
            ))}
          </List>
        )}

        {timer.isRunning && (
          <Group align="flex-end">
            <TextInput
              placeholder="What are you working on now?"
              value={newActivityText}
              onChange={(e) => setNewActivityText(e.target.value)}
              onKeyDown={handleKeyDown}
              style={{ flex: 1 }}
            />
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={handleAddActivity}
              disabled={!newActivityText.trim()}
            >
              Add
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  );
};

export const TrackerDashboard: React.FC = () => {
  const timer = useQueueTimer();
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // When timer stops, open the summary modal
  const handleStop = useCallback(() => {
    timer.stopTimer();
    if (timer.totalElapsedTime > 0 || timer.activeTodo) {
      setIsSummaryOpen(true);
    }
  }, [timer]);

  return (
    <Stack gap="xl">
      <TimerBar onStop={handleStop} />
      <PerformedTasks />
      
      <AssignedTasksPanel />

      <Stack gap="xl">
        <WorkQueue />
        <AddTaskForm />
      </Stack>

      <SummaryModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} />
    </Stack>
  );
};
