import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { TimeEntry, StagedTimeEntry } from '../../../types';
import { IconChevronLeft, IconChevronRight, IconCheck, IconGitCommit } from '@tabler/icons-react';
import { Card, ActionIcon, Group, Title, LoadingOverlay, Text, Box, SimpleGrid, Paper, ThemeIcon, Badge, Tooltip, Loader } from '@mantine/core';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatDisplayMonthYear } from '../../../utils/formatters';

interface CalendarGridProps {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  entriesByDate: Record<string, TimeEntry[]>;
  stagedByDate?: Record<string, StagedTimeEntry[]>;
  selectedDays: Set<string>;
  onDayClick: (dateStr: string) => void;
  isLoading: boolean;
  isMultiSelectMode: boolean;
  isActiveDaySelected?: boolean;
  isDraggingEntry?: boolean;
  onDropEntryOnDate?: (dateStr: string) => void;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  currentMonth,
  onPrevMonth,
  onNextMonth,
  entriesByDate,
  stagedByDate = {},
  selectedDays,
  onDayClick,
  isLoading,
  isMultiSelectMode,
  isActiveDaySelected,
  isDraggingEntry = false,
  onDropEntryOnDate,
}) => {
  const { language, t } = useLanguage();
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [hoveredArrow, setHoveredArrow] = useState<'prev' | 'next' | null>(null);
  const [recentlyDroppedDate, setRecentlyDroppedDate] = useState<string | null>(null);

  const onPrevMonthRef = useRef(onPrevMonth);
  const onNextMonthRef = useRef(onNextMonth);
  const arrowDirectionRef = useRef<'prev' | 'next' | null>(null);
  const arrowTimeoutRef = useRef<number | null>(null);
  const arrowIntervalRef = useRef<number | null>(null);
  const dropFlashTimerRef = useRef<number | null>(null);

  useEffect(() => {
    onPrevMonthRef.current = onPrevMonth;
    onNextMonthRef.current = onNextMonth;
  }, [onPrevMonth, onNextMonth]);

  const stopArrowTimersOnly = useCallback(() => {
    if (arrowTimeoutRef.current !== null) {
      window.clearTimeout(arrowTimeoutRef.current);
      arrowTimeoutRef.current = null;
    }
    if (arrowIntervalRef.current !== null) {
      window.clearInterval(arrowIntervalRef.current);
      arrowIntervalRef.current = null;
    }
    arrowDirectionRef.current = null;
  }, []);

  const clearArrowTimers = useCallback(() => {
    stopArrowTimersOnly();
    setHoveredArrow(null);
  }, [stopArrowTimersOnly]);

  const startArrowAutoStep = useCallback(
    (direction: 'prev' | 'next') => {
      if (arrowDirectionRef.current === direction) return;
      stopArrowTimersOnly();
      arrowDirectionRef.current = direction;
      setHoveredArrow(direction);

      const step = () => {
        if (direction === 'prev') {
          onPrevMonthRef.current();
        } else {
          onNextMonthRef.current();
        }
      };

      arrowTimeoutRef.current = window.setTimeout(() => {
        step();
        arrowIntervalRef.current = window.setInterval(step, 750);
      }, 550);
    },
    [stopArrowTimersOnly]
  );

  useEffect(() => {
    if (!isDraggingEntry) {
      stopArrowTimersOnly();
    }
  }, [isDraggingEntry, stopArrowTimersOnly]);

  useEffect(() => {
    return () => {
      stopArrowTimersOnly();
      if (dropFlashTimerRef.current !== null) {
        window.clearTimeout(dropFlashTimerRef.current);
        dropFlashTimerRef.current = null;
      }
    };
  }, [stopArrowTimersOnly]);

  const effectiveDragOverDate = isDraggingEntry ? dragOverDate : null;
  const effectiveHoveredArrow = isDraggingEntry ? hoveredArrow : null;
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  let startDayOfWeek = firstDayOfMonth.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const monthName = formatDisplayMonthYear(currentMonth, language);

  const cells = [];
  const dayNames = language === 'bg'
    ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(<Box key={`empty-${i}`} h={isActiveDaySelected ? 44 : undefined} mih={isActiveDaySelected ? 44 : 120} style={{ opacity: 0.5 }} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, month, day));
    const entries = entriesByDate[dateStr] || [];
    const staged = stagedByDate[dateStr] || [];
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const stagedHours = staged.reduce((sum, e) => sum + e.hours, 0);
    const hasEntries = totalHours > 0;
    const hasStaged = staged.length > 0;
    const isSelected = selectedDays.has(dateStr);
    const isToday = dateStr === formatDate(new Date());

    // Aggregate hours by project for the date (pushed + staged)
    const projectsMap = new Map<string, { pushed: number; staged: number }>();
    entries.forEach(e => {
      const projName = e.project?.name || t('generalProjectShort');
      const cur = projectsMap.get(projName) || { pushed: 0, staged: 0 };
      cur.pushed += e.hours;
      projectsMap.set(projName, cur);
    });
    staged.forEach(s => {
      const projName = s.projectName || t('generalProjectShort');
      const cur = projectsMap.get(projName) || { pushed: 0, staged: 0 };
      cur.staged += s.hours;
      projectsMap.set(projName, cur);
    });
    const projectsList = Array.from(projectsMap.entries());

    const isDragTarget = effectiveDragOverDate === dateStr;
    const isJustDropped = recentlyDroppedDate === dateStr;

    const cellBackground = isDragTarget
      ? 'var(--mantine-color-orange-light)'
      : isSelected
      ? 'var(--mantine-color-blue-light)'
      : hasEntries
      ? 'var(--mantine-color-green-light)'
      : hasStaged
      ? 'var(--mantine-color-orange-light)'
      : 'transparent';

    const cellBorder = isDragTarget
      ? '2px dashed var(--mantine-color-orange-filled)'
      : isSelected
      ? '1px solid var(--mantine-color-blue-filled)'
      : hasStaged
      ? '1.5px dashed var(--mantine-color-orange-filled)'
      : '1px solid var(--mantine-color-default-border)';

    cells.push(
      <Paper
        key={dateStr}
        withBorder={isSelected || hasStaged || isDragTarget}
        h={isActiveDaySelected ? 44 : undefined}
        mih={isActiveDaySelected ? 44 : 120}
        radius="sm"
        p={isActiveDaySelected ? "4px 6px" : "xs"}
        style={{
          cursor: 'pointer',
          position: 'relative',
          backgroundColor: cellBackground,
          border: cellBorder,
          transition: 'all 0.2s ease',
          opacity: (isMultiSelectMode && !isSelected) ? 0.7 : 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transform: isDragTarget ? 'scale(1.06)' : undefined,
          zIndex: isDragTarget ? 2 : undefined,
          boxShadow: isDragTarget
            ? '0 4px 12px rgba(253, 126, 20, 0.25)'
            : isJustDropped
            ? '0 0 0 2px var(--mantine-color-orange-filled)'
            : undefined,
        }}
        onClick={() => onDayClick(dateStr)}
        onDragOver={(e) => {
          if (!isDraggingEntry || isMultiSelectMode) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          if (dragOverDate !== dateStr) {
            setDragOverDate(dateStr);
          }
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            setDragOverDate((prev) => (prev === dateStr ? null : prev));
          }
        }}
        onDrop={(e) => {
          if (!isDraggingEntry || isMultiSelectMode) return;
          e.preventDefault();
          setDragOverDate(null);
          clearArrowTimers();
          onDropEntryOnDate?.(dateStr);
          if (dropFlashTimerRef.current !== null) {
            window.clearTimeout(dropFlashTimerRef.current);
          }
          setRecentlyDroppedDate(dateStr);
          dropFlashTimerRef.current = window.setTimeout(() => {
            setRecentlyDroppedDate(null);
            dropFlashTimerRef.current = null;
          }, 900);
        }}
      >
        <Group justify="space-between" align="center" wrap="nowrap" style={{ width: '100%' }}>
          <Text size={isActiveDaySelected ? "xs" : "sm"} fw={isToday ? 700 : 500} c={isToday ? 'blue' : undefined}>
            {day}
          </Text>
          {isSelected ? (
            <ThemeIcon size={isActiveDaySelected ? 12 : "xs"} radius="xl" color="blue" style={{ position: 'absolute', top: 3, right: 3 }}>
              <IconCheck size={isActiveDaySelected ? 8 : 10} />
            </ThemeIcon>
          ) : hasStaged ? (
            <Tooltip label={`${t('stagedTooltipCalendar')}: ${staged.length} (${stagedHours.toFixed(1)}h)`}>
              {isActiveDaySelected ? (
                <ThemeIcon size={14} radius="xl" color="orange" variant="filled" style={{ position: 'absolute', top: 3, right: 3 }}>
                  <IconGitCommit size={9} />
                </ThemeIcon>
              ) : (
                <Badge
                  size="xs"
                  color="orange"
                  variant="filled"
                  leftSection={<IconGitCommit size={10} />}
                  styles={{ root: { paddingLeft: 4, paddingRight: 5, height: 16, fontSize: 9, textTransform: 'none' } }}
                >
                  {staged.length}
                </Badge>
              )}
            </Tooltip>
          ) : null}
        </Group>
        
        {(hasEntries || hasStaged) && (
          <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {!isActiveDaySelected && (
              <Box mb="xs" mt="xs">
                {projectsList.slice(0, 3).map(([pName, pHours], idx) => (
                  <Group key={idx} justify="space-between" gap={2} wrap="nowrap" mb={2}>
                    <Text
                      size="10px"
                      truncate
                      fw={500}
                      c={pHours.staged > 0 && pHours.pushed === 0 ? 'orange.8' : 'dimmed'}
                      lh={1.2}
                      style={{ flex: 1 }}
                    >
                      {pHours.staged > 0 && pHours.pushed === 0 ? '○' : '•'} {pName}
                    </Text>
                    <Text size="10px" fw={600} c={pHours.staged > 0 && pHours.pushed === 0 ? 'orange.8' : 'dimmed'} lh={1.2}>
                      {(pHours.pushed + pHours.staged).toFixed(1)}h
                    </Text>
                  </Group>
                ))}
                {projectsList.length > 3 && (
                  <Text size="9px" c="dimmed" fs="italic">+{projectsList.length - 3} {t('moreCountLabel')}</Text>
                )}
              </Box>
            )}
            <Group justify={isActiveDaySelected ? 'center' : 'flex-end'} gap={4} mt="auto" wrap="nowrap">
              {hasEntries && (
                <Text size={isActiveDaySelected ? "xs" : "sm"} fw={700} c="green.9" lh={1.1}>
                  {totalHours.toFixed(1)}h
                </Text>
              )}
              {hasStaged && (
                <Text size={isActiveDaySelected ? "10px" : "xs"} fw={700} c="orange.8" lh={1.1}>
                  {hasEntries ? `+${stagedHours.toFixed(1)}h` : `${stagedHours.toFixed(1)}h`}
                </Text>
              )}
            </Group>
          </Box>
        )}
      </Paper>
    );
  }

  const totalCells = startDayOfWeek + daysInMonth;
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remainingCells; i++) {
    cells.push(<Box key={`empty-end-${i}`} h={isActiveDaySelected ? 44 : undefined} mih={isActiveDaySelected ? 44 : 120} style={{ opacity: 0.5 }} />);
  }

  return (
    <Card shadow="sm" padding={isActiveDaySelected ? "sm" : "lg"} radius="md" withBorder pos="relative">
      <LoadingOverlay visible={isLoading && !isDraggingEntry} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
      <Group justify="space-between" mb={isActiveDaySelected ? "sm" : "xl"}>
        <ActionIcon
          variant={effectiveHoveredArrow === 'prev' ? 'filled' : isDraggingEntry ? 'outline' : 'light'}
          color={effectiveHoveredArrow === 'prev' ? 'orange' : 'blue'}
          className={effectiveHoveredArrow === 'prev' ? 'calendar-arrow-drag-hover' : undefined}
          onClick={onPrevMonth}
          aria-label={t('prevMonthAria')}
          size={isActiveDaySelected ? "sm" : "lg"}
          onDragOver={(e) => {
            if (!isDraggingEntry) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (dragOverDate !== null) setDragOverDate(null);
            startArrowAutoStep('prev');
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              clearArrowTimers();
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            clearArrowTimers();
          }}
        >
          <IconChevronLeft size={isActiveDaySelected ? 16 : 20} style={{ pointerEvents: 'none' }} />
        </ActionIcon>

        <Group gap={6} align="center" wrap="nowrap">
          <Title order={isActiveDaySelected ? 4 : 3}>{monthName}</Title>
          {isLoading && isDraggingEntry && <Loader size="xs" />}
        </Group>

        <ActionIcon
          variant={effectiveHoveredArrow === 'next' ? 'filled' : isDraggingEntry ? 'outline' : 'light'}
          color={effectiveHoveredArrow === 'next' ? 'orange' : 'blue'}
          className={effectiveHoveredArrow === 'next' ? 'calendar-arrow-drag-hover' : undefined}
          onClick={onNextMonth}
          aria-label={t('nextMonthAria')}
          size={isActiveDaySelected ? "sm" : "lg"}
          onDragOver={(e) => {
            if (!isDraggingEntry) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (dragOverDate !== null) setDragOverDate(null);
            startArrowAutoStep('next');
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              clearArrowTimers();
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            clearArrowTimers();
          }}
        >
          <IconChevronRight size={isActiveDaySelected ? 16 : 20} style={{ pointerEvents: 'none' }} />
        </ActionIcon>
      </Group>

      {isDraggingEntry && !isMultiSelectMode && (
        <Text size="xs" c="orange.7" fw={500} ta="center" mb="xs">
          {t('calendarDropCopyHint')}
        </Text>
      )}

      <SimpleGrid cols={7} spacing="xs" verticalSpacing="xs">
        {dayNames.map(d => (
          <Text key={d} size={isActiveDaySelected ? "xs" : "sm"} fw={600} c="dimmed" ta="center" mb="xs">{d}</Text>
        ))}
        {cells}
      </SimpleGrid>
    </Card>
  );
};

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
