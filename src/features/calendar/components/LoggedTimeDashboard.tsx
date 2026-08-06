import React, { useState } from 'react';
import { Button, Group, Title, ActionIcon, Stack } from '@mantine/core';
import { IconCalendar, IconRefresh, IconChecklist, IconSquareX } from '@tabler/icons-react';
import { useCalendarEntries } from '../hooks/useCalendarEntries';
import { CalendarGrid } from './CalendarGrid';
import { DayDetailsView } from './DayDetailsView';
import { BulkLogForm } from './BulkLogForm';
import { TimeEntryFormModal } from './TimeEntryFormModal';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { deleteTimeEntry } from '../../../services/redmine';
import type { TimeEntry } from '../../../types';
import { notifications } from '@mantine/notifications';

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

  const handlePrevMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
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
    if (!isMultiSelectMode) {
      setSelectedDays(new Set(activeDayStr ? [activeDayStr] : []));
    } else {
      setSelectedDays(new Set());
    }
    setIsMultiSelectMode(prev => !prev);
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
      notifications.show({ title: 'Success', message: 'Time entry deleted.', color: 'green' });
      refetch();
    } catch (err: any) {
      notifications.show({ title: 'Error', message: err.message || 'Failed to delete time entry.', color: 'red' });
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
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap="xs">
          <IconCalendar size={28} color="var(--mantine-color-blue-filled)" />
          <Title order={2}>Calendar Log</Title>
        </Group>

        <Group>
          <Button
            size="sm"
            variant={isMultiSelectMode ? 'filled' : 'light'}
            leftSection={isMultiSelectMode ? <IconSquareX size={16} /> : <IconChecklist size={16} />}
            onClick={toggleMultiSelectMode}
          >
            {isMultiSelectMode ? 'Cancel Multi-Select' : 'Select Multiple Days'}
          </Button>

          <ActionIcon
            size="lg"
            variant="light"
            onClick={refetch}
            loading={isLoading}
            aria-label="Refresh calendar"
          >
            <IconRefresh size={20} />
          </ActionIcon>
        </Group>
      </Group>

      <Group align="flex-start" wrap="nowrap" style={{ gap: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <CalendarGrid
            currentMonth={currentMonth}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            entriesByDate={entriesByDate}
            selectedDays={isMultiSelectMode ? selectedDays : new Set(activeDayStr ? [activeDayStr] : [])}
            onDayClick={handleDayClick}
            isLoading={isLoading}
            isMultiSelectMode={isMultiSelectMode}
          />
        </div>

        {!isMultiSelectMode && activeDayStr && (
          <div style={{ width: '350px', flexShrink: 0 }}>
            <DayDetailsView
              dateStr={activeDayStr}
              entries={entriesByDate[activeDayStr] || []}
              onClose={() => setActiveDayStr(null)}
              onEdit={handleEditEntry}
              onDelete={handleDeleteEntry}
              onAdd={handleAddEntry}
            />
          </div>
        )}

        {isMultiSelectMode && selectedDays.size > 0 && (
          <div style={{ width: '400px', flexShrink: 0 }}>
            <BulkLogForm
              selectedDays={selectedDays}
              onSuccess={handleBulkSuccess}
              onCancel={toggleMultiSelectMode}
            />
          </div>
        )}
      </Group>

      <TimeEntryFormModal
        isOpen={isFormModalOpen}
        onClose={() => { setIsFormModalOpen(false); setEditingEntry(null); setAddForDate(undefined); }}
        onSuccess={handleFormSuccess}
        editEntry={editingEntry}
        defaultDate={addForDate}
      />
    </Stack>
  );
};
