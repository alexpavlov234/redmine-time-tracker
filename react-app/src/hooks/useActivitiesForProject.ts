import { useState, useEffect } from 'react';
import { getTimeEntryActivities, getProjectActivities } from '../services/redmine';

export interface ActivityOption {
  id: number;
  name: string;
  is_default?: boolean;
}

/**
 * DIP-compliant hook: loads activities for a given project (or global activities if no project).
 * Falls back to global activities if project-specific fetch fails or returns empty.
 */
export const useActivitiesForProject = (projectId: string | null) => {
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchActivities = async () => {
      setIsLoading(true);
      try {
        // Always load global activities first as fallback
        const globalActivities = await getTimeEntryActivities();

        if (!projectId || projectId === 'my_issues') {
          if (!cancelled) setActivities(globalActivities);
          return;
        }

        // Try project-specific activities
        try {
          const projActivities = await getProjectActivities(projectId);
          if (!cancelled) {
            setActivities(projActivities.length > 0 ? projActivities : globalActivities);
          }
        } catch {
          if (!cancelled) setActivities(globalActivities);
        }
      } catch (err) {
        console.error('Failed to load activities:', err);
        if (!cancelled) setActivities([]);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchActivities();
    return () => { cancelled = true; };
  }, [projectId]);

  const defaultActivityId = activities.find(a => a.is_default)?.id
    ?? (activities.length > 0 ? activities[0].id : null);

  return { activities, isLoading, defaultActivityId };
};
