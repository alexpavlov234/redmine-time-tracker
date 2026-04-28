import React from 'react';
import type { TimeEntry } from '../../../types';
import { Card, Button } from '../../../components/ui';
import styles from './DayDetailsView.module.scss';
import { Clock, Edit2, Trash2, Plus } from 'lucide-react';

interface DayDetailsViewProps {
  dateStr: string;
  entries: TimeEntry[];
  onClose: () => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (entryId: number) => void;
  onAdd: (dateStr: string) => void;
}

export const DayDetailsView: React.FC<DayDetailsViewProps> = ({
  dateStr,
  entries,
  onClose,
  onEdit,
  onDelete,
  onAdd,
}) => {
  const dateObj = new Date(dateStr + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);

  // Group entries by project for summary
  const projectSummary = entries.reduce<Record<string, number>>((acc, e) => {
    const name = e.project?.name || 'Unknown';
    acc[name] = (acc[name] || 0) + e.hours;
    return acc;
  }, {});

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Clock size={20} className="text-primary" />
          {formattedDate}
        </div>
      }
      headerAction={<span className={styles.badge}>{totalHours.toFixed(1)}h Total</span>}
      className={styles.detailsCard}
    >
      {/* Project summary stats */}
      {Object.keys(projectSummary).length > 0 && (
        <div className={styles.projectSummaryStats}>
          {Object.entries(projectSummary).map(([name, hours]) => {
            const percentage = totalHours > 0 ? (hours / totalHours) * 100 : 0;
            return (
              <div key={name} className={styles.projectStatItem}>
                <div className={styles.projectStatHeader}>
                  <span className={styles.projectStatName}>{name}</span>
                  <span className={styles.projectStatHours}>{hours.toFixed(1)}h</span>
                </div>
                <div className={styles.projectProgressBar}>
                  <div 
                    className={styles.projectProgressFill} 
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {entries.length === 0 ? (
        <div className={styles.emptyState}>No time logged on this day.</div>
      ) : (
        <ul className={styles.entryList}>
          {entries.map((entry) => (
            <li key={entry.id} className={styles.entryItem}>
              <div className={styles.content}>
                <div className={styles.header}>
                  <span className={styles.project}>{entry.project?.name || 'Unknown Project'}</span>
                  <span className={styles.hours}>{entry.hours}h</span>
                </div>
                <div className={styles.issue}>
                  #{entry.issue?.id} - {entry.issue?.subject || 'Unknown Task'}
                </div>
                {entry.comments && <div className={styles.comments}>{entry.comments}</div>}
                <div className={styles.meta}>Activity: {entry.activity?.name || 'General'}</div>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Edit2}
                  onClick={() => onEdit(entry)}
                  aria-label="Edit entry"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={Trash2}
                  onClick={() => onDelete(entry.id)}
                  aria-label="Delete entry"
                  className={styles.deleteBtn}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={styles.footer}>
        <Button variant="secondary" onClick={onClose}>
          Close Details
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => onAdd(dateStr)}>
          Log Time Here
        </Button>
      </div>
    </Card>
  );
};
