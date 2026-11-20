import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Group,
  Stack,
  Text,
  Title,
  TextInput,
  Select,
  Button,
  Badge,
  ActionIcon,
  Table,
  Paper,
  Loader,
  Alert,
  SimpleGrid,
  Grid,
  Box,
  Tooltip,
} from '@mantine/core';
import {
  IconSearch,
  IconRefresh,
  IconCheck,
  IconAlertTriangle,
  IconX,
  IconCalendarCheck,
  IconCalendarEvent,
  IconChevronDown,
  IconChevronRight,
  IconChevronLeft,
} from '@tabler/icons-react';
import { useUser } from '../../../contexts/UserContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useStagedEntries } from '../../../contexts/StagedEntriesContext';
import { getAllUserTimeEntries } from '../../../services/redmine';
import { getBulgarianHolidays, formatDateISO } from '../../../utils/bulgarianHolidays';
import { formatDisplayDate, formatDisplayMonth, formatDisplayMonthYear } from '../../../utils/formatters';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';
import type { TimeEntry } from '../../../types';

const CUSTOM_HOLIDAYS_STORAGE_KEY = 'redmine_validation_custom_holidays_v1';

interface CustomHolidaysConfig {
  added: string[];
  removed: string[];
}

function loadCustomHolidays(): CustomHolidaysConfig {
  try {
    const raw = localStorage.getItem(CUSTOM_HOLIDAYS_STORAGE_KEY);
    if (!raw) return { added: [], removed: [] };
    const parsed = JSON.parse(raw);
    return {
      added: Array.isArray(parsed?.added) ? parsed.added : [],
      removed: Array.isArray(parsed?.removed) ? parsed.removed : [],
    };
  } catch {
    return { added: [], removed: [] };
  }
}

function saveCustomHolidays(config: CustomHolidaysConfig): void {
  try {
    localStorage.setItem(CUSTOM_HOLIDAYS_STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota errors
  }
}

interface FilteredTaskRow {
  key: string;
  taskId: string;
  taskSubject: string;
  projectName: string;
  distinctDates: Set<string>;
  entries: TimeEntry[];
}

/// <summary>
/// Focused time validation dashboard:
/// 1) Checks whether every working day in the selected year (excluding weekends and Bulgarian public holidays) has logged time.
/// 2) Filters tasks by keyword (e.g. leave / vacation) to count exact days and time entries.
/// </summary>
export const TimeValidationDashboard: React.FC = () => {
  const { user } = useUser();
  const { language, t } = useLanguage();
  const { stagedByDate } = useStagedEntries();
  const navigate = useNavigate();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [calendarMonth, setCalendarMonth] = useState<number>(() => new Date().getMonth());
  const [keyword, setKeyword] = useState('');

  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [customHolidays, setCustomHolidays] = useState<CustomHolidaysConfig>(() => loadCustomHolidays());

  // Sync mini-calendar month when year changes
  useEffect(() => {
    const yearNum = parseInt(selectedYear, 10);
    setCalendarMonth(yearNum === currentYear ? new Date().getMonth() : 0);
  }, [selectedYear, currentYear]);

  const toggleDayHoliday = useCallback((iso: string, isOfficialHoliday: boolean) => {
    setCustomHolidays((prev) => {
      const addedSet = new Set(prev.added);
      const removedSet = new Set(prev.removed);

      if (isOfficialHoliday) {
        if (removedSet.has(iso)) {
          removedSet.delete(iso);
        } else {
          removedSet.add(iso);
        }
      } else {
        if (addedSet.has(iso)) {
          addedSet.delete(iso);
        } else {
          addedSet.add(iso);
        }
      }

      const next: CustomHolidaysConfig = {
        added: Array.from(addedSet),
        removed: Array.from(removedSet),
      };
      saveCustomHolidays(next);
      return next;
    });
  }, []);

  const resetYearCustomHolidays = useCallback(() => {
    const prefix = `${selectedYear}-`;
    setCustomHolidays((prev) => {
      const next: CustomHolidaysConfig = {
        added: prev.added.filter((d) => !d.startsWith(prefix)),
        removed: prev.removed.filter((d) => !d.startsWith(prefix)),
      };
      saveCustomHolidays(next);
      return next;
    });
  }, [selectedYear]);

  const yearOptions = useMemo(() => {
    const years: Array<{ value: string; label: string }> = [];
    for (let y = currentYear; y >= currentYear - 4; y--) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  }, [currentYear]);

  const fetchYearEntries = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAllUserTimeEntries({
        user_id: user.id,
        from: `${selectedYear}-01-01`,
        to: `${selectedYear}-12-31`,
      });
      setEntries(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to load time entries.');
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedYear]);

  useEffect(() => {
    fetchYearEntries();
  }, [fetchYearEntries]);

  // 1. Working days validation (excluding weekends, official Bulgarian holidays, and user-marked non-working days)
  const workingDaysCheck = useMemo(() => {
    const yearNum = parseInt(selectedYear, 10);
    const today = new Date();
    const endDate = yearNum === today.getFullYear() ? today : new Date(yearNum, 11, 31);
    const officialHolidaysMap = getBulgarianHolidays(yearNum);
    const addedSet = new Set(customHolidays.added);
    const removedSet = new Set(customHolidays.removed);

    // Effective non-working holidays map (official minus removed, plus user-added)
    const effectiveHolidaysMap = new Map<string, { name: string; isCustom: boolean }>();
    officialHolidaysMap.forEach((name, iso) => {
      if (!removedSet.has(iso)) {
        effectiveHolidaysMap.set(iso, { name, isCustom: false });
      }
    });
    addedSet.forEach((iso) => {
      if (iso.startsWith(`${selectedYear}-`) && !effectiveHolidaysMap.has(iso)) {
        effectiveHolidaysMap.set(iso, { name: t('validationCustomHolidayLabel'), isCustom: true });
      }
    });

    // Compute all working days up to endDate
    const workingDays: string[] = [];
    const cursor = new Date(yearNum, 0, 1);
    const limit = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
    while (cursor <= limit) {
      const dow = cursor.getDay();
      const iso = formatDateISO(cursor);
      if (dow !== 0 && dow !== 6 && !effectiveHolidaysMap.has(iso)) {
        workingDays.push(iso);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    const loggedHoursByDate = new Map<string, number>();
    entries.forEach((e) => {
      if (e.hours > 0 && e.spent_on) {
        loggedHoursByDate.set(e.spent_on, (loggedHoursByDate.get(e.spent_on) || 0) + e.hours);
      }
    });

    const missingDays = workingDays.filter((d) => !loggedHoursByDate.has(d));
    const loggedWorkingDaysCount = workingDays.length - missingDays.length;

    // Group missing days by month for clean display
    const missingByMonth = new Map<string, string[]>();
    missingDays.forEach((iso) => {
      const dt = new Date(iso + 'T00:00:00');
      const capitalized = formatDisplayMonth(dt, language);
      if (!missingByMonth.has(capitalized)) {
        missingByMonth.set(capitalized, []);
      }
      missingByMonth.get(capitalized)!.push(iso);
    });

    const hasCustomInYear =
      customHolidays.added.some((d) => d.startsWith(`${selectedYear}-`)) ||
      customHolidays.removed.some((d) => d.startsWith(`${selectedYear}-`));

    return {
      totalWorkingDays: workingDays.length,
      loggedWorkingDaysCount,
      missingDays,
      missingDaysSet: new Set(missingDays),
      loggedHoursByDate,
      officialHolidaysMap,
      effectiveHolidaysMap,
      missingByMonth: Array.from(missingByMonth.entries()),
      holidaysCount: effectiveHolidaysMap.size,
      hasCustomInYear,
      endDateIso: formatDateISO(endDate),
    };
  }, [selectedYear, entries, language, customHolidays, t]);

  // 2. Keyword filter for leaves / tasks (days count + entries count only)
  const keywordResult = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) {
      return {
        hasQuery: false,
        uniqueDaysCount: 0,
        entriesCount: 0,
        rows: [] as FilteredTaskRow[],
      };
    }

    const matchedEntries = entries.filter((entry) => {
      const subject = (entry.issue?.subject || '').toLowerCase();
      const issueId = entry.issue?.id ? String(entry.issue.id) : '';
      const project = (entry.project?.name || '').toLowerCase();
      const comments = (entry.comments || '').toLowerCase();
      const activity = (entry.activity?.name || '').toLowerCase();

      return (
        subject.includes(q) ||
        issueId.includes(q) ||
        `#${issueId}`.includes(q) ||
        project.includes(q) ||
        comments.includes(q) ||
        activity.includes(q)
      );
    });

    const allDates = new Set<string>();
    const taskMap = new Map<string, FilteredTaskRow>();

    matchedEntries.forEach((entry) => {
      allDates.add(entry.spent_on);
      const hasIssue = Boolean(entry.issue?.id);
      const key = hasIssue ? `issue-${entry.issue!.id}` : `proj-${entry.project?.id || 'none'}`;
      if (!taskMap.has(key)) {
        taskMap.set(key, {
          key,
          taskId: hasIssue ? String(entry.issue!.id) : '',
          taskSubject: entry.issue?.subject || (hasIssue ? `#${entry.issue!.id}` : entry.project?.name || '-'),
          projectName: entry.project?.name || '',
          distinctDates: new Set<string>(),
          entries: [],
        });
      }
      const row = taskMap.get(key)!;
      row.distinctDates.add(entry.spent_on);
      row.entries.push(entry);
    });

    const rows = Array.from(taskMap.values())
      .map((row) => ({
        ...row,
        entries: row.entries.sort((a, b) => (b.spent_on > a.spent_on ? 1 : -1)),
      }))
      .sort((a, b) => b.distinctDates.size - a.distinctDates.size);

    return {
      hasQuery: true,
      uniqueDaysCount: allDates.size,
      entriesCount: matchedEntries.length,
      rows,
    };
  }, [entries, keyword]);

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const formatMissingDateLabel = (iso: string) => {
    return formatDisplayDate(iso, language, { weekday: 'short' });
  };

  return (
    <Stack gap="lg">
      {/* Page Header */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t('validationTitle')}</Title>

        <Group gap="sm">
          <Select
            aria-label={t('validationYearLabel')}
            value={selectedYear}
            onChange={(val) => val && setSelectedYear(val)}
            data={yearOptions}
            w={110}
            size="sm"
          />
          <Button
            variant="light"
            size="sm"
            leftSection={<IconRefresh size={16} />}
            onClick={fetchYearEntries}
            loading={isLoading}
          >
            {t('validationRefreshBtn')}
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" title="Error">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <Group justify="center" py="xl">
          <Loader size="md" />
          <Text c="dimmed">{t('validationLoading')}</Text>
        </Group>
      ) : (
        <>
          {/* Section 1: Working Days Check */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Group justify="space-between" align="center" wrap="wrap">
                <Group gap="xs">
                  <IconCalendarCheck size={20} color="var(--mantine-color-blue-filled)" />
                  <Title order={4}>{t('validationWorkingDaysTitle')}</Title>
                </Group>
                <Text size="xs" c="dimmed">
                  {t('validationHolidaysExcluded')}: {workingDaysCheck.holidaysCount}
                </Text>
              </Group>

              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    {t('validationWorkingDaysCount')}
                  </Text>
                  <Text fz={28} fw={700} mt={4}>
                    {workingDaysCheck.totalWorkingDays}
                  </Text>
                </Paper>

                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    {t('validationLoggedDaysCount')}
                  </Text>
                  <Text fz={28} fw={700} c="green" mt={4}>
                    {workingDaysCheck.loggedWorkingDaysCount}
                  </Text>
                </Paper>

                <Paper withBorder p="md" radius="md">
                  <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                    {t('validationMissingDaysCount')}
                  </Text>
                  <Text fz={28} fw={700} c={workingDaysCheck.missingDays.length === 0 ? 'green' : 'red'} mt={4}>
                    {workingDaysCheck.missingDays.length}
                  </Text>
                </Paper>
              </SimpleGrid>

              <Grid align="flex-start">
                {/* Compact Monthly Calendar */}
                <Grid.Col span={{ base: 12, md: 5 }}>
                  {(() => {
                    const yearNum = parseInt(selectedYear, 10);
                    const firstDay = new Date(yearNum, calendarMonth, 1);
                    const daysInMonth = new Date(yearNum, calendarMonth + 1, 0).getDate();
                    let startDow = firstDay.getDay();
                    startDow = startDow === 0 ? 6 : startDow - 1;
                    const monthTitle = formatDisplayMonthYear(firstDay, language);
                    const dayHeaders = language === 'bg'
                      ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
                      : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
                    const todayIso = formatDateISO(new Date());

                    const cells: React.ReactNode[] = [];
                    for (let i = 0; i < startDow; i++) {
                      cells.push(<Box key={`empty-${i}`} h={32} />);
                    }

                    for (let d = 1; d <= daysInMonth; d++) {
                      const dt = new Date(yearNum, calendarMonth, d);
                      const iso = formatDateISO(dt);
                      const dow = dt.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      const isOfficialHoliday = workingDaysCheck.officialHolidaysMap.has(iso);
                      const holidayInfo = workingDaysCheck.effectiveHolidaysMap.get(iso);
                      const loggedHours = workingDaysCheck.loggedHoursByDate.get(iso) || 0;
                      const hasStaged = (stagedByDate[iso]?.length || 0) > 0;
                      const isMissing = workingDaysCheck.missingDaysSet.has(iso);
                      const isFuture = iso > workingDaysCheck.endDateIso;
                      const isToday = iso === todayIso;

                      const displayDate = formatDisplayDate(iso, language);

                      let bg = 'transparent';
                      let color: string | undefined = undefined;
                      let border = isToday ? '1.5px solid var(--mantine-color-blue-filled)' : '1px solid transparent';
                      let tooltipText = displayDate;

                      if (holidayInfo) {
                        bg = 'var(--mantine-color-default-hover)';
                        color = 'dimmed';
                        if (holidayInfo.isCustom) {
                          border = '1px dashed var(--mantine-color-gray-6)';
                        }
                        tooltipText = `${displayDate} • ${holidayInfo.name}`;
                      } else if (loggedHours > 0) {
                        bg = 'var(--mantine-color-green-light)';
                        color = 'green.9';
                        tooltipText = `${displayDate} • ${t('validationLegendLogged')} (${loggedHours.toFixed(1)}h)`;
                      } else if (isMissing && hasStaged) {
                        bg = 'var(--mantine-color-orange-light)';
                        color = 'orange.9';
                        border = '1px dashed var(--mantine-color-orange-filled)';
                        tooltipText = `${displayDate} • ${t('validationStagedOnlyTag')}`;
                      } else if (isMissing) {
                        bg = 'var(--mantine-color-red-light)';
                        color = 'red.8';
                        tooltipText = `${displayDate} • ${t('validationLegendMissing')}`;
                      } else if (isWeekend) {
                        color = 'dimmed';
                        tooltipText = `${displayDate} • ${t('validationLegendHoliday')}`;
                      } else if (isFuture) {
                        color = 'dimmed';
                      }

                      cells.push(
                        <Tooltip key={iso} label={tooltipText} openDelay={150}>
                          <Paper
                            h={32}
                            radius="xs"
                            onClick={
                              !isWeekend
                                ? () => toggleDayHoliday(iso, isOfficialHoliday)
                                : undefined
                            }
                            style={{
                              backgroundColor: bg,
                              border,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: isFuture && loggedHours === 0 && !holidayInfo ? 0.45 : 1,
                              cursor: isWeekend ? 'default' : 'pointer',
                              userSelect: 'none',
                            }}
                          >
                            <Text size="xs" fw={loggedHours > 0 || isMissing || isToday ? 700 : 400} c={color}>
                              {d}
                            </Text>
                          </Paper>
                        </Tooltip>
                      );
                    }

                    return (
                      <Paper withBorder p="sm" radius="md">
                        <Group justify="space-between" mb="xs">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            disabled={calendarMonth === 0}
                            onClick={() => setCalendarMonth((m) => Math.max(0, m - 1))}
                            aria-label="Previous month"
                          >
                            <IconChevronLeft size={16} />
                          </ActionIcon>
                          <Text size="sm" fw={600}>
                            {monthTitle}
                          </Text>
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            disabled={calendarMonth === 11}
                            onClick={() => setCalendarMonth((m) => Math.min(11, m + 1))}
                            aria-label="Next month"
                          >
                            <IconChevronRight size={16} />
                          </ActionIcon>
                        </Group>

                        <SimpleGrid cols={7} spacing={4} verticalSpacing={4}>
                          {dayHeaders.map((h) => (
                            <Text key={h} size="10px" fw={600} c="dimmed" ta="center">
                              {h}
                            </Text>
                          ))}
                          {cells}
                        </SimpleGrid>

                        <Group gap="xs" mt="sm" justify="center" wrap="wrap">
                          <Group gap={4}>
                            <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: 'var(--mantine-color-green-light)', border: '1px solid var(--mantine-color-green-6)' }} />
                            <Text size="10px" c="dimmed">{t('validationLegendLogged')}</Text>
                          </Group>
                          <Group gap={4}>
                            <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: 'var(--mantine-color-red-light)', border: '1px solid var(--mantine-color-red-6)' }} />
                            <Text size="10px" c="dimmed">{t('validationLegendMissing')}</Text>
                          </Group>
                          <Group gap={4}>
                            <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: 'var(--mantine-color-orange-light)', border: '1px dashed var(--mantine-color-orange-6)' }} />
                            <Text size="10px" c="dimmed">{t('validationLegendStaged')}</Text>
                          </Group>
                          <Group gap={4}>
                            <Box w={10} h={10} style={{ borderRadius: 2, backgroundColor: 'var(--mantine-color-default-hover)', border: '1px solid var(--mantine-color-default-border)' }} />
                            <Text size="10px" c="dimmed">{t('validationLegendHoliday')}</Text>
                          </Group>
                        </Group>

                        <Group justify="space-between" align="center" mt="xs" gap="xs">
                          <Text size="10px" c="dimmed">
                            {t('validationClickToToggleHoliday')}
                          </Text>
                          {workingDaysCheck.hasCustomInYear && (
                            <Button
                              variant="subtle"
                              size="compact-xs"
                              color="gray"
                              onClick={resetYearCustomHolidays}
                            >
                              {t('validationResetHolidaysBtn')}
                            </Button>
                          )}
                        </Group>

                        <Button
                          fullWidth
                          mt="sm"
                          size="xs"
                          variant="light"
                          leftSection={<IconCalendarEvent size={14} />}
                          onClick={() => navigate(`/logged-time?year=${yearNum}&month=${calendarMonth + 1}`)}
                        >
                          {t('validationOpenInCalendarBtn')}
                        </Button>
                      </Paper>
                    );
                  })()}
                </Grid.Col>

                {/* Missing Days List */}
                <Grid.Col span={{ base: 12, md: 7 }}>
                  {workingDaysCheck.missingDays.length === 0 ? (
                    <Alert icon={<IconCheck size={16} />} color="green" radius="md">
                      {t('validationAllLoggedSuccess')}
                    </Alert>
                  ) : (
                    <Stack gap="sm">
                      <Group gap="xs">
                        <IconAlertTriangle size={16} color="var(--mantine-color-red-filled)" />
                        <Text size="sm" fw={600} c="red">
                          {t('validationMissingDaysListTitle')} ({workingDaysCheck.missingDays.length})
                        </Text>
                      </Group>

                      <Stack gap="xs">
                        {workingDaysCheck.missingByMonth.map(([monthName, dates]) => (
                          <Paper key={monthName} withBorder p="xs" radius="sm">
                            <Group gap="xs" align="center" wrap="wrap">
                              <Text size="xs" fw={700} w={95} c="dimmed">
                                {monthName}
                              </Text>
                              <Group gap={6} wrap="wrap" style={{ flex: 1 }}>
                                {dates.map((iso) => {
                                  const hasStaged = (stagedByDate[iso]?.length || 0) > 0;
                                  const monthIdx = parseInt(iso.split('-')[1], 10) - 1;
                                  return (
                                    <Badge
                                      key={iso}
                                      variant="light"
                                      color={hasStaged ? 'orange' : 'red'}
                                      size="sm"
                                      style={{ textTransform: 'none', cursor: 'pointer' }}
                                      onClick={() => setCalendarMonth(monthIdx)}
                                    >
                                      {formatMissingDateLabel(iso)}
                                      {hasStaged ? ` (${t('validationStagedOnlyTag')})` : ''}
                                    </Badge>
                                  );
                                })}
                              </Group>
                            </Group>
                          </Paper>
                        ))}
                      </Stack>
                    </Stack>
                  )}
                </Grid.Col>
              </Grid>
            </Stack>
          </Card>

          {/* Section 2: Leaves / Keyword Filter */}
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Stack gap="md">
              <Title order={4}>{t('validationLeaveTitle')}</Title>

              <TextInput
                placeholder={t('validationKeywordPlaceholder')}
                leftSection={<IconSearch size={16} />}
                rightSection={
                  keyword ? (
                    <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setKeyword('')}>
                      <IconX size={14} />
                    </ActionIcon>
                  ) : null
                }
                value={keyword}
                onChange={(e) => setKeyword(e.currentTarget.value)}
              />

              {!keywordResult.hasQuery ? (
                <Text size="sm" c="dimmed">
                  {t('validationEnterKeywordHint')}
                </Text>
              ) : keywordResult.rows.length === 0 ? (
                <Text size="sm" c="dimmed">
                  {t('validationNoMatchingTasks')}
                </Text>
              ) : (
                <Stack gap="md">
                  <Group gap="md">
                    <Badge size="xl" variant="filled" color="blue" radius="md">
                      {keywordResult.uniqueDaysCount} {t('validationFilterDaysResult')}
                    </Badge>
                    <Badge size="xl" variant="light" color="gray" radius="md">
                      {keywordResult.entriesCount} {t('validationFilterEntriesResult')}
                    </Badge>
                  </Group>

                  <Table striped highlightOnHover withTableBorder>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th w={36} />
                        <Table.Th>{t('validationTaskCol')}</Table.Th>
                        <Table.Th w={110} ta="right">{t('validationDaysCol')}</Table.Th>
                        <Table.Th w={110} ta="right">{t('validationEntriesCol')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {keywordResult.rows.map((row) => {
                        const isExpanded = expandedKeys.has(row.key);
                        return (
                          <React.Fragment key={row.key}>
                            <Table.Tr
                              style={{ cursor: 'pointer' }}
                              onClick={() => toggleExpand(row.key)}
                            >
                              <Table.Td>
                                {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                              </Table.Td>
                              <Table.Td>
                                <Group gap="xs" wrap="wrap">
                                  {row.taskId ? (
                                    <RedmineIssueLink
                                      issueId={row.taskId}
                                      subject={row.taskSubject}
                                      size="sm"
                                      fw={600}
                                    />
                                  ) : (
                                    <Text size="sm" fw={600}>{row.taskSubject}</Text>
                                  )}
                                  {row.projectName && (
                                    <Badge size="xs" variant="light" color="gray" style={{ textTransform: 'none' }}>
                                      {row.projectName}
                                    </Badge>
                                  )}
                                </Group>
                              </Table.Td>
                              <Table.Td ta="right">
                                <Badge color="blue" variant="light" size="md">
                                  {row.distinctDates.size}
                                </Badge>
                              </Table.Td>
                              <Table.Td ta="right">
                                <Text size="sm" fw={600}>{row.entries.length}</Text>
                              </Table.Td>
                            </Table.Tr>

                            {isExpanded && (
                              <Table.Tr>
                                <Table.Td colSpan={4} p="xs" bg="var(--mantine-color-default)">
                                  <Table withTableBorder fz="xs">
                                    <Table.Thead>
                                      <Table.Tr>
                                        <Table.Th w={155}>{t('validationDateCol')}</Table.Th>
                                        <Table.Th>{t('validationCommentCol')}</Table.Th>
                                      </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                      {row.entries.map((entry) => (
                                        <Table.Tr key={entry.id}>
                                          <Table.Td fw={500} style={{ whiteSpace: 'nowrap' }}>{formatDisplayDate(entry.spent_on, language)}</Table.Td>
                                          <Table.Td>{entry.comments || '-'}</Table.Td>
                                        </Table.Tr>
                                      ))}
                                    </Table.Tbody>
                                  </Table>
                                </Table.Td>
                              </Table.Tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Stack>
              )}
            </Stack>
          </Card>
        </>
      )}
    </Stack>
  );
};
