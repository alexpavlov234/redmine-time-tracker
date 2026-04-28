import React, { useState } from 'react';
import { Button } from '../../../components/ui';
import { Calendar as CalendarIcon, RefreshCw, CheckSquare, XSquare } from 'lucide-react';
import styles from './LoggedTimeDashboard.module.scss';
import { useCalendarEntries } from '../hooks/useCalendarEntries';
import { CalendarGrid } from './CalendarGrid';
import { DayDetailsView } from './DayDetailsView';
import { BulkLogForm } from './BulkLogForm';
import { TimeEntryFormModal } from './TimeEntryFormModal';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useToast } from '../../../contexts/ToastContext';
import { deleteTimeEntry } from '../../../services/redmine';
import type { TimeEntry } from '../../../types';

export const LoggedTimeDashboard: React.FC = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [activeDayStr, setActiveDayStr] = useState<string | null>(null);

  // Edit/Add modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [addForDate, setAddForDate] = useState<string | undefined>(undefined);

  const { entriesByDate, isLoading, refetch } = useCalendarEntries(currentMonth);
  const confirm = useConfirm();
  const { showSuccess, showError } = useToast();

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    setSelectedDays(new Set());
    setActiveDayStr(null);
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
    setSelectedDays(new Set());
    setActiveDayStr(null);
  };

  const handleDayClick = (dateStr: string) => {
    if (isMultiSelectMode) {
      setSelectedDays(prev => {
        const next = new Set(prev);
        if (next.has(dateStr)) {
          next.delete(dateStr);
        } else {
          next.add(dateStr);
        }
        return next;
      });
    } else {
      setActiveDayStr(dateStr === activeDayStr ? null : dateStr);
    }
  };

  const toggleMultiSelectMode = () => {
    setIsMultiSelectMode(prev => !prev);
    setSelectedDays(new Set());
    setActiveDayStr(null);
  };

  const handleBulkSuccess = () => {
    refetch();
    toggleMultiSelectMode();
  };

  // --- Day Details handlers ---
  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setAddForDate(undefined);
    setIsFormModalOpen(true);
  };

  const handleDeleteEntry = async (entryId: number) => {
    const confirmed = await confirm({
      message: 'Are you sure you want to delete this time entry?',
      subtitle: 'This action cannot be undone.',
      variant: 'danger',
      confirmText: 'Delete',
    });
    if (!confirmed) return;

    try {
      await deleteTimeEntry(entryId);
      showSuccess('Time entry deleted.');
      refetch();
    } catch (err: any) {
      showError(err.message || 'Failed to delete time entry.');
    }
  };

  const handleAddEntry = (dateStr: string) => {
    setEditingEntry(null);
    setAddForDate(dateStr);
    setIsFormModalOpen(true);
  };

  const handleFormSuccess = () => {
    refetch();
    setIsFormModalOpen(false);
    setEditingEntry(null);
    setAddForDate(undefined);
  };

  return (
    <div className={styles.container}>
      <div className={styles.topActions}>
        <h2 className={styles.pageTitle}>
          <CalendarIcon size={24} className="text-primary" />
          Calendar Log
        </h2>

        <div className={styles.toolbar}>
          <Button
            size="sm"
            variant={isMultiSelectMode ? 'primary' : 'secondary'}
            icon={isMultiSelectMode ? XSquare : CheckSquare}
            onClick={toggleMultiSelectMode}
          >
            {isMultiSelectMode ? 'Cancel Multi-Select' : 'Select Multiple Days'}
          </Button>

          <Button
            size="sm"
            variant="ghost"
            icon={RefreshCw}
            onClick={refetch}
            isLoading={isLoading}
            aria-label="Refresh calendar"
          />
        </div>
      </div>

      <div className={styles.grid}>
        <CalendarGrid
          currentMonth={currentMonth}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          entriesByDate={entriesByDate}
          selectedDays={selectedDays}
          onDayClick={handleDayClick}
          isLoading={isLoading}
          isMultiSelectMode={isMultiSelectMode}
        />

        {!isMultiSelectMode && activeDayStr && (
          <DayDetailsView
            dateStr={activeDayStr}
            entries={entriesByDate[activeDayStr] || []}
            onClose={() => setActiveDayStr(null)}
            onEdit={handleEditEntry}
            onDelete={handleDeleteEntry}
            onAdd={handleAddEntry}
          />
        )}

        {isMultiSelectMode && selectedDays.size > 0 && (
          <div className={styles.bulkFormContainer}>
            <BulkLogForm
              selectedDays={selectedDays}
              onSuccess={handleBulkSuccess}
              onCancel={toggleMultiSelectMode}
            />
          </div>
        )}
      </div>

      {/* Time Entry Form Modal (Edit / Add) */}
      <TimeEntryFormModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingEntry(null); setAddForDate(undefined); }}
        onSuccess={handleFormSuccess}
        editEntry={editingEntry}
        defaultDate={addForDate}
      />
    </div>
  );
};
