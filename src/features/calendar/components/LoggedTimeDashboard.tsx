import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Group, Title, ActionIcon, Stack, Paper, Text, Badge, Progress, Alert, Tooltip } from '@mantine/core';
import { IconRefresh, IconChecklist, IconSquareX, IconGitCommit, IconCloudUpload, IconCheck, IconAlertCircle, IconInfoCircle } from '@tabler/icons-react';
import { useCalendarEntries } from '../hooks/useCalendarEntries';
import { CalendarGrid } from './CalendarGrid';
import { DayDetailsView, type DraggedCalendarEntry } from './DayDetailsView';
import { BulkLogForm } from './BulkLogForm';
import { TimeEntryFormModal } from './TimeEntryFormModal';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useStagedEntries } from '../../../contexts/StagedEntriesContext';
import { deleteTimeEntry } from '../../../services/redmine';
import { formatDisplayDate } from '../../../utils/formatters';
import type { TimeEntry, StagedTimeEntry, TimeLogPreset } from '../../../types';

const PROJECT_PALETTE = [
  'blue',
  'teal',
  'violet',
  'grape',
  'orange',
  'cyan',
  'indigo',
  'lime',
  'pink',
  'emerald',
  'yellow',
  'red',
];

/// <summary>
/// Dashboard displaying a monthly calendar of logged Redmine time entries and a task/topic search view.
/// </summary>
export const LoggedTimeDashboard: React.FC = () => {
  const { language, t } = useLanguage();
  const [searchParams] = useSearchParams();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const yearParam = parseInt(searchParams.get('year') || '', 10);
    const monthParam = parseInt(searchParams.get('month') || '', 10);
    if (!isNaN(yearParam) && !isNaN(monthParam) && monthParam >= 1 && monthParam <= 12) {
      return new Date(yearParam, monthParam - 1, 1);
    }
    return new Date();
  });

  useEffect(() => {
    const yearParam = parseInt(searchParams.get('year') || '', 10);
    const monthParam = parseInt(searchParams.get('month') || '', 10);
    if (!isNaN(yearParam) && !isNaN(monthParam) && monthParam >= 1 && monthParam <= 12) {
      setCurrentMonth(new Date(yearParam, monthParam - 1, 1));
    }
  }, [searchParams]);
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<string>>(new Set());
  const [activeDayStr, setActiveDayStr] = useState<string | null>(null);
  const [draggingEntryKey, setDraggingEntryKey] = useState<string | null>(null);
  const draggingEntryRef = useRef<DraggedCalendarEntry | null>(null);
  const [pinnedDaySnapshot, setPinnedDaySnapshot] = useState<{ dateStr: string; entries: TimeEntry[] } | null>(null);

  // Edit/Add/Copy modal state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [editingStagedEntry, setEditingStagedEntry] = useState<StagedTimeEntry | null>(null);
  const [copyingEntry, setCopyingEntry] = useState<TimeEntry | null>(null);
  const [addForDate, setAddForDate] = useState<string | undefined>(undefined);
  const [selectedPresetForModal, setSelectedPresetForModal] = useState<TimeLogPreset | null>(null);
  const [pushFeedback, setPushFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const { entriesByDate, isLoading, refetch } = useCalendarEntries(currentMonth);
  const {
    stagedEntries,
    stagedByDate,
    totalStagedHours,
    isPushing,
    pushProgress,
    stageEntry,
    removeStagedEntry,
    pushEntry,
    pushDay,
    pushAll,
  } = useStagedEntries();
  const confirm = useConfirm();

  const currentMonthPrefix = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;

  const activeDayEntries = useMemo(() => {
    if (!activeDayStr) return [];
    if (activeDayStr.startsWith(currentMonthPrefix)) {
      return entriesByDate[activeDayStr] || [];
    }
    return pinnedDaySnapshot?.dateStr === activeDayStr ? pinnedDaySnapshot.entries : [];
  }, [activeDayStr, currentMonthPrefix, entriesByDate, pinnedDaySnapshot]);

  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  const todayStagedEntries = stagedByDate[todayStr] || [];
  const todayStagedHours = todayStagedEntries.reduce((sum, e) => sum + e.hours, 0);

  const projectColorMap = useMemo(() => {
    const names = new Set<string>();
    Object.values(entriesByDate).forEach(entries => {
      entries.forEach(e => {
        names.add(e.project?.name || t('generalNoProject'));
      });
    });
    const sorted = Array.from(names).sort();
    const map = new Map<string, string>();
    sorted.forEach((name, idx) => {
      map.set(name, PROJECT_PALETTE[idx % PROJECT_PALETTE.length]);
    });
    return map;
  }, [entriesByDate, t]);

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
    } else if (dateStr === activeDayStr) {
      setActiveDayStr(null);
      setPinnedDaySnapshot(null);
    } else {
      setActiveDayStr(dateStr);
      setPinnedDaySnapshot({ dateStr, entries: entriesByDate[dateStr] || [] });
    }
  };

  const handleEntryDragStart = useCallback(
    (payload: DraggedCalendarEntry, key: string) => {
      draggingEntryRef.current = payload;
      setDraggingEntryKey(key);
      if (activeDayStr && activeDayStr.startsWith(currentMonthPrefix)) {
        setPinnedDaySnapshot({
          dateStr: activeDayStr,
          entries: entriesByDate[activeDayStr] || [],
        });
      }
    },
    [activeDayStr, currentMonthPrefix, entriesByDate]
  );

  const handleEntryDragEnd = useCallback(() => {
    draggingEntryRef.current = null;
    setDraggingEntryKey(null);
  }, []);

  useEffect(() => {
    window.addEventListener('dragend', handleEntryDragEnd);
    return () => {
      window.removeEventListener('dragend', handleEntryDragEnd);
    };
  }, [handleEntryDragEnd]);

  const handleDropEntryOnDate = useCallback(
    (targetDateStr: string) => {
      const payload = draggingEntryRef.current;
      if (!payload) return;

      if (payload.kind === 'pushed') {
        const entry = payload.entry;
        const mappedCustomFields = (entry.custom_fields || [])
          .filter((cf) => cf.value !== undefined && cf.value !== null && cf.value !== '')
          .map((cf) => ({ id: cf.id, value: cf.value }));

        stageEntry({
          projectId: entry.project?.id ? String(entry.project.id) : '',
          projectName: entry.project?.name || t('generalNoProject'),
          issueId: entry.issue?.id,
          issueSubject: entry.issue?.subject,
          activityId: entry.activity?.id ?? 0,
          activityName: entry.activity?.name || '',
          hours: entry.hours,
          comments: entry.comments || '',
          spent_on: targetDateStr,
          ...(mappedCustomFields.length > 0 && { custom_fields: mappedCustomFields }),
        });
      } else {
        const entry = payload.entry;
        const mappedCustomFields = entry.custom_fields?.map((cf) => ({ ...cf }));

        stageEntry({
          projectId: entry.projectId,
          projectName: entry.projectName,
          issueId: entry.issueId,
          issueSubject: entry.issueSubject,
          activityId: entry.activityId,
          activityName: entry.activityName,
          hours: entry.hours,
          comments: entry.comments,
          spent_on: targetDateStr,
          ...(mappedCustomFields && mappedCustomFields.length > 0 && { custom_fields: mappedCustomFields }),
        });
      }

      draggingEntryRef.current = null;
      setDraggingEntryKey(null);
      setPushFeedback({
        success: true,
        message: `${t('dragCopySuccessPrefix')} ${formatDisplayDate(targetDateStr, language)}.`,
      });
    },
    [stageEntry, t, language]
  );

  const toggleMultiSelectMode = () => {
    if (!isMultiSelectMode) {
      setSelectedDays(new Set(activeDayStr ? [activeDayStr] : []));
    } else {
      setSelectedDays(new Set());
    }
    setIsMultiSelectMode(prev => !prev);
    setActiveDayStr(null);
    setPinnedDaySnapshot(null);
  };

  const handleBulkSuccess = () => {
    refetch();
    toggleMultiSelectMode();
  };

  /// <summary>
  /// Opens the time entry form modal in edit mode for the given entry.
  /// </summary>
  const handleEditEntry = (entry: TimeEntry) => {
    setEditingEntry(entry);
    setEditingStagedEntry(null);
    setCopyingEntry(null);
    setAddForDate(undefined);
    setSelectedPresetForModal(null);
    setIsFormModalOpen(true);
  };

  /// <summary>
  /// Opens the time entry form modal in edit mode for a locally staged entry.
  /// </summary>
  const handleEditStagedEntry = (entry: StagedTimeEntry) => {
    setEditingEntry(null);
    setEditingStagedEntry(entry);
    setCopyingEntry(null);
    setAddForDate(undefined);
    setSelectedPresetForModal(null);
    setIsFormModalOpen(true);
  };

  const handleDeleteStagedEntry = async (localId: string) => {
    const confirmed = await confirm({
      message: t('deleteStagedConfirm'),
      subtitle: t('deleteStagedSubtitle'),
      variant: 'danger',
      confirmText: t('deleteBtn'),
    });
    if (!confirmed) return;
    removeStagedEntry(localId);
  };

  const handlePushStagedEntry = async (localId: string) => {
    setPushFeedback(null);
    const res = await pushEntry(localId);
    if (res.success) {
      setPushFeedback({ success: true, message: `${t('stagedPushSuccess')} 1` });
      refetch();
    } else {
      setPushFeedback({ success: false, message: `${t('stagedPushPartialError')} ${res.error || ''}` });
    }
  };

  const handlePushDay = async (dateStr: string) => {
    setPushFeedback(null);
    const res = await pushDay(dateStr);
    if (res.pushedCount > 0) {
      refetch();
    }
    if (res.failedCount === 0 && res.pushedCount > 0) {
      setPushFeedback({ success: true, message: `${t('stagedPushSuccess')} ${res.pushedCount}` });
    } else if (res.failedCount > 0) {
      setPushFeedback({
        success: false,
        message: `${t('stagedPushSuccess')} ${res.pushedCount} | ${t('stagedPushPartialError')} ${res.failedCount}`,
      });
    }
  };

  const handlePushAll = async () => {
    setPushFeedback(null);
    const res = await pushAll();
    if (res.pushedCount > 0) {
      refetch();
    }
    if (res.failedCount === 0 && res.pushedCount > 0) {
      setPushFeedback({ success: true, message: `${t('stagedPushSuccess')} ${res.pushedCount}` });
    } else if (res.failedCount > 0) {
      setPushFeedback({
        success: false,
        message: `${t('stagedPushSuccess')} ${res.pushedCount} | ${t('stagedPushPartialError')} ${res.failedCount}`,
      });
    }
  };

  /// <summary>
  /// Opens the time entry form modal in copy mode for the given entry with an empty date field.
  /// </summary>
  const handleCopyEntry = (entry: TimeEntry) => {
    setEditingEntry(null);
    setEditingStagedEntry(null);
    setCopyingEntry(entry);
    setAddForDate(undefined);
    setSelectedPresetForModal(null);
    setIsFormModalOpen(true);
  };

  const handleDeleteEntry = async (entryId: number) => {
    const confirmed = await confirm({
      message: t('deleteTimeEntryConfirm'),
      subtitle: t('deleteTimeEntrySubtitle'),
      variant: 'danger',
      confirmText: t('deleteBtn'),
    });
    if (!confirmed) return;

    try {
      await deleteTimeEntry(entryId);
      refetch();
    } catch (err: any) {
      alert(err.message || t('deleteTimeEntryError'));
    }
  };

  const handleAddEntry = (dateStr: string) => {
    setEditingEntry(null);
    setEditingStagedEntry(null);
    setCopyingEntry(null);
    setAddForDate(dateStr);
    setSelectedPresetForModal(null);
    setIsFormModalOpen(true);
  };

  const handleApplyPresetForDay = (dateStr: string, preset: TimeLogPreset) => {
    setEditingEntry(null);
    setEditingStagedEntry(null);
    setCopyingEntry(null);
    setAddForDate(dateStr);
    setSelectedPresetForModal(preset);
    setIsFormModalOpen(true);
  };

  const handleQuickCommitPresetForDay = (dateStr: string, preset: TimeLogPreset) => {
    const clean = preset.taskId ? preset.taskId.replace(/^#/, '').trim() : '';
    const parsed = clean ? parseInt(clean, 10) : undefined;
    const validIssueId = parsed && !isNaN(parsed) ? parsed : undefined;

    const billableId = localStorage.getItem('billableFieldId');
    const customFields: Array<{ id: number; value: string | number }> = [];
    if (billableId && !isNaN(parseInt(billableId, 10))) {
      customFields.push({
        id: parseInt(billableId, 10),
        value: preset.isBillable ? '1' : '0',
      });
    }

    stageEntry({
      projectId: preset.projectId || '',
      projectName: preset.projectName || t('generalNoProject'),
      issueId: validIssueId,
      issueSubject: preset.taskSubject || undefined,
      activityId: parseInt(preset.activityId, 10) || 0,
      activityName: preset.activityName || '',
      hours: preset.hours,
      comments: preset.comments || '',
      spent_on: dateStr,
      ...(customFields.length > 0 && { custom_fields: customFields }),
    });

    setPushFeedback({
      success: true,
      message: `${t('presetQuickCommitSuccessPrefix')} „${preset.name}“ ${t('presetQuickCommitSuccessSuffix')} ${formatDisplayDate(dateStr, language)}.`,
    });
  };

  const handleFormSuccess = () => {
    refetch();
    setIsFormModalOpen(false);
    setEditingEntry(null);
    setEditingStagedEntry(null);
    setCopyingEntry(null);
    setAddForDate(undefined);
    setSelectedPresetForModal(null);
  };

  return (
    <Stack gap="lg">
      {/* Consistent Top Page Header */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t('navLoggedTime')}</Title>

        <Group gap="sm" wrap="wrap">
          <Tooltip label={t('bulkLogModeTooltip')} multiline w={280}>
            <Button
              size="sm"
              variant={isMultiSelectMode ? 'filled' : 'light'}
              leftSection={isMultiSelectMode ? <IconSquareX size={16} /> : <IconChecklist size={16} />}
              onClick={toggleMultiSelectMode}
            >
              {isMultiSelectMode ? t('cancelMultiSelectBtn') : t('bulkLogModeBtn')}
            </Button>
          </Tooltip>

          <ActionIcon
            size="lg"
            variant="light"
            onClick={refetch}
            loading={isLoading}
            aria-label={t('refreshCalendarAria')}
          >
            <IconRefresh size={20} />
          </ActionIcon>
        </Group>
      </Group>

      {isMultiSelectMode && (
        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light" radius="md">
          {t('bulkLogModeHint')}
        </Alert>
      )}

      {/* Staged (Committed) Entries Push Bar */}
          {stagedEntries.length > 0 && (
            <Paper
              withBorder
              radius="md"
              p="sm"
              style={{
                backgroundColor: 'var(--mantine-color-orange-light)',
                border: '1.5px dashed var(--mantine-color-orange-filled)',
              }}
            >
              <Stack gap="xs">
                <Group justify="space-between" align="center" wrap="wrap" gap="sm">
                  <Group gap="sm" wrap="wrap">
                    <IconGitCommit size={20} color="var(--mantine-color-orange-filled)" />
                    <div>
                      <Group gap="xs">
                        <Text size="sm" fw={700} c="orange.9">
                          {t('stagedBannerTitle')}
                        </Text>
                        <Badge color="orange" variant="filled" size="sm">
                          {stagedEntries.length} • {totalStagedHours.toFixed(1)}h
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed">
                        {t('stagedBannerSummaryPrefix')} {stagedEntries.length}{' '}
                        {stagedEntries.length === 1 ? t('stagedEntrySingle') : t('stagedBannerSummaryMiddle')}{' '}
                        ({totalStagedHours.toFixed(1)}h) — {t('stagedBannerSummarySuffix')}
                      </Text>
                    </div>
                  </Group>

                  <Group gap="xs" wrap="wrap">
                    {todayStagedEntries.length > 0 && todayStagedEntries.length < stagedEntries.length && (
                      <Button
                        size="xs"
                        variant="light"
                        color="orange"
                        leftSection={<IconCloudUpload size={15} />}
                        onClick={() => handlePushDay(todayStr)}
                        loading={isPushing}
                      >
                        {t('pushTodayBtn')} ({todayStagedEntries.length} • {todayStagedHours.toFixed(1)}h)
                      </Button>
                    )}
                    <Button
                      size="sm"
                      color="orange"
                      leftSection={<IconCloudUpload size={16} />}
                      onClick={handlePushAll}
                      loading={isPushing}
                    >
                      {t('pushAllBtn')} ({stagedEntries.length})
                    </Button>
                  </Group>
                </Group>

                {isPushing && pushProgress && (
                  <Stack gap={4}>
                    <Progress
                      value={Math.round((pushProgress.current / pushProgress.total) * 100)}
                      color="orange"
                      size="md"
                      striped
                      animated
                    />
                    <Text size="xs" c="dimmed" ta="center">
                      {t('stagedPushProgress')} ({pushProgress.current} / {pushProgress.total})...
                    </Text>
                  </Stack>
                )}
              </Stack>
            </Paper>
          )}

          {pushFeedback && (
            <Alert
              color={pushFeedback.success ? 'green' : 'red'}
              icon={pushFeedback.success ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
              withCloseButton
              onClose={() => setPushFeedback(null)}
            >
              {pushFeedback.message}
            </Alert>
          )}

          <Group align="flex-start" wrap="nowrap" style={{ gap: '1.5rem' }}>
            <div style={{ 
              width: (!isMultiSelectMode && activeDayStr) ? '360px' : 'auto', 
              flex: (!isMultiSelectMode && activeDayStr) ? '0 0 360px' : 1, 
              minWidth: 0,
              transition: 'all 0.3s ease'
            }}>
              <CalendarGrid
                currentMonth={currentMonth}
                onPrevMonth={handlePrevMonth}
                onNextMonth={handleNextMonth}
                entriesByDate={entriesByDate}
                stagedByDate={stagedByDate}
                selectedDays={isMultiSelectMode ? selectedDays : new Set(activeDayStr ? [activeDayStr] : [])}
                onDayClick={handleDayClick}
                isLoading={isLoading}
                isMultiSelectMode={isMultiSelectMode}
                isActiveDaySelected={!isMultiSelectMode && !!activeDayStr}
                isDraggingEntry={Boolean(draggingEntryKey)}
                onDropEntryOnDate={handleDropEntryOnDate}
              />
            </div>

            {!isMultiSelectMode && activeDayStr && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <DayDetailsView
                  dateStr={activeDayStr}
                  entries={activeDayEntries}
                  stagedEntries={stagedByDate[activeDayStr] || []}
                  projectColorMap={projectColorMap}
                  onClose={() => {
                    setActiveDayStr(null);
                    setPinnedDaySnapshot(null);
                  }}
                  onEdit={handleEditEntry}
                  onCopy={handleCopyEntry}
                  onDelete={handleDeleteEntry}
                  onAdd={handleAddEntry}
                  onEditStaged={handleEditStagedEntry}
                  onDeleteStaged={handleDeleteStagedEntry}
                  onPushStagedEntry={handlePushStagedEntry}
                  onPushDay={handlePushDay}
                  isPushing={isPushing}
                  draggingEntryKey={draggingEntryKey}
                  onEntryDragStart={handleEntryDragStart}
                  onEntryDragEnd={handleEntryDragEnd}
                  onApplyPreset={handleApplyPresetForDay}
                  onQuickCommitPreset={handleQuickCommitPresetForDay}
                />
              </div>
            )}

            {isMultiSelectMode && selectedDays.size > 0 && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <BulkLogForm
                  selectedDays={selectedDays}
                  onSuccess={handleBulkSuccess}
                  onCancel={toggleMultiSelectMode}
                />
              </div>
            )}
          </Group>

      {isFormModalOpen && (
        <TimeEntryFormModal
          isOpen={isFormModalOpen}
          onClose={() => {
            setIsFormModalOpen(false);
            setEditingEntry(null);
            setEditingStagedEntry(null);
            setCopyingEntry(null);
            setAddForDate(undefined);
            setSelectedPresetForModal(null);
          }}
          onSuccess={handleFormSuccess}
          editEntry={editingEntry}
          editStagedEntry={editingStagedEntry}
          copyEntry={copyingEntry}
          defaultDate={addForDate}
          initialPresetId={selectedPresetForModal?.id || null}
          initialPreset={selectedPresetForModal}
        />
      )}
    </Stack>
  );
};
