import React from 'react';
import type { TimeEntry } from '../../../types';
import styles from './CalendarGrid.module.scss';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../../../components/ui';

interface CalendarGridProps {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  entriesByDate: Record<string, TimeEntry[]>;
  selectedDays: Set<string>;
  onDayClick: (dateStr: string) => void;
  isLoading: boolean;
  isMultiSelectMode: boolean;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  currentMonth,
  onPrevMonth,
  onNextMonth,
  entriesByDate,
  selectedDays,
  onDayClick,
  isLoading,
  isMultiSelectMode
}) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  // 0 = Sunday, 1 = Monday. We want Monday=0, Sunday=6
  let startDayOfWeek = firstDayOfMonth.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const monthName = currentMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

  const cells = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(<div key={`empty-${i}`} className={`${styles.day} ${styles.empty}`} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, month, day));
    const entries = entriesByDate[dateStr] || [];
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const hasEntries = totalHours > 0;
    const isSelected = selectedDays.has(dateStr);
    const isToday = dateStr === formatDate(new Date());

    cells.push(
      <div
        key={dateStr}
        className={`
          ${styles.day} 
          ${hasEntries ? styles.hasEntries : ''} 
          ${isSelected ? styles.selected : ''} 
          ${isToday ? styles.today : ''} 
          ${isMultiSelectMode ? styles.multiSelectMode : ''}
        `}
        onClick={() => onDayClick(dateStr)}
      >
        <span className={styles.dayNumber}>{day}</span>
        {hasEntries && (
          <span className={styles.hoursBadge}>{totalHours.toFixed(1)}h</span>
        )}
        {isSelected && (
          <div className={styles.selectedMarker} />
        )}
      </div>
    );
  }

  // padding end
  const totalCells = startDayOfWeek + daysInMonth;
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remainingCells; i++) {
    cells.push(<div key={`empty-end-${i}`} className={`${styles.day} ${styles.empty}`} />);
  }

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <Button variant="ghost" size="sm" icon={ChevronLeft} onClick={onPrevMonth} aria-label="Previous Month" />
        <h3 className={styles.monthTitle}>{monthName}</h3>
        <Button variant="ghost" size="sm" icon={ChevronRight} onClick={onNextMonth} aria-label="Next Month" />
      </div>

      <div className={styles.grid}>
        {dayNames.map(d => (
          <div key={d} className={styles.dayHeaderCell}>{d}</div>
        ))}
        {cells}
      </div>
      
      {isLoading && (
        <div className={styles.loadingOverlay}>
          <div className={styles.spinner} />
        </div>
      )}
    </div>
  );
};

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
