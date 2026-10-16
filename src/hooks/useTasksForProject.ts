import { useState, useEffect } from 'react';
import type { RedmineIssue } from '../types';
import { redmineApiRequest, cacheIssues } from '../services/redmine';

// In-memory cache of open tasks per project ID
const projectTasksCache = new Map<string, RedmineIssue[]>();

/// <summary>
/// DIP-compliant hook: decouples UI components from direct API calls for task fetching,
/// caching project tasks in memory and populating the global issue cache.
/// </summary>
/// <param name="projectId">Selected project ID or 'my_issues'.</param>
/// <returns>Tasks list, loading flag, and error message.</returns>
export const useTasksForProject = (projectId: string | null) => {
  const [tasks, setTasks] = useState<RedmineIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
      return;
    }

    if (projectTasksCache.has(projectId)) {
      setTasks(projectTasksCache.get(projectId)!);
      return;
    }

    let cancelled = false;

    const fetchTasks = async () => {
      setIsLoading(true);
      setError(null);
      try {
        let endpoint: string;
        if (projectId === 'my_issues') {
          endpoint = '/issues.json?assigned_to_id=me&status_id=open&limit=100';
        } else {
          endpoint = `/issues.json?project_id=${projectId}&status_id=open&limit=100`;
        }
        const data = await redmineApiRequest(endpoint);
        const fetched: RedmineIssue[] = data.issues || [];
        cacheIssues(fetched);
        projectTasksCache.set(projectId, fetched);
        if (!cancelled) {
          setTasks(fetched);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error('Failed to load tasks:', err);
          setError(err.message || 'Failed to load tasks');
          setTasks([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchTasks();
    return () => { cancelled = true; };
  }, [projectId]);

  return { tasks, isLoading, error };
};
