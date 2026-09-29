import { useState, useEffect, useMemo, useCallback } from 'react';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useUser } from '../../../contexts/UserContext';
import {
  getUserMemberships,
  isUserProjectManager,
  getProjectDetails,
  extractBudgetMetadata,
  getAllProjectTimeEntries,
  calculateBudgetStats,
} from '../../../services/pmService';
import type { TimeEntry } from '../../../types';
import type {
  RedmineProjectFull,
  RedmineProjectMembership,
  ProjectBudgetMetadata,
  ProjectBudgetStats,
} from '../../../types/pm';

/// <summary>
/// Predefined date filter intervals for project time logs.
/// </summary>
export type DateRangePreset = 'this_month' | 'last_month' | 'last_30_days' | 'contract_period' | 'all';

/// <summary>
/// Budget threshold selection ('contract' = Budget 2, 'estimate' = Budget 1, 'profitability' = Budget 3).
/// </summary>
export type BudgetThresholdType = 'contract' | 'estimate' | 'profitability';

/// <summary>
/// Custom React hook that coordinates Redmine project manager data, budgets, and team time logs.
/// </summary>
export function useProjectManagerData() {
  const { allProjects, isLoadingProjects } = useProjects();
  const { user } = useUser();

  // Mode: Show only projects managed by current user or all projects
  const [filterMode, setFilterMode] = useState<'managed' | 'all'>('managed');
  const [userMemberships, setUserMemberships] = useState<RedmineProjectMembership[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');

  // Project details & budget metadata
  const [projectDetails, setProjectDetails] = useState<RedmineProjectFull | null>(null);
  const [budgetMetadata, setBudgetMetadata] = useState<ProjectBudgetMetadata>({
    budget1Estimate: 0,
    budget2Contract: 0,
    budget3Profitability: 0,
    clientName: '',
    startDate: '',
    contractEndDate: '',
    targetEndDate: '',
    contractType: '',
    billingInfo: '',
  });

  // Selected budget threshold
  const [activeBudgetType, setActiveBudgetType] = useState<BudgetThresholdType>('contract');
  const [hourlyRate, setHourlyRate] = useState<number>(() => {
    return parseFloat(localStorage.getItem('pm_global_hourly_rate') || '0') || 0;
  });
  const [currency, setCurrency] = useState<string>(() => {
    return localStorage.getItem('pm_global_currency') || 'EUR';
  });

  // Time entries & filters
  const [allTimeEntries, setAllTimeEntries] = useState<TimeEntry[]>([]);
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('this_month');
  const [customFromDate, setCustomFromDate] = useState<string>('');
  const [customToDate, setCustomToDate] = useState<string>('');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('all');
  const [selectedActivityId, setSelectedActivityId] = useState<string>('all');
  const [selectedBillableFilter, setSelectedBillableFilter] = useState<'all' | 'billable' | 'non_billable'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Loading states
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState<boolean>(false);

  // 1. Fetch current user memberships
  useEffect(() => {
    let isMounted = true;
    getUserMemberships().then(memberships => {
      if (isMounted) setUserMemberships(memberships);
    });
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // 2. Identify projects where current user has PM role or is in memberships
  const managedProjectIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of userMemberships) {
      if (isUserProjectManager(m, user?.id)) {
        ids.add(String(m.project.id));
      }
    }
    return ids;
  }, [userMemberships, user?.id]);

  // Projects list based on filterMode
  const displayedProjects = useMemo(() => {
    if (filterMode === 'managed' && managedProjectIds.size > 0) {
      return allProjects.filter(p => managedProjectIds.has(String(p.id)));
    }
    return allProjects;
  }, [filterMode, managedProjectIds, allProjects]);

  // Active selected project ID (falls back to first displayed project)
  const activeProjectId = useMemo(() => {
    if (selectedProjectId && displayedProjects.some(p => String(p.id) === selectedProjectId)) {
      return selectedProjectId;
    }
    return displayedProjects.length > 0 ? String(displayedProjects[0].id) : '';
  }, [displayedProjects, selectedProjectId]);

  // Fetch project details and time entries when activeProjectId changes
  useEffect(() => {
    if (!activeProjectId) {
      return;
    }

    let isMounted = true;

    // Asynchronously initiate data fetching
    Promise.resolve().then(() => {
      if (!isMounted) return;
      setIsLoadingDetails(true);
      setIsLoadingEntries(true);
      setAllTimeEntries([]);

      getProjectDetails(activeProjectId)
        .then(details => {
          if (!isMounted) return;
          setProjectDetails(details);
          const meta = extractBudgetMetadata(details);
          setBudgetMetadata(meta);

          const savedRate = localStorage.getItem(`pm_rate_${activeProjectId}`);
          if (savedRate) {
            setHourlyRate(parseFloat(savedRate) || 0);
          }
        })
        .finally(() => {
          if (isMounted) setIsLoadingDetails(false);
        });

      getAllProjectTimeEntries(activeProjectId)
        .then(entries => {
          if (!isMounted) return;
          setAllTimeEntries(entries);
        })
        .finally(() => {
          if (isMounted) setIsLoadingEntries(false);
        });
    });

    return () => {
      isMounted = false;
    };
  }, [activeProjectId]);

  // Calculate target hours based on active threshold
  const targetBudgetHours = useMemo(() => {
    switch (activeBudgetType) {
      case 'estimate':
        return budgetMetadata.budget1Estimate;
      case 'profitability':
        return budgetMetadata.budget3Profitability;
      case 'contract':
      default:
        return budgetMetadata.budget2Contract;
    }
  }, [activeBudgetType, budgetMetadata]);

  // Compute budget statistics for the entire project
  const budgetStats: ProjectBudgetStats = useMemo(() => {
    return calculateBudgetStats(allTimeEntries, targetBudgetHours);
  }, [allTimeEntries, targetBudgetHours]);

  // Date filtering logic
  const dateInterval = useMemo(() => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (dateRangePreset === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: toYMD(start), to: toYMD(end), label: `Този месец (${toYMD(start)} - ${toYMD(end)})` };
    }

    if (dateRangePreset === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: toYMD(start), to: toYMD(end), label: `Миналия месец (${toYMD(start)} - ${toYMD(end)})` };
    }

    if (dateRangePreset === 'last_30_days') {
      const start = new Date();
      start.setDate(start.getDate() - 30);
      return { from: toYMD(start), to: toYMD(now), label: `Последните 30 дни (${toYMD(start)} - ${toYMD(now)})` };
    }

    if (dateRangePreset === 'contract_period' && budgetMetadata.startDate && budgetMetadata.contractEndDate) {
      return {
        from: budgetMetadata.startDate,
        to: budgetMetadata.contractEndDate,
        label: `Срок по договор (${budgetMetadata.startDate} - ${budgetMetadata.contractEndDate})`,
      };
    }

    if (customFromDate || customToDate) {
      return {
        from: customFromDate,
        to: customToDate,
        label: `Свободен период (${customFromDate || '...'} - ${customToDate || '...'})`,
      };
    }

    return { from: '', to: '', label: 'Всички отчетени записи' };
  }, [dateRangePreset, customFromDate, customToDate, budgetMetadata]);

  // Filter time entries for the table & client export
  const filteredTimeEntries = useMemo(() => {
    return allTimeEntries.filter(entry => {
      // Date filter
      if (dateInterval.from && entry.spent_on < dateInterval.from) return false;
      if (dateInterval.to && entry.spent_on > dateInterval.to) return false;

      // Member filter
      if (selectedMemberId !== 'all' && String(entry.user?.id) !== selectedMemberId) {
        return false;
      }

      // Activity filter
      if (selectedActivityId !== 'all' && String(entry.activity?.id) !== selectedActivityId) {
        return false;
      }

      // Billable filter
      const isBillable = entry.custom_fields?.some(
        cf => (cf.name?.toLowerCase().includes('billable') || cf.id === 4) && (cf.value === '1' || cf.value === 'true')
      );
      if (selectedBillableFilter === 'billable' && !isBillable) return false;
      if (selectedBillableFilter === 'non_billable' && isBillable) return false;

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesComment = (entry.comments || '').toLowerCase().includes(query);
        const matchesIssue = String(entry.issue?.id || '').includes(query) || (entry.issue?.subject || '').toLowerCase().includes(query);
        const matchesUser = (entry.user?.name || '').toLowerCase().includes(query);
        const matchesActivity = (entry.activity?.name || '').toLowerCase().includes(query);
        if (!matchesComment && !matchesIssue && !matchesUser && !matchesActivity) return false;
      }

      return true;
    });
  }, [
    allTimeEntries,
    dateInterval,
    selectedMemberId,
    selectedActivityId,
    selectedBillableFilter,
    searchQuery,
  ]);

  // Set hourly rate and persist
  const updateHourlyRate = useCallback((rate: number) => {
    setHourlyRate(rate);
    if (selectedProjectId) {
      localStorage.setItem(`pm_rate_${selectedProjectId}`, String(rate));
    }
    localStorage.setItem('pm_global_hourly_rate', String(rate));
  }, [selectedProjectId]);

  // Set currency and persist
  const updateCurrency = useCallback((curr: string) => {
    setCurrency(curr);
    localStorage.setItem('pm_global_currency', curr);
  }, []);

  // Refetch everything for active project
  const refetchAll = useCallback(() => {
    if (!activeProjectId) return;
    setIsLoadingDetails(true);
    setIsLoadingEntries(true);
    getProjectDetails(activeProjectId)
      .then(details => {
        setProjectDetails(details);
        setBudgetMetadata(extractBudgetMetadata(details));
      })
      .finally(() => setIsLoadingDetails(false));

    getAllProjectTimeEntries(activeProjectId)
      .then(entries => setAllTimeEntries(entries))
      .finally(() => setIsLoadingEntries(false));
  }, [activeProjectId]);

  return {
    // Projects
    allProjects,
    displayedProjects,
    selectedProjectId: activeProjectId,
    setSelectedProjectId,
    filterMode,
    setFilterMode,
    managedProjectIds,
    isLoadingProjects: isLoadingProjects || isLoadingDetails,

    // Project Details & Budgets
    projectDetails,
    budgetMetadata,
    activeBudgetType,
    setActiveBudgetType,
    targetBudgetHours,
    budgetStats,
    hourlyRate,
    updateHourlyRate,
    currency,
    updateCurrency,

    // Time entries & Filters
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

    // Actions
    refetchAll,
  };
}
