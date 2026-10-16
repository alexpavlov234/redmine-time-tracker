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
    hasRequestedProjects,
    isLoadingProjectsList,
    isLoadingProjects,
    loadProjectsForDropdown,

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
  const projectName = activeProject?.name || projectDetails?.name || 'Project';

  return (
    <Stack gap="lg" style={{ maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Top Header & Project Selector Bar */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Group gap="xs">
          <IconBriefcase size={28} color="var(--mantine-color-blue-filled)" />
          <div>
            <Title order={2}>Project Management</Title>
            <Text size="sm" c="dimmed">
              Monitor budgets, track team time logs, and generate client reports.
            </Text>
          </div>
        </Group>

        <Group gap="sm" wrap="wrap">
          {/* Managed vs All filter */}
          <SegmentedControl
            size="sm"
            value={filterMode}
            onChange={val => {
              loadProjectsForDropdown();
              setFilterMode(val as 'managed' | 'all');
            }}
            data={[
              {
                value: 'managed',
                label: hasRequestedProjects ? `My Projects (${managedProjectIds.size})` : 'My Projects',
              },
              {
                value: 'all',
                label: 'All Projects',
              },
            ]}
          />

          {/* Project Dropdown - loads projects on click/open */}
          <Select
            size="sm"
            placeholder={isLoadingProjectsList ? 'Loading projects...' : 'Select a project...'}
            data={projectSelectData}
            value={selectedProjectId || null}
            onChange={val => setSelectedProjectId(val || '')}
            onDropdownOpen={loadProjectsForDropdown}
            onClick={loadProjectsForDropdown}
            searchable
            clearable
            nothingFoundMessage={isLoadingProjectsList ? 'Loading projects...' : 'No projects found'}
            style={{ width: 280 }}
            leftSection={<IconFolder size={16} />}
            rightSection={isLoadingProjectsList ? <Loader size="xs" /> : undefined}
          />

          <ActionIcon
            size="lg"
            variant="light"
            onClick={refetchAll}
            loading={isLoadingProjectsList || isLoadingProjects || isLoadingEntries}
            aria-label="Refresh project data"
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
            <Text c="dimmed">Loading project data...</Text>
          </Stack>
        </Center>
      ) : !selectedProjectId ? (
        <Alert icon={<IconAlertCircle size={18} />} title="No Project Selected" color="blue">
          {hasRequestedProjects && !isLoadingProjectsList && filterMode === 'managed' && managedProjectIds.size === 0
            ? 'No projects are marked as managed by you in Redmine. You can switch to "All Projects" using the control above.'
            : 'Click on the project dropdown above to load projects, then select a project to view its budget health and time logs.'}
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
