import React, { createContext, useContext, useState, useEffect } from 'react';
import type { RedmineIssue, RedmineProject, IssueStatus } from '../types';
import { redmineApiRequest } from '../services/redmine';

interface RedmineContextProps {
  apiKey: string;
  redmineUrl: string;
  setApiKey: (key: string) => void;
  setRedmineUrl: (url: string) => void;
  allProjects: RedmineProject[];
  allTasks: RedmineIssue[];
  issueStatuses: IssueStatus[];
  setAllProjects: (projects: RedmineProject[]) => void;
  setAllTasks: (tasks: RedmineIssue[]) => void;
  setIssueStatuses: (statuses: IssueStatus[]) => void;
  isConfigured: boolean;
}

const RedmineContext = createContext<RedmineContextProps | undefined>(undefined);

export const RedmineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [apiKey, setApiKeyState] = useState<string>(() => localStorage.getItem('redmineApiKey') || '');
  const [redmineUrl, setRedmineUrlState] = useState<string>(() => localStorage.getItem('redmineUrl') || '');

  const [allProjects, setAllProjects] = useState<RedmineProject[]>([]);
  const [allTasks, setAllTasks] = useState<RedmineIssue[]>([]);
  const [issueStatuses, setIssueStatuses] = useState<IssueStatus[]>([]);

  const setApiKey = (key: string) => {
    localStorage.setItem('redmineApiKey', key);
    setApiKeyState(key);
  };

  const setRedmineUrl = (url: string) => {
    localStorage.setItem('redmineUrl', url);
    setRedmineUrlState(url);
  };

  const isConfigured = Boolean(apiKey && redmineUrl);

  useEffect(() => {
    if (isConfigured && allProjects.length === 0) {
      const fetchProjects = async () => {
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
          console.error("Failed to fetch all projects", err);
        }
      };

      fetchProjects();
    }
  }, [isConfigured]);

  return (
    <RedmineContext.Provider
      value={{
        apiKey,
        redmineUrl,
        setApiKey,
        setRedmineUrl,
        allProjects,
        allTasks,
        issueStatuses,
        setAllProjects,
        setAllTasks,
        setIssueStatuses,
        isConfigured,
      }}
    >
      {children}
    </RedmineContext.Provider>
  );
};

export const useRedmine = () => {
  const context = useContext(RedmineContext);
  if (!context) {
    throw new Error('useRedmine must be used within a RedmineProvider');
  }
  return context;
};
