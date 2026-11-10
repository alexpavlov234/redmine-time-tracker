import React, { useState } from 'react';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useQueue } from '../../../contexts/QueueContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { IconPlayerPlay, IconPlayerPause, IconPlayerStop, IconAlertCircle } from '@tabler/icons-react';
import { Button, Modal, TextInput, Paper, Group, Text, ActionIcon, Stack, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { formatTime } from '../../../utils/formatters';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';

/// <summary>
/// Properties for configuring the TimerBar component.
/// </summary>
interface TimerBarProps {
  /// <summary>Optional callback invoked when the user stops the timer session.</summary>
  onStop?: () => void;
}

/// <summary>
/// Global top bar displaying active task info, running timer, and play/pause/stop actions without redundant status labels.
/// </summary>
export const TimerBar: React.FC<TimerBarProps> = ({ onStop }) => {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { isConfigured } = useSettings();
  const { todos } = useQueue();
  const { t } = useLanguage();
  const timer = useQueueTimer();
  const { isRunning, totalElapsedTime, activeTodo } = timer;

  const [showFirstActivityModal, setShowFirstActivityModal] = useState(false);
  const [firstActivityText, setFirstActivityText] = useState('');
  const [pendingTodoId, setPendingTodoId] = useState<number | null>(null);

  if (!isConfigured) {
    return (
      <Paper shadow="xs" p="md" radius="md" withBorder bg="var(--mantine-color-default)">
        <Group justify="center" c="dimmed">
          <IconAlertCircle size={18} />
          <Text size="sm">{t('timerConfigurePrompt')}</Text>
        </Group>
      </Paper>
    );
  }

  // Active task info
  const currentTaskId = activeTodo?.taskId || (todos.length > 0 ? todos[0].taskId : '');
  const currentSubject = activeTodo?.taskSubject || (todos.length > 0 ? todos[0].taskSubject : '');
  const displayProject = activeTodo?.projectName || (todos.length > 0 ? todos[0].projectName : '');
  const displayActivity = activeTodo?.activityName;

  /// <summary>
  /// Starts timer for active todo or general tracking session.
  /// </summary>
  const handleStart = async () => {
    const targetTodo = activeTodo || (todos.length > 0 ? todos[0] : null);

    if (targetTodo) {
      const result = await timer.startTimerForTodo(targetTodo.id);
      if (result === 'needs_prompt') {
        setPendingTodoId(targetTodo.id);
        setFirstActivityText(targetTodo.note || '');
        setShowFirstActivityModal(true);
      }
    } else {
      timer.startWithoutTask();
    }
  };

  /// <summary>
  /// Confirms first activity text and initiates timer for todo.
  /// </summary>
  const handleFirstActivitySubmit = () => {
    if (!firstActivityText.trim() || pendingTodoId === null) return;
    timer.startAfterPrompt(pendingTodoId, firstActivityText.trim());
    setShowFirstActivityModal(false);
    setFirstActivityText('');
    setPendingTodoId(null);
  };

  /// <summary>
  /// Cancels first activity prompt modal.
  /// </summary>
  const handleFirstActivityCancel = () => {
    setShowFirstActivityModal(false);
    setFirstActivityText('');
    setPendingTodoId(null);
  };

  return (
    <>
      <Paper shadow="sm" p="md" radius="md" withBorder bg="var(--mantine-color-default)">
        <Group justify="space-between" wrap={isMobile ? 'wrap' : 'nowrap'} gap="md">
          <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
            {(displayProject || displayActivity) && (
              <Group gap="xs" wrap="nowrap">
                {displayProject && (
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" truncate>
                    {displayProject}
                  </Text>
                )}
                {displayActivity && (
                  <Text
                    size="xs"
                    c="dimmed"
                    fw={500}
                    style={{
                      borderLeft: displayProject ? '1px solid var(--mantine-color-default-border)' : undefined,
                      paddingLeft: displayProject ? '0.5rem' : undefined,
                    }}
                  >
                    {displayActivity}
                  </Text>
                )}
              </Group>
            )}

            {currentTaskId ? (
              <RedmineIssueLink
                issueId={currentTaskId}
                subject={currentSubject}
                size="lg"
                fw={700}
              />
            ) : (
              <Text size="md" fw={600} c="dimmed" truncate>
                {t('noActiveTaskSelected')}
              </Text>
            )}
          </Stack>

          <Group gap="md" wrap="nowrap" justify={isMobile ? 'flex-end' : 'flex-start'} style={isMobile ? { width: '100%' } : undefined}>
            <Text
              size="1.8rem"
              fw={700}
              c={isRunning ? 'blue' : undefined}
              style={{
                fontVariantNumeric: 'tabular-nums',
                letterSpacing: '-0.5px',
                lineHeight: 1,
              }}
            >
              {formatTime(totalElapsedTime)}
            </Text>

            <Group gap="xs" wrap="nowrap">
              {!isRunning ? (
                <Tooltip label={todos.length === 0 ? t('startTrackingNoTaskTooltip') : t('startTrackingTooltip')}>
                  <ActionIcon variant="filled" color="blue" size="xl" radius="xl" onClick={handleStart} aria-label={t('startTrackingTooltip')}>
                    <IconPlayerPlay size={22} fill="currentColor" />
                  </ActionIcon>
                </Tooltip>
              ) : (
                <Tooltip label={t('pauseTimerTooltip')}>
                  <ActionIcon variant="filled" color="orange" size="xl" radius="xl" onClick={timer.pauseTimer} aria-label={t('pauseTimerTooltip')}>
                    <IconPlayerPause size={22} fill="currentColor" />
                  </ActionIcon>
                </Tooltip>
              )}

              <Tooltip label={t('stopAndLogTooltip')}>
                <ActionIcon
                  variant="light"
                  color="red"
                  size="xl"
                  radius="xl"
                  onClick={onStop || timer.stopTimer}
                  disabled={totalElapsedTime === 0 && !isRunning}
                  aria-label={t('stopAndLogTooltip')}
                >
                  <IconPlayerStop size={22} fill="currentColor" />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Group>
      </Paper>

      {/* First Activity Prompt Modal */}
      <Modal
        opened={showFirstActivityModal}
        onClose={handleFirstActivityCancel}
        title={<Text fw={600}>{t('firstPerformedTaskQuestion')}</Text>}
        size="md"
        fullScreen={isMobile}
        centered
        radius="md"
      >
        <Stack gap="md">
          <TextInput
            label={t('performedTaskDescLabel')}
            placeholder={t('performedTaskPlaceholder')}
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
              {t('startTrackingBtn')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
