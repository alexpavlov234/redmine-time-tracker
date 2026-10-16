import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ComboboxData, ComboboxItem, ComboboxItemGroup } from '@mantine/core';
import type { RedmineProject, IssueStatus } from '../types';
import { redmineApiRequest } from '../services/redmine';
import { useSettings } from './SettingsContext';

/// <summary>
/// Properties exposed by the ProjectsContext.
/// </summary>
interface ProjectsContextProps {
  /// <summary>List of all available Redmine projects.</summary>
  allProjects: RedmineProject[];
  /// <summary>List of issue statuses configured in Redmine.</summary>
  issueStatuses: IssueStatus[];
  /// <summary>List of project IDs recently used by the current user.</summary>
  recentProjectIds: string[];
  /// <summary>Whether projects are currently being fetched.</summary>
  isLoadingProjects: boolean;
  /// <summary>Whether projects have already been fetched in the current session.</summary>
  hasLoadedProjects: boolean;
  /// <summary>Updates issue statuses in context.</summary>
  setIssueStatuses: (statuses: IssueStatus[]) => void;
  /// <summary>Ensures projects and recent projects are loaded on demand (e.g. when opening a project dropdown).</summary>
  ensureProjectsLoaded: () => Promise<void>;
  /// <summary>Ensures issue statuses are loaded on demand.</summary>
  ensureStatusesLoaded: () => Promise<void>;
  /// <summary>Forces a refetch of all projects from Redmine.</summary>
  refetchProjects: () => Promise<void>;
  /// <summary>Refetches recently used projects from Redmine time entries.</summary>
  refreshRecentProjects: () => Promise<void>;
  /// <summary>Builds grouped Mantine Select options with Recently Used projects on top.</summary>
  getProjectSelectData: (includeMyIssues?: boolean) => ComboboxData;
}

const ProjectsContext = createContext<ProjectsContextProps | undefined>(undefined);

/// <summary>
/// Context provider that manages Redmine projects, recent project history, and issue statuses with on-demand lazy loading.
/// </summary>
export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConfigured, settingsVersion } = useSettings();
  const [allProjects, setAllProjects] = useState<RedmineProject[]>([]);
  const [issueStatuses, setIssueStatuses] = useState<IssueStatus[]>([]);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [hasLoadedProjects, setHasLoadedProjects] = useState(false);

  const hasLoadedProjectsRef = useRef(false);
  const inFlightProjectsRef = useRef<Promise<void> | null>(null);
  const hasLoadedStatusesRef = useRef(false);
  const inFlightStatusesRef = useRef<Promise<void> | null>(null);

  /// <summary>
  /// Fetches recently used project IDs from the user's latest time entries.
  /// </summary>
  const fetchRecentProjects = useCallback(async () => {
    if (!isConfigured) {
      setRecentProjectIds([]);
      return;
    }
    try {
      const data = await redmineApiRequest('/time_entries.json?user_id=me&limit=50');
      const entries = data.time_entries || [];
      const orderedIds: string[] = [];
      entries.forEach((e: any) => {
        const pid = e.project?.id?.toString();
        if (pid && !orderedIds.includes(pid)) {
          orderedIds.push(pid);
        }
      });
      setRecentProjectIds(orderedIds);
    } catch {
      // Ignore recent project load errors gracefully
    }
  }, [isConfigured]);

  /// <summary>
  /// Fetches all Redmine projects with pagination.
  /// </summary>
  /// <param name="force">Whether to bypass the loaded check and force a fresh fetch.</param>
  const loadProjectsInternal = useCallback(async (force = false) => {
    if (!isConfigured) {
      setAllProjects([]);
      setHasLoadedProjects(false);
      hasLoadedProjectsRef.current = false;
      return;
    }

    if (!force && hasLoadedProjectsRef.current) {
      return;
    }

    if (inFlightProjectsRef.current) {
      return inFlightProjectsRef.current;
    }

    const promise = (async () => {
      setIsLoadingProjects(true);
      try {
        const collected: RedmineProject[] = [];
        let offset = 0;
        const limit = 100;
        let totalCount = Infinity;

        while (collected.length < totalCount) {
          const page = await redmineApiRequest(`/projects.json?limit=${limit}&offset=${offset}`);
          const pageProjects = Array.isArray(page.projects) ? page.projects : [];
          totalCount = typeof page.total_count === 'number' ? page.total_count : pageProjects.length;
          collected.push(...pageProjects);
          if (pageProjects.length === 0) break;
          offset += pageProjects.length;
        }

        setAllProjects(collected);
        hasLoadedProjectsRef.current = true;
        setHasLoadedProjects(true);

        await fetchRecentProjects();
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setIsLoadingProjects(false);
        inFlightProjectsRef.current = null;
      }
    })();

    inFlightProjectsRef.current = promise;
    return promise;
  }, [isConfigured, fetchRecentProjects]);

  /// <summary>
  /// Ensures projects are loaded on demand (e.g., when the user clicks a project dropdown).
  /// </summary>
  const ensureProjectsLoaded = useCallback(async () => {
    return loadProjectsInternal(false);
  }, [loadProjectsInternal]);

  /// <summary>
  /// Forces a fresh reload of projects from Redmine.
  /// </summary>
  const refetchProjects = useCallback(async () => {
    return loadProjectsInternal(true);
  }, [loadProjectsInternal]);

  /// <summary>
  /// Ensures issue statuses are loaded on demand.
  /// </summary>
  const ensureStatusesLoaded = useCallback(async () => {
    if (!isConfigured || hasLoadedStatusesRef.current) {
      return;
    }
    if (inFlightStatusesRef.current) {
      return inFlightStatusesRef.current;
    }
    const promise = (async () => {
      try {
        const statusesResp = await redmineApiRequest('/issue_statuses.json');
        if (Array.isArray(statusesResp.issue_statuses)) {
          setIssueStatuses(statusesResp.issue_statuses);
          hasLoadedStatusesRef.current = true;
        }
      } catch (e) {
        console.error('Failed to fetch issue statuses:', e);
      } finally {
        inFlightStatusesRef.current = null;
      }
    })();
    inFlightStatusesRef.current = promise;
    return promise;
  }, [isConfigured]);

  /// <summary>
  /// Builds Mantine ComboboxData with optional 'my_issues' and grouped Recently Used vs All Projects.
  /// </summary>
  /// <param name="includeMyIssues">Whether to include the special 'my_issues' option at the top.</param>
  /// <returns>Grouped ComboboxData for Mantine Select.</returns>
  const getProjectSelectData = useCallback((includeMyIssues = false): ComboboxData => {
    const items: (ComboboxItem | ComboboxItemGroup<ComboboxItem>)[] = [];

    if (includeMyIssues) {
      items.push({ value: 'my_issues', label: '--- My Assigned Issues ---' });
    }

    if (recentProjectIds.length > 0) {
      const recentSet = new Set(recentProjectIds);
      const recentProjects = recentProjectIds
        .map(id => allProjects.find(p => p.id.toString() === id))
        .filter((p): p is RedmineProject => Boolean(p));

      const otherProjects = allProjects.filter(p => !recentSet.has(p.id.toString()));

      if (recentProjects.length > 0) {
        items.push({
          group: 'Recently Used',
          items: recentProjects.map(p => ({ value: p.id.toString(), label: p.name })),
        });
      }

      items.push({
        group: 'All Projects',
        items: otherProjects.map(p => ({ value: p.id.toString(), label: p.name })),
      });
    } else {
      items.push(...allProjects.map(p => ({ value: p.id.toString(), label: p.name })));
    }

    return items;
  }, [allProjects, recentProjectIds]);

  // Reset cached state when settings change; actual fetching happens lazily on user interaction
  useEffect(() => {
    setAllProjects([]);
    setIssueStatuses([]);
    setRecentProjectIds([]);
    setHasLoadedProjects(false);
    hasLoadedProjectsRef.current = false;
    hasLoadedStatusesRef.current = false;
    inFlightProjectsRef.current = null;
    inFlightStatusesRef.current = null;
  }, [isConfigured, settingsVersion]);

  return (
    <ProjectsContext.Provider
      value={{
        allProjects,
        issueStatuses,
        recentProjectIds,
        isLoadingProjects,
        hasLoadedProjects,
        setIssueStatuses,
        ensureProjectsLoaded,
        ensureStatusesLoaded,
        refetchProjects,
        refreshRecentProjects: fetchRecentProjects,
        getProjectSelectData,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
};

export const useProjects = () => {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return context;
};
