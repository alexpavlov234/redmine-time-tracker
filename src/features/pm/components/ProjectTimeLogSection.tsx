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
} from '@mantine/core';
import {
  IconCalendar,
  IconSearch,
  IconList,
  IconChecklist,
  IconUsers,
  IconDownload,
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
    map.set('all', 'Всички членове на екипа');
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
    map.set('all', 'Всички дейности');
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

  // Grouped task summaries
  const taskSummaries = useMemo(() => {
    return groupEntriesByTask(filteredEntries);
  }, [filteredEntries]);

  // Grouped member summaries
  const memberSummaries = useMemo(() => {
    return groupEntriesByMember(filteredEntries);
  }, [filteredEntries]);

  const cleanUrl = redmineUrl?.replace(/\/$/, '') || '';

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Header & Export Button */}
        <Group justify="space-between" align="center">
          <div>
            <Title order={3}>Отчетено време по проекта</Title>
            <Text size="sm" c="dimmed">
              {dateLabel} • Общо {filteredEntries.length} записа
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
            Експорт за клиент
          </Button>
        </Group>

        {/* View Statistics Cards */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
          <Paper withBorder p="xs" radius="sm">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Отработени в периода
            </Text>
            <Text size="lg" fw={700}>
              {viewStats.totalHours} <Text span size="xs" fw={500} c="dimmed">ч.</Text>
            </Text>
          </Paper>

          <Paper withBorder p="xs" radius="sm">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Фактурируеми (Billable)
            </Text>
            <Text size="lg" fw={700} c="teal">
              {viewStats.billableHours} <Text span size="xs" fw={500} c="dimmed">ч.</Text>
            </Text>
          </Paper>

          <Paper withBorder p="xs" radius="sm">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Отработени задачи
            </Text>
            <Text size="lg" fw={700}>
              {viewStats.taskCount}
            </Text>
          </Paper>

          <Paper withBorder p="xs" radius="sm">
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Активни служители
            </Text>
            <Text size="lg" fw={700}>
              {viewStats.userCount}
            </Text>
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
                    { value: 'this_month', label: 'Този месец' },
                    { value: 'last_month', label: 'Миналия месец' },
                    { value: 'last_30_days', label: 'Последните 30 дни' },
                    { value: 'contract_period', label: 'Срок по договор' },
                    { value: 'all', label: 'Всички' },
                  ]}
                />
              </Group>

              {dateRangePreset === 'all' && (
                <Group gap="xs">
                  <TextInput
                    size="xs"
                    type="date"
                    placeholder="От дата"
                    value={customFromDate}
                    onChange={e => onCustomFromDateChange(e.target.value)}
                    style={{ width: 135 }}
                  />
                  <Text size="xs" c="dimmed">-</Text>
                  <TextInput
                    size="xs"
                    type="date"
                    placeholder="До дата"
                    value={customToDate}
                    onChange={e => onCustomToDateChange(e.target.value)}
                    style={{ width: 135 }}
                  />
                </Group>
              )}

              <Group gap="xs">
                <Select
                  size="xs"
                  placeholder="Фактурируемост"
                  data={[
                    { value: 'all', label: 'Всички часове' },
                    { value: 'billable', label: 'Само фактурируеми' },
                    { value: 'non_billable', label: 'Нефактурируеми' },
                  ]}
                  value={selectedBillableFilter}
                  onChange={val => onBillableFilterChange((val as 'all' | 'billable' | 'non_billable') || 'all')}
                  style={{ width: 170 }}
                />
                <Select
                  size="xs"
                  placeholder="Служител"
                  data={memberOptions}
                  value={selectedMemberId}
                  onChange={val => onMemberChange(val || 'all')}
                  style={{ width: 190 }}
                />
                <Select
                  size="xs"
                  placeholder="Дейност"
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
              placeholder="Търсене по задача, име на задача, служител или коментар..."
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
              Всички записи ({filteredEntries.length})
            </Tabs.Tab>
            <Tabs.Tab value="tasks" leftSection={<IconChecklist size={16} />}>
              По задачи ({taskSummaries.length})
            </Tabs.Tab>
            <Tabs.Tab value="members" leftSection={<IconUsers size={16} />}>
              По екип ({memberSummaries.length})
            </Tabs.Tab>
          </Tabs.List>

          {/* TAB 1: Detailed Entries Table */}
          <Tabs.Panel value="entries" pt="xs">
            {filteredEntries.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" py="xl">
                Няма намерени отчетени часове за избрания период и филтри.
              </Text>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <Table striped highlightOnHover withTableBorder withColumnBorders fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th style={{ width: 95 }}>Дата</Table.Th>
                      <Table.Th style={{ width: 140 }}>Служител</Table.Th>
                      <Table.Th style={{ width: 220 }}>Задача</Table.Th>
                      <Table.Th style={{ width: 110 }}>Дейност</Table.Th>
                      <Table.Th style={{ width: 70, textAlign: 'right' }}>Часове</Table.Th>
                      <Table.Th>Описание на дейността</Table.Th>
                      <Table.Th style={{ width: 90, textAlign: 'center' }}>Фактурируемо</Table.Th>
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
                              <Group gap={4} wrap="nowrap">
                                {issueLink ? (
                                  <Anchor href={issueLink} target="_blank" rel="noopener noreferrer" fw={600}>
                                    #{issueId}
                                  </Anchor>
                                ) : (
                                  <Text fw={600}>#{issueId}</Text>
                                )}
                                {entry.issue?.subject && (
                                  <Text size="xs" truncate style={{ maxWidth: 170 }}>
                                    {entry.issue.subject}
                                  </Text>
                                )}
                              </Group>
                            ) : (
                              <Text c="dimmed">Общ проект</Text>
                            )}
                          </Table.Td>
                          <Table.Td>{entry.activity?.name || '-'}</Table.Td>
                          <Table.Td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {Number(entry.hours).toFixed(2)} ч.
                          </Table.Td>
                          <Table.Td>{entry.comments || '-'}</Table.Td>
                          <Table.Td style={{ textAlign: 'center' }}>
                            {isBillable ? (
                              <Badge size="xs" color="teal" variant="light">
                                Да
                              </Badge>
                            ) : (
                              <Badge size="xs" color="gray" variant="subtle">
                                Не
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

          {/* TAB 2: Grouped by Task */}
          <Tabs.Panel value="tasks" pt="xs">
            {taskSummaries.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" py="xl">
                Няма данни за задачи в избрания период.
              </Text>
            ) : (
              <Table striped highlightOnHover withTableBorder fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th style={{ width: 100 }}>Задача №</Table.Th>
                    <Table.Th>Заглавие на задача</Table.Th>
                    <Table.Th style={{ width: 90, textAlign: 'right' }}>Общо часове</Table.Th>
                    <Table.Th style={{ width: 100, textAlign: 'right' }}>Фактурируеми</Table.Th>
                    <Table.Th style={{ width: 150 }}>Дейности</Table.Th>
                    <Table.Th style={{ width: 180 }}>Служители</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {taskSummaries.map(t => {
                    const issueLink = t.issueId && cleanUrl ? `${cleanUrl}/issues/${t.issueId}` : null;
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
                            <Text c="dimmed">Общо</Text>
                          )}
                        </Table.Td>
                        <Table.Td fw={500}>{t.subject}</Table.Td>
                        <Table.Td style={{ textAlign: 'right', fontWeight: 700 }}>
                          {t.totalHours.toFixed(2)} ч.
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right', color: 'var(--mantine-color-teal-filled)' }}>
                          {t.billableHours.toFixed(2)} ч.
                        </Table.Td>
                        <Table.Td>{t.activities.join(', ') || '-'}</Table.Td>
                        <Table.Td>{t.members.join(', ') || '-'}</Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            )}
          </Tabs.Panel>

          {/* TAB 3: Grouped by Member */}
          <Tabs.Panel value="members" pt="xs">
            {memberSummaries.length === 0 ? (
              <Text c="dimmed" size="sm" ta="center" py="xl">
                Няма данни за служители в избрания период.
              </Text>
            ) : (
              <Table striped highlightOnHover withTableBorder fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Служител</Table.Th>
                    <Table.Th style={{ width: 110, textAlign: 'right' }}>Общо часове</Table.Th>
                    <Table.Th style={{ width: 120, textAlign: 'right' }}>Фактурируеми</Table.Th>
                    <Table.Th style={{ width: 100, textAlign: 'center' }}>Брой задачи</Table.Th>
                    <Table.Th style={{ width: 100, textAlign: 'right' }}>% от времето</Table.Th>
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
                          {m.totalHours.toFixed(2)} ч.
                        </Table.Td>
                        <Table.Td style={{ textAlign: 'right', color: 'var(--mantine-color-teal-filled)' }}>
                          {m.billableHours.toFixed(2)} ч.
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
