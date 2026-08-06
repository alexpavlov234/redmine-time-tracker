import { useState, useEffect } from 'react';
import type { TimeEntry } from '../../../types';
import { getTimeEntries, getIssues } from '../../../services/redmine';
import { useUser } from '../../../contexts/UserContext';

/**
 * DIP-compliant hook: reads userId from UserContext instead of
 * calling getCurrentUser() directly on every fetch.
 */
const monthCache = new Map<string, Record<string, TimeEntry[]>>();

export const useCalendarEntries = (currentMonth: Date) => {
  const { user } = useUser();
  const [entriesByDate, setEntriesByDate] = useState<Record<string, TimeEntry[]>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = async (forceRefetch = false) => {
    if (!user) {
      setEntriesByDate({});
      return;
    }

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const monthKey = `${year}-${month}`;

    if (!forceRefetch && monthCache.has(monthKey)) {
      setEntriesByDate(monthCache.get(monthKey)!);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      const from = formatDate(firstDay);
      const to = formatDate(lastDay);

      const timeEntries = await getTimeEntries({ from, to, user_id: user.id });

      // Fetch missing issue subjects in chunks concurrently
      const issueIdsToFetch = new Set<number>();
      timeEntries.forEach(entry => {
        if (entry.issue && entry.issue.id && !entry.issue.subject) {
          issueIdsToFetch.add(entry.issue.id);
        }
      });

      if (issueIdsToFetch.size > 0) {
        const ids = Array.from(issueIdsToFetch);
        const chunkPromises = [];
        
        for (let i = 0; i < ids.length; i += 20) {
          const chunk = ids.slice(i, i + 20);
          chunkPromises.push(
            getIssues(chunk).catch(e => {
              console.error('Failed to fetch issue chunk:', e);
              return [];
            })
          );
        }
        
        const chunks = await Promise.all(chunkPromises);
        const issues = chunks.flat();
        
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
      }

      // Group by date
      const grouped: Record<string, TimeEntry[]> = {};
      timeEntries.forEach(entry => {
        if (!grouped[entry.spent_on]) {
          grouped[entry.spent_on] = [];
        }
        grouped[entry.spent_on].push(entry);
      });

      monthCache.set(monthKey, grouped);
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

  return { entriesByDate, isLoading, error, refetch: () => fetchEntries(true) };
};

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
