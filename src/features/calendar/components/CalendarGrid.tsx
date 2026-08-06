import React from 'react';
import type { TimeEntry } from '../../../types';
import { IconChevronLeft, IconChevronRight, IconCheck } from '@tabler/icons-react';
import { Card, ActionIcon, Group, Title, LoadingOverlay, Text, Box, SimpleGrid, Paper, ThemeIcon } from '@mantine/core';

interface CalendarGridProps {
  currentMonth: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  entriesByDate: Record<string, TimeEntry[]>;
  selectedDays: Set<string>;
  onDayClick: (dateStr: string) => void;
  isLoading: boolean;
  isMultiSelectMode: boolean;
  isActiveDaySelected?: boolean;
}

export const CalendarGrid: React.FC<CalendarGridProps> = ({
  currentMonth,
  onPrevMonth,
  onNextMonth,
  entriesByDate,
  selectedDays,
  onDayClick,
  isLoading,
  isMultiSelectMode,
  isActiveDaySelected
}) => {
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const daysInMonth = lastDayOfMonth.getDate();

  let startDayOfWeek = firstDayOfMonth.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const monthName = currentMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

  const cells = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(<Box key={`empty-${i}`} h={isActiveDaySelected ? 44 : undefined} mih={isActiveDaySelected ? 44 : 120} style={{ opacity: 0.5 }} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, month, day));
    const entries = entriesByDate[dateStr] || [];
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const hasEntries = totalHours > 0;
    const isSelected = selectedDays.has(dateStr);
    const isToday = dateStr === formatDate(new Date());

    // Aggregate hours by project for the date
    const projectsMap = new Map<string, number>();
    entries.forEach(e => {
      const projName = e.project?.name || 'General';
      projectsMap.set(projName, (projectsMap.get(projName) || 0) + e.hours);
    });
    const projectsList = Array.from(projectsMap.entries());

    cells.push(
      <Paper
        key={dateStr}
        withBorder={isSelected}
        h={isActiveDaySelected ? 44 : undefined}
        mih={isActiveDaySelected ? 44 : 120}
        radius="sm"
        p={isActiveDaySelected ? "4px 6px" : "xs"}
        style={{
          cursor: 'pointer',
          position: 'relative',
          backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : (hasEntries ? 'var(--mantine-color-green-light)' : 'transparent'),
          borderColor: isSelected ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-default-border)',
          transition: 'all 0.2s ease',
          opacity: (isMultiSelectMode && !isSelected) ? 0.7 : 1,
          display: 'flex',
          flexDirection: 'column',
          justify: 'space-between'
        }}
        onClick={() => onDayClick(dateStr)}
      >
        <Group justify="space-between" align="center" wrap="nowrap" style={{ width: '100%' }}>
          <Text size={isActiveDaySelected ? "xs" : "sm"} fw={isToday ? 700 : 500} c={isToday ? 'blue' : undefined}>
            {day}
          </Text>
          {isSelected && (
            <ThemeIcon size={isActiveDaySelected ? 12 : "xs"} radius="xl" color="blue" style={{ position: 'absolute', top: 3, right: 3 }}>
              <IconCheck size={isActiveDaySelected ? 8 : 10} />
            </ThemeIcon>
          )}
        </Group>
        
        {hasEntries && (
          <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            {!isActiveDaySelected && (
              <Box mb="xs" mt="xs">
                {projectsList.slice(0, 3).map(([pName, pHours], idx) => (
                  <Group key={idx} justify="space-between" gap={2} wrap="nowrap" mb={2}>
                    <Text size="10px" truncate fw={500} c="dimmed" lh={1.2} style={{ flex: 1 }}>
                      • {pName}
                    </Text>
                    <Text size="10px" fw={600} c="dimmed" lh={1.2}>
                      {pHours.toFixed(1)}h
                    </Text>
                  </Group>
                ))}
                {projectsList.length > 3 && (
                  <Text size="9px" c="dimmed" fs="italic">+{projectsList.length - 3} more</Text>
                )}
              </Box>
            )}
            <Group justify={isActiveDaySelected ? 'center' : 'flex-end'} mt="auto">
              <Text size={isActiveDaySelected ? "xs" : "sm"} fw={700} c="green.9" lh={1.1}>
                {totalHours.toFixed(1)}h
              </Text>
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
      <LoadingOverlay visible={isLoading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
      <Group justify="space-between" mb={isActiveDaySelected ? "sm" : "xl"}>
        <ActionIcon variant="light" onClick={onPrevMonth} aria-label="Previous Month" size={isActiveDaySelected ? "sm" : "lg"}>
          <IconChevronLeft size={isActiveDaySelected ? 16 : 20} />
        </ActionIcon>
        <Title order={isActiveDaySelected ? 4 : 3}>{monthName}</Title>
        <ActionIcon variant="light" onClick={onNextMonth} aria-label="Next Month" size={isActiveDaySelected ? "sm" : "lg"}>
          <IconChevronRight size={isActiveDaySelected ? 16 : 20} />
        </ActionIcon>
      </Group>

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
