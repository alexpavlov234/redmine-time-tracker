import React, { useState, useCallback } from 'react';
import { TimerBar } from '../../timer/components/TimerBar';
import { WorkQueue } from '../../queue/components/WorkQueue';
import { AddTaskForm } from '../../queue/components/AddTaskForm';
import { SummaryModal } from './SummaryModal';
import { AssignedTasksPanel } from './AssignedTasksPanel';
import { StandardLogPanel } from './StandardLogPanel';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useSettings } from '../../../contexts/SettingsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { Card, Button, TextInput, Group, Stack, Badge, Text, ThemeIcon, Grid, SegmentedControl, Timeline, Title } from '@mantine/core';
import { IconClipboardList, IconPlus, IconCheck, IconClock } from '@tabler/icons-react';

/// <summary>
/// Sub-panel for viewing and recording incremental activities with an ongoing timeline during an active timer session.
/// </summary>
const PerformedTasks: React.FC = () => {
  const timer = useQueueTimer();
  const { t } = useLanguage();
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
            <Text fw={500}>{t('ongoingTimelineTitle')}</Text>
          </Group>
          <Badge size="lg" circle>{timer.activities.length}</Badge>
        </Group>
      </Card.Section>

      <Stack mt="md" gap="md">
        {timer.activities.length === 0 ? (
          <Text c="dimmed" size="sm" ta="center" py="md">
            {t('noActivitiesRecorded')}
          </Text>
        ) : (
          <Timeline active={timer.activities.length - 1} bulletSize={24} lineWidth={2}>
            {timer.activities.map((act, i) => {
              const isCurrent = i === timer.activities.length - 1 && timer.isRunning;
              return (
                <Timeline.Item
                  key={i}
                  bullet={
                    <ThemeIcon
                      size={22}
                      radius="xl"
                      color={isCurrent ? 'blue' : 'teal'}
                      variant={isCurrent ? 'filled' : 'light'}
                    >
                      {isCurrent ? <IconClock size={12} /> : <IconCheck size={12} />}
                    </ThemeIcon>
                  }
                  title={
                    <Group justify="space-between" align="baseline">
                      <Text size="sm" fw={isCurrent ? 600 : 500} c={isCurrent ? 'blue' : undefined}>
                        {act.text}
                      </Text>
                      {act.durationSeconds !== undefined && act.durationSeconds > 0 && (
                        <Badge size="xs" variant="light" color={isCurrent ? 'blue' : 'gray'}>
                          {formatDuration(act.durationSeconds)}
                        </Badge>
                      )}
                    </Group>
                  }
                >
                  {act.timestamp && (
                    <Text c="dimmed" size="xs">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </Text>
                  )}
                </Timeline.Item>
              );
            })}
          </Timeline>
        )}

        {timer.isRunning && (
          <Group align="flex-end">
            <TextInput
              placeholder={t('whatWorkingOnPlaceholder')}
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
              {t('addBtn')}
            </Button>
          </Group>
        )}
      </Stack>
    </Card>
  );
};

/// <summary>
/// Main Tracker dashboard combining timer bar, queue management, assigned issues, and presets.
/// </summary>
export const TrackerDashboard: React.FC = () => {
  const timer = useQueueTimer();
  const { usePerformedTasksList, setUsePerformedTasksList } = useSettings();
  const { t } = useLanguage();
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  // When timer stops, open the summary modal
  const handleStop = useCallback(() => {
    timer.stopTimer();
    if (timer.totalElapsedTime > 0 || timer.activeTodo) {
      setIsSummaryOpen(true);
    }
  }, [timer]);

  return (
    <Stack gap="lg">
      {/* Consistent Top Page Header */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t('navTracker')}</Title>

        <SegmentedControl
          size="sm"
          radius="md"
          color="blue"
          value={usePerformedTasksList ? 'performed' : 'direct'}
          onChange={(val) => setUsePerformedTasksList(val === 'performed')}
          data={[
            { label: t('directLoggingTitle'), value: 'direct' },
            { label: t('performedListTitle'), value: 'performed' },
          ]}
        />
      </Group>

      <Grid>
        {/* Left Column: Timer, Performed Tasks, Work Queue */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="lg">
            <TimerBar onStop={handleStop} />
            {usePerformedTasksList && <PerformedTasks />}
            <WorkQueue />
          </Stack>
        </Grid.Col>

        {/* Right Column: Task Selection (Assigned Tasks, Presets, Add Task) */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="lg">
            <AssignedTasksPanel />
            <StandardLogPanel />
            <AddTaskForm />
          </Stack>
        </Grid.Col>
      </Grid>

      {isSummaryOpen && (
        <SummaryModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} />
      )}
    </Stack>
  );
};
