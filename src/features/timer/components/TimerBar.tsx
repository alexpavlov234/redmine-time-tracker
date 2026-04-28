import React, { useState } from 'react';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useQueue } from '../../../contexts/QueueContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { Play, Pause, Square, AlertCircle, ArrowDown } from 'lucide-react';
import { Button, Modal, Input } from '../../../components/ui';
import styles from './TimerBar.module.scss';
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
      <div className={`${styles.timerBar} glass-panel`}>
        <div className={styles.emptyState}>
          <AlertCircle size={18} />
          <span>Configure your Redmine connection in Settings to start tracking.</span>
        </div>
      </div>
    );
  }

  // No tasks state
  if (todos.length === 0 && !isRunning) {
    return (
      <div className={`${styles.timerBar} glass-panel`}>
        <div className={styles.emptyState}>
          <ArrowDown size={18} />
          <span>Add a task using the <strong>Add Task Manually</strong> form to start tracking</span>
        </div>
      </div>
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
      <div className={`${styles.timerBar} glass-panel`}>
        <div className={styles.taskInfo}>
          <span className={styles.project}>{displayProject}</span>
          <span className={styles.task}>{displayTask}</span>
          {displayActivity && <span className={styles.activity}>{displayActivity}</span>}
        </div>

        <div className={styles.controls}>
          <div className={styles.timeDisplay}>{formatTime(totalElapsedTime)}</div>

          {!isRunning ? (
            <Button icon={Play} onClick={handleStart} variant="primary" />
          ) : (
            <Button icon={Pause} onClick={timer.pauseTimer} variant="warning" />
          )}

          <Button
            icon={Square}
            onClick={onStop || timer.stopTimer}
            variant="danger"
            disabled={totalElapsedTime === 0 && !isRunning}
          />
        </div>
      </div>

      {/* First Activity Prompt Modal */}
      <Modal
        isOpen={showFirstActivityModal}
        onClose={handleFirstActivityCancel}
        title="What is your first performed task?"
        footer={
          <Button
            variant="primary"
            icon={Play}
            onClick={handleFirstActivitySubmit}
            disabled={!firstActivityText.trim()}
          >
            Start Tracking
          </Button>
        }
      >
        <Input
          label="Performed task description"
          placeholder="e.g., Investigating bug #123"
          value={firstActivityText}
          onChange={e => setFirstActivityText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleFirstActivitySubmit(); }}
          fullWidth
          autoFocus
        />
      </Modal>
    </>
  );
};
