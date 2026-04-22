import React, { createContext, useContext, useState, useEffect } from 'react';
import type { RedmineProject, RedmineIssue, IssueStatus } from '../types';
import { redmineApiRequest } from '../services/redmine';
import { useSettings } from './SettingsContext';

interface ProjectsContextProps {
  allProjects: RedmineProject[];
  issueStatuses: IssueStatus[];
  isLoadingProjects: boolean;
  setIssueStatuses: (statuses: IssueStatus[]) => void;
  refetchProjects: () => void;
}

const ProjectsContext = createContext<ProjectsContextProps | undefined>(undefined);

export const ProjectsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConfigured, settingsVersion } = useSettings();
  const [allProjects, setAllProjects] = useState<RedmineProject[]>([]);
  const [issueStatuses, setIssueStatuses] = useState<IssueStatus[]>([]);
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
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  // Refetch when settings change
  useEffect(() => {
    if (isConfigured) {
      fetchProjects();
    } else {
      setAllProjects([]);
      setIssueStatuses([]);
    }
  }, [isConfigured, settingsVersion]);

  return (
    <ProjectsContext.Provider
      value={{
        allProjects,
        issueStatuses,
        isLoadingProjects,
        setIssueStatuses,
        refetchProjects: fetchProjects,
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
