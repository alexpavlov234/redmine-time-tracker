import { useState, useEffect } from 'react';
import { getTimeEntryActivities, getProjectActivities } from '../services/redmine';

export interface ActivityOption {
  id: number;
  name: string;
  is_default?: boolean;
}

/// <summary>
/// DIP-compliant hook: loads activities for a given project (or global activities if no project).
/// Fetches project-specific activities first when a project is selected, falling back to global activities only if needed.
/// </summary>
/// <param name="projectId">Selected project ID or null.</param>
/// <param name="enabled">Whether activity fetching is enabled (default true).</param>
/// <returns>Loaded activities, loading flag, and default activity ID.</returns>
export const useActivitiesForProject = (projectId: string | null, enabled: boolean = true) => {
  const [activities, setActivities] = useState<ActivityOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const fetchActivities = async () => {
      setIsLoading(true);
      try {
        if (projectId && projectId !== 'my_issues') {
          try {
            const projActivities = await getProjectActivities(projectId);
            if (projActivities.length > 0) {
              if (!cancelled) setActivities(projActivities);
              return;
            }
          } catch {
            // Fall through to global activities fallback
          }
        }

        const globalActivities = await getTimeEntryActivities();
        if (!cancelled) {
          setActivities(globalActivities);
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
  }, [projectId, enabled]);

  const defaultActivityId = activities.find(a => a.is_default)?.id
    ?? (activities.length > 0 ? activities[0].id : null);

  return { activities, isLoading, defaultActivityId };
};
