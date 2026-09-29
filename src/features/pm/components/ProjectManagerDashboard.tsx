import React, { useState, useMemo } from 'react';
import {
  Stack,
  Group,
  Title,
  Select,
  SegmentedControl,
  ActionIcon,
  Text,
  Loader,
  Center,
  Alert,
} from '@mantine/core';
import {
  IconBriefcase,
  IconRefresh,
  IconAlertCircle,
  IconFolder,
} from '@tabler/icons-react';
import { useProjectManagerData } from '../hooks/useProjectManagerData';
import { ProjectBudgetCard } from './ProjectBudgetCard';
import { ProjectTimeLogSection } from './ProjectTimeLogSection';
import { ClientExportModal } from './ClientExportModal';

/// <summary>
/// Main dashboard component for Project Managers to monitor managed projects, track budget health,
/// analyze team time entries, and export client-ready reports.
/// </summary>
export const ProjectManagerDashboard: React.FC = () => {
  const {
    displayedProjects,
    selectedProjectId,
    setSelectedProjectId,
    filterMode,
    setFilterMode,
    managedProjectIds,
    isLoadingProjects,

    projectDetails,
    budgetMetadata,
    activeBudgetType,
    setActiveBudgetType,
    budgetStats,
    hourlyRate,
    updateHourlyRate,
    currency,
    updateCurrency,

    allTimeEntries,
    filteredTimeEntries,
    dateRangePreset,
    setDateRangePreset,
    dateInterval,
    customFromDate,
    setCustomFromDate,
    customToDate,
    setCustomToDate,
    selectedMemberId,
    setSelectedMemberId,
    selectedActivityId,
    setSelectedActivityId,
    selectedBillableFilter,
    setSelectedBillableFilter,
    searchQuery,
    setSearchQuery,
    isLoadingEntries,

    refetchAll,
  } = useProjectManagerData();

  // Client Export Modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  // Combobox options for project selection
  const projectSelectData = useMemo(() => {
    return displayedProjects.map(p => ({
      value: String(p.id),
      label: p.name,
    }));
  }, [displayedProjects]);

  const activeProject = displayedProjects.find(p => String(p.id) === selectedProjectId);
  const projectName = activeProject?.name || projectDetails?.name || 'Проект';

  return (
    <Stack gap="lg" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Top Header & Project Selector Bar */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap="xs">
          <IconBriefcase size={28} color="var(--mantine-color-blue-filled)" />
          <div>
            <Title order={2}>Ръководител проекти</Title>
            <Text size="xs" c="dimmed">
              Мониторинг на бюджети, отчетено време и клиентски отчети
            </Text>
          </div>
        </Group>

        <Group gap="sm" wrap="wrap">
          {/* Managed vs All filter */}
          <SegmentedControl
            size="sm"
            value={filterMode}
            onChange={val => setFilterMode(val as 'managed' | 'all')}
            data={[
              {
                value: 'managed',
                label: `Моите проекти (${managedProjectIds.size})`,
              },
              {
                value: 'all',
                label: 'Всички проекти',
              },
            ]}
          />

          {/* Project Dropdown */}
          <Select
            size="sm"
            placeholder="Изберете проект..."
            data={projectSelectData}
            value={selectedProjectId}
            onChange={val => setSelectedProjectId(val || '')}
            searchable
            nothingFoundMessage="Няма намерени проекти"
            style={{ width: 280 }}
            leftSection={<IconFolder size={16} />}
          />

          <ActionIcon
            size="lg"
            variant="light"
            onClick={refetchAll}
            loading={isLoadingProjects || isLoadingEntries}
            aria-label="Обнови данните"
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Group>
      </Group>

      {/* Main Content Area */}
      {isLoadingProjects && !projectDetails ? (
        <Center py="xl">
          <Stack align="center" gap="sm">
            <Loader size="lg" />
            <Text c="dimmed">Зареждане на данни за проекта...</Text>
          </Stack>
        </Center>
      ) : !selectedProjectId || displayedProjects.length === 0 ? (
        <Alert icon={<IconAlertCircle size={18} />} title="Няма избран проект" color="blue">
          {filterMode === 'managed' && managedProjectIds.size === 0
            ? 'Нямате проекти, маркирани като ръководени от вас в Redmine. Можете да превключите на "Всички проекти" от бутона горе.'
            : 'Моля, изберете проект от падащото меню горе, за да прегледате бюджета и отчетеното време.'}
        </Alert>
      ) : (
        <Stack gap="lg">
          {/* Section 1: Project Budget Movement & Health */}
          <ProjectBudgetCard
            projectName={projectName}
            metadata={budgetMetadata}
            stats={budgetStats}
            activeBudgetType={activeBudgetType}
            onBudgetTypeChange={setActiveBudgetType}
            hourlyRate={hourlyRate}
            onHourlyRateChange={updateHourlyRate}
            currency={currency}
            onCurrencyChange={updateCurrency}
          />

          {/* Section 2: Detailed Time Logs & Breakdown */}
          <ProjectTimeLogSection
            allEntries={allTimeEntries}
            filteredEntries={filteredTimeEntries}
            dateRangePreset={dateRangePreset}
            onDateRangeChange={setDateRangePreset}
            dateLabel={dateInterval.label}
            customFromDate={customFromDate}
            onCustomFromDateChange={setCustomFromDate}
            customToDate={customToDate}
            onCustomToDateChange={setCustomToDate}
            selectedMemberId={selectedMemberId}
            onMemberChange={setSelectedMemberId}
            selectedActivityId={selectedActivityId}
            onActivityChange={setSelectedActivityId}
            selectedBillableFilter={selectedBillableFilter}
            onBillableFilterChange={setSelectedBillableFilter}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onOpenExportModal={() => setIsExportModalOpen(true)}
            isLoading={isLoadingEntries}
          />
        </Stack>
      )}

      {/* Client Export Modal */}
      {isExportModalOpen && (
        <ClientExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          projectName={projectName}
          metadata={budgetMetadata}
          entries={filteredTimeEntries}
          dateLabel={dateInterval.label}
          dateRangePreset={dateRangePreset}
          dateFrom={dateInterval.from}
          dateTo={dateInterval.to}
          defaultHourlyRate={hourlyRate}
          defaultCurrency={currency}
        />
      )}
    </Stack>
  );
};
