import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Title,
  Select,
  Button,
  Badge,
  Slider,
  SegmentedControl,
  NumberInput,
  Table,
  Checkbox,
  Progress,
  Modal,
  Alert,
  Tooltip,
  Paper,
  SimpleGrid,
  TextInput,
  Textarea,
  Loader,
  Divider,
  ActionIcon,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import {
  IconArrowsExchange,
  IconPlus,
  IconAlertCircle,
  IconRefresh,
  IconInfoCircle,
  IconSparkles,
  IconChevronDown,
  IconChevronRight,
  IconChecklist,
  IconClock,
  IconPencil,
  IconGitFork,
  IconUsers,
  IconUser,
  IconShieldCheck,
} from '@tabler/icons-react';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useUser } from '../../../contexts/UserContext';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';
import { formatDisplayDate } from '../../../utils/formatters';
import {
  getAllUserTimeEntries,
  getIssue,
  redmineApiRequest,
  updateTimeEntry,
  getProjectMemberships,
} from '../../../services/redmine';
import {
  cloneTaskToProject,
  findMatchingTaskInProject,
  executeTimeTransfer,
  calculateEntryHours,
  roundHours,
  detectSplitEntries,
  checkTransferPermissions,
  type ProjectPermissionsResult,
  type SplitEntryInfo,
  type TransferProgress,
} from '../../../services/transferService';
import type { RedmineIssue, TaskTransferMapping, TimeTransferResult, TimeEntry } from '../../../types';

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDateRange(preset: string, customFrom: string, customTo: string): { from?: string; to?: string } {
  const now = new Date();
  if (preset === 'all_time') return {};
  if (preset === 'this_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: formatDate(firstDay), to: formatDate(lastDay) };
  }
  if (preset === 'last_month') {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: formatDate(firstDay), to: formatDate(lastDay) };
  }
  if (preset === 'last_30_days') {
    const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: formatDate(past), to: formatDate(now) };
  }
  if (preset === 'this_year') {
    const firstDay = new Date(now.getFullYear(), 0, 1);
    const lastDay = new Date(now.getFullYear(), 11, 31);
    return { from: formatDate(firstDay), to: formatDate(lastDay) };
  }
  if (preset === 'custom') {
    return {
      from: customFrom || undefined,
      to: customTo || undefined,
    };
  }
  return {};
}

function getSelectedEntryIdsForMapping(mapping: TaskTransferMapping): Set<number> {
  if (mapping.selectedEntryIds !== undefined) {
    return new Set(mapping.selectedEntryIds);
  }
  return new Set(mapping.selected ? mapping.timeEntries.map(e => e.id) : []);
}

export const TimeTransferDashboard: React.FC = () => {
  const { language, t } = useLanguage();
  const { user } = useUser();
  const { getProjectSelectData, ensureProjectsLoaded, isLoadingProjects } = useProjects();

  // View mode: 'tasks' (Grouped by task with expandable rows) vs 'entries' (Entry by entry)
  const [viewMode, setViewMode] = useState<'tasks' | 'entries'>('tasks');
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());

  // Project selectors
  const [sourceProjectId, setSourceProjectId] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<string | null>(null);

  // Filters for source time entries ('me', 'all', or specific colleague user_id)
  const [userFilter, setUserFilter] = useState<string>('me');
  const [projectColleagues, setProjectColleagues] = useState<Array<{ id: number; name: string }>>([]);
  const [isLoadingColleagues, setIsLoadingColleagues] = useState<boolean>(false);
  const [permissions, setPermissions] = useState<ProjectPermissionsResult>({
    isAdmin: false,
    isSourceManager: false,
    isTargetManager: false,
    canTransferColleagues: false,
    sourceRoles: [],
    targetRoles: [],
  });
  const [datePreset, setDatePreset] = useState<string>('all_time');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');

  // Manual task entry
  const [manualTaskId, setManualTaskId] = useState<string>('');
  const [isAddingManualTask, setIsAddingManualTask] = useState<boolean>(false);

  // Global transfer options (no extra note appended in transferred task as per requirement)
  const [globalPercentage, setGlobalPercentage] = useState<number>(100);
  const appendCommentNote = false;

  // Filter for already-split entries ('all' | 'split_only' | 'unsplit_only')
  const [splitFilter, setSplitFilter] = useState<'all' | 'split_only' | 'unsplit_only'>('all');

  // Loaded tasks & state
  const [mappings, setMappings] = useState<TaskTransferMapping[]>([]);
  const [isLoadingEntries, setIsLoadingEntries] = useState<boolean>(false);
  const [targetTasks, setTargetTasks] = useState<RedmineIssue[]>([]);
  const [targetTimeEntries, setTargetTimeEntries] = useState<TimeEntry[]>([]);
  const [isLoadingTargetTasks, setIsLoadingTargetTasks] = useState<boolean>(false);
  const [cloningTaskId, setCloningTaskId] = useState<number | null>(null);
  const [isBulkCloning, setIsBulkCloning] = useState<boolean>(false);

  // Modals
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState<boolean>(false);
  const [progress, setProgress] = useState<TransferProgress>({
    current: 0,
    total: 0,
    stepMessage: '',
    percent: 0,
  });
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const [transferResult, setTransferResult] = useState<TimeTransferResult | null>(null);

  // Comment edit modal state
  const [editingCommentEntry, setEditingCommentEntry] = useState<{
    sourceTaskId: number;
    entry: TimeEntry;
    comment: string;
  } | null>(null);
  const [isSavingCommentToRedmine, setIsSavingCommentToRedmine] = useState<boolean>(false);

  // Ensure projects dropdown has items
  useEffect(() => {
    ensureProjectsLoaded();
  }, [ensureProjectsLoaded]);

  const projectSelectData = useMemo(() => {
    return getProjectSelectData(false);
  }, [getProjectSelectData]);

  // Ref for target tasks to avoid triggering source task reload when target tasks change
  const targetTasksRef = useRef<RedmineIssue[]>(targetTasks);
  useEffect(() => {
    targetTasksRef.current = targetTasks;
  }, [targetTasks]);

  // Load target project tasks whenever targetProjectId changes (with pagination up to 500 tasks)
  useEffect(() => {
    if (!targetProjectId) {
      setTargetTasks([]);
      return;
    }

    let isCancelled = false;
    const fetchTargetTasks = async () => {
      setIsLoadingTargetTasks(true);
      try {
        const allIssues: RedmineIssue[] = [];
        let offset = 0;
        let totalCount = Infinity;

        // Fetch up to 500 issues (5 pages of 100)
        while (allIssues.length < totalCount && offset < 500) {
          if (isCancelled) break;
          const resp = await redmineApiRequest(
            `/issues.json?project_id=${targetProjectId}&status_id=*&limit=100&offset=${offset}`
          );
          const issues: RedmineIssue[] = resp.issues || [];
          totalCount = typeof resp.total_count === 'number' ? resp.total_count : issues.length;
          allIssues.push(...issues);

          if (issues.length === 0 || allIssues.length >= totalCount) {
            break;
          }
          offset += issues.length;
        }

        if (!isCancelled) {
          setTargetTasks(allIssues);
        }
      } catch (err) {
        console.error('Failed to fetch target project tasks:', err);
        if (!isCancelled) setTargetTasks([]);
      } finally {
        if (!isCancelled) setIsLoadingTargetTasks(false);
      }
    };

    fetchTargetTasks();
    return () => {
      isCancelled = true;
    };
  }, [targetProjectId]);

  // Load target project time entries in background for cross-project split detection
  useEffect(() => {
    if (!targetProjectId) {
      setTargetTimeEntries([]);
      return;
    }

    let isCancelled = false;
    const { from, to } = getDateRange(datePreset, customFrom, customTo);
    const params: Record<string, unknown> = {
      project_id: targetProjectId,
      from,
      to,
    };
    if (userFilter === 'me') {
      params.user_id = user?.id || 'me';
    } else if (userFilter !== 'all') {
      params.user_id = userFilter;
    }

    getAllUserTimeEntries(params as any)
      .then(entries => {
        if (!isCancelled) setTargetTimeEntries(entries);
      })
      .catch(err => {
        console.warn('Failed to load target project entries for split detection:', err);
        if (!isCancelled) setTargetTimeEntries([]);
      });

    return () => {
      isCancelled = true;
    };
  }, [targetProjectId, datePreset, customFrom, customTo, userFilter, user?.id]);

  // Fetch logged time entries for source project and group by task
  const loadSourceTasks = useCallback(async () => {
    if (!sourceProjectId) return;

    setIsLoadingEntries(true);
    try {
      const { from, to } = getDateRange(datePreset, customFrom, customTo);
      const params: Record<string, unknown> = {
        project_id: sourceProjectId,
        from,
        to,
      };
      if (userFilter === 'me') {
        params.user_id = user?.id || 'me';
      } else if (userFilter !== 'all') {
        params.user_id = userFilter;
      }

      const entries: TimeEntry[] = await getAllUserTimeEntries(params as any);

      // Merge unique users found in entries into projectColleagues
      setProjectColleagues(prev => {
        const map = new Map<number, { id: number; name: string }>();
        prev.forEach(u => map.set(u.id, u));
        entries.forEach(e => {
          if (e.user && e.user.id) {
            map.set(e.user.id, { id: e.user.id, name: e.user.name });
          }
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      });

      // Group entries by task
      const taskGroups = new Map<number, { task: RedmineIssue | null; entries: TimeEntry[] }>();
      const nonTaskEntries: TimeEntry[] = [];

      entries.forEach(entry => {
        if (entry.issue && entry.issue.id) {
          const tid = entry.issue.id;
          if (!taskGroups.has(tid)) {
            taskGroups.set(tid, {
              task: entry.issue as RedmineIssue,
              entries: [],
            });
          }
          taskGroups.get(tid)!.entries.push(entry);
        } else {
          nonTaskEntries.push(entry);
        }
      });

      const newMappings: TaskTransferMapping[] = [];
      const currentTargetTasks = targetTasksRef.current;

      taskGroups.forEach(({ task, entries: groupEntries }, taskId) => {
        const totalHours = roundHours(
          groupEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
        );

        const taskSubject = task?.subject || groupEntries[0]?.issue?.subject || `Задача #${taskId}`;
        const trackerName = task?.tracker?.name;

        // Auto-match if target tasks already loaded
        const match = findMatchingTaskInProject(taskSubject, currentTargetTasks);

        newMappings.push({
          sourceTaskId: taskId,
          sourceTaskSubject: taskSubject,
          sourceTrackerName: trackerName,
          totalLoggedHours: totalHours,
          entryCount: groupEntries.length,
          timeEntries: groupEntries,
          selectedEntryIds: groupEntries.map(e => e.id), // All selected by default
          entryPercentages: {},
          entryTargetTaskIds: {},
          targetTaskId: match ? String(match.id) : '',
          targetTaskSubject: match ? match.subject : undefined,
          percentage: globalPercentage,
          selected: true,
          status: 'idle',
        });
      });

      // Sort by total logged hours descending
      newMappings.sort((a, b) => b.totalLoggedHours - a.totalLoggedHours);
      setMappings(newMappings);
    } catch (err: unknown) {
      console.error('Failed to load source project entries:', err);
      setMappings([]);
    } finally {
      setIsLoadingEntries(false);
    }
  }, [sourceProjectId, datePreset, customFrom, customTo, userFilter, user?.id, globalPercentage]);

  // Auto-fetch source tasks whenever source project or main filter changes
  useEffect(() => {
    if (sourceProjectId) {
      loadSourceTasks();
    }
  }, [sourceProjectId, datePreset, userFilter, loadSourceTasks]);

  // Fetch project memberships (members) for source project
  useEffect(() => {
    if (!sourceProjectId) {
      setProjectColleagues([]);
      return;
    }

    let isCancelled = false;
    setIsLoadingColleagues(true);

    getProjectMemberships(sourceProjectId)
      .then(memberships => {
        if (isCancelled) return;
        const map = new Map<number, { id: number; name: string }>();
        memberships.forEach(m => {
          if (m.user && m.user.id) {
            map.set(m.user.id, { id: m.user.id, name: m.user.name });
          }
        });
        setProjectColleagues(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(err => {
        console.warn('Could not load project memberships:', err);
        if (!isCancelled) setProjectColleagues([]);
      })
      .finally(() => {
        if (!isCancelled) setIsLoadingColleagues(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [sourceProjectId]);

  // Check user permissions in source and target projects
  useEffect(() => {
    if (!sourceProjectId) {
      setPermissions({
        isAdmin: false,
        isSourceManager: false,
        isTargetManager: false,
        canTransferColleagues: false,
        sourceRoles: [],
        targetRoles: [],
      });
      return;
    }

    let isCancelled = false;
    checkTransferPermissions(sourceProjectId, targetProjectId, user?.id)
      .then(res => {
        if (!isCancelled) {
          setPermissions(res);
        }
      })
      .catch(err => {
        console.warn('Could not check project permissions:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [sourceProjectId, targetProjectId, user?.id]);

  // Reset userFilter if selected colleague is no longer in project
  useEffect(() => {
    if (userFilter !== 'me' && userFilter !== 'all') {
      const exists = projectColleagues.some(c => String(c.id) === userFilter);
      if (!exists && projectColleagues.length > 0) {
        setUserFilter('me');
      }
    }
  }, [projectColleagues, userFilter]);

  // When targetTasks changes, recheck auto-matches for mappings that do not have targetTaskId
  useEffect(() => {
    if (targetTasks.length === 0) return;

    setMappings(prev =>
      prev.map(m => {
        if (m.targetTaskId) return m;
        const match = findMatchingTaskInProject(m.sourceTaskSubject, targetTasks);
        if (match) {
          return {
            ...m,
            targetTaskId: String(match.id),
            targetTaskSubject: match.subject,
          };
        }
        return m;
      })
    );
  }, [targetTasks]);

  // Update percentages across mappings when global percentage changes
  const handleGlobalPercentageChange = (val: number) => {
    setGlobalPercentage(val);
    setMappings(prev =>
      prev.map(m => ({
        ...m,
        percentage: val,
        // Clear entry percentage overrides so they inherit the new global percentage
        entryPercentages: {},
      }))
    );
  };

  // Add manual task by ID
  const handleAddManualTask = async () => {
    const cleanId = manualTaskId.replace(/^#/, '').trim();
    const idNum = parseInt(cleanId, 10);
    if (isNaN(idNum) || idNum <= 0) return;

    if (mappings.some(m => m.sourceTaskId === idNum)) {
      setManualTaskId('');
      return;
    }

    setIsAddingManualTask(true);
    try {
      const issue = await getIssue(idNum, true);
      const { from, to } = getDateRange(datePreset, customFrom, customTo);
      const params: Record<string, unknown> = {
        issue_id: idNum,
        from,
        to,
      };
      if (userFilter === 'me') {
        params.user_id = user?.id || 'me';
      }
      const entries: TimeEntry[] = await getAllUserTimeEntries(params as any);
      if (entries.length === 0) {
        alert(`Внимание: За задача #${idNum} няма намерени отчети за време при избраните филтри.`);
      }

      const totalHours = roundHours(
        entries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0)
      );

      const match = findMatchingTaskInProject(issue.subject, targetTasksRef.current);

      const newMapping: TaskTransferMapping = {
        sourceTaskId: idNum,
        sourceTaskSubject: issue.subject,
        sourceTrackerName: issue.tracker?.name,
        totalLoggedHours: totalHours,
        entryCount: entries.length,
        timeEntries: entries,
        selectedEntryIds: entries.map(e => e.id),
        entryPercentages: {},
        entryTargetTaskIds: {},
        targetTaskId: match ? String(match.id) : '',
        targetTaskSubject: match ? match.subject : undefined,
        percentage: globalPercentage,
        selected: true,
        status: 'idle',
      };

      setMappings(prev => [newMapping, ...prev]);
      setManualTaskId('');
    } catch (err: unknown) {
      alert(`Неуспешно зареждане на задача #${idNum}: ${(err as Error).message}`);
    } finally {
      setIsAddingManualTask(false);
    }
  };

  // Clone single task to target project
  const handleCloneTask = async (mapping: TaskTransferMapping) => {
    if (!targetProjectId) {
      alert('Моля, изберете първо целеви проект!');
      return;
    }

    setCloningTaskId(mapping.sourceTaskId);
    try {
      const newIssue = await cloneTaskToProject(mapping.sourceTaskId, targetProjectId);

      // Add to target tasks list so other dropdowns see it
      setTargetTasks(prev => [newIssue, ...prev]);

      // Update mapping
      setMappings(prev =>
        prev.map(m =>
          m.sourceTaskId === mapping.sourceTaskId
            ? {
                ...m,
                targetTaskId: String(newIssue.id),
                targetTaskSubject: newIssue.subject,
                createdTaskId: newIssue.id,
                status: 'ready',
              }
            : m
        )
      );
    } catch (err: unknown) {
      alert(`Грешка при създаване на задача: ${(err as Error).message}`);
    } finally {
      setCloningTaskId(null);
    }
  };

  // Bulk clone missing target tasks for all selected mappings
  const handleBulkCloneMissing = async () => {
    if (!targetProjectId) {
      alert('Моля, изберете първо целеви проект!');
      return;
    }

    const missingMappings = mappings.filter(m => {
      if (!m.selected) return false;
      const activeIds = getSelectedEntryIdsForMapping(m);
      return activeIds.size > 0 && !m.targetTaskId;
    });
    if (missingMappings.length === 0) return;

    setIsBulkCloning(true);
    const failedTasks: string[] = [];
    try {
      for (const m of missingMappings) {
        try {
          const newIssue = await cloneTaskToProject(m.sourceTaskId, targetProjectId);
          setTargetTasks(prev => [newIssue, ...prev]);
          setMappings(prev =>
            prev.map(item =>
              item.sourceTaskId === m.sourceTaskId
                ? {
                    ...item,
                    targetTaskId: String(newIssue.id),
                    targetTaskSubject: newIssue.subject,
                    createdTaskId: newIssue.id,
                    status: 'ready',
                  }
                : item
            )
          );
        } catch (cloneErr: unknown) {
          console.error(`Failed to clone task #${m.sourceTaskId}:`, cloneErr);
          failedTasks.push(`#${m.sourceTaskId} (${(cloneErr as Error).message})`);
        }
      }
      if (failedTasks.length > 0) {
        alert(`Следните задачи не можаха да бъдат клонирани:\n${failedTasks.join('\n')}`);
      }
    } finally {
      setIsBulkCloning(false);
    }
  };

  // Toggle selection for all tasks and entries
  const handleToggleSelectAll = (checked: boolean) => {
    setMappings(prev =>
      prev.map(m => ({
        ...m,
        selected: checked,
        selectedEntryIds: checked ? m.timeEntries.map(e => e.id) : [],
      }))
    );
  };

  // Toggle entire task row selection
  const handleToggleSelectRow = (sourceTaskId: number, checked: boolean) => {
    setMappings(prev =>
      prev.map(m => {
        if (m.sourceTaskId === sourceTaskId) {
          return {
            ...m,
            selected: checked,
            selectedEntryIds: checked ? m.timeEntries.map(e => e.id) : [],
          };
        }
        return m;
      })
    );
  };

  // Toggle individual time entry selection (Entry by entry)
  const handleToggleSelectEntry = (sourceTaskId: number, entryId: number, checked: boolean) => {
    setMappings(prev =>
      prev.map(m => {
        if (m.sourceTaskId === sourceTaskId) {
          const currentSelected = getSelectedEntryIdsForMapping(m);
          if (checked) {
            currentSelected.add(entryId);
          } else {
            currentSelected.delete(entryId);
          }
          const nextSelectedArray = Array.from(currentSelected);
          return {
            ...m,
            selected: nextSelectedArray.length > 0,
            selectedEntryIds: nextSelectedArray,
          };
        }
        return m;
      })
    );
  };

  // Toggle task expansion (collapsible sub-table of time entries)
  const toggleTaskExpansion = (taskId: number) => {
    setExpandedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Update target task for whole task
  const handleTargetTaskChange = (sourceTaskId: number, newTargetId: string | null) => {
    const matched = targetTasks.find(t => String(t.id) === newTargetId);
    setMappings(prev =>
      prev.map(m =>
        m.sourceTaskId === sourceTaskId
          ? {
              ...m,
              targetTaskId: newTargetId || '',
              targetTaskSubject: matched?.subject,
            }
          : m
      )
    );
  };

  // Update target task override for individual time entry
  const handleEntryTargetTaskChange = (sourceTaskId: number, entryId: number, newTargetId: string | null) => {
    setMappings(prev =>
      prev.map(m => {
        if (m.sourceTaskId === sourceTaskId) {
          const updated = { ...(m.entryTargetTaskIds || {}) };
          if (newTargetId) {
            updated[entryId] = newTargetId;
          } else {
            delete updated[entryId];
          }
          return { ...m, entryTargetTaskIds: updated };
        }
        return m;
      })
    );
  };

  // Update percentage for whole task
  const handleTaskPercentageChange = (sourceTaskId: number, newPct: number | string) => {
    const val = typeof newPct === 'number' ? newPct : parseInt(newPct, 10);
    if (isNaN(val)) return;
    const clamped = Math.max(1, Math.min(100, val));
    setMappings(prev =>
      prev.map(m => (m.sourceTaskId === sourceTaskId ? { ...m, percentage: clamped } : m))
    );
  };

  // Update percentage override for individual time entry
  const handleEntryPercentageChange = (sourceTaskId: number, entryId: number, newPct: number | string) => {
    const val = typeof newPct === 'number' ? newPct : parseInt(newPct, 10);
    if (isNaN(val)) return;
    const clamped = Math.max(1, Math.min(100, val));
    setMappings(prev =>
      prev.map(m => {
        if (m.sourceTaskId === sourceTaskId) {
          return {
            ...m,
            entryPercentages: {
              ...(m.entryPercentages || {}),
              [entryId]: clamped,
            },
          };
        }
        return m;
      })
    );
  };

  // Update comment / description for individual time entry
  const handleEntryCommentChange = (sourceTaskId: number, entryId: number, text: string) => {
    setMappings(prev =>
      prev.map(m => {
        if (m.sourceTaskId === sourceTaskId) {
          return {
            ...m,
            entryComments: {
              ...(m.entryComments || {}),
              [entryId]: text,
            },
          };
        }
        return m;
      })
    );
  };

  // Save edited comment immediately to Redmine API
  const handleSaveCommentDirectlyToRedmine = async () => {
    if (!editingCommentEntry) return;
    setIsSavingCommentToRedmine(true);
    try {
      await updateTimeEntry(editingCommentEntry.entry.id, {
        comments: editingCommentEntry.comment,
      });

      handleEntryCommentChange(
        editingCommentEntry.sourceTaskId,
        editingCommentEntry.entry.id,
        editingCommentEntry.comment
      );

      setMappings(prev =>
        prev.map(m => {
          if (m.sourceTaskId === editingCommentEntry.sourceTaskId) {
            return {
              ...m,
              timeEntries: m.timeEntries.map(e =>
                e.id === editingCommentEntry.entry.id
                  ? { ...e, comments: editingCommentEntry.comment }
                  : e
              ),
            };
          }
          return m;
        })
      );

      alert(t('commentSavedSuccess'));
      setEditingCommentEntry(null);
    } catch (err: unknown) {
      alert(`Грешка при запис в Redmine: ${(err as Error).message}`);
    } finally {
      setIsSavingCommentToRedmine(false);
    }
  };

  // Extract all loaded source entries
  const allSourceEntries = useMemo(() => {
    return mappings.flatMap(m => m.timeEntries);
  }, [mappings]);

  // Detect time entries that have already been split in two for a given day with matching text
  const splitEntriesMap = useMemo(() => {
    return detectSplitEntries(allSourceEntries, targetTimeEntries);
  }, [allSourceEntries, targetTimeEntries]);

  // Summary calculations based on selected entries
  const summaryStats = useMemo(() => {
    let selectedTasksCount = 0;
    let selectedEntriesCount = 0;
    let totalEntriesCount = 0;
    let sourceHours = 0;
    let transferHours = 0;
    let remainingHours = 0;
    let missingEntriesCount = 0;
    let missingTasksCount = 0;
    let selectedSplitCount = 0;

    mappings.forEach(m => {
      totalEntriesCount += m.timeEntries.length;
      const activeEntryIds = getSelectedEntryIdsForMapping(m);
      let taskHasSelectedEntries = false;
      let taskHasMissingTarget = false;

      m.timeEntries.forEach(entry => {
        if (activeEntryIds.has(entry.id)) {
          taskHasSelectedEntries = true;
          selectedEntriesCount++;

          if (splitEntriesMap.has(entry.id)) {
            selectedSplitCount++;
          }

          const pct = m.entryPercentages?.[entry.id] ?? m.percentage ?? globalPercentage;
          const origH = Number(entry.hours) || 0;
          const { transferred: th, remaining: rh } = calculateEntryHours(origH, pct);

          sourceHours = roundHours(sourceHours + origH);
          transferHours = roundHours(transferHours + th);
          remainingHours = roundHours(remainingHours + rh);

          const targetForThis = m.entryTargetTaskIds?.[entry.id] || m.targetTaskId;
          if (!targetForThis) {
            missingEntriesCount++;
            taskHasMissingTarget = true;
          }
        }
      });

      if (taskHasSelectedEntries) {
        selectedTasksCount++;
        if (taskHasMissingTarget) {
          missingTasksCount++;
        }
      }
    });

    return {
      selectedTasksCount,
      selectedEntriesCount,
      totalEntriesCount,
      sourceHours,
      transferHours,
      remainingHours,
      missingEntriesCount,
      missingTasksCount,
      selectedSplitCount,
    };
  }, [mappings, globalPercentage, splitEntriesMap]);

  // Colleagues whose time entries are currently selected for transfer
  const colleaguesInTransfer = useMemo(() => {
    const userMap = new Map<number, { id: number; name: string }>();
    mappings.forEach(m => {
      if (!m.selected) return;
      const activeEntryIds = getSelectedEntryIdsForMapping(m);
      m.timeEntries.forEach(e => {
        if (activeEntryIds.has(e.id) && e.user && e.user.id) {
          userMap.set(e.user.id, { id: e.user.id, name: e.user.name });
        }
      });
    });
    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [mappings]);

  const hasOtherColleaguesEntries = useMemo(() => {
    return colleaguesInTransfer.some(c => c.id !== user?.id);
  }, [colleaguesInTransfer, user?.id]);

  // Target task select options (ensures all available target tasks and any manually assigned ones have valid labels)
  const targetTaskOptions = useMemo(() => {
    const map = new Map<string, string>();
    targetTasks.forEach(t => {
      map.set(String(t.id), `#${t.id} - ${t.subject}`);
    });
    // Ensure any assigned target task in mappings is also available in options
    mappings.forEach(m => {
      if (m.targetTaskId && !map.has(m.targetTaskId)) {
        map.set(m.targetTaskId, `#${m.targetTaskId} - ${m.targetTaskSubject || `Задача #${m.targetTaskId}`}`);
      }
      if (m.entryTargetTaskIds) {
        Object.values(m.entryTargetTaskIds).forEach(tid => {
          if (tid && !map.has(tid)) {
            map.set(tid, `#${tid} - Задача #${tid}`);
          }
        });
      }
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [targetTasks, mappings]);

  // Flattened list of all time entries for the "Отчет за отчет" view
  const flatEntries = useMemo(() => {
    const list: Array<{
      entry: TimeEntry;
      mapping: TaskTransferMapping;
      isSelected: boolean;
      percentage: number;
      targetTaskId: string;
      transferredHours: number;
      remainingHours: number;
      splitInfo?: SplitEntryInfo;
    }> = [];

    mappings.forEach(m => {
      const activeIds = getSelectedEntryIdsForMapping(m);
      m.timeEntries.forEach(entry => {
        const splitInfo = splitEntriesMap.get(entry.id);
        if (splitFilter === 'split_only' && !splitInfo) return;
        if (splitFilter === 'unsplit_only' && splitInfo) return;

        const isSelected = activeIds.has(entry.id);
        const pct = m.entryPercentages?.[entry.id] ?? m.percentage ?? globalPercentage;
        const targetId = m.entryTargetTaskIds?.[entry.id] || m.targetTaskId || '';
        const origH = Number(entry.hours) || 0;
        const { transferred: th, remaining: rh } = calculateEntryHours(origH, pct);

        list.push({
          entry,
          mapping: m,
          isSelected,
          percentage: pct,
          targetTaskId: targetId,
          transferredHours: th,
          remainingHours: rh,
          splitInfo,
        });
      });
    });

    // Sort by date descending
    list.sort((a, b) => new Date(b.entry.spent_on).getTime() - new Date(a.entry.spent_on).getTime());
    return list;
  }, [mappings, globalPercentage, splitEntriesMap, splitFilter]);

  // Confirm transfer execution
  const handleStartTransfer = () => {
    if (summaryStats.selectedEntriesCount === 0) return;
    setIsConfirmModalOpen(true);
  };

  const handleExecuteTransferConfirmed = async () => {
    setIsConfirmModalOpen(false);
    setIsProgressModalOpen(true);
    setProgress({
      current: 0,
      total: 100,
      stepMessage: 'Стартиране на прехвърлянето...',
      percent: 0,
    });

    try {
      const result = await executeTimeTransfer({
        sourceProjectId: sourceProjectId!,
        targetProjectId: targetProjectId!,
        globalPercentage,
        mappings,
        appendCommentNote,
        onProgress: setProgress,
      });

      setTransferResult(result);
      setIsProgressModalOpen(false);
      setIsResultModalOpen(true);

      // Refresh source tasks list
      loadSourceTasks();

      // Refresh target tasks so newly cloned tasks appear in dropdowns
      if (targetProjectId) {
        try {
          const resp = await redmineApiRequest(
            `/issues.json?project_id=${targetProjectId}&status_id=*&limit=100`
          );
          setTargetTasks(resp.issues || []);
        } catch {
          // Ignore target task refetch errors gracefully
        }
      }
    } catch (err: unknown) {
      alert(`Възникна непредвидена грешка при прехвърлянето: ${(err as Error).message}`);
      setIsProgressModalOpen(false);
    }
  };

  const isSameProject = sourceProjectId && targetProjectId && sourceProjectId === targetProjectId;

  return (
    <Stack gap="lg">
      {/* Page Header */}
      <Group justify="space-between" align="center" wrap="wrap">
        <div>
          <Title order={2}>
            {t('timeTransferTitle')}
          </Title>
          <Text c="dimmed" size="sm" mt={3}>
            {t('timeTransferSubtitle')}
          </Text>
        </div>
      </Group>

      {/* Step 1: Project Selection & Filters */}
      <Card withBorder padding="md" radius="md">
        <Stack gap="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Select
              label={t('sourceProjectLabel')}
              placeholder={t('selectSourceProjectPlaceholder')}
              data={projectSelectData}
              searchable
              clearable
              value={sourceProjectId}
              onChange={val => {
                setSourceProjectId(val);
                setMappings([]);
              }}
              disabled={isLoadingProjects}
            />

            <Select
              label={t('targetProjectLabel')}
              placeholder={t('selectTargetProjectPlaceholder')}
              data={projectSelectData}
              searchable
              clearable
              value={targetProjectId}
              onChange={val => setTargetProjectId(val)}
              disabled={isLoadingProjects}
            />
          </SimpleGrid>

          {isSameProject && (
            <Alert color="yellow" icon={<IconAlertCircle size={18} />}>
              {t('sameProjectWarning')}
            </Alert>
          )}

          {sourceProjectId && (
            <>
              <Divider />
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Stack gap={4}>
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Text size="xs" fw={500} c="dimmed">
                      {t('userFilterLabel')}
                    </Text>
                    {permissions.canTransferColleagues ? (
                      <Tooltip label="Имате права на ръководител или администратор в проекта. Можете свободно да прехвърляте отчетите на всички колеги.">
                        <Badge
                          size="xs"
                          color="teal"
                          variant="light"
                          leftSection={<IconShieldCheck size={10} />}
                          style={{ cursor: 'help' }}
                        >
                          {permissions.isAdmin ? 'Администратор' : (permissions.sourceRoles[0] || 'Ръководител')}
                        </Badge>
                      </Tooltip>
                    ) : (
                      <Tooltip label="Ако нямате права на мениджър/администратор в Redmine, прехвърлянето на чужди отчети зависи от правата на Вашата роля в изходния и целевия проект.">
                        <Badge
                          size="xs"
                          color="gray"
                          variant="outline"
                          leftSection={<IconUser size={10} />}
                          style={{ cursor: 'help' }}
                        >
                          {permissions.sourceRoles[0] || t('permissionRegularBadge')}
                        </Badge>
                      </Tooltip>
                    )}
                  </Group>

                  <Select
                    size="sm"
                    searchable
                    clearable={false}
                    disabled={isLoadingColleagues}
                    placeholder="Изберете потребител..."
                    value={userFilter}
                    onChange={val => setUserFilter(val || 'me')}
                    data={[
                      { value: 'me', label: `👤 ${t('userFilterOnlyMe')} (${user?.name || 'Аз'})` },
                      { value: 'all', label: `👥 ${t('userFilterAll')}` },
                      ...(projectColleagues
                        .filter(c => c.id !== user?.id)
                        .length > 0
                        ? [
                            {
                              group: t('userFilterColleaguesGroup'),
                              items: projectColleagues
                                .filter(c => c.id !== user?.id)
                                .map(c => ({ value: String(c.id), label: `👤 ${c.name}` })),
                            },
                          ]
                        : []),
                    ]}
                  />
                  {userFilter !== 'me' && !permissions.canTransferColleagues && (
                    <Text size="10px" c="dimmed">
                      ℹ️ {t('permissionColleagueNotice')}
                    </Text>
                  )}
                </Stack>

                <Select
                  label={t('dateFilterLabel')}
                  size="sm"
                  data={[
                    { value: 'all_time', label: t('dateFilterAllTime') },
                    { value: 'this_month', label: t('dateFilterThisMonth') },
                    { value: 'last_month', label: t('dateFilterLastMonth') },
                    { value: 'last_30_days', label: t('dateFilterLast30Days') },
                    { value: 'this_year', label: t('dateFilterThisYear') },
                    { value: 'custom', label: t('dateFilterCustom') },
                  ]}
                  value={datePreset}
                  onChange={val => setDatePreset(val || 'all_time')}
                />

                <Button
                  leftSection={<IconRefresh size={16} />}
                  onClick={loadSourceTasks}
                  loading={isLoadingEntries}
                  color="blue"
                  variant="light"
                  style={{ alignSelf: 'flex-end' }}
                >
                  {t('loadTasksBtn')}
                </Button>
              </SimpleGrid>

              {datePreset === 'custom' && (
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                  <DatePickerInput
                    label={t('pmFromDatePlaceholder')}
                    placeholder={t('pmFromDatePlaceholder')}
                    valueFormat="D MMMM YYYY"
                    clearable
                    value={customFrom || null}
                    onChange={val => setCustomFrom(val || '')}
                  />
                  <DatePickerInput
                    label={t('pmToDatePlaceholder')}
                    placeholder={t('pmToDatePlaceholder')}
                    valueFormat="D MMMM YYYY"
                    clearable
                    value={customTo || null}
                    onChange={val => setCustomTo(val || '')}
                  />
                </SimpleGrid>
              )}
            </>
          )}
        </Stack>
      </Card>

      {/* Step 2: Global Transfer Settings & View Mode Toggle */}
      {sourceProjectId && targetProjectId && (
        <Card withBorder padding="md" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap="xs">
                <Text fw={600} size="md">
                  {t('globalPercentageLabel')}:
                </Text>
                {[100, 75, 50, 25].map(pct => (
                  <Button
                    key={pct}
                    size="xs"
                    variant={globalPercentage === pct ? 'filled' : 'light'}
                    color="blue"
                    onClick={() => handleGlobalPercentageChange(pct)}
                  >
                    {pct}%
                  </Button>
                ))}
              </Group>

              {/* View Mode Toggle: By Tasks vs Entry by Entry */}
              <Group gap="xs">
                <Text size="sm" c="dimmed" fw={500}>
                  {t('viewModeLabel')}:
                </Text>
                <SegmentedControl
                  size="xs"
                  value={viewMode}
                  onChange={val => setViewMode(val as 'tasks' | 'entries')}
                  data={[
                    {
                      value: 'tasks',
                      label: (
                        <Group gap={6} wrap="nowrap">
                          <IconChecklist size={14} />
                          <span>{t('viewModeTasks')}</span>
                        </Group>
                      ),
                    },
                    {
                      value: 'entries',
                      label: (
                        <Group gap={6} wrap="nowrap">
                          <IconClock size={14} />
                          <span>{t('viewModeEntries')}</span>
                        </Group>
                      ),
                    },
                  ]}
                />
              </Group>
            </Group>

            <Group align="center" gap="lg" wrap="nowrap">
              <Slider
                value={globalPercentage}
                onChange={handleGlobalPercentageChange}
                min={1}
                max={100}
                step={1}
                marks={[
                  { value: 25, label: '25%' },
                  { value: 50, label: '50%' },
                  { value: 75, label: '75%' },
                  { value: 100, label: '100%' },
                ]}
                style={{ flex: 1 }}
                color="blue"
              />
              <NumberInput
                value={globalPercentage}
                onChange={val => handleGlobalPercentageChange(Number(val) || 100)}
                min={1}
                max={100}
                w={85}
                size="sm"
                suffix="%"
              />
            </Group>

            <Group justify="space-between" align="center" wrap="wrap" mt="xs">
              {/* Filter for already split entries */}
              <Group gap="xs" align="center">
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Отчети:
                </Text>
                <SegmentedControl
                  size="xs"
                  value={splitFilter}
                  onChange={val => setSplitFilter(val as 'all' | 'split_only' | 'unsplit_only')}
                  data={[
                    { value: 'all', label: t('splitFilterAll') },
                    {
                      value: 'split_only',
                      label: (
                        <Group gap={4} wrap="nowrap">
                          <IconGitFork size={13} color="var(--mantine-color-violet-5)" />
                          <span>{t('splitFilterOnlySplit')}</span>
                        </Group>
                      ),
                    },
                    { value: 'unsplit_only', label: t('splitFilterNonSplit') },
                  ]}
                />
              </Group>

              {/* Manual Task Add */}
              <Group gap="xs">
                <TextInput
                  placeholder={t('addTaskByIdPlaceholder')}
                  size="xs"
                  w={120}
                  value={manualTaskId}
                  onChange={e => setManualTaskId(e.currentTarget.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddManualTask();
                  }}
                />
                <Button
                  size="xs"
                  variant="outline"
                  leftSection={<IconPlus size={14} />}
                  onClick={handleAddManualTask}
                  loading={isAddingManualTask}
                >
                  {t('addTransferTaskBtn')}
                </Button>
              </Group>
            </Group>
          </Stack>
        </Card>
      )}

      {/* Step 3: Tasks or Entry-by-Entry Table */}
      {sourceProjectId && targetProjectId ? (
        <Card withBorder padding="md" radius="md">
          <Stack gap="md">
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap="xs">
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => handleToggleSelectAll(true)}
                  disabled={mappings.length === 0}
                >
                  {t('selectAllBtn')}
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => handleToggleSelectAll(false)}
                  disabled={mappings.length === 0}
                >
                  {t('deselectAllBtn')}
                </Button>
              </Group>

              {summaryStats.missingTasksCount > 0 && (
                <Button
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconPlus size={14} />}
                  onClick={handleBulkCloneMissing}
                  loading={isBulkCloning}
                >
                  {t('createMissingTasksBtn')} ({summaryStats.missingTasksCount})
                </Button>
              )}
            </Group>

            {isLoadingEntries ? (
              <Group justify="center" p="xl">
                <Loader size="md" />
                <Text size="sm">{t('loadingTasks')}</Text>
              </Group>
            ) : mappings.length === 0 ? (
              <Alert icon={<IconInfoCircle size={18} />} color="blue" variant="light">
                {t('noTasksFoundInProject')}
              </Alert>
            ) : viewMode === 'tasks' ? (
              /* VIEW 1: GROUPED BY TASK WITH EXPANDABLE INDIVIDUAL TIME ENTRIES */
              <Table.ScrollContainer minWidth={900}>
                <Table striped highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={40}>
                        <Checkbox
                          checked={
                            mappings.length > 0 &&
                            mappings.every(m => m.selected && (m.selectedEntryIds?.length ?? m.timeEntries.length) === m.timeEntries.length)
                          }
                          indeterminate={
                            mappings.some(m => m.selected) &&
                            !mappings.every(m => m.selected && (m.selectedEntryIds?.length ?? m.timeEntries.length) === m.timeEntries.length)
                          }
                          onChange={e => handleToggleSelectAll(e.currentTarget.checked)}
                        />
                      </Table.Th>
                      <Table.Th w={30}></Table.Th>
                      <Table.Th>{t('sourceTaskCol')}</Table.Th>
                      <Table.Th w={120}>{t('loggedHoursCol')}</Table.Th>
                      <Table.Th w={100}>{t('transferPctCol')}</Table.Th>
                      <Table.Th w={110}>{t('transferHoursCol')}</Table.Th>
                      <Table.Th w={90}>{t('remainingHoursCol')}</Table.Th>
                      <Table.Th style={{ minWidth: 260 }}>{t('targetTaskCol')}</Table.Th>
                      <Table.Th w={130}>Действие</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {mappings.map(mapping => {
                      const taskSplitCount = mapping.timeEntries.filter(e => splitEntriesMap.has(e.id)).length;
                      if (splitFilter === 'split_only' && taskSplitCount === 0) return null;
                      if (splitFilter === 'unsplit_only' && taskSplitCount === mapping.timeEntries.length && mapping.timeEntries.length > 0) return null;

                      const isExpanded = expandedTaskIds.has(mapping.sourceTaskId);
                      const activeEntryIds = new Set(mapping.selectedEntryIds ?? (mapping.selected ? mapping.timeEntries.map(e => e.id) : []));
                      const isAllEntriesSelected = mapping.timeEntries.length > 0 && activeEntryIds.size === mapping.timeEntries.length;
                      const isSomeEntriesSelected = activeEntryIds.size > 0 && activeEntryIds.size < mapping.timeEntries.length;
                      const isCloningThis = cloningTaskId === mapping.sourceTaskId;

                      // Calculate task hours based on selected entries
                      let taskSourceHours = 0;
                      let taskTransferHours = 0;
                      let taskRemainingHours = 0;

                      mapping.timeEntries.forEach(e => {
                        const origH = Number(e.hours) || 0;
                        const isEntrySelected = activeEntryIds.has(e.id);
                        if (isEntrySelected) {
                          const pct = mapping.entryPercentages?.[e.id] ?? mapping.percentage ?? globalPercentage;
                          const { transferred: th, remaining: rh } = calculateEntryHours(origH, pct);

                          taskSourceHours = roundHours(taskSourceHours + origH);
                          taskTransferHours = roundHours(taskTransferHours + th);
                          taskRemainingHours = roundHours(taskRemainingHours + rh);
                        } else {
                          taskRemainingHours = roundHours(taskRemainingHours + origH);
                        }
                      });

                      const taskPct = mapping.percentage ?? globalPercentage;
                      const taskAuthors = Array.from(new Set(mapping.timeEntries.map(e => e.user?.name).filter(Boolean)));
                      const hasColleagueAuthors = mapping.timeEntries.some(e => e.user && e.user.id !== user?.id);

                      return (
                        <React.Fragment key={mapping.sourceTaskId}>
                          <Table.Tr style={{ opacity: mapping.selected ? 1 : 0.5 }}>
                            <Table.Td>
                              <Checkbox
                                checked={isAllEntriesSelected}
                                indeterminate={isSomeEntriesSelected}
                                onChange={e => handleToggleSelectRow(mapping.sourceTaskId, e.currentTarget.checked)}
                              />
                            </Table.Td>

                            <Table.Td>
                              <Tooltip label={isExpanded ? t('collapseEntriesTooltip') : t('expandEntriesTooltip')}>
                                <ActionIcon
                                  size="sm"
                                  variant="subtle"
                                  color="gray"
                                  onClick={() => toggleTaskExpansion(mapping.sourceTaskId)}
                                >
                                  {isExpanded ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                                </ActionIcon>
                              </Tooltip>
                            </Table.Td>

                            <Table.Td>
                              <Stack gap={2}>
                                <Group gap={6} wrap="nowrap">
                                  <RedmineIssueLink issueId={mapping.sourceTaskId} />
                                  {mapping.sourceTrackerName && (
                                    <Badge size="xs" variant="light" color="blue">
                                      {mapping.sourceTrackerName}
                                    </Badge>
                                  )}
                                </Group>
                                <Text size="sm" lineClamp={2}>
                                  {mapping.sourceTaskSubject}
                                </Text>
                                <Group gap={6} wrap="wrap">
                                  <Badge
                                    size="xs"
                                    variant="subtle"
                                    color={activeEntryIds.size > 0 ? 'blue' : 'gray'}
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => toggleTaskExpansion(mapping.sourceTaskId)}
                                  >
                                    {activeEntryIds.size} от {mapping.entryCount} {t('entriesOfTask')} (клик за детайли)
                                  </Badge>
                                  {taskSplitCount > 0 && (
                                    <Badge
                                      size="xs"
                                      color="violet"
                                      variant="light"
                                      leftSection={<IconGitFork size={10} />}
                                      style={{ cursor: 'pointer' }}
                                      onClick={() => toggleTaskExpansion(mapping.sourceTaskId)}
                                    >
                                      {taskSplitCount} {t('splitEntryBadge')}
                                    </Badge>
                                  )}
                                  {hasColleagueAuthors && (
                                    <Tooltip label={`Отчети в задачата от: ${taskAuthors.join(', ')}`}>
                                      <Badge
                                        size="xs"
                                        variant="light"
                                        color="cyan"
                                        leftSection={<IconUsers size={10} />}
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => toggleTaskExpansion(mapping.sourceTaskId)}
                                      >
                                        {taskAuthors.length === 1 ? taskAuthors[0] : `${taskAuthors.length} колеги`}
                                      </Badge>
                                    </Tooltip>
                                  )}
                                </Group>
                              </Stack>
                            </Table.Td>

                            <Table.Td>
                              <Text fw={600} size="sm">
                                {mapping.totalLoggedHours.toFixed(2)} ч.
                              </Text>
                            </Table.Td>

                            <Table.Td>
                              <NumberInput
                                size="xs"
                                w={80}
                                value={taskPct}
                                onChange={val => handleTaskPercentageChange(mapping.sourceTaskId, val)}
                                min={1}
                                max={100}
                                suffix="%"
                                disabled={!mapping.selected}
                              />
                            </Table.Td>

                            <Table.Td>
                              <Text fw={600} size="sm" c="teal">
                                {taskTransferHours.toFixed(2)} ч.
                              </Text>
                            </Table.Td>

                            <Table.Td>
                              <Text size="sm" c={taskRemainingHours > 0 ? 'dimmed' : 'gray'}>
                                {taskRemainingHours.toFixed(2)} ч.
                              </Text>
                            </Table.Td>

                            <Table.Td>
                              <Stack gap={4}>
                                <Select
                                  size="xs"
                                  placeholder={t('selectTargetTaskPlaceholder')}
                                  data={targetTaskOptions}
                                  searchable
                                  clearable
                                  value={mapping.targetTaskId || null}
                                  onChange={val => handleTargetTaskChange(mapping.sourceTaskId, val)}
                                  disabled={!mapping.selected || isLoadingTargetTasks}
                                />
                                {mapping.createdTaskId && (
                                  <Badge size="xs" color="teal" variant="light">
                                    ✓ {t('taskCreatedSuccess')} #{mapping.createdTaskId}
                                  </Badge>
                                )}
                                {!mapping.createdTaskId && mapping.targetTaskId && mapping.targetTaskSubject && (
                                  <Text size="xs" c="dimmed" lineClamp={1}>
                                    {mapping.targetTaskSubject}
                                  </Text>
                                )}
                              </Stack>
                            </Table.Td>

                            <Table.Td>
                              {!mapping.targetTaskId ? (
                                <Tooltip label="Създава копие на тази задача със същото заглавие и описание в целевия проект">
                                  <Button
                                    size="xs"
                                    variant="light"
                                    color="teal"
                                    leftSection={<IconPlus size={12} />}
                                    onClick={() => handleCloneTask(mapping)}
                                    loading={isCloningThis}
                                    disabled={!mapping.selected}
                                  >
                                    {t('createSameTaskBtn')}
                                  </Button>
                                </Tooltip>
                              ) : (
                                <Badge size="sm" color="green" variant="outline">
                                  Готова
                                </Badge>
                              )}
                            </Table.Td>
                          </Table.Tr>

                          {/* EXPANDED INNER TIME ENTRIES SUB-TABLE */}
                          {isExpanded && (
                            <Table.Tr style={{ background: 'var(--mantine-color-default-hover)' }}>
                              <Table.Td colSpan={9} p="xs">
                                <Card withBorder p="sm" radius="sm" style={{ background: 'var(--mantine-color-body)' }}>
                                  <Text size="xs" fw={700} c="dimmed" mb="xs" tt="uppercase">
                                    Отчети за време (изберете кои точно отчети да се прехвърлят):
                                  </Text>
                                  <Table verticalSpacing="xs" striped highlightOnHover>
                                    <Table.Thead>
                                      <Table.Tr>
                                        <Table.Th w={40}></Table.Th>
                                        <Table.Th w={145}>{t('entryDateCol')}</Table.Th>
                                        <Table.Th w={130}>{t('entryUserCol')}</Table.Th>
                                        <Table.Th w={120}>{t('entryActivityCol')}</Table.Th>
                                        <Table.Th>{t('entryCommentCol')}</Table.Th>
                                        <Table.Th w={90}>{t('entryHoursCol')}</Table.Th>
                                        <Table.Th w={85}>{t('transferPctCol')}</Table.Th>
                                        <Table.Th w={100}>{t('transferHoursCol')}</Table.Th>
                                        <Table.Th w={90}>{t('remainingHoursCol')}</Table.Th>
                                      </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                      {mapping.timeEntries.map(entry => {
                                        const splitInfo = splitEntriesMap.get(entry.id);
                                        if (splitFilter === 'split_only' && !splitInfo) return null;
                                        if (splitFilter === 'unsplit_only' && splitInfo) return null;

                                        const isEntrySelected = activeEntryIds.has(entry.id);
                                        const entryPct = mapping.entryPercentages?.[entry.id] ?? taskPct;
                                        const origH = Number(entry.hours) || 0;
                                        const { transferred: th, remaining: rh } = calculateEntryHours(origH, entryPct);

                                        return (
                                          <Table.Tr key={entry.id} style={{ opacity: isEntrySelected ? 1 : 0.4 }}>
                                            <Table.Td>
                                              <Checkbox
                                                checked={isEntrySelected}
                                                onChange={e =>
                                                  handleToggleSelectEntry(
                                                    mapping.sourceTaskId,
                                                    entry.id,
                                                    e.currentTarget.checked
                                                  )
                                                }
                                              />
                                            </Table.Td>
                                            <Table.Td>
                                              <Stack gap={3} align="flex-start">
                                                <Badge size="xs" variant="outline" color="blue" style={{ textTransform: 'none', whiteSpace: 'nowrap' }}>
                                                  {formatDisplayDate(entry.spent_on, language)}
                                                </Badge>
                                                {splitInfo && (
                                                  <Tooltip
                                                    multiline
                                                    w={320}
                                                    withArrow
                                                    label={
                                                      <Stack gap={3}>
                                                        <Text size="xs" fw={700}>
                                                          {t('splitEntryTooltipTitle')}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                          "{splitInfo.partnerComments || entry.comments}"
                                                        </Text>
                                                        <Divider my={2} />
                                                        <Text size="xs">
                                                          • Текущ отчет: #{entry.id} ({Number(entry.hours).toFixed(2)} ч.)
                                                        </Text>
                                                        <Text size="xs">
                                                          • {t('splitPartnerDetails')}: #{splitInfo.partnerEntryId} ({splitInfo.partnerHours.toFixed(2)} ч.)
                                                          {splitInfo.partnerTaskId ? ` в #${splitInfo.partnerTaskId}` : ''}
                                                          {splitInfo.partnerTaskSubject ? ` ${splitInfo.partnerTaskSubject}` : ''}
                                                          {splitInfo.partnerProjectName ? ` [${splitInfo.partnerProjectName}]` : ''}
                                                        </Text>
                                                        <Text size="xs" fw={600} c="teal">
                                                          • {t('splitTotalDayHours')}: {splitInfo.totalHours.toFixed(2)} ч.
                                                        </Text>
                                                      </Stack>
                                                    }
                                                  >
                                                    <Badge
                                                      size="xs"
                                                      color="violet"
                                                      variant="light"
                                                      leftSection={<IconGitFork size={10} />}
                                                      style={{ cursor: 'pointer' }}
                                                    >
                                                      {t('splitEntryBadge')} ({Number(entry.hours).toFixed(2)} + {splitInfo.partnerHours.toFixed(2)} ч.)
                                                    </Badge>
                                                  </Tooltip>
                                                )}
                                              </Stack>
                                            </Table.Td>
                                            <Table.Td>
                                              <Badge
                                                size="xs"
                                                variant={entry.user?.id === user?.id ? 'light' : 'outline'}
                                                color={entry.user?.id === user?.id ? 'gray' : 'blue'}
                                                leftSection={entry.user?.id === user?.id ? undefined : <IconUser size={10} />}
                                              >
                                                {entry.user?.name || '—'}
                                                {entry.user?.id === user?.id ? ' (Аз)' : ''}
                                              </Badge>
                                            </Table.Td>
                                            <Table.Td>
                                              <Badge size="xs" variant="light" color="gray">
                                                {entry.activity?.name || '—'}
                                              </Badge>
                                            </Table.Td>
                                            <Table.Td style={{ minWidth: 220 }}>
                                              <Group gap={4} wrap="nowrap">
                                                <TextInput
                                                  size="xs"
                                                  style={{ flex: 1 }}
                                                  value={mapping.entryComments?.[entry.id] ?? entry.comments ?? ''}
                                                  onChange={e =>
                                                    handleEntryCommentChange(
                                                      mapping.sourceTaskId,
                                                      entry.id,
                                                      e.currentTarget.value
                                                    )
                                                  }
                                                  placeholder={t('commentInputPlaceholder')}
                                                  disabled={!isEntrySelected}
                                                />
                                                <Tooltip label="Редактирай в голям прозорец">
                                                  <ActionIcon
                                                    size="xs"
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={() =>
                                                      setEditingCommentEntry({
                                                        sourceTaskId: mapping.sourceTaskId,
                                                        entry,
                                                        comment: mapping.entryComments?.[entry.id] ?? entry.comments ?? '',
                                                      })
                                                    }
                                                    disabled={!isEntrySelected}
                                                  >
                                                    <IconPencil size={13} />
                                                  </ActionIcon>
                                                </Tooltip>
                                              </Group>
                                            </Table.Td>
                                            <Table.Td>
                                              <Text size="xs" fw={600}>
                                                {origH.toFixed(2)} ч.
                                              </Text>
                                            </Table.Td>
                                            <Table.Td>
                                              <NumberInput
                                                size="xs"
                                                w={75}
                                                value={entryPct}
                                                onChange={val =>
                                                  handleEntryPercentageChange(mapping.sourceTaskId, entry.id, val)
                                                }
                                                min={1}
                                                max={100}
                                                suffix="%"
                                                disabled={!isEntrySelected}
                                              />
                                            </Table.Td>
                                            <Table.Td>
                                              <Text size="xs" fw={600} c="teal">
                                                {isEntrySelected ? `${th.toFixed(2)} ч.` : '0.00 ч.'}
                                              </Text>
                                            </Table.Td>
                                            <Table.Td>
                                              <Text size="xs" c="dimmed">
                                                {isEntrySelected ? `${rh.toFixed(2)} ч.` : `${origH.toFixed(2)} ч.`}
                                              </Text>
                                            </Table.Td>
                                          </Table.Tr>
                                        );
                                      })}
                                    </Table.Tbody>
                                  </Table>
                                </Card>
                              </Table.Td>
                            </Table.Tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            ) : (
              /* VIEW 2: FLAT "ОТЧЕТ ЗА ОТЧЕТ" (ENTRY BY ENTRY) TABLE */
              <Table.ScrollContainer minWidth={950}>
                <Table striped highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th w={40}>
                        <Checkbox
                          checked={
                            flatEntries.length > 0 && flatEntries.every(f => f.isSelected)
                          }
                          indeterminate={
                            flatEntries.some(f => f.isSelected) &&
                            !flatEntries.every(f => f.isSelected)
                          }
                          onChange={e => handleToggleSelectAll(e.currentTarget.checked)}
                        />
                      </Table.Th>
                      <Table.Th w={145}>{t('entryDateCol')}</Table.Th>
                      <Table.Th style={{ minWidth: 200 }}>{t('sourceTaskCol')}</Table.Th>
                      <Table.Th w={120}>{t('entryUserCol')}</Table.Th>
                      <Table.Th w={110}>{t('entryActivityCol')}</Table.Th>
                      <Table.Th style={{ minWidth: 160 }}>{t('entryCommentCol')}</Table.Th>
                      <Table.Th w={85}>{t('entryHoursCol')}</Table.Th>
                      <Table.Th w={85}>{t('transferPctCol')}</Table.Th>
                      <Table.Th w={95}>{t('transferHoursCol')}</Table.Th>
                      <Table.Th w={85}>{t('remainingHoursCol')}</Table.Th>
                      <Table.Th style={{ minWidth: 220 }}>{t('targetTaskCol')}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {flatEntries.map(({ entry, mapping, isSelected, percentage, targetTaskId, transferredHours, remainingHours, splitInfo }) => {
                      const origH = Number(entry.hours) || 0;

                      return (
                        <Table.Tr key={entry.id} style={{ opacity: isSelected ? 1 : 0.45 }}>
                          <Table.Td>
                            <Checkbox
                              checked={isSelected}
                              onChange={e =>
                                handleToggleSelectEntry(
                                  mapping.sourceTaskId,
                                  entry.id,
                                  e.currentTarget.checked
                                )
                              }
                            />
                          </Table.Td>

                          <Table.Td>
                            <Stack gap={3} align="flex-start">
                              <Badge size="xs" variant="outline" color="blue" style={{ textTransform: 'none', whiteSpace: 'nowrap' }}>
                                {formatDisplayDate(entry.spent_on, language)}
                              </Badge>
                              {splitInfo && (
                                <Tooltip
                                  multiline
                                  w={320}
                                  withArrow
                                  label={
                                    <Stack gap={3}>
                                      <Text size="xs" fw={700}>
                                        {t('splitEntryTooltipTitle')}
                                      </Text>
                                      <Text size="xs" c="dimmed">
                                        "{splitInfo.partnerComments || entry.comments}"
                                      </Text>
                                      <Divider my={2} />
                                      <Text size="xs">
                                        • Текущ отчет: #{entry.id} ({Number(entry.hours).toFixed(2)} ч.)
                                      </Text>
                                      <Text size="xs">
                                        • {t('splitPartnerDetails')}: #{splitInfo.partnerEntryId} ({splitInfo.partnerHours.toFixed(2)} ч.)
                                        {splitInfo.partnerTaskId ? ` в #${splitInfo.partnerTaskId}` : ''}
                                        {splitInfo.partnerTaskSubject ? ` ${splitInfo.partnerTaskSubject}` : ''}
                                        {splitInfo.partnerProjectName ? ` [${splitInfo.partnerProjectName}]` : ''}
                                      </Text>
                                      <Text size="xs" fw={600} c="teal">
                                        • {t('splitTotalDayHours')}: {splitInfo.totalHours.toFixed(2)} ч.
                                      </Text>
                                    </Stack>
                                  }
                                >
                                  <Badge
                                    size="xs"
                                    color="violet"
                                    variant="light"
                                    leftSection={<IconGitFork size={10} />}
                                    style={{ cursor: 'pointer' }}
                                  >
                                    {t('splitEntryBadge')} ({Number(entry.hours).toFixed(2)} + {splitInfo.partnerHours.toFixed(2)} ч.)
                                  </Badge>
                                </Tooltip>
                              )}
                            </Stack>
                          </Table.Td>

                          <Table.Td>
                            <Stack gap={2}>
                              <Group gap={6} wrap="nowrap">
                                <RedmineIssueLink issueId={mapping.sourceTaskId} />
                                {mapping.sourceTrackerName && (
                                  <Badge size="xs" variant="light" color="blue">
                                    {mapping.sourceTrackerName}
                                  </Badge>
                                )}
                              </Group>
                              <Text size="xs" lineClamp={1}>
                                {mapping.sourceTaskSubject}
                              </Text>
                            </Stack>
                          </Table.Td>

                          <Table.Td>
                            <Badge
                              size="xs"
                              variant={entry.user?.id === user?.id ? 'light' : 'outline'}
                              color={entry.user?.id === user?.id ? 'gray' : 'blue'}
                              leftSection={entry.user?.id === user?.id ? undefined : <IconUser size={10} />}
                            >
                              {entry.user?.name || '—'}
                              {entry.user?.id === user?.id ? ' (Аз)' : ''}
                            </Badge>
                          </Table.Td>

                          <Table.Td>
                            <Badge size="xs" variant="light" color="gray">
                              {entry.activity?.name || '—'}
                            </Badge>
                          </Table.Td>

                          <Table.Td style={{ minWidth: 200 }}>
                            <Group gap={4} wrap="nowrap">
                              <TextInput
                                size="xs"
                                style={{ flex: 1 }}
                                value={mapping.entryComments?.[entry.id] ?? entry.comments ?? ''}
                                onChange={e =>
                                  handleEntryCommentChange(
                                    mapping.sourceTaskId,
                                    entry.id,
                                    e.currentTarget.value
                                  )
                                }
                                placeholder={t('commentInputPlaceholder')}
                                disabled={!isSelected}
                              />
                              <Tooltip label="Редактирай в голям прозорец">
                                <ActionIcon
                                  size="xs"
                                  variant="subtle"
                                  color="gray"
                                  onClick={() =>
                                    setEditingCommentEntry({
                                      sourceTaskId: mapping.sourceTaskId,
                                      entry,
                                      comment: mapping.entryComments?.[entry.id] ?? entry.comments ?? '',
                                    })
                                  }
                                  disabled={!isSelected}
                                >
                                  <IconPencil size={13} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>
                          </Table.Td>

                          <Table.Td>
                            <Text size="xs" fw={600}>
                              {origH.toFixed(2)} ч.
                            </Text>
                          </Table.Td>

                          <Table.Td>
                            <NumberInput
                              size="xs"
                              w={75}
                              value={percentage}
                              onChange={val =>
                                handleEntryPercentageChange(mapping.sourceTaskId, entry.id, val)
                              }
                              min={1}
                              max={100}
                              suffix="%"
                              disabled={!isSelected}
                            />
                          </Table.Td>

                          <Table.Td>
                            <Text size="xs" fw={600} c="teal">
                              {isSelected ? `${transferredHours.toFixed(2)} ч.` : '0.00 ч.'}
                            </Text>
                          </Table.Td>

                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {isSelected ? `${remainingHours.toFixed(2)} ч.` : `${origH.toFixed(2)} ч.`}
                            </Text>
                          </Table.Td>

                          <Table.Td>
                            <Group gap={4} wrap="nowrap">
                              <Select
                                size="xs"
                                style={{ flex: 1 }}
                                placeholder={t('selectTargetTaskPlaceholder')}
                                data={targetTaskOptions}
                                searchable
                                clearable
                                value={targetTaskId || null}
                                onChange={val =>
                                  handleEntryTargetTaskChange(mapping.sourceTaskId, entry.id, val)
                                }
                                disabled={!isSelected || isLoadingTargetTasks}
                              />
                              {!targetTaskId && (
                                <Tooltip label={t('createSameTaskBtn')}>
                                  <ActionIcon
                                    size="sm"
                                    variant="light"
                                    color="teal"
                                    onClick={() => handleCloneTask(mapping)}
                                    loading={cloningTaskId === mapping.sourceTaskId}
                                    disabled={!isSelected}
                                  >
                                    <IconPlus size={14} />
                                  </ActionIcon>
                                </Tooltip>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Stack>
        </Card>
      ) : (
        <Alert icon={<IconInfoCircle size={18} />} color="blue">
          {t('selectProjectsFirst')}
        </Alert>
      )}

      {/* Step 4: Summary Card & Action Button */}
      {sourceProjectId && targetProjectId && summaryStats.selectedEntriesCount > 0 && (
        <Paper withBorder p="md" radius="md" style={{ background: 'var(--mantine-color-body)' }}>
          <Group justify="space-between" align="center" wrap="wrap">
            <Group gap="xl" wrap="wrap">
              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  {t('selectedEntriesCount')}
                </Text>
                <Text fw={700} size="xl">
                  {summaryStats.selectedEntriesCount} / {summaryStats.totalEntriesCount} ({summaryStats.selectedTasksCount} задачи)
                </Text>
              </div>

              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  {t('totalSourceHours')}
                </Text>
                <Text fw={700} size="xl">
                  {summaryStats.sourceHours.toFixed(2)} ч.
                </Text>
              </div>

              <div>
                <Text size="xs" c="teal" tt="uppercase" fw={700}>
                  {t('totalTransferHours')}
                </Text>
                <Text fw={700} size="xl" c="teal">
                  {summaryStats.transferHours.toFixed(2)} ч.
                </Text>
              </div>

              <div>
                <Text size="xs" c="dimmed" tt="uppercase" fw={700}>
                  {t('totalRemainingHours')}
                </Text>
                <Text fw={700} size="xl" c="dimmed">
                  {summaryStats.remainingHours.toFixed(2)} ч.
                </Text>
              </div>
            </Group>

            <Button
              size="md"
              color="teal"
              leftSection={<IconArrowsExchange size={20} />}
              onClick={handleStartTransfer}
              disabled={summaryStats.selectedEntriesCount === 0}
            >
              {t('executeTransferBtn')} ({summaryStats.transferHours.toFixed(2)} ч.)
            </Button>
          </Group>
        </Paper>
      )}

      {/* Confirmation Modal */}
      <Modal
        opened={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title={
          <Group gap="xs">
            <IconArrowsExchange size={20} />
            <Text fw={700}>{t('confirmTransferModalTitle')}</Text>
          </Group>
        }
        size="lg"
      >
        <Stack gap="md">
          <Text size="sm">{t('confirmTransferPrompt')}</Text>

          <Paper withBorder p="sm" radius="sm">
            <Stack gap="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Избрани отчети за прехвърляне:
                </Text>
                <Text fw={600} size="sm">
                  {summaryStats.selectedEntriesCount} отчета (в {summaryStats.selectedTasksCount} задачи)
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Часове за прехвърляне:
                </Text>
                <Text fw={700} size="sm" c="teal">
                  {summaryStats.transferHours.toFixed(2)} ч.
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">
                  Оставащи часове в изходните задачи:
                </Text>
                <Text fw={600} size="sm">
                  {summaryStats.remainingHours.toFixed(2)} ч.
                </Text>
              </Group>
              {colleaguesInTransfer.length > 0 && (
                <Group justify="space-between" align="flex-start">
                  <Text size="sm" c="dimmed">
                    {t('colleaguesInTransferLabel')}:
                  </Text>
                  <Group gap={4} justify="flex-end" style={{ maxWidth: '60%' }}>
                    {colleaguesInTransfer.map(c => (
                      <Badge
                        key={c.id}
                        size="xs"
                        variant={c.id === user?.id ? 'light' : 'outline'}
                        color={c.id === user?.id ? 'gray' : 'blue'}
                        leftSection={c.id === user?.id ? undefined : <IconUser size={10} />}
                      >
                        {c.name}{c.id === user?.id ? ' (Аз)' : ''}
                      </Badge>
                    ))}
                  </Group>
                </Group>
              )}
              {hasOtherColleaguesEntries && (
                <Alert color="blue" icon={<IconInfoCircle size={16} />} p="xs">
                  {t('colleaguesEntriesNotice')}
                </Alert>
              )}
              {summaryStats.missingTasksCount > 0 && (
                <Alert color="teal" icon={<IconPlus size={16} />}>
                  {summaryStats.missingTasksCount} от избраните задачи (общо {summaryStats.missingEntriesCount} отчета) нямат асоциирана целева задача. Те ще бъдат автоматично клонирани в целевия проект по време на прехвърлянето!
                </Alert>
              )}
              {summaryStats.selectedSplitCount > 0 && (
                <Alert color="violet" icon={<IconGitFork size={16} />}>
                  {summaryStats.selectedSplitCount} {t('splitEntriesDetectedAlert')}
                </Alert>
              )}
            </Stack>
          </Paper>

          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setIsConfirmModalOpen(false)}>
              {t('cancelBtn')}
            </Button>
            <Button color="teal" onClick={handleExecuteTransferConfirmed}>
              {t('confirmBtn')}
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* Progress Modal */}
      <Modal
        opened={isProgressModalOpen}
        onClose={() => {}}
        closeOnClickOutside={false}
        closeOnEscape={false}
        withCloseButton={false}
        title={t('transferInProgress')}
      >
        <Stack gap="md" py="sm">
          <Progress value={progress.percent} animated size="lg" color="teal" />
          <Text size="sm" c="dimmed">
            {progress.stepMessage}
          </Text>
          <Text size="xs" ta="right" c="dimmed">
            {progress.current} / {progress.total} стъпки ({progress.percent}%)
          </Text>
        </Stack>
      </Modal>

      {/* Result Report Modal */}
      <Modal
        opened={isResultModalOpen}
        onClose={() => setIsResultModalOpen(false)}
        title={
          <Group gap="xs">
            <IconSparkles size={20} color="var(--mantine-color-teal-6)" />
            <Text fw={700}>{t('transferCompletedTitle')}</Text>
          </Group>
        }
        size="md"
      >
        {transferResult && (
          <Stack gap="md">
            <Paper withBorder p="md" radius="sm">
              <SimpleGrid cols={2} spacing="sm">
                <div>
                  <Text size="xs" c="dimmed">
                    {t('tasksProcessedLabel')}
                  </Text>
                  <Text fw={700} size="lg">
                    {transferResult.tasksProcessed}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    {t('totalTransferHours')}
                  </Text>
                  <Text fw={700} size="lg" c="teal">
                    {transferResult.totalTransferredHours.toFixed(2)} ч.
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    {t('entriesMovedLabel')}
                  </Text>
                  <Text fw={600} size="md">
                    {transferResult.entriesMoved}
                  </Text>
                </div>
                <div>
                  <Text size="xs" c="dimmed">
                    {t('entriesSplitLabel')}
                  </Text>
                  <Text fw={600} size="md">
                    {transferResult.entriesSplit}
                  </Text>
                </div>
                {transferResult.tasksCreated > 0 && (
                  <div>
                    <Text size="xs" c="dimmed">
                      {t('tasksCreatedLabel')}
                    </Text>
                    <Text fw={600} size="md" c="blue">
                      {transferResult.tasksCreated}
                    </Text>
                  </div>
                )}
              </SimpleGrid>
            </Paper>

            {transferResult.errors.length > 0 && (
              <Alert color="red" icon={<IconAlertCircle size={16} />} title={t('errorsOccurred')}>
                <Stack gap={4}>
                  {transferResult.errors.map((err, idx) => (
                    <Text size="xs" key={idx}>
                      • {err}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}

            <Button fullWidth onClick={() => setIsResultModalOpen(false)}>
              {t('closeBtn')}
            </Button>
          </Stack>
        )}
      </Modal>

      {/* Edit Comment Modal */}
      <Modal
        opened={Boolean(editingCommentEntry)}
        onClose={() => setEditingCommentEntry(null)}
        title={
          <Group gap="xs">
            <IconPencil size={18} />
            <Text fw={700}>{t('editCommentModalTitle')}</Text>
          </Group>
        }
        size="md"
      >
        {editingCommentEntry && (
          <Stack gap="md">
            <Group justify="space-between">
              <Badge size="sm" variant="outline" color="blue" style={{ textTransform: 'none' }}>
                {t('dateLabel')}: {formatDisplayDate(editingCommentEntry.entry.spent_on, language)}
              </Badge>
              <Badge size="sm" variant="light" color="teal">
                Часове: {Number(editingCommentEntry.entry.hours).toFixed(2)} ч.
              </Badge>
            </Group>

            {editingCommentEntry && splitEntriesMap.get(editingCommentEntry.entry.id) && (
              <Alert color="violet" icon={<IconGitFork size={16} />}>
                Този отчет вече е разделен на 2 за дата {formatDisplayDate(editingCommentEntry.entry.spent_on, language)} със същия текст!
                Партньорски отчет: #{splitEntriesMap.get(editingCommentEntry.entry.id)!.partnerEntryId} ({splitEntriesMap.get(editingCommentEntry.entry.id)!.partnerHours.toFixed(2)} ч.)
                {splitEntriesMap.get(editingCommentEntry.entry.id)!.partnerTaskId
                  ? ` в задача #${splitEntriesMap.get(editingCommentEntry.entry.id)!.partnerTaskId}`
                  : ''}
                {splitEntriesMap.get(editingCommentEntry.entry.id)!.partnerProjectName
                  ? ` [${splitEntriesMap.get(editingCommentEntry.entry.id)!.partnerProjectName}]`
                  : ''}.
              </Alert>
            )}

            <Textarea
              label={t('commentFieldLabel')}
              placeholder={t('commentInputPlaceholder')}
              minRows={4}
              maxRows={8}
              autosize
              value={editingCommentEntry.comment}
              onChange={e =>
                setEditingCommentEntry({
                  ...editingCommentEntry,
                  comment: e.currentTarget.value,
                })
              }
            />

            <Group justify="space-between" mt="sm">
              <Button
                variant="light"
                color="blue"
                size="xs"
                loading={isSavingCommentToRedmine}
                onClick={handleSaveCommentDirectlyToRedmine}
              >
                {t('saveToRedmineNowBtn')}
              </Button>

              <Group gap="xs">
                <Button variant="default" size="xs" onClick={() => setEditingCommentEntry(null)}>
                  {t('cancelBtn')}
                </Button>
                <Button
                  color="teal"
                  size="xs"
                  onClick={() => {
                    handleEntryCommentChange(
                      editingCommentEntry.sourceTaskId,
                      editingCommentEntry.entry.id,
                      editingCommentEntry.comment
                    );
                    setEditingCommentEntry(null);
                  }}
                >
                  {t('applyForTransferBtn')}
                </Button>
              </Group>
            </Group>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
};
