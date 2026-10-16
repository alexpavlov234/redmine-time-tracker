/// <summary>
/// Given a number of seconds, formats it as HH:mm:ss.
/// </summary>
/// <param name="totalSeconds">Total elapsed time in seconds.</param>
/// <returns>Formatted time string in HH:mm:ss format.</returns>
export function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

/// <summary>
/// Normalizes and cleans a task or issue ID by trimming whitespace and removing leading hashes (#).
/// </summary>
/// <param name="taskId">The raw task ID (string, number, or null/undefined).</param>
/// <returns>Sanitized task ID string, or an empty string if null/empty.</returns>
export function cleanTaskId(taskId: string | number | undefined | null): string {
  if (taskId === undefined || taskId === null) return '';
  return taskId.toString().replace(/^#/, '').trim();
}

/// <summary>
/// Formats key-value custom field records into Redmine API payload objects with non-empty values.
/// </summary>
/// <param name="customFieldValues">Record mapping custom field IDs to their string or number values.</param>
/// <returns>Array of Redmine custom field payload objects ready for API submission.</returns>
export function formatCustomFieldsPayload(
  customFieldValues: Record<string | number, string | number | undefined | null>
): Array<{ id: number; value: string | number }> {
  return Object.entries(customFieldValues)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([id, value]) => ({
      id: parseInt(id, 10),
      value: value as string | number,
    }));
}
