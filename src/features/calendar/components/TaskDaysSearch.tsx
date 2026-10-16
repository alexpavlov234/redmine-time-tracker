import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Title,
  TextInput,
  Select,
  NumberInput,
  Button,
  Badge,
  ActionIcon,
  Table,
  Paper,
  Loader,
  Tooltip,
  Alert,
  SimpleGrid,
} from '@mantine/core';
import {
  IconSearch,
  IconRefresh,
  IconChevronDown,
  IconChevronRight,
  IconPlayerPlay,
  IconBeach,
  IconHeartbeat,
  IconX,
  IconNotes,
} from '@tabler/icons-react';
import { useUser } from '../../../contexts/UserContext';
import { useQueue } from '../../../contexts/QueueContext';
import { useTaskNotes } from '../../../hooks/useTaskNotes';
import { getAllUserTimeEntries } from '../../../services/redmine';
import { TaskNoteButton } from '../../../components/common/TaskNoteButton';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';
import type { TimeEntry } from '../../../types';

/// <summary>
/// Predefined date filter intervals for task and leave search.
/// </summary>
type TaskDatePreset = 'this_year' | 'last_year' | 'last_12_months' | 'last_30_days' | 'all_time' | 'custom';

/// <summary>
/// Grouped task aggregation data for reporting logged days and entries.
/// </summary>
interface TaskAggregation {
  /// <summary>Unique task identifier (or string representation of project for non-issue entries).</summary>
  taskId: string;
  /// <summary>Subject line of the task or fallback description.</summary>
  taskSubject: string;
  /// <summary>Associated project name.</summary>
  projectName: string;
  /// <summary>Associated project ID.</summary>
  projectId: string;
  /// <summary>Sum of all logged hours for this task in the filtered period.</summary>
  totalHours: number;
  /// <summary>Calculated days based on standard workday hours.</summary>
  totalDays: number;
  /// <summary>Set of distinct dates when time was logged.</summary>
  distinctDates: Set<string>;
  /// <summary>Earliest logged date.</summary>
  firstDate: string;
  /// <summary>Latest logged date.</summary>
  lastDate: string;
  /// <summary>Underlying time entries.</summary>
  entries: TimeEntry[];
}

/// <summary>
/// Formats a Date object to YYYY-MM-DD string.
/// </summary>
/// <param name="date">Date to format.</param>
/// <returns>Formatted ISO date string.</returns>
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/// <summary>
/// Dashboard component for searching any topic or task and calculating total days logged (ideal for leave tracking).
/// Displays connected task notes and provides direct actions to queue tasks.
/// </summary>
export const TaskDaysSearch: React.FC = () => {
  const { user } = useUser();
  const { addTodo } = useQueue();
  const { getNote } = useTaskNotes();

  // Search and filter parameters
  const [searchQuery, setSearchQuery] = useState('');
  const [datePreset, setDatePreset] = useState<TaskDatePreset>('this_year');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [workdayHours, setWorkdayHours] = useState<number>(() => {
    const saved = localStorage.getItem('hours_per_day');
    return saved ? parseFloat(saved) || 8 : 8;
  });

  // Data fetching state
  const [allEntries, setAllEntries] = useState<TimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Save workday hours setting
  const handleWorkdayHoursChange = (val: string | number) => {
    const num = typeof val === 'number' ? val : parseFloat(val) || 8;
    setWorkdayHours(num);
    localStorage.setItem('hours_per_day', String(num));
  };

  /// <summary>
  /// Computes date boundary strings based on current datePreset.
  /// </summary>
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();

    switch (datePreset) {
      case 'this_year': {
        const from = `${currentYear}-01-01`;
        const to = `${currentYear}-12-31`;
        return { fromDate: from, toDate: to };
      }
      case 'last_year': {
        const from = `${currentYear - 1}-01-01`;
        const to = `${currentYear - 1}-12-31`;
        return { fromDate: from, toDate: to };
      }
      case 'last_12_months': {
        const past = new Date(now);
        past.setFullYear(now.getFullYear() - 1);
        return { fromDate: formatDate(past), toDate: formatDate(now) };
      }
      case 'last_30_days': {
        const past = new Date(now);
        past.setDate(now.getDate() - 30);
        return { fromDate: formatDate(past), toDate: formatDate(now) };
      }
      case 'all_time':
        return { fromDate: '', toDate: '' };
      case 'custom':
        return { fromDate: customFrom, toDate: customTo };
      default:
        return { fromDate: `${currentYear}-01-01`, toDate: `${currentYear}-12-31` };
    }
  }, [datePreset, customFrom, customTo]);

  /// <summary>
  /// Fetches time entries for current user across the selected date range.
  /// </summary>
  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const entries = await getAllUserTimeEntries({
        user_id: user.id,
        from: fromDate || undefined,
        to: toDate || undefined,
      });
      setAllEntries(entries);
    } catch (err: any) {
      console.error('Failed to fetch user time entries:', err);
      setError(err?.message || 'Could not load time entries.');
    } finally {
      setIsLoading(false);
    }
  }, [user, fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /// <summary>
  /// Toggles expansion of a specific task card to show its individual time entries.
  /// </summary>
  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  /// <summary>
  /// Adds a task directly into the active timer queue.
  /// </summary>
  const handleAddToQueue = (task: TaskAggregation) => {
    const existingNote = getNote(task.taskId);
    addTodo({
      projectId: task.projectId,
      projectName: task.projectName,
      taskId: task.taskId,
      taskSubject: task.taskSubject,
      note: existingNote || '',
    });
  };

  /// <summary>
  /// Aggregates all time entries into grouped task objects.
  /// </summary>
  const taskGroups = useMemo<TaskAggregation[]>(() => {
    const map = new Map<string, TaskAggregation>();

    allEntries.forEach((entry) => {
      const hasIssue = Boolean(entry.issue?.id);
      const taskIdKey = hasIssue ? String(entry.issue!.id) : `project-${entry.project?.id || 'none'}`;
      const taskSubject = entry.issue?.subject || (hasIssue ? `Task #${entry.issue!.id}` : entry.project?.name || 'General Time');
      const projectName = entry.project?.name || 'Unknown Project';
      const projectId = entry.project?.id ? String(entry.project.id) : '';

      if (!map.has(taskIdKey)) {
        map.set(taskIdKey, {
          taskId: hasIssue ? String(entry.issue!.id) : '',
          taskSubject,
          projectName,
          projectId,
          totalHours: 0,
          totalDays: 0,
          distinctDates: new Set<string>(),
          firstDate: entry.spent_on,
          lastDate: entry.spent_on,
          entries: [],
        });
      }

      const group = map.get(taskIdKey)!;
      group.totalHours += entry.hours;
      group.distinctDates.add(entry.spent_on);
      group.entries.push(entry);

      if (entry.spent_on < group.firstDate) group.firstDate = entry.spent_on;
      if (entry.spent_on > group.lastDate) group.lastDate = entry.spent_on;
    });

    const divisor = workdayHours > 0 ? workdayHours : 8;
    map.forEach((group) => {
      group.totalDays = parseFloat((group.totalHours / divisor).toFixed(2));
      // Sort individual entries by date descending
      group.entries.sort((a, b) => (b.spent_on > a.spent_on ? 1 : -1));
    });

    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
  }, [allEntries, workdayHours]);

  /// <summary>
  /// Filters task groups according to the user's search query across subject, taskId, comments, project, and notes.
  /// </summary>
  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return taskGroups;

    return taskGroups.filter((group) => {
      const matchTaskId = group.taskId.toLowerCase().includes(query) || `#${group.taskId}`.includes(query);
      const matchSubject = group.taskSubject.toLowerCase().includes(query);
      const matchProject = group.projectName.toLowerCase().includes(query);
      const matchNote = getNote(group.taskId).toLowerCase().includes(query);
      const matchComments = group.entries.some((e) => (e.comments || '').toLowerCase().includes(query));
      const matchActivity = group.entries.some((e) => (e.activity?.name || '').toLowerCase().includes(query));

      return matchTaskId || matchSubject || matchProject || matchNote || matchComments || matchActivity;
    });
  }, [taskGroups, searchQuery, getNote]);

  /// <summary>
  /// Overall summary metrics across the filtered tasks.
  /// </summary>
  const summaryMetrics = useMemo(() => {
    let totalHours = 0;
    const allDistinctDates = new Set<string>();

    filteredTasks.forEach((t) => {
      totalHours += t.totalHours;
      t.distinctDates.forEach((d) => allDistinctDates.add(d));
    });

    const divisor = workdayHours > 0 ? workdayHours : 8;
    const totalDays = parseFloat((totalHours / divisor).toFixed(2));

    return {
      totalHours: parseFloat(totalHours.toFixed(2)),
      totalDays,
      uniqueDaysCount: allDistinctDates.size,
      tasksCount: filteredTasks.length,
    };
  }, [filteredTasks, workdayHours]);

  return (
    <Stack gap="lg">
      <Group justify="space-between" wrap="wrap">
        <div>
          <Title order={2}>Task Days & Topic Search</Title>
          <Text size="sm" c="dimmed">
            Calculate how many days you have logged for any task, vacation, or search topic.
          </Text>
        </div>

        <Group>
          <Button
            leftSection={<IconRefresh size={16} />}
            variant="light"
            onClick={fetchData}
            loading={isLoading}
          >
            Refresh Data
          </Button>
        </Group>
      </Group>

      {/* Filter and Configuration Card */}
      <Card shadow="sm" padding="md" radius="md" withBorder>
        <Stack gap="md">
          <Group grow align="flex-end" wrap="wrap">
            <TextInput
              label="Search Topic or Task"
              placeholder="e.g. Leave, Vacation, Sick, #1234, Support..."
              leftSection={<IconSearch size={16} />}
              rightSection={
                searchQuery ? (
                  <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearchQuery('')}>
                    <IconX size={14} />
                  </ActionIcon>
                ) : null
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ flex: '1 1 280px' }}
            />

            <Select
              label="Date Range"
              value={datePreset}
              onChange={(val) => setDatePreset((val as TaskDatePreset) || 'this_year')}
              data={[
                { value: 'this_year', label: `This Year (${new Date().getFullYear()})` },
                { value: 'last_year', label: `Last Year (${new Date().getFullYear() - 1})` },
                { value: 'last_12_months', label: 'Last 12 Months' },
                { value: 'last_30_days', label: 'Last 30 Days' },
                { value: 'all_time', label: 'All Time' },
                { value: 'custom', label: 'Custom Range' },
              ]}
              style={{ flex: '0 0 200px' }}
            />

            <NumberInput
              label="Hours / Day"
              description="Standard workday conversion"
              value={workdayHours}
              onChange={handleWorkdayHoursChange}
              min={1}
              max={24}
              step={0.5}
              style={{ flex: '0 0 160px' }}
            />
          </Group>

          {/* Quick Filter Presets */}
          <Group gap="xs" align="center">
            <Text size="xs" fw={600} c="dimmed">
              Quick Presets:
            </Text>
            <Button
              size="xs"
              variant={searchQuery.toLowerCase().includes('leave') ? 'filled' : 'light'}
              color="teal"
              leftSection={<IconBeach size={14} />}
              onClick={() => setSearchQuery('leave')}
            >
              Leaves & Vacations
            </Button>
            <Button
              size="xs"
              variant={searchQuery.toLowerCase().includes('sick') ? 'filled' : 'light'}
              color="red"
              leftSection={<IconHeartbeat size={14} />}
              onClick={() => setSearchQuery('sick')}
            >
              Sick Leave
            </Button>
            {searchQuery && (
              <Button size="xs" variant="subtle" color="gray" onClick={() => setSearchQuery('')}>
                Show All Topics
              </Button>
            )}
          </Group>

          {/* Custom Date Inputs if custom range selected */}
          {datePreset === 'custom' && (
            <Group grow align="flex-end">
              <TextInput
                label="From Date"
                placeholder="YYYY-MM-DD"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.currentTarget.value)}
              />
              <TextInput
                label="To Date"
                placeholder="YYYY-MM-DD"
                value={customTo}
                onChange={(e) => setCustomTo(e.currentTarget.value)}
              />
              <Button onClick={fetchData} variant="light">
                Apply Custom Range
              </Button>
            </Group>
          )}
        </Stack>
      </Card>

      {/* Summary Stat Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md">
        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            Total Days Logged
          </Text>
          <Group align="baseline" gap="xs" mt="xs">
            <Text fz={28} fw={700} c="blue">
              {summaryMetrics.totalDays}
            </Text>
            <Text size="sm" c="dimmed">
              days
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Based on {workdayHours}h / workday
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            Total Hours
          </Text>
          <Group align="baseline" gap="xs" mt="xs">
            <Text fz={28} fw={700}>
              {summaryMetrics.totalHours}
            </Text>
            <Text size="sm" c="dimmed">
              hours
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Sum of all matched entries
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            Unique Dates Logged
          </Text>
          <Group align="baseline" gap="xs" mt="xs">
            <Text fz={28} fw={700} c="teal">
              {summaryMetrics.uniqueDaysCount}
            </Text>
            <Text size="sm" c="dimmed">
              calendar dates
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Distinct dates with logs
          </Text>
        </Paper>

        <Paper withBorder p="md" radius="md">
          <Text size="xs" c="dimmed" fw={700} tt="uppercase">
            Matching Tasks
          </Text>
          <Group align="baseline" gap="xs" mt="xs">
            <Text fz={28} fw={700}>
              {summaryMetrics.tasksCount}
            </Text>
            <Text size="sm" c="dimmed">
              tasks
            </Text>
          </Group>
          <Text size="xs" c="dimmed" mt={4}>
            Matching current filters
          </Text>
        </Paper>
      </SimpleGrid>

      {/* Leave Summary Notice */}
      {searchQuery && (
        <Alert icon={<IconSearch size={16} />} title={`Search Results for "${searchQuery}"`} color="blue" radius="md">
          Logged <strong>{summaryMetrics.totalDays} days</strong> ({summaryMetrics.totalHours} hours) across{' '}
          <strong>{summaryMetrics.uniqueDaysCount} working dates</strong> in this period.
        </Alert>
      )}

      {/* Loading & Error States */}
      {isLoading && (
        <Group justify="center" py="xl">
          <Loader size="md" />
          <Text c="dimmed">Loading and calculating time entries...</Text>
        </Group>
      )}

      {error && (
        <Alert color="red" title="Error Loading Data">
          {error}
        </Alert>
      )}

      {!isLoading && filteredTasks.length === 0 && (
        <Paper withBorder p="xl" radius="md" ta="center">
          <Text c="dimmed" size="md">
            No time entries found matching your search and date range criteria.
          </Text>
        </Paper>
      )}

      {/* Task List Cards */}
      {!isLoading && filteredTasks.length > 0 && (
        <Stack gap="md">
          {filteredTasks.map((task) => {
            const isExpanded = expandedTasks.has(task.taskId);
            const taskNote = getNote(task.taskId);

            return (
              <Card key={task.taskId || task.taskSubject} shadow="xs" padding="md" radius="md" withBorder>
                <Stack gap="xs">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs" wrap="wrap">
                        <Badge size="sm" variant="light" color="gray">
                          {task.projectName}
                        </Badge>
                        {task.taskId && (
                          <RedmineIssueLink
                            issueId={task.taskId}
                            size="sm"
                            fw={700}
                          />
                        )}
                      </Group>

                      <Text fw={600} size="md" lineClamp={2}>
                        {task.taskSubject}
                      </Text>

                      <Text size="xs" c="dimmed">
                        Period: {task.firstDate} &rarr; {task.lastDate} ({task.distinctDates.size} dates logged)
                      </Text>
                    </Stack>

                    <Group gap="xs" align="center" wrap="nowrap">
                      {/* Highlighted Total Days Badge */}
                      <Badge size="xl" variant="filled" color="blue" radius="md">
                        {task.totalDays} Days
                      </Badge>

                      <Text size="sm" c="dimmed" fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ({task.totalHours}h)
                      </Text>

                      {/* Connected Note Button */}
                      {task.taskId && (
                        <TaskNoteButton taskId={task.taskId} taskSubject={task.taskSubject} size="md" />
                      )}

                      {/* Add to Timer Queue */}
                      {task.taskId && (
                        <Tooltip label="Add to Work Queue">
                          <ActionIcon
                            variant="light"
                            color="teal"
                            size="md"
                            onClick={() => handleAddToQueue(task)}
                            aria-label="Add to Queue"
                          >
                            <IconPlayerPlay size={18} />
                          </ActionIcon>
                        </Tooltip>
                      )}

                      {/* Expand / Collapse Entries */}
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="md"
                        onClick={() => toggleTaskExpansion(task.taskId)}
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        {isExpanded ? <IconChevronDown size={18} /> : <IconChevronRight size={18} />}
                      </ActionIcon>
                    </Group>
                  </Group>

                  {/* Connected Note Preview Callout */}
                  {taskNote && (
                    <Paper withBorder p="xs" radius="sm" bg="var(--mantine-color-blue-light)" mt={4}>
                      <Group gap="xs" align="flex-start" wrap="nowrap">
                        <IconNotes size={16} color="var(--mantine-color-blue-filled)" style={{ flexShrink: 0, marginTop: 2 }} />
                        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                          <Text size="xs" fw={700} c="blue">
                            Connected Task Note:
                          </Text>
                          <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                            {taskNote}
                          </Text>
                        </Stack>
                      </Group>
                    </Paper>
                  )}

                  {/* Expandable Entries Table */}
                  {isExpanded && (
                    <Stack gap="xs" mt="sm">
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                        Individual Log Entries ({task.entries.length}):
                      </Text>

                      <Table striped highlightOnHover withTableBorder withColumnBorders>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th style={{ width: 120 }}>Date</Table.Th>
                            <Table.Th style={{ width: 90 }}>Hours</Table.Th>
                            <Table.Th style={{ width: 90 }}>Days Equiv.</Table.Th>
                            <Table.Th style={{ width: 150 }}>Activity</Table.Th>
                            <Table.Th>Comments / Notes</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {task.entries.map((entry) => {
                            const daysEquiv = parseFloat((entry.hours / (workdayHours || 8)).toFixed(2));
                            return (
                              <Table.Tr key={entry.id}>
                                <Table.Td fw={500}>{entry.spent_on}</Table.Td>
                                <Table.Td fw={600} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  {entry.hours}h
                                </Table.Td>
                                <Table.Td style={{ fontVariantNumeric: 'tabular-nums' }}>
                                  <Badge size="xs" variant="light" color="blue">
                                    {daysEquiv}d
                                  </Badge>
                                </Table.Td>
                                <Table.Td>{entry.activity?.name || '-'}</Table.Td>
                                <Table.Td style={{ wordBreak: 'break-word' }}>
                                  {entry.comments || <Text c="dimmed" size="xs">No comments</Text>}
                                </Table.Td>
                              </Table.Tr>
                            );
                          })}
                        </Table.Tbody>
                      </Table>
                    </Stack>
                  )}
                </Stack>
              </Card>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
};
