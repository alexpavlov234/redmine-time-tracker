import type { TimeEntry } from './index';

/// <summary>
/// Represents a custom field on a Redmine project.
/// </summary>
export interface RedmineCustomField {
  /// <summary>ID of the custom field.</summary>
  id: number;
  /// <summary>Name of the custom field in Redmine.</summary>
  name: string;
  /// <summary>Value assigned to the custom field (string, number, array, or null).</summary>
  value: unknown;
}

/// <summary>
/// Represents the full project information returned by Redmine project details API.
/// </summary>
export interface RedmineProjectFull {
  /// <summary>Project identifier numeric ID.</summary>
  id: number;
  /// <summary>Human-readable name of the project.</summary>
  name: string;
  /// <summary>Slug identifier of the project.</summary>
  identifier: string;
  /// <summary>Description of the project.</summary>
  description?: string;
  /// <summary>Status code (1 = active, 5 = closed, etc.).</summary>
  status: number;
  /// <summary>List of custom fields associated with the project.</summary>
  custom_fields?: RedmineCustomField[];
  /// <summary>Parent project reference if this is a sub-project.</summary>
  parent?: {
    id: number;
    name: string;
  };
}

/// <summary>
/// Represents a user membership in a Redmine project.
/// </summary>
export interface RedmineProjectMembership {
  /// <summary>Membership ID.</summary>
  id: number;
  /// <summary>Project reference.</summary>
  project: {
    id: number;
    name: string;
  };
  /// <summary>Roles held by the user in this project.</summary>
  roles: Array<{
    id: number;
    name: string;
    inherited?: boolean;
  }>;
}

/// <summary>
/// Extracted project budget metadata from Redmine custom fields.
/// </summary>
export interface ProjectBudgetMetadata {
  /// <summary>Budget 1 - Expert evaluation (in hours).</summary>
  budget1Estimate: number;
  /// <summary>Budget 2 - By Contract (in hours) - primary budget.</summary>
  budget2Contract: number;
  /// <summary>Budget 3 - Profitability threshold (in hours).</summary>
  budget3Profitability: number;
  /// <summary>Client name extracted from project fields.</summary>
  clientName: string;
  /// <summary>Start date of project/contract (YYYY-MM-DD).</summary>
  startDate: string;
  /// <summary>Contract end date (YYYY-MM-DD).</summary>
  contractEndDate: string;
  /// <summary>Target end date (YYYY-MM-DD).</summary>
  targetEndDate: string;
  /// <summary>Contract type (e.g. Services, Contract, Support).</summary>
  contractType: string;
  /// <summary>Billing information notes.</summary>
  billingInfo: string;
  /// <summary>Responsible person ID from custom fields.</summary>
  responsibleUserId?: string;
  /// <summary>Whether this is an umbrella container project.</summary>
  isUmbrella?: boolean;
}

/// <summary>
/// Computed statistics for project budget tracking and velocity.
/// </summary>
export interface ProjectBudgetStats {
  /// <summary>Active budget target in hours (based on chosen budget type).</summary>
  targetHours: number;
  /// <summary>Total hours spent so far on this project.</summary>
  totalSpentHours: number;
  /// <summary>Total billable hours spent so far.</summary>
  totalBillableHours: number;
  /// <summary>Remaining hours before exceeding budget.</summary>
  remainingHours: number;
  /// <summary>Percentage of target budget consumed (0 - 100+%).</summary>
  percentageUsed: number;
  /// <summary>Hours spent in current month.</summary>
  spentThisMonth: number;
  /// <summary>Hours spent in previous month.</summary>
  spentLastMonth: number;
  /// <summary>Average weekly burn rate in hours.</summary>
  weeklyBurnRate: number;
  /// <summary>Health status of the budget.</summary>
  healthStatus: 'on_track' | 'warning' | 'over_budget';
}

/// <summary>
/// Grouped task time summary for client report.
/// </summary>
export interface TaskTimeSummary {
  /// <summary>Task / Issue ID.</summary>
  issueId: number;
  /// <summary>Task subject / title.</summary>
  subject: string;
  /// <summary>Total hours spent on this task.</summary>
  totalHours: number;
  /// <summary>Billable hours spent on this task.</summary>
  billableHours: number;
  /// <summary>Distinct activities performed under this task.</summary>
  activities: string[];
  /// <summary>Summarized descriptions/comments of work done.</summary>
  comments: string[];
  /// <summary>Team members who contributed to this task.</summary>
  members: string[];
  /// <summary>List of time entry IDs included in this task.</summary>
  entryIds?: number[];
  /// <summary>Underlying time entries belonging to this task.</summary>
  entries?: TimeEntry[];
}

/// <summary>
/// Grouped team member time summary.
/// </summary>
export interface MemberTimeSummary {
  /// <summary>User ID in Redmine.</summary>
  userId: number;
  /// <summary>User full name.</summary>
  userName: string;
  /// <summary>Total hours logged by this member.</summary>
  totalHours: number;
  /// <summary>Billable hours logged by this member.</summary>
  billableHours: number;
  /// <summary>Number of tasks worked on.</summary>
  taskCount: number;
}

/// <summary>
/// Supported export languages for client report and data export.
/// </summary>
export type ExportLanguage = 'bg' | 'en';

/// <summary>
/// Supported positions for company logo placement in client report.
/// </summary>
export type LogoPosition = 'top-right' | 'top-left' | 'center';

/// <summary>
/// Options for configuring the client export document.
/// </summary>
export interface ClientExportConfig {
  /// <summary>Export language ('bg' | 'en').</summary>
  language: ExportLanguage;
  /// <summary>Client name to display on the report header.</summary>
  clientName: string;
  /// <summary>Title of the report (e.g. "Отчет за отработено време" or "Time Tracking Report").</summary>
  reportTitle: string;
  /// <summary>Period text label (e.g. "Септември 2026").</summary>
  periodLabel: string;
  /// <summary>Name of the person who created the report.</summary>
  createdBy?: string;
  /// <summary>Name of the person who issued / prepared the report.</summary>
  issuedBy?: string;
  /// <summary>Issue date of the report.</summary>
  issueDate?: string;
  /// <summary>Position of the company logo on the report header.</summary>
  logoPosition?: LogoPosition;
  /// <summary>Whether to show Client name in metadata section.</summary>
  showClient?: boolean;
  /// <summary>Whether to show Project name in metadata section.</summary>
  showProject?: boolean;
  /// <summary>Whether to show Period label in metadata section.</summary>
  showPeriod?: boolean;
  /// <summary>Whether to show Contract Budget in metadata section.</summary>
  showMetaContractBudget?: boolean;
  /// <summary>Whether to show Contract Type in metadata section.</summary>
  showContractType?: boolean;
  /// <summary>Whether to show Created By in header box.</summary>
  showCreatedBy?: boolean;
  /// <summary>Whether to show Issue Date in header box.</summary>
  showIssueDate?: boolean;
  /// <summary>Grouping mode for the report table ('task' or 'date').</summary>
  groupBy: 'task' | 'date';
  /// <summary>Whether to show summary metrics box/row.</summary>
  showSummaryStats: boolean;
  /// <summary>Whether to show Contract Budget in summary.</summary>
  showContractBudget: boolean;
  /// <summary>Whether to show Total Hours in summary.</summary>
  showTotalHours: boolean;
  /// <summary>Whether to show Remaining Budget in summary.</summary>
  showRemainingBudget: boolean;
  /// <summary>Whether to show Billable Hours in summary.</summary>
  showBillableHours: boolean;
  /// <summary>Whether to show individual team member names on client report.</summary>
  showTeamMembers: boolean;
  /// <summary>Whether to show task numbers / IDs.</summary>
  showTaskIds: boolean;
  /// <summary>Whether to show activities column.</summary>
  showActivities: boolean;
  /// <summary>Whether to show descriptions / comments column.</summary>
  showDescriptions: boolean;
  /// <summary>Whether to include only billable hours.</summary>
  showBillableOnly: boolean;
  /// <summary>Whether to calculate and display financial amount.</summary>
  showFinancials: boolean;
  /// <summary>Hourly billing rate applied if financials are shown.</summary>
  hourlyRate: number;
  /// <summary>Currency code (e.g. 'EUR', 'BGN', 'USD').</summary>
  currency: string;
  /// <summary>Additional notes or message to client at the end of report.</summary>
  customNotes: string;
}
