import React, { createContext, useContext, useState, useEffect } from 'react';
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
  /// <summary>Updates issue statuses in context.</summary>
  setIssueStatuses: (statuses: IssueStatus[]) => void;
  /// <summary>Refetches all projects from Redmine.</summary>
  refetchProjects: () => void;
  /// <summary>Refetches recently used projects from Redmine time entries.</summary>
  refreshRecentProjects: () => Promise<void>;
  /// <summary>Builds grouped Mantine Select options with Recently Used projects on top.</summary>
  getProjectSelectData: (includeMyIssues?: boolean) => ComboboxData;
}

const ProjectsContext = createContext<ProjectsContextProps | undefined>(undefined);

export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConfigured, settingsVersion } = useSettings();
  const [allProjects, setAllProjects] = useState<RedmineProject[]>([]);
  const [issueStatuses, setIssueStatuses] = useState<IssueStatus[]>([]);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);

  const fetchProjects = async () => {
    if (!isConfigured) {
      setAllProjects([]);
      return;
    }
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

      // Also fetch issue statuses globally
      try {
        const statusesResp = await redmineApiRequest('/issue_statuses.json');
        if (Array.isArray(statusesResp.issue_statuses)) {
          setIssueStatuses(statusesResp.issue_statuses);
        }
      } catch (e) {
        console.error('Failed to fetch issue statuses:', e);
      }
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  const fetchRecentProjects = async () => {
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
  };

  /// <summary>
  /// Builds Mantine ComboboxData with optional 'my_issues' and grouped Recently Used vs All Projects.
  /// </summary>
  /// <param name="includeMyIssues">Whether to include the special 'my_issues' option at the top.</param>
  /// <returns>Grouped ComboboxData for Mantine Select.</returns>
  const getProjectSelectData = (includeMyIssues = false): ComboboxData => {
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
  };

  // Refetch when settings change
  useEffect(() => {
    if (isConfigured) {
      fetchProjects();
      fetchRecentProjects();
    } else {
      setAllProjects([]);
      setIssueStatuses([]);
      setRecentProjectIds([]);
    }
  }, [isConfigured, settingsVersion]);

  return (
    <ProjectsContext.Provider
      value={{
        allProjects,
        issueStatuses,
        recentProjectIds,
        isLoadingProjects,
        setIssueStatuses,
        refetchProjects: fetchProjects,
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
