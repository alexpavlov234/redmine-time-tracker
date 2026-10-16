import { redmineApiRequest, getIssues } from './redmine';
import type { TimeEntry } from '../types';
import type {
  RedmineProjectFull,
  RedmineProjectMembership,
  ProjectBudgetMetadata,
  ProjectBudgetStats,
  TaskTimeSummary,
  MemberTimeSummary,
  ClientExportConfig,
  ExportLanguage,
} from '../types/pm';

// In-memory caches for PM dashboard data to avoid redundant server load
let cachedMemberships: RedmineProjectMembership[] | null = null;
const projectDetailsCache = new Map<string, RedmineProjectFull>();
const projectEntriesCache = new Map<string, TimeEntry[]>();

/// <summary>
/// Fetches current user information along with their project memberships and roles, with in-memory caching.
/// </summary>
/// <param name="forceRefresh">Whether to bypass the in-memory cache.</param>
/// <returns>Array of project memberships for current user.</returns>
export async function getUserMemberships(forceRefresh = false): Promise<RedmineProjectMembership[]> {
  if (!forceRefresh && cachedMemberships !== null) {
    return cachedMemberships;
  }
  try {
    const response = await redmineApiRequest('/users/current.json?include=memberships');
    const memberships = response.user?.memberships;
    cachedMemberships = Array.isArray(memberships) ? memberships : [];
    return cachedMemberships;
  } catch (error) {
    console.error('Failed to fetch user memberships:', error);
    return [];
  }
}

/// <summary>
/// Determines whether a project membership indicates the user is a Project Manager.
/// </summary>
/// <param name="membership">Redmine project membership record.</param>
/// <param name="currentUserId">Current user ID to compare against responsible field if present.</param>
/// <param name="responsibleUserId">Responsible user ID from project custom fields.</param>
/// <returns>True if user has PM/Lead role or is assigned as responsible person.</returns>
export function isUserProjectManager(
  membership?: RedmineProjectMembership,
  currentUserId?: number,
  responsibleUserId?: string
): boolean {
  if (currentUserId && responsibleUserId && String(currentUserId) === String(responsibleUserId).trim()) {
    return true;
  }

  if (!membership?.roles) return false;

  const pmRegex = /(ръководител|manager|pm|lead|администратор|управ|owner)/i;
  return membership.roles.some(role => pmRegex.test(role.name || ''));
}

/// <summary>
/// Fetches detailed project information from Redmine including all custom fields, with in-memory caching.
/// </summary>
/// <param name="projectId">Numeric or slug identifier of the project.</param>
/// <param name="forceRefresh">Whether to bypass the in-memory cache.</param>
/// <returns>Full project data or null if not found.</returns>
export async function getProjectDetails(projectId: number | string, forceRefresh = false): Promise<RedmineProjectFull | null> {
  const key = String(projectId);
  if (!forceRefresh && projectDetailsCache.has(key)) {
    return projectDetailsCache.get(key)!;
  }
  try {
    const response = await redmineApiRequest(`/projects/${projectId}.json?include=custom_fields,trackers`);
    const proj = response.project || null;
    if (proj) {
      projectDetailsCache.set(key, proj);
    }
    return proj;
  } catch (error) {
    console.error(`Failed to fetch project details for ${projectId}:`, error);
    return null;
  }
}

/// <summary>
/// Extracts structured budget, dates, and client information from Redmine project custom fields.
/// </summary>
/// <param name="project">Full project object with custom fields.</param>
/// <returns>Structured ProjectBudgetMetadata.</returns>
export function extractBudgetMetadata(project: RedmineProjectFull | null): ProjectBudgetMetadata {
  const metadata: ProjectBudgetMetadata = {
    budget1Estimate: 0,
    budget2Contract: 0,
    budget3Profitability: 0,
    clientName: '',
    startDate: '',
    contractEndDate: '',
    targetEndDate: '',
    contractType: '',
    billingInfo: '',
    responsibleUserId: undefined,
  };

  if (!project?.custom_fields || !Array.isArray(project.custom_fields)) {
    return metadata;
  }

  for (const field of project.custom_fields) {
    const name = (field.name || '').trim().toLowerCase();
    const rawVal = field.value;

    if (!rawVal && rawVal !== 0) continue;

    // Budget 1: Експертна оценка
    if (field.id === 16 || name.includes('бюджет 1') || (name.includes('бюджет') && name.includes('оценка'))) {
      const num = parseFloat(String(rawVal));
      if (!isNaN(num)) metadata.budget1Estimate = num;
    }
    // Budget 2: по Договор (основен) - require both 'бюджет' and 'договор' or id: 17 so date fields don't match
    else if (field.id === 17 || name.includes('бюджет 2') || (name.includes('бюджет') && name.includes('договор'))) {
      const num = parseFloat(String(rawVal));
      if (!isNaN(num)) metadata.budget2Contract = num;
    }
    // Budget 3: праг Рентабилност
    else if (field.id === 18 || name.includes('бюджет 3') || (name.includes('бюджет') && name.includes('рентабилност'))) {
      const num = parseFloat(String(rawVal));
      if (!isNaN(num)) metadata.budget3Profitability = num;
    }
    // Client Name
    else if (field.id === 7 || name === 'клиент' || name === 'client') {
      metadata.clientName = String(rawVal).trim();
    }
    // Responsible user ID
    else if (field.id === 27 || name === 'отговорник' || name === 'manager') {
      metadata.responsibleUserId = String(rawVal).trim();
    }
    // Start date
    else if (field.id === 19 || name.includes('начална дата')) {
      metadata.startDate = String(rawVal).trim();
    }
    // Contract end date
    else if (field.id === 20 || name.includes('крайна дата по договор')) {
      metadata.contractEndDate = String(rawVal).trim();
    }
    // Target end date
    else if (field.id === 21 || name.includes('целева крайна дата')) {
      metadata.targetEndDate = String(rawVal).trim();
    }
    // Contract / Project type (detect Umbrella projects)
    else if (field.id === 35 || name.includes('тип договор') || field.id === 13 || name.includes('тип на проекта')) {
      const str = String(rawVal).trim();
      if (str.toLowerCase().includes('umbrella')) {
        metadata.isUmbrella = true;
      }
      if (field.id === 35 || name.includes('тип договор')) {
        metadata.contractType = str;
      }
    }
    // Billing info
    else if (field.id === 31 || name.includes('информация за фактуриране')) {
      metadata.billingInfo = String(rawVal).trim();
    }
  }

  return metadata;
}

/// <summary>
/// Retrieves all time entries for a project with automated pagination, enriches them with issue subjects, and caches the result in memory.
/// </summary>
/// <param name="projectId">ID of project.</param>
/// <param name="fromDate">Optional start date (YYYY-MM-DD).</param>
/// <param name="toDate">Optional end date (YYYY-MM-DD).</param>
/// <param name="forceRefresh">Whether to bypass the in-memory cache.</param>
/// <returns>Complete list of time entries for the project in the specified range with issue subjects populated.</returns>
export async function getAllProjectTimeEntries(
  projectId: number | string,
  fromDate?: string,
  toDate?: string,
  forceRefresh = false
): Promise<TimeEntry[]> {
  if (!projectId) return [];

  const cacheKey = `${projectId}_${fromDate || ''}_${toDate || ''}`;
  if (!forceRefresh && projectEntriesCache.has(cacheKey)) {
    return projectEntriesCache.get(cacheKey)!;
  }

  const allEntries: TimeEntry[] = [];
  const limit = 100;
  let offset = 0;
  let totalCount = Infinity;

  let queryParams = `project_id=${projectId}&subproject_id=!*&limit=${limit}&include=custom_fields`;
  if (fromDate) queryParams += `&from=${fromDate}`;
  if (toDate) queryParams += `&to=${toDate}`;

  try {
    while (allEntries.length < totalCount) {
      const url = `/time_entries.json?${queryParams}&offset=${offset}`;
      const response = await redmineApiRequest(url);
      const entries: TimeEntry[] = Array.isArray(response.time_entries) ? response.time_entries : [];

      totalCount = typeof response.total_count === 'number' ? response.total_count : entries.length;
      allEntries.push(...entries);

      if (entries.length === 0 || allEntries.length >= totalCount) {
        break;
      }

      offset += entries.length;
    }
  } catch (error) {
    console.error(`Failed to fetch time entries for project ${projectId}:`, error);
  }

  // Enrich time entries with issue subjects and parent tasks
  const issueIds = Array.from(
    new Set(
      allEntries
        .map(e => e.issue?.id)
        .filter((id): id is number => typeof id === 'number' && id > 0)
    )
  );

  if (issueIds.length > 0) {
    try {
      const issues = await getIssues(issueIds, true);
      const issueMap = new Map<number, typeof issues[0]>();
      for (const issue of issues) {
        if (issue && issue.id) {
          issueMap.set(issue.id, issue);
        }
      }

      for (const entry of allEntries) {
        if (entry.issue?.id) {
          const issueObj = issueMap.get(entry.issue.id);
          if (issueObj) {
            if (issueObj.subject) {
              entry.issue.subject = issueObj.subject;
            }
            if (issueObj.parent?.id) {
              entry.issue.parent = {
                id: issueObj.parent.id,
                subject: issueObj.parent.subject,
              };
            }
          }
        }
      }
    } catch (err) {
      console.warn('Failed to populate issue subjects and parents for time entries:', err);
    }
  }

  projectEntriesCache.set(cacheKey, allEntries);
  return allEntries;
}

/// <summary>
/// Computes budget progress, burn rate, and health indicators from time entries and target hours.
/// </summary>
/// <param name="timeEntries">All project time entries.</param>
/// <param name="targetHours">Active budget target in hours.</param>
/// <returns>Computed ProjectBudgetStats.</returns>
export function calculateBudgetStats(timeEntries: TimeEntry[], targetHours: number): ProjectBudgetStats {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevYear = prevMonthDate.getFullYear();
  const prevMonth = prevMonthDate.getMonth();

  let totalSpentHours = 0;
  let totalBillableHours = 0;
  let spentThisMonth = 0;
  let spentLastMonth = 0;

  // Track timestamps for weekly burn rate over last 28 days
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);
  let spentLast4Weeks = 0;

  for (const entry of timeEntries) {
    const hours = Number(entry.hours) || 0;
    totalSpentHours += hours;

    // Check billable status
    const isBillable = entry.custom_fields?.some(
      cf => (cf.name?.toLowerCase().includes('billable') || cf.id === 4) && (cf.value === '1' || cf.value === 'true')
    );
    if (isBillable || !entry.custom_fields || entry.custom_fields.length === 0) {
      // Treat as billable if marked or default
      totalBillableHours += hours;
    }

    if (entry.spent_on) {
      const entryDate = new Date(entry.spent_on);
      const eYear = entryDate.getFullYear();
      const eMonth = entryDate.getMonth();

      if (eYear === currentYear && eMonth === currentMonth) {
        spentThisMonth += hours;
      } else if (eYear === prevYear && eMonth === prevMonth) {
        spentLastMonth += hours;
      }

      if (entryDate >= twentyEightDaysAgo) {
        spentLast4Weeks += hours;
      }
    }
  }

  // Weekly burn rate (average over last 4 weeks)
  const weeklyBurnRate = Math.round((spentLast4Weeks / 4) * 10) / 10;

  const validTarget = targetHours > 0 ? targetHours : 0;
  const remainingHours = validTarget > 0 ? Math.round((validTarget - totalSpentHours) * 100) / 100 : 0;
  const percentageUsed = validTarget > 0 ? Math.round((totalSpentHours / validTarget) * 1000) / 10 : 0;

  let healthStatus: 'on_track' | 'warning' | 'over_budget' = 'on_track';
  if (validTarget > 0) {
    if (percentageUsed >= 95) {
      healthStatus = 'over_budget';
    } else if (percentageUsed >= 75) {
      healthStatus = 'warning';
    }
  }

  return {
    targetHours: validTarget,
    totalSpentHours: Math.round(totalSpentHours * 100) / 100,
    totalBillableHours: Math.round(totalBillableHours * 100) / 100,
    remainingHours,
    percentageUsed,
    spentThisMonth: Math.round(spentThisMonth * 100) / 100,
    spentLastMonth: Math.round(spentLastMonth * 100) / 100,
    weeklyBurnRate,
    healthStatus,
  };
}

/// <summary>
/// Groups a list of time entries by issue/task for structured presentation and export.
/// Automatically detects parent tasks and groups child tasks under their respective parent task.
/// </summary>
/// <param name="entries">Time entries to aggregate.</param>
/// <param name="hierarchical">Whether to group child tasks under their parent tasks (default true).</param>
/// <returns>Array of task summaries sorted by highest spent hours.</returns>
export function groupEntriesByTask(entries: TimeEntry[], hierarchical: boolean = true): TaskTimeSummary[] {
  const map = new Map<number, TaskTimeSummary>();
  const noTaskKey = 0;

  for (const entry of entries) {
    const issueId = entry.issue?.id || noTaskKey;
    const subject = entry.issue?.subject || (issueId === 0 ? 'Обща дейност / General work' : `#${issueId}`);
    const hours = Number(entry.hours) || 0;

    const isBillable = entry.custom_fields?.some(
      cf => (cf.name?.toLowerCase().includes('billable') || cf.id === 4) && (cf.value === '1' || cf.value === 'true')
    );

    let item = map.get(issueId);
    if (!item) {
      item = {
        issueId,
        subject,
        totalHours: 0,
        billableHours: 0,
        directHours: 0,
        directBillableHours: 0,
        activities: [],
        comments: [],
        members: [],
        entryIds: [],
        directEntryIds: [],
        entries: [],
        directEntries: [],
        parent: entry.issue?.parent ? {
          id: entry.issue.parent.id,
          subject: entry.issue.parent.subject,
        } : undefined,
      };
      map.set(issueId, item);
    } else if (!item.parent && entry.issue?.parent) {
      item.parent = {
        id: entry.issue.parent.id,
        subject: entry.issue.parent.subject,
      };
    }

    item.entryIds?.push(entry.id);
    item.directEntryIds?.push(entry.id);
    item.entries?.push(entry);
    item.directEntries?.push(entry);
    item.totalHours += hours;
    item.directHours = (item.directHours || 0) + hours;

    if (isBillable || !entry.custom_fields || entry.custom_fields.length === 0) {
      item.billableHours += hours;
      item.directBillableHours = (item.directBillableHours || 0) + hours;
    }

    const activityName = entry.activity?.name;
    if (activityName && !item.activities.includes(activityName)) {
      item.activities.push(activityName);
    }

    const comment = (entry.comments || '').trim();
    if (comment && !item.comments.includes(comment)) {
      item.comments.push(comment);
    }

    const userName = entry.user?.name;
    if (userName && !item.members.includes(userName)) {
      item.members.push(userName);
    }
  }

  // Sort sub-entries chronologically within each task
  for (const item of map.values()) {
    item.totalHours = Math.round(item.totalHours * 100) / 100;
    item.billableHours = Math.round(item.billableHours * 100) / 100;
    item.directHours = Math.round((item.directHours || 0) * 100) / 100;
    item.directBillableHours = Math.round((item.directBillableHours || 0) * 100) / 100;

    if (item.entries) {
      item.entries.sort((a, b) => (a.spent_on || '').localeCompare(b.spent_on || ''));
    }
    if (item.directEntries) {
      item.directEntries.sort((a, b) => (a.spent_on || '').localeCompare(b.spent_on || ''));
    }
  }

  if (!hierarchical) {
    return Array.from(map.values()).sort((a, b) => b.totalHours - a.totalHours);
  }

  // Detect parent tasks and assemble hierarchy
  const parentsMap = new Map<number, TaskTimeSummary>();
  const childIds = new Set<number>();

  for (const item of map.values()) {
    if (item.parent && item.parent.id > 0 && item.parent.id !== item.issueId) {
      const pId = item.parent.id;
      childIds.add(item.issueId);

      let parentSummary = map.get(pId) || parentsMap.get(pId);
      if (!parentSummary) {
        parentSummary = {
          issueId: pId,
          subject: item.parent.subject || `#${pId}`,
          totalHours: 0,
          billableHours: 0,
          directHours: 0,
          directBillableHours: 0,
          activities: [],
          comments: [],
          members: [],
          entryIds: [],
          directEntryIds: [],
          entries: [],
          directEntries: [],
          isParent: true,
          children: [],
        };
        parentsMap.set(pId, parentSummary);
      } else {
        parentSummary.isParent = true;
        if (!parentSummary.children) {
          parentSummary.children = [];
        }
        if (item.parent.subject && (!parentSummary.subject || parentSummary.subject === `#${parentSummary.issueId}`)) {
          parentSummary.subject = item.parent.subject;
        }
      }

      if (!parentSummary.children!.some(c => c.issueId === item.issueId)) {
        parentSummary.children!.push(item);
      }
    }
  }

  // Aggregate children into parent summaries
  const allParents = new Set<TaskTimeSummary>([
    ...parentsMap.values(),
    ...Array.from(map.values()).filter(t => t.isParent && t.children && t.children.length > 0),
  ]);

  for (const parent of allParents) {
    // Sort children by total hours descending
    parent.children?.sort((a, b) => b.totalHours - a.totalHours);

    let childHours = 0;
    let childBillable = 0;
    const combinedEntryIds = new Set<number>(parent.directEntryIds || []);
    const combinedActivities = new Set<string>(parent.activities);
    const combinedMembers = new Set<string>(parent.members);
    const combinedComments = new Set<string>(parent.comments);

    for (const child of parent.children || []) {
      childHours += child.totalHours;
      childBillable += child.billableHours;
      child.entryIds?.forEach(id => combinedEntryIds.add(id));
      child.activities.forEach(a => combinedActivities.add(a));
      child.members.forEach(m => combinedMembers.add(m));
      child.comments.forEach(c => combinedComments.add(c));
    }

    parent.totalHours = Math.round(((parent.directHours || 0) + childHours) * 100) / 100;
    parent.billableHours = Math.round(((parent.directBillableHours || 0) + childBillable) * 100) / 100;
    parent.entryIds = Array.from(combinedEntryIds);
    parent.activities = Array.from(combinedActivities);
    parent.members = Array.from(combinedMembers);
    parent.comments = Array.from(combinedComments);
  }

  // Build top-level list
  const topLevelList: TaskTimeSummary[] = [];

  // 1. Add all synthetic parents from parentsMap
  for (const parent of parentsMap.values()) {
    topLevelList.push(parent);
  }

  // 2. Add tasks from map that are NOT children of another task
  for (const item of map.values()) {
    if (!childIds.has(item.issueId)) {
      topLevelList.push(item);
    }
  }

  return topLevelList.sort((a, b) => b.totalHours - a.totalHours);
}

/// <summary>
/// Groups time entries by team member to analyze individual contribution.
/// </summary>
/// <param name="entries">Time entries to aggregate.</param>
/// <returns>Array of member summaries sorted by total hours descending.</returns>
export function groupEntriesByMember(entries: TimeEntry[]): MemberTimeSummary[] {
  const map = new Map<number, { summary: MemberTimeSummary; tasks: Set<number> }>();

  for (const entry of entries) {
    const userId = entry.user?.id || 0;
    const userName = entry.user?.name || 'Неизвестен / Unknown';
    const hours = Number(entry.hours) || 0;

    const isBillable = entry.custom_fields?.some(
      cf => (cf.name?.toLowerCase().includes('billable') || cf.id === 4) && (cf.value === '1' || cf.value === 'true')
    );

    let record = map.get(userId);
    if (!record) {
      record = {
        summary: {
          userId,
          userName,
          totalHours: 0,
          billableHours: 0,
          taskCount: 0,
        },
        tasks: new Set<number>(),
      };
      map.set(userId, record);
    }

    record.summary.totalHours += hours;
    if (isBillable || !entry.custom_fields || entry.custom_fields.length === 0) {
      record.summary.billableHours += hours;
    }

    if (entry.issue?.id) {
      record.tasks.add(entry.issue.id);
    }
  }

  return Array.from(map.values())
    .map(r => ({
      ...r.summary,
      totalHours: Math.round(r.summary.totalHours * 100) / 100,
      billableHours: Math.round(r.summary.billableHours * 100) / 100,
      taskCount: r.tasks.size,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);
}

/// <summary>
/// Localization dictionary for client export in Bulgarian and English.
/// </summary>
export const exportTranslations = {
  bg: {
    reportTitleDefault: 'Отчет за отработено време',
    client: 'Клиент',
    project: 'Проект',
    period: 'Период',
    date: 'Дата',
    issueDate: 'Дата на издаване',
    taskNo: 'Задача №',
    task: 'Задача',
    activity: 'Дейност',
    teamMember: 'Служител',
    hours: 'Часове',
    rate: 'Ставка',
    amount: 'Стойност',
    billable: 'Фактурируемо',
    yes: 'Да',
    no: 'Не',
    description: 'Описание на дейността',
    total: 'ОБЩО',
    summaryTitle: 'Обобщение на отработеното време',
    totalHours: 'Общо часове',
    billableHours: 'Фактурируеми часове',
    totalAmount: 'Обща стойност',
    totalTasks: 'Брой задачи',
    activeMembers: 'Активни служители',
    notesTitle: 'Бележки и пояснения',
    preparedBy: 'Изготвил',
    acceptedBy: 'Приел / Одобрил',
    issuedBy: 'Издал',
    signature: 'Подпис',
    noEntries: 'Няма намерени отчетени часове за избрания период.',
    allProject: 'Общ проект',
    hoursShort: 'ч.',
    emailSubject: 'Отчет за отработено време по проект',
    contractBudget: 'Бюджет по договор',
    remainingBudget: 'Оставащ бюджет',
    periodAll: 'Всички отчетени записи',
    periodThisMonth: 'Този месец',
    periodLastMonth: 'Миналия месец',
    periodLast30Days: 'Последните 30 дни',
    periodContract: 'Срок по договор',
    periodCustom: 'Свободен период',
    companyLogo: 'Фирмено лого',
    uploadLogo: 'Качи лого',
    removeLogo: 'Премахни',
    logoHint: 'Запазва се автоматично в браузъра',
    logoPosition: 'Позиция на логото',
    logoPosTopRight: 'Горе вдясно',
    logoPosTopLeft: 'Горе вляво',
    logoPosCenter: 'Центрирано',
    excludeHint: 'Маркирайте/размаркирайте редовете в таблицата за изключване на данни',
    excludedCount: 'Изключени записи',
    restoreAll: 'Възстанови всички',
    createdBy: 'Създал',
    metaFieldsTitle: 'Полета под заглавието',
    contractType: 'Договор / Тип',
    showClient: 'Показвай клиент',
    showProject: 'Показвай проект',
    showPeriod: 'Показвай период',
    showCreatedBy: 'Показвай създател (горе вдясно)',
    showIssueDate: 'Показвай дата на издаване',
    parentTaskNo: 'Родителска задача №',
    parentTask: 'Родителска задача',
    subtasks: 'подзадачи',
    directEntries: 'Директни записи',
    showParentTask: 'Показвай родителска задача',
  },
  en: {
    reportTitleDefault: 'Time Tracking Report',
    client: 'Client',
    project: 'Project',
    period: 'Period',
    date: 'Date',
    issueDate: 'Date of Issue',
    taskNo: 'Task #',
    task: 'Task',
    activity: 'Activity',
    teamMember: 'Team Member',
    hours: 'Hours',
    rate: 'Rate',
    amount: 'Amount',
    billable: 'Billable',
    yes: 'Yes',
    no: 'No',
    description: 'Work Description',
    total: 'TOTAL',
    summaryTitle: 'Time Tracking Summary',
    totalHours: 'Total Hours',
    billableHours: 'Billable Hours',
    totalAmount: 'Total Amount',
    totalTasks: 'Tasks Completed',
    activeMembers: 'Team Members',
    notesTitle: 'Notes & Comments',
    preparedBy: 'Prepared by',
    acceptedBy: 'Approved by',
    issuedBy: 'Issued by',
    signature: 'Signature',
    noEntries: 'No time entries found for the selected period.',
    allProject: 'General project',
    hoursShort: 'hrs',
    emailSubject: 'Time Tracking Report for Project',
    contractBudget: 'Contract Budget',
    remainingBudget: 'Remaining Budget',
    periodAll: 'All Logged Entries',
    periodThisMonth: 'This Month',
    periodLastMonth: 'Last Month',
    periodLast30Days: 'Last 30 Days',
    periodContract: 'Contract Period',
    periodCustom: 'Custom Period',
    companyLogo: 'Company Logo',
    uploadLogo: 'Upload Logo',
    removeLogo: 'Remove',
    logoHint: 'Saved automatically in browser cache',
    logoPosition: 'Logo Position',
    logoPosTopRight: 'Top Right',
    logoPosTopLeft: 'Top Left',
    logoPosCenter: 'Center',
    excludeHint: 'Check or uncheck rows in table to include/exclude entries',
    excludedCount: 'Excluded entries',
    restoreAll: 'Restore all',
    createdBy: 'Created by',
    metaFieldsTitle: 'Header Details (Metadata)',
    contractType: 'Contract Type',
    showClient: 'Show Client',
    showProject: 'Show Project',
    showPeriod: 'Show Period',
    showCreatedBy: 'Show Created by (top right)',
    showIssueDate: 'Show Date of Issue',
    parentTaskNo: 'Parent Task #',
    parentTask: 'Parent Task',
    subtasks: 'subtasks',
    directEntries: 'Direct entries',
    showParentTask: 'Show Parent Task',
  },
} as const;

/// <summary>
/// Generates a localized period label for client export reports.
/// </summary>
/// <param name="language">Target export language ('bg' | 'en').</param>
/// <param name="preset">Active date range preset.</param>
/// <param name="fromDate">Start date string.</param>
/// <param name="toDate">End date string.</param>
/// <param name="contractStart">Contract start date.</param>
/// <param name="contractEnd">Contract end date.</param>
/// <param name="fallbackLabel">Optional fallback label to translate.</param>
/// <returns>Localized period string.</returns>
export function getLocalizedPeriodLabel(
  language: ExportLanguage,
  preset?: string,
  fromDate?: string,
  toDate?: string,
  contractStart?: string,
  contractEnd?: string,
  fallbackLabel?: string
): string {
  const t = exportTranslations[language || 'bg'];

  if (preset === 'this_month') {
    return fromDate && toDate ? `${t.periodThisMonth} (${fromDate} - ${toDate})` : t.periodThisMonth;
  }
  if (preset === 'last_month') {
    return fromDate && toDate ? `${t.periodLastMonth} (${fromDate} - ${toDate})` : t.periodLastMonth;
  }
  if (preset === 'last_30_days') {
    return fromDate && toDate ? `${t.periodLast30Days} (${fromDate} - ${toDate})` : t.periodLast30Days;
  }
  if (preset === 'contract_period') {
    const s = contractStart || fromDate;
    const e = contractEnd || toDate;
    return s && e ? `${t.periodContract} (${s} - ${e})` : t.periodContract;
  }
  if (preset === 'all' && !fromDate && !toDate) {
    return t.periodAll;
  }
  if (fromDate || toDate) {
    return `${t.periodCustom} (${fromDate || '...'} - ${toDate || '...'})`;
  }

  // Handle fallback label string
  if (fallbackLabel) {
    if (language === 'en') {
      return fallbackLabel
        .replace(/Всички отчетени записи/gi, t.periodAll)
        .replace(/Всички/gi, 'All')
        .replace(/Този месец/gi, t.periodThisMonth)
        .replace(/Миналия месец/gi, t.periodLastMonth)
        .replace(/Последните 30 дни/gi, t.periodLast30Days)
        .replace(/Срок по договор/gi, t.periodContract)
        .replace(/Свободен период/gi, t.periodCustom);
    } else {
      return fallbackLabel
        .replace(/All Logged Entries/gi, t.periodAll)
        .replace(/All/gi, 'Всички')
        .replace(/This Month/gi, t.periodThisMonth)
        .replace(/Last Month/gi, t.periodLastMonth)
        .replace(/Last 30 Days/gi, t.periodLast30Days)
        .replace(/Contract Period/gi, t.periodContract)
        .replace(/Custom Period/gi, t.periodCustom);
    }
  }

  return t.periodAll;
}

/// <summary>
/// Generates and triggers download of a CSV spreadsheet formatted with UTF-8 BOM for Microsoft Excel compatibility.
/// </summary>
/// <param name="entries">Filtered time entries to export.</param>
/// <param name="config">Client export configuration settings.</param>
/// <param name="projectName">Project title.</param>
export function exportToCsv(entries: TimeEntry[], config: ClientExportConfig, projectName: string): void {
  const t = exportTranslations[config.language || 'bg'];
  // UTF-8 BOM is required for Excel to recognize Cyrillic encoding
  const BOM = '\uFEFF';
  const delimiter = ';'; // Standard semicolon delimiter for European locale Excel
  const showParent = config.showParentTask !== false;

  // Header row based on language and toggles
  const headers = [
    t.date,
    t.project,
    t.client,
    ...(showParent ? [t.parentTaskNo, t.parentTask] : []),
    ...(config.showTaskIds ? [t.taskNo] : []),
    t.task,
    ...(config.showActivities ? [t.activity] : []),
    ...(config.showTeamMembers ? [t.teamMember] : []),
    t.hours,
    ...(config.showFinancials ? [`${t.rate} (${config.currency})`, `${t.amount} (${config.currency})`] : []),
    t.billable,
    ...(config.showDescriptions ? [t.description] : []),
  ];

  const rows: string[] = [headers.join(delimiter)];

  let totalHours = 0;
  let totalCost = 0;

  for (const entry of entries) {
    const hours = Number(entry.hours) || 0;
    totalHours += hours;

    const isBillable = entry.custom_fields?.some(
      cf => (cf.name?.toLowerCase().includes('billable') || cf.id === 4) && (cf.value === '1' || cf.value === 'true')
    );
    const billableStr = isBillable ? t.yes : t.no;

    const cost = Math.round(hours * config.hourlyRate * 100) / 100;
    totalCost += cost;

    // Sanitize string cells to avoid breaking CSV columns
    const cleanComment = (entry.comments || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""');
    const taskSubject = (entry.issue?.subject || (entry.issue?.id ? `#${entry.issue.id}` : t.allProject))
      .replace(/[\r\n]+/g, ' ')
      .replace(/"/g, '""');

    const parentIdStr = entry.issue?.parent?.id ? `#${entry.issue.parent.id}` : '-';
    const parentSubject = (entry.issue?.parent?.subject || '-')
      .replace(/[\r\n]+/g, ' ')
      .replace(/"/g, '""');

    const row = [
      entry.spent_on || '',
      `"${projectName.replace(/"/g, '""')}"`,
      `"${config.clientName.replace(/"/g, '""')}"`,
      ...(showParent ? [parentIdStr, `"${parentSubject}"`] : []),
      ...(config.showTaskIds ? [entry.issue?.id ? `#${entry.issue.id}` : '-'] : []),
      `"${taskSubject}"`,
      ...(config.showActivities ? [`"${(entry.activity?.name || '').replace(/"/g, '""')}"`] : []),
      ...(config.showTeamMembers ? [`"${(entry.user?.name || '').replace(/"/g, '""')}"`] : []),
      hours.toFixed(2).replace('.', ','),
      ...(config.showFinancials
        ? [config.hourlyRate.toFixed(2).replace('.', ','), cost.toFixed(2).replace('.', ',')]
        : []),
      billableStr,
      ...(config.showDescriptions ? [`"${cleanComment}"`] : []),
    ];

    rows.push(row.join(delimiter));
  }

  // Summary row at the bottom
  const summaryRow = [
    t.total,
    '',
    '',
    ...(showParent ? ['', ''] : []),
    ...(config.showTaskIds ? [''] : []),
    '',
    ...(config.showActivities ? [''] : []),
    ...(config.showTeamMembers ? [''] : []),
    totalHours.toFixed(2).replace('.', ','),
    ...(config.showFinancials ? ['', totalCost.toFixed(2).replace('.', ',')] : []),
    '',
    ...(config.showDescriptions ? [''] : []),
  ];
  rows.push(summaryRow.join(delimiter));

  const csvContent = BOM + rows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const cleanProj = projectName.replace(/[^a-zA-Z0-9а-яА-Я_-]/g, '_');
  const dateStr = new Date().toISOString().slice(0, 10);

  link.setAttribute('href', url);
  link.setAttribute('download', `Client_Report_${cleanProj}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
