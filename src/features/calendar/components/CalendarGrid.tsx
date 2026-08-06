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

  let startDayOfWeek = firstDayOfMonth.getDay();
  startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

  const monthName = currentMonth.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });

  const cells = [];
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push(<Box key={`empty-${i}`} h={80} style={{ opacity: 0.5 }} />);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, month, day));
    const entries = entriesByDate[dateStr] || [];
    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const hasEntries = totalHours > 0;
    const isSelected = selectedDays.has(dateStr);
    const isToday = dateStr === formatDate(new Date());

    cells.push(
      <Paper
        key={dateStr}
        withBorder={isSelected}
        h={80}
        radius="sm"
        p="xs"
        style={{
          cursor: 'pointer',
          position: 'relative',
          backgroundColor: isSelected ? 'var(--mantine-color-blue-light)' : (hasEntries ? 'var(--mantine-color-green-light)' : 'transparent'),
          borderColor: isSelected ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-default-border)',
          transition: 'all 0.2s ease',
          opacity: (isMultiSelectMode && !isSelected) ? 0.7 : 1,
        }}
        onClick={() => onDayClick(dateStr)}
      >
        <Group justify="space-between" align="flex-start">
          <Text size="sm" fw={isToday ? 700 : 500} c={isToday ? 'blue' : undefined}>{day}</Text>
          {isSelected && (
            <ThemeIcon size="xs" radius="xl" color="blue">
              <IconCheck size={10} />
            </ThemeIcon>
          )}
        </Group>
        
        {hasEntries && (
          <Group justify="center" mt="sm">
            <Text size="xs" fw={700} c="green.9">{totalHours.toFixed(1)}h</Text>
          </Group>
        )}
      </Paper>
    );
  }

  const totalCells = startDayOfWeek + daysInMonth;
  const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 0; i < remainingCells; i++) {
    cells.push(<Box key={`empty-end-${i}`} h={80} style={{ opacity: 0.5 }} />);
  }

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder pos="relative">
      <LoadingOverlay visible={isLoading} zIndex={1000} overlayProps={{ radius: "sm", blur: 2 }} />
      <Group justify="space-between" mb="xl">
        <ActionIcon variant="light" onClick={onPrevMonth} aria-label="Previous Month" size="lg">
          <IconChevronLeft size={20} />
        </ActionIcon>
        <Title order={3}>{monthName}</Title>
        <ActionIcon variant="light" onClick={onNextMonth} aria-label="Next Month" size="lg">
          <IconChevronRight size={20} />
        </ActionIcon>
      </Group>

      <SimpleGrid cols={7} spacing="xs" verticalSpacing="xs">
        {dayNames.map(d => (
          <Text key={d} size="sm" fw={600} c="dimmed" ta="center" mb="xs">{d}</Text>
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
