import React, { useState, useMemo } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Title,
  Badge,
  Select,
  TextInput,
  SegmentedControl,
  Table,
  Tabs,
  Button,
  Anchor,
  SimpleGrid,
  Paper,
  ActionIcon,
} from '@mantine/core';
import {
  IconCalendar,
  IconSearch,
  IconList,
  IconChecklist,
  IconUsers,
  IconDownload,
  IconChevronDown,
  IconChevronRight,
} from '@tabler/icons-react';
import type { TimeEntry } from '../../../types';
import type { DateRangePreset } from '../hooks/useProjectManagerData';
import { groupEntriesByTask, groupEntriesByMember } from '../../../services/pmService';
import { useSettings } from '../../../contexts/SettingsContext';

/// <summary>
/// Properties for ProjectTimeLogSection.
/// </summary>
interface ProjectTimeLogSectionProps {
  /// <summary>Full list of project time entries.</summary>
  allEntries: TimeEntry[];
  /// <summary>Filtered time entries for the current view and export.</summary>
  filteredEntries: TimeEntry[];
  /// <summary>Currently selected date range preset.</summary>
  dateRangePreset: DateRangePreset;
  /// <summary>Callback to update date range preset.</summary>
  onDateRangeChange: (preset: DateRangePreset) => void;
  /// <summary>Human-readable text of the current date filter.</summary>
  dateLabel: string;
  /// <summary>Custom from date string (YYYY-MM-DD).</summary>
  customFromDate: string;
  /// <summary>Callback for custom from date change.</summary>
  onCustomFromDateChange: (val: string) => void;
  /// <summary>Custom to date string (YYYY-MM-DD).</summary>
  customToDate: string;
  /// <summary>Callback for custom to date change.</summary>
  onCustomToDateChange: (val: string) => void;
  /// <summary>Selected member ID or 'all'.</summary>
  selectedMemberId: string;
  /// <summary>Callback for member filter.</summary>
  onMemberChange: (val: string) => void;
  /// <summary>Selected activity ID or 'all'.</summary>
  selectedActivityId: string;
  /// <summary>Callback for activity filter.</summary>
  onActivityChange: (val: string) => void;
  /// <summary>Selected billable filter ('all' | 'billable' | 'non_billable').</summary>
  selectedBillableFilter: 'all' | 'billable' | 'non_billable';
  /// <summary>Callback for billable filter.</summary>
  onBillableFilterChange: (val: 'all' | 'billable' | 'non_billable') => void;
  /// <summary>Search filter text.</summary>
  searchQuery: string;
  /// <summary>Callback for search text change.</summary>
  onSearchChange: (val: string) => void;
  /// <summary>Callback to trigger the Client Export modal.</summary>
  onOpenExportModal: () => void;
  /// <summary>Whether time entries are currently loading.</summary>
  isLoading: boolean;
}

/// <summary>
/// Detailed project time log section with multi-level filtering, aggregations, and task breakdown.
/// </summary>
export const ProjectTimeLogSection: React.FC<ProjectTimeLogSectionProps> = ({
  allEntries,
  filteredEntries,
  dateRangePreset,
  onDateRangeChange,
  dateLabel,
  customFromDate,
  onCustomFromDateChange,
  customToDate,
  onCustomToDateChange,
  selectedMemberId,
  onMemberChange,
  selectedActivityId,
  onActivityChange,
  selectedBillableFilter,
  onBillableFilterChange,
  searchQuery,
  onSearchChange,
  onOpenExportModal,
  isLoading,
}) => {
  const { redmineUrl } = useSettings();
  const [activeTab, setActiveTab] = useState<string | null>('entries');

  // Extract unique members for filter dropdown
  const memberOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set('all', 'All Team Members');
    for (const e of allEntries) {
      if (e.user?.id) {
        map.set(String(e.user.id), e.user.name || `User #${e.user.id}`);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [allEntries]);

  // Extract unique activities for filter dropdown
  const activityOptions = useMemo(() => {
    const map = new Map<string, string>();
    map.set('all', 'All Activities');
    for (const e of allEntries) {
      if (e.activity?.id) {
        map.set(String(e.activity.id), e.activity.name || `Activity #${e.activity.id}`);
      }
    }
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [allEntries]);

  // Compute stats for current filtered view
  const viewStats = useMemo(() => {
    let total = 0;
    let billable = 0;
    const taskSet = new Set<number>();
    const userSet = new Set<number>();

    for (const e of filteredEntries) {
      const h = Number(e.hours) || 0;
      total += h;
      const isBillable = e.custom_fields?.some(
        cf => (cf.name?.toLowerCase().includes('billable') || cf.id === 4) && (cf.value === '1' || cf.value === 'true')
      );
      if (isBillable || !e.custom_fields || e.custom_fields.length === 0) {
        billable += h;
      }
      if (e.issue?.id) taskSet.add(e.issue.id);
      if (e.user?.id) userSet.add(e.user.id);
    }

    return {
      totalHours: Math.round(total * 100) / 100,
      billableHours: Math.round(billable * 100) / 100,
      nonBillableHours: Math.round((total - billable) * 100) / 100,
      taskCount: taskSet.size,
      userCount: userSet.size,
    };
  }, [filteredEntries]);

  // Grouped task summaries (hierarchical with detected parents)
  const taskSummaries = useMemo(() => {
    return groupEntriesByTask(filteredEntries);
  }, [filteredEntries]);

  // Detected parent tasks with children
  const parentTasks = useMemo(() => {
    return taskSummaries.filter(t => t.isParent && t.children && t.children.length > 0);
  }, [taskSummaries]);

  // Set of collapsed parent task IDs (empty set = all expanded by default)
  const [collapsedParentIds, setCollapsedParentIds] = useState<Set<number>>(() => new Set());

  /// <summary>
  /// Toggles expansion for an individual parent task.
  /// </summary>
  /// <param name="parentId">ID of the parent task.</param>
  const toggleParentExpand = (parentId: number) => {
    setCollapsedParentIds(prev => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const isAllParentsExpanded = parentTasks.length > 0 && parentTasks.every(p => !collapsedParentIds.has(p.issueId));

  /// <summary>
  /// Toggles expansion for all parent tasks simultaneously.
  /// </summary>
  const toggleExpandAll = () => {
    if (isAllParentsExpanded) {
      setCollapsedParentIds(new Set(parentTasks.map(p => p.issueId)));
    } else {
      setCollapsedParentIds(new Set());
    }
  };

  // Grouped member summaries
  const memberSummaries = useMemo(() => {
    return groupEntriesByMember(filteredEntries);
  }, [filteredEntries]);

  const cleanUrl = redmineUrl?.replace(/\/$/, '') || '';

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header & Export Button */}
        <Group justify="space-between" align="center" wrap="wrap">
          <div>
            <Title order={3}>Project Time Logs</Title>
            <Text size="sm" c="dimmed">
              {dateLabel} • Total {filteredEntries.length} entries
            </Text>
          </div>

          <Button
            size="md"
            color="blue"
            leftSection={<IconDownload size={18} />}
            onClick={onOpenExportModal}
            disabled={filteredEntries.length === 0}
            loading={isLoading}
          >
            Export for Client
          </Button>
        </Group>

        {/* View Statistics Cards */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          <Paper withBorder p="md" radius="md">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Logged in Period
            </Text>
            <Group align="baseline" gap="xs" mt="xs">
              <Text fz={28} fw={700}>
                {viewStats.totalHours}
              </Text>
              <Text size="sm" c="dimmed">
                hours
              </Text>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Billable Hours
            </Text>
            <Group align="baseline" gap="xs" mt="xs">
              <Text fz={28} fw={700} c="teal">
                {viewStats.billableHours}
              </Text>
              <Text size="sm" c="dimmed">
                hours
              </Text>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Tasks Worked On
            </Text>
            <Group align="baseline" gap="xs" mt="xs">
              <Text fz={28} fw={700}>
                {viewStats.taskCount}
              </Text>
              <Text size="sm" c="dimmed">
                tasks
              </Text>
            </Group>
          </Paper>

          <Paper withBorder p="md" radius="md">
            <Text size="xs" c="dimmed" fw={700} tt="uppercase">
              Active Team Members
            </Text>
            <Group align="baseline" gap="xs" mt="xs">
              <Text fz={28} fw={700}>
                {viewStats.userCount}
              </Text>
              <Text size="sm" c="dimmed">
                members
              </Text>
            </Group>
          </Paper>
        </SimpleGrid>

        {/* Filters Bar */}
        <Card withBorder padding="sm" radius="sm" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
          <Stack gap="xs">
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap="xs">
                <IconCalendar size={18} color="gray" />
                <SegmentedControl
                  size="xs"
                  value={dateRangePreset}
                  onChange={val => onDateRangeChange(val as DateRangePreset)}
                  data={[
                    { value: 'this_month', label: 'This Month' },
                    { value: 'last_month', label: 'Last Month' },
                    { value: 'last_30_days', label: 'Last 30 Days' },
                    { value: 'contract_period', label: 'Contract Period' },
                    { value: 'all', label: 'All / Custom' },
                  ]}
                />
              </Group>

              {dateRangePreset === 'all' && (
                <Group gap="xs">
                  <TextInput
                    size="xs"
                    type="date"
                    placeholder="From"
                    value={customFromDate}
                    onChange={e => onCustomFromDateChange(e.target.value)}
                    style={{ width: 135 }}
                  />
                  <Text size="xs" c="dimmed">-</Text>
                  <TextInput
                    size="xs"
                    type="date"
                    placeholder="To"
                    value={customToDate}
                    onChange={e => onCustomToDateChange(e.target.value)}
                    style={{ width: 135 }}
                  />
                </Group>
              )}

              <Group gap="xs">
                <Select
                  size="xs"
                  placeholder="Billable status"
                  data={[
                    { value: 'all', label: 'All Hours' },
                    { value: 'billable', label: 'Billable Only' },
                    { value: 'non_billable', label: 'Non-billable Only' },
                  ]}
                  value={selectedBillableFilter}
                  onChange={val => onBillableFilterChange((val as 'all' | 'billable' | 'non_billable') || 'all')}
                  style={{ width: 170 }}
                />
                <Select
                  size="xs"
                  placeholder="Team Member"
                  data={memberOptions}
                  value={selectedMemberId}
                  onChange={val => onMemberChange(val || 'all')}
                  style={{ width: 190 }}
                />
                <Select
                  size="xs"
                  placeholder="Activity"
                  data={activityOptions}
                  value={selectedActivityId}
                  onChange={val => onActivityChange(val || 'all')}
                  style={{ width: 160 }}
                />
              </Group>
            </Group>

            {/* Search Input */}
            <TextInput
              size="xs"
              placeholder="Search by task #ID, subject, team member, or comment..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              leftSection={<IconSearch size={14} />}
            />
          </Stack>
        </Card>

        {/* Tabs: Detailed Table, Tasks, Members */}
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="entries" leftSection={<IconList size={16} />}>
              All Entries ({filteredEntries.length})
            </Tabs.Tab>
            <Tabs.Tab value="tasks" leftSection={<IconChecklist size={16} />}>
              By Task ({taskSummaries.length})
            </Tabs.Tab>
            <Tabs.Tab value="members" leftSection={<IconUsers size={16} />}>
              By Team Member ({memberSummaries.length})
            </Tabs.Tab>
          </Tabs.List>

          {/* TAB 1: Detailed Entries Table */}
          <Tabs.Panel value="entries" pt="xs">
            {filteredEntries.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" py="xl">
                No logged hours found for the selected period and filters.
              </Text>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 95 }}>Date</Table.Th>
                      <Table.Th style={{ width: 140 }}>Team Member</Table.Th>
                      <Table.Th style={{ width: 220 }}>Task</Table.Th>
                      <Table.Th style={{ width: 110 }}>Activity</Table.Th>
                      <Table.Th style={{ width: 70, textAlign: 'right' }}>Hours</Table.Th>
                      <Table.Th>Activity Description / Comment</Table.Th>
                      <Table.Th style={{ width: 90, textAlign: 'center' }}>Billable</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {filteredEntries.map(entry => {
                      const isBillable = entry.custom_fields?.some(
                        cf =>
                          (cf.name?.toLowerCase().includes('billable') || cf.id === 4) &&
                          (cf.value === '1' || cf.value === 'true')
                      );
                      const issueId = entry.issue?.id;
                      const issueLink = issueId && cleanUrl ? `${cleanUrl}/issues/${issueId}` : null;

                      return (
                        <Table.Tr key={entry.id}>
                          <Table.Td>{entry.spent_on}</Table.Td>
                          <Table.Td fw={500}>{entry.user?.name || '-'}</Table.Td>
                          <Table.Td>
                            {issueId ? (
                              <Stack gap={2}>
                                <Group gap={4} wrap="nowrap">
                                  {issueLink ? (
                                    <Anchor href={issueLink} target="_blank" rel="noopener noreferrer" fw={600}>
                                      #{issueId}
                                    </Anchor>
                                  ) : (
                                    <Text fw={600}>#{issueId}</Text>
                                  )}
                                  {entry.issue?.subject && (
                                    <Text size="xs" truncate style={{ maxWidth: 170 }} title={entry.issue.subject}>
                                      {entry.issue.subject}
                                    </Text>
                                  )}
                                </Group>
                                {entry.issue?.parent && (
                                  <Group gap={4} wrap="nowrap">
                                    <Badge size="xs" variant="light" color="indigo" style={{ textTransform: 'none' }}>
                                      ↳ Parent: #{entry.issue.parent.id}
                                    </Badge>
                                    {entry.issue.parent.subject && (
                                      <Text size="10px" c="dimmed" truncate style={{ maxWidth: 150 }} title={entry.issue.parent.subject}>
                                        {entry.issue.parent.subject}
                                      </Text>
                                    )}
                                  </Group>
                                )}
                              </Stack>
                            ) : (
                              <Text c="dimmed">General Project</Text>
                            )}
                          </Table.Td>
                          <Table.Td>{entry.activity?.name || '-'}</Table.Td>
                          <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {Number(entry.hours).toFixed(2)} h
                          </Table.Td>
                          <Table.Td>{entry.comments || '-'}</Table.Td>
                          <Table.Td style={{ textAlign: 'center' }}>
                            {isBillable ? (
                              <Badge size="xs" color="teal" variant="light">
                                Yes
                              </Badge>
                            ) : (
                              <Badge size="xs" color="gray" variant="subtle">
                                No
                              </Badge>
                            )}
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </div>
            )}
          </Tabs.Panel>

          {/* TAB 2: Grouped by Task (with Parent Task Hierarchy) */}
          <Tabs.Panel value="tasks" pt="xs">
            {taskSummaries.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" py="xl">
                No task entries found for the selected period.
              </Text>
            ) : (
              <Stack gap="xs">
                {parentTasks.length > 0 && (
                  <Group justify="flex-end">
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={isAllParentsExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                      onClick={toggleExpandAll}
                    >
                      {isAllParentsExpanded ? 'Collapse all parent tasks' : 'Expand all parent tasks'}
                    </Button>
                  </Group>
                )}
                <Table striped highlightOnHover withTableBorder fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 110 }}>Task #</Table.Th>
                      <Table.Th>Task Subject</Table.Th>
                      <Table.Th style={{ width: 110, textAlign: 'right' }}>Total Hours</Table.Th>
                      <Table.Th style={{ width: 100, textAlign: 'right' }}>Billable</Table.Th>
                      <Table.Th style={{ width: 150 }}>Activities</Table.Th>
                      <Table.Th style={{ width: 180 }}>Team Members</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {taskSummaries.map(t => {
                      const isParent = Boolean(t.isParent && t.children && t.children.length > 0);
                      const isExpanded = !collapsedParentIds.has(t.issueId);
                      const issueLink = t.issueId && cleanUrl ? `${cleanUrl}/issues/${t.issueId}` : null;

                      if (isParent) {
                        return (
                          <React.Fragment key={`parent-${t.issueId}`}>
                            {/* Parent Task Header Row */}
                            <Table.Tr bg="light-dark(var(--mantine-color-blue-0), var(--mantine-color-dark-6))">
                              <Table.Td>
                                <Group gap={4} wrap="nowrap">
                                  <ActionIcon
                                    size="xs"
                                    variant="subtle"
                                    color="blue"
                                    onClick={() => toggleParentExpand(t.issueId)}
                                    title={isExpanded ? 'Collapse subtasks' : 'Expand subtasks'}
                                  >
                                    {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                                  </ActionIcon>
                                  {t.issueId ? (
                                    issueLink ? (
                                      <Anchor href={issueLink} target="_blank" rel="noopener noreferrer" fw={700}>
                                        #{t.issueId}
                                      </Anchor>
                                    ) : (
                                      <Text fw={700}>#{t.issueId}</Text>
                                    )
                                  ) : (
                                    <Text c="dimmed">Total</Text>
                                  )}
                                </Group>
                              </Table.Td>
                              <Table.Td>
                                <Group gap="xs" wrap="wrap">
                                  <Badge size="xs" color="indigo" variant="filled">
                                    Parent Task
                                  </Badge>
                                  <Text fw={700}>{t.subject}</Text>
                                  <Badge size="xs" color="gray" variant="light">
                                    {t.children?.length} {t.children?.length === 1 ? 'sub-task' : 'sub-tasks'}
                                  </Badge>
                                </Group>
                              </Table.Td>
                              <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                                <Text fw={700} span>{t.totalHours.toFixed(2)} h</Text>
                                {t.directHours && t.directHours > 0 ? (
                                  <Text size="10px" c="dimmed" display="block">
                                    (direct: {t.directHours.toFixed(2)} h)
                                  </Text>
                                ) : null}
                              </Table.Td>
                              <Table.Td style={{ textAlign: 'right', color: 'var(--mantine-color-teal-filled)', fontWeight: 700 }}>
                                {t.billableHours.toFixed(2)} h
                              </Table.Td>
                              <Table.Td>{t.activities.join(', ') || '-'}</Table.Td>
                              <Table.Td>{t.members.join(', ') || '-'}</Table.Td>
                            </Table.Tr>

                            {/* Direct hours row if parent had direct entries */}
                            {isExpanded && t.directHours && t.directHours > 0 ? (
                              <Table.Tr key={`parent-direct-${t.issueId}`} style={{ fontStyle: 'italic' }}>
                                <Table.Td style={{ paddingLeft: 28 }}>
                                  <Text size="xs" c="dimmed">↳ #{t.issueId}</Text>
                                </Table.Td>
                                <Table.Td>
                                  <Text size="xs" c="dimmed">Direct entries for task #{t.issueId}</Text>
                                </Table.Td>
                                <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                                  {t.directHours.toFixed(2)} h
                                </Table.Td>
                                <Table.Td style={{ textAlign: 'right', color: 'var(--mantine-color-teal-filled)' }}>
                                  {(t.directBillableHours || 0).toFixed(2)} h
                                </Table.Td>
                                <Table.Td>-</Table.Td>
                                <Table.Td>-</Table.Td>
                              </Table.Tr>
                            ) : null}

                            {/* Child Tasks Rows */}
                            {isExpanded &&
                              t.children?.map(child => {
                                const childLink = child.issueId && cleanUrl ? `${cleanUrl}/issues/${child.issueId}` : null;
                                return (
                                  <Table.Tr key={`child-${child.issueId}`}>
                                    <Table.Td style={{ paddingLeft: 28 }}>
                                      <Group gap={4} wrap="nowrap">
                                        <Text size="xs" c="dimmed">↳</Text>
                                        {childLink ? (
                                          <Anchor href={childLink} target="_blank" rel="noopener noreferrer" fw={600} size="xs">
                                            #{child.issueId}
                                          </Anchor>
                                        ) : (
                                          <Text fw={600} size="xs">#{child.issueId}</Text>
                                        )}
                                      </Group>
                                    </Table.Td>
                                    <Table.Td fw={500}>{child.subject}</Table.Td>
                                    <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                                      {child.totalHours.toFixed(2)} h
                                    </Table.Td>
                                    <Table.Td style={{ textAlign: 'right', color: 'var(--mantine-color-teal-filled)' }}>
                                      {child.billableHours.toFixed(2)} h
                                    </Table.Td>
                                    <Table.Td>{child.activities.join(', ') || '-'}</Table.Td>
                                    <Table.Td>{child.members.join(', ') || '-'}</Table.Td>
                                  </Table.Tr>
                                );
                              })}
                          </React.Fragment>
                        );
                      }

                      // Standalone Task (not a parent)
                      return (
                        <Table.Tr key={t.issueId}>
                          <Table.Td>
                            {t.issueId ? (
                              issueLink ? (
                                <Anchor href={issueLink} target="_blank" rel="noopener noreferrer" fw={700}>
                                  #{t.issueId}
                                </Anchor>
                              ) : (
                                <Text fw={700}>#{t.issueId}</Text>
                              )
                            ) : (
                              <Text c="dimmed">Total</Text>
                            )}
                          </Table.Td>
                          <Table.Td fw={500}>{t.subject}</Table.Td>
                          <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                            {t.totalHours.toFixed(2)} h
                          </Table.Td>
                          <Table.Td style={{ textAlign: 'right', color: 'var(--mantine-color-teal-filled)' }}>
                            {t.billableHours.toFixed(2)} h
                          </Table.Td>
                          <Table.Td>{t.activities.join(', ') || '-'}</Table.Td>
                          <Table.Td>{t.members.join(', ') || '-'}</Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Stack>
            )}
          </Tabs.Panel>

          {/* TAB 3: Grouped by Member */}
          <Tabs.Panel value="members" pt="xs">
            {memberSummaries.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" py="xl">
                No team member data found for the selected period.
              </Text>
            ) : (
              <Table striped highlightOnHover withTableBorder fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Team Member</Table.Th>
                    <Table.Th style={{ width: 110, textAlign: 'right' }}>Total Hours</Table.Th>
                    <Table.Th style={{ width: 120, textAlign: 'right' }}>Billable</Table.Th>
                    <Table.Th style={{ width: 100, textAlign: 'center' }}>Task Count</Table.Th>
                    <Table.Th style={{ width: 100, textAlign: 'right' }}>% of Time</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {memberSummaries.map(m => {
                    const percent =
                      viewStats.totalHours > 0
                        ? Math.round((m.totalHours / viewStats.totalHours) * 1000) / 10
                        : 0;
                    return (
                      <Table.Tr key={m.userId}>
                        <Table.Td fw={600}>{m.userName}</Table.Td>
                        <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {m.totalHours.toFixed(2)} h
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right', color: 'var(--mantine-color-teal-filled)' }}>
                          {m.billableHours.toFixed(2)} h
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'center' }}>{m.taskCount}</Table.Td>
                        <Table.Td style={{ textAlign: 'right' }}>{percent}%</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Card>
  );
};
