import React, { useState, useCallback } from 'react';
import { TimerBar } from '../../timer/components/TimerBar';
import { WorkQueue } from '../../queue/components/WorkQueue';
import { AddTaskForm } from '../../queue/components/AddTaskForm';
import { SummaryModal } from './SummaryModal';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { Card, Button, Input } from '../../../components/ui';
import { ClipboardList, Plus } from 'lucide-react';
import styles from './TrackerDashboard.module.scss';

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
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ClipboardList size={20} className="text-primary" />
          Performed Tasks
        </div>
      }
      headerAction={
        <span className={styles.activityCount}>{timer.activities.length}</span>
      }
    >
      {timer.activities.length === 0 ? (
        <div className={styles.emptyActivities}>
          No performed tasks recorded yet. Add one below.
        </div>
      ) : (
        <ul className={styles.activityList}>
          {timer.activities.map((act, i) => (
            <li key={i} className={styles.activityItem}>
              <span className={styles.activityText}>{act.text}</span>
              {act.durationSeconds !== undefined && act.durationSeconds > 0 && (
                <span className={styles.activityDuration}>
                  {formatDuration(act.durationSeconds)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {timer.isRunning && (
        <div className={styles.addActivityRow}>
          <Input
            placeholder="What are you working on now?"
            value={newActivityText}
            onChange={(e) => setNewActivityText(e.target.value)}
            onKeyDown={handleKeyDown}
            fullWidth
          />
          <Button
            variant="primary"
            size="sm"
            icon={Plus}
            onClick={handleAddActivity}
            disabled={!newActivityText.trim()}
          >
            Add
          </Button>
        </div>
      )}
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <TimerBar onStop={handleStop} />
      <PerformedTasks />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
        <WorkQueue />
        <AddTaskForm />
      </div>

      <SummaryModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} />
    </div>
  );
};
