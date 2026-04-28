import { useState, useEffect } from 'react';
import type { RedmineIssue } from '../types';
import { redmineApiRequest } from '../services/redmine';

/**
 * DIP-compliant hook: decouples UI components from direct API calls for task fetching.
 * Replaces inline useEffect + redmineApiRequest patterns in AddTaskForm, BulkLogForm, etc.
 */
export const useTasksForProject = (projectId: string | null) => {
  const [tasks, setTasks] = useState<RedmineIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setTasks([]);
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
        if (!cancelled) {
          setTasks(data.issues || []);
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
