import { useState, useEffect } from 'react';
import type { TimeEntry } from '../../../types';
import { getTimeEntries, getIssues } from '../../../services/redmine';
import { useUser } from '../../../contexts/UserContext';

/**
 * DIP-compliant hook: reads userId from UserContext instead of
 * calling getCurrentUser() directly on every fetch.
 */
export const useCalendarEntries = (currentMonth: Date) => {
  const { user } = useUser();
  const [entriesByDate, setEntriesByDate] = useState<Record<string, TimeEntry[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = async () => {
    if (!user) {
      setEntriesByDate({});
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      const from = formatDate(firstDay);
      const to = formatDate(lastDay);

      const timeEntries = await getTimeEntries({ from, to, user_id: user.id });

      // Fetch missing issue subjects in chunks
      const issueIdsToFetch = new Set<number>();
      timeEntries.forEach(entry => {
        if (entry.issue && entry.issue.id && !entry.issue.subject) {
          issueIdsToFetch.add(entry.issue.id);
        }
      });

      if (issueIdsToFetch.size > 0) {
        const ids = Array.from(issueIdsToFetch);
        for (let i = 0; i < ids.length; i += 20) {
          const chunk = ids.slice(i, i + 20);
          try {
            const issues = await getIssues(chunk);
            issues.forEach((issue: any) => {
              timeEntries.forEach(entry => {
                if (entry.issue && entry.issue.id === issue.id) {
                  entry.issue.subject = issue.subject;
                  if (!entry.project && issue.project) {
                    entry.project = issue.project;
                  }
                }
              });
            });
          } catch (e) {
            console.error('Failed to fetch issue chunk:', e);
          }
        }
      }

      // Group by date
      const grouped: Record<string, TimeEntry[]> = {};
      timeEntries.forEach(entry => {
        if (!grouped[entry.spent_on]) {
          grouped[entry.spent_on] = [];
        }
        grouped[entry.spent_on].push(entry);
      });

      setEntriesByDate(grouped);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch calendar entries');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [currentMonth, user?.id]);

  return { entriesByDate, isLoading, error, refetch: fetchEntries };
};

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
