import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Select, TextInput, Group, Stack, Loader } from '@mantine/core';
import { useProjects } from '../../contexts/ProjectsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTasksForProject } from '../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../hooks/useActivitiesForProject';
import { getIssue } from '../../services/redmine';
import { getLastActivityForTask, setLastActivityForTask, getLastUserActivity } from '../../services/taskActivity';
import type { RedmineIssue } from '../../types';

/// <summary>
/// Properties for configuring the unified ProjectTaskActivityFields component.
/// </summary>
export interface ProjectTaskActivityFieldsProps {
  /// <summary>Currently selected project ID string.</summary>
  projectId: string;
  /// <summary>Callback triggered when the project selection changes.</summary>
  onProjectChange: (projectId: string) => void;
  /// <summary>Currently entered or selected task ID string.</summary>
  taskId: string;
  /// <summary>Callback triggered when the task ID changes or a task is loaded.</summary>
  onTaskChange: (taskId: string, task?: RedmineIssue | null) => void;
  /// <summary>Currently selected activity ID string.</summary>
  activityId: string;
  /// <summary>Callback triggered when the activity selection changes.</summary>
  onActivityChange: (activityId: string) => void;
  /// <summary>Whether to include the '--- My Assigned Issues ---' option in the project dropdown.</summary>
  includeMyIssues?: boolean;
  /// <summary>Whether activity selection is marked with asterisk/required.</summary>
  activityRequired?: boolean;
  /// <summary>Whether project selection is marked with asterisk/required.</summary>
  projectRequired?: boolean;
  /// <summary>Whether task selection is marked with asterisk/required.</summary>
  taskRequired?: boolean;
  /// <summary>Whether all input fields should be disabled.</summary>
  disabled?: boolean;
  /// <summary>Additional task dropdown options (e.g. from an existing time entry or active preset).</summary>
  additionalTaskOptions?: Array<{ value: string; label: string }>;
  /// <summary>Additional activity dropdown options (e.g. from an existing time entry).</summary>
  additionalActivityOptions?: Array<{ value: string; label: string }>;
  /// <summary>Whether to hide the activity selection field completely.</summary>
  hideActivity?: boolean;
  /// <summary>Layout arrangement of the fields: 'stacked' (vertical) or 'standard' (project/activity/task rows).</summary>
  layout?: 'stacked' | 'standard';
}

/// <summary>
/// Unified form fields component for selecting a Redmine Project, Task (via ID or dropdown),
/// and Activity with automatic ID search, project synchronization, and last used activity retrieval.
/// </summary>
export const ProjectTaskActivityFields: React.FC<ProjectTaskActivityFieldsProps> = ({
  projectId,
  onProjectChange,
  taskId,
  onTaskChange,
  activityId,
  onActivityChange,
  includeMyIssues = true,
  activityRequired = true,
  projectRequired = false,
  taskRequired = true,
  disabled = false,
  additionalTaskOptions = [],
  additionalActivityOptions = [],
  hideActivity = false,
  layout = 'standard',
}) => {
  const { getProjectSelectData, ensureProjectsLoaded, isLoadingProjects } = useProjects();
  const { t } = useLanguage();
  const [loadedTask, setLoadedTask] = useState<RedmineIssue | null>(null);
  const [isLoadingIssue, setIsLoadingIssue] = useState(false);
  const lastSearchedIdRef = useRef<string>('');

  // Ensure projects are loaded if a project ID is already pre-selected (e.g. from edit/preset/issue lookup)
  useEffect(() => {
    if (projectId && projectId !== 'my_issues') {
      ensureProjectsLoaded();
    }
  }, [projectId, ensureProjectsLoaded]);

  const { tasks: projectTasks, isLoading: isLoadingTasks } = useTasksForProject(projectId || null);
  const { activities: projectActivities, isLoading: isLoadingActivities, defaultActivityId } = useActivitiesForProject(
    projectId || null,
    !hideActivity
  );

  // Grouped project options with 'Recently Used' at the top
  const projectOptions = useMemo(() => {
    return getProjectSelectData(includeMyIssues);
  }, [getProjectSelectData, includeMyIssues]);

  // Combined activity options
  const activityOptions = useMemo(() => {
    const options = projectActivities.map(a => ({
      value: a.id.toString(),
      label: `${a.name}${a.is_default ? ' (default)' : ''}`,
    }));

    // Append any extra activity options (e.g. historical entry activity)
    additionalActivityOptions.forEach(extra => {
      if (!options.some(o => o.value === extra.value)) {
        options.unshift(extra);
      }
    });

    return options;
  }, [projectActivities, additionalActivityOptions]);

  // Combined task options
  const taskOptions = useMemo(() => {
    const map = new Map<string, string>();

    // From project/my issues
    projectTasks.forEach(item => map.set(item.id.toString(), `#${item.id} - ${item.subject}`));

    // From loaded task
    if (loadedTask) {
      map.set(loadedTask.id.toString(), `#${loadedTask.id} - ${loadedTask.subject}`);
    }

    // From additional options (presets, copied entries, etc.)
    additionalTaskOptions.forEach(opt => {
      if (!map.has(opt.value)) {
        map.set(opt.value, opt.label);
      }
    });

    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [projectTasks, loadedTask, additionalTaskOptions]);

  /// <summary>
  /// Finds and applies the last used activity for the given task ID.
  /// </summary>
  /// <param name="cleanTaskId">Task ID without hash prefix.</param>
  const applyLastActivityForTask = useCallback(
    async (cleanTaskId: string) => {
      if (!cleanTaskId) return;
      try {
        const lastActId = await getLastActivityForTask(cleanTaskId);
        if (lastActId) {
          onActivityChange(lastActId);
        } else if (!activityId && defaultActivityId) {
          onActivityChange(defaultActivityId.toString());
        }
      } catch {
        if (!activityId && defaultActivityId) {
          onActivityChange(defaultActivityId.toString());
        }
      }
    },
    [activityId, defaultActivityId, onActivityChange]
  );

  /// <summary>
  /// Fetches an issue by ID from Redmine, auto-populates project and task subject,
  /// and looks up the last used activity for this task.
  /// </summary>
  /// <param name="rawId">Raw user input task identifier.</param>
  const handleQuickLoad = useCallback(
    async (rawId: string) => {
      const cleanId = rawId.replace(/^#/, '').trim();
      if (!cleanId || isNaN(Number(cleanId)) || cleanId === lastSearchedIdRef.current) return;

      lastSearchedIdRef.current = cleanId;
      setIsLoadingIssue(true);
      try {
        const issue = await getIssue(parseInt(cleanId, 10));
        setLoadedTask(issue);
        onTaskChange(issue.id.toString(), issue);

        if (issue.project?.id) {
          onProjectChange(issue.project.id.toString());
        }

        // Auto-select last activity for this task
        applyLastActivityForTask(issue.id.toString());
      } catch (error) {
        console.warn(`Could not load issue #${cleanId}:`, error);
      } finally {
        setIsLoadingIssue(false);
      }
    },
    [onTaskChange, onProjectChange, applyLastActivityForTask]
  );

  /// <summary>
  /// Clears loaded task details and search cache when taskId is empty or cleared.
  /// Prevents old task options or search cache from lingering across openings.
  /// </summary>
  useEffect(() => {
    if (!taskId) {
      setLoadedTask(null);
      lastSearchedIdRef.current = '';
    }
  }, [taskId]);

  // Debounced auto-fetch when user types task ID (500ms after typing digits)
  useEffect(() => {
    const clean = taskId.replace(/^#/, '').trim();
    if (!clean || isNaN(Number(clean)) || clean === lastSearchedIdRef.current) return;

    const timer = setTimeout(() => {
      handleQuickLoad(taskId);
    }, 500);

    return () => clearTimeout(timer);
  }, [taskId, handleQuickLoad]);

  // Pre-select user's last activity when activities load if none is set
  useEffect(() => {
    if (!activityId && projectActivities.length > 0) {
      if (taskId) {
        applyLastActivityForTask(taskId);
      } else {
        getLastUserActivity().then(actId => {
          if (actId && projectActivities.some(a => a.id.toString() === actId)) {
            onActivityChange(actId);
          } else if (defaultActivityId) {
            onActivityChange(defaultActivityId.toString());
          }
        });
      }
    }
  }, [projectActivities, defaultActivityId, taskId, activityId, applyLastActivityForTask, onActivityChange]);

  /// <summary>
  /// Handles selecting a task from the Task Name dropdown.
  /// </summary>
  /// <param name="val">Selected task ID string.</param>
  const handleTaskDropdownSelect = (val: string | null) => {
    const selectedId = val || '';
    onTaskChange(selectedId);
    if (!selectedId) return;

    lastSearchedIdRef.current = selectedId;
    const task = projectTasks.find(item => item.id.toString() === selectedId) || (loadedTask?.id.toString() === selectedId ? loadedTask : null);

    if (task?.project?.id) {
      onProjectChange(task.project.id.toString());
    }

    applyLastActivityForTask(selectedId);
  };

  /// <summary>
  /// Handles project dropdown change. Clears task if switching to a non-matching project.
  /// </summary>
  /// <param name="val">Selected project ID string.</param>
  const handleProjectDropdownChange = (val: string | null) => {
    const newProjectId = val || '';
    onProjectChange(newProjectId);
    if (!newProjectId) {
      onTaskChange('');
      onActivityChange('');
      lastSearchedIdRef.current = '';
      setLoadedTask(null);
    }
  };

  /// <summary>
  /// Handles user activity selection and caches it as the last activity for the current task.
  /// </summary>
  /// <param name="val">Selected activity ID string.</param>
  const handleActivitySelect = (val: string | null) => {
    const actId = val || '';
    onActivityChange(actId);
    if (taskId && actId) {
      setLastActivityForTask(taskId, actId);
    }
  };

  const projectField = (
    <Select
      label={t('projectLabel')}
      placeholder={isLoadingProjects ? t('loadingProjects') : t('projectPlaceholder')}
      data={projectOptions}
      searchable
      clearable
      withAsterisk={projectRequired}
      value={projectId || null}
      onChange={handleProjectDropdownChange}
      onDropdownOpen={ensureProjectsLoaded}
      onClick={ensureProjectsLoaded}
      nothingFoundMessage={isLoadingProjects ? t('loadingProjects') : t('noProjectsFound')}
      rightSection={isLoadingProjects ? <Loader size="xs" /> : undefined}
      disabled={disabled}
    />
  );

  const taskFields = (
    <Group align="flex-start" wrap="nowrap">
      <TextInput
        label={t('taskIdLabel')}
        placeholder="ID..."
        w={110}
        value={taskId}
        onChange={e => onTaskChange(e.currentTarget.value)}
        onBlur={() => {
          if (taskId) handleQuickLoad(taskId);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (taskId) handleQuickLoad(taskId);
          }
        }}
        disabled={disabled || isLoadingIssue}
        rightSection={isLoadingIssue ? <Loader size="xs" /> : undefined}
      />
      <Select
        label={t('taskNameLabel')}
        placeholder={isLoadingTasks ? t('loadingTasks') : t('searchTasksInputPlaceholder')}
        data={taskOptions}
        searchable
        clearable
        withAsterisk={taskRequired}
        value={taskId || null}
        onChange={handleTaskDropdownSelect}
        disabled={disabled || isLoadingTasks}
        style={{ flex: 1 }}
      />
    </Group>
  );

  const activityField = (
    <Select
      label={t('activityLabel')}
      placeholder={isLoadingActivities ? t('loadingActivities') : t('selectActivityPlaceholder')}
      data={activityOptions}
      withAsterisk={activityRequired}
      value={activityId || null}
      onChange={handleActivitySelect}
      disabled={disabled || isLoadingActivities}
    />
  );

  if (layout === 'stacked') {
    return (
      <Stack gap="md">
        {projectField}
        {taskFields}
        {!hideActivity && activityField}
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {projectField}
      {!hideActivity && activityField}
      {taskFields}
    </Stack>
  );
};
