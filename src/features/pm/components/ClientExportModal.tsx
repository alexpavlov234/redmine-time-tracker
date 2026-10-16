import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Modal,
  Grid,
  Stack,
  Group,
  TextInput,
  Textarea,
  SegmentedControl,
  Switch,
  NumberInput,
  Select,
  Button,
  Title,
  Text,
  Badge,
  Paper,
  Divider,
  Box,
  SimpleGrid,
  FileButton,
  ActionIcon,
  Checkbox,
  Alert,
} from '@mantine/core';
import {
  IconPrinter,
  IconFileSpreadsheet,
  IconCopy,
  IconCheck,
  IconBriefcase,
  IconLanguage,
  IconAdjustments,
  IconPhoto,
  IconUpload,
  IconTrash,
} from '@tabler/icons-react';
import type { TimeEntry } from '../../../types';
import type { ProjectBudgetMetadata, ClientExportConfig, TaskTimeSummary, ExportLanguage, LogoPosition } from '../../../types/pm';
import { exportToCsv, exportTranslations, getLocalizedPeriodLabel, groupEntriesByTask } from '../../../services/pmService';
import { getIssues } from '../../../services/redmine';
import { useUser } from '../../../contexts/UserContext';
import '../styles/clientReport.css';

/// <summary>
/// Properties for ClientExportModal.
/// </summary>
interface ClientExportModalProps {
  /// <summary>Whether modal is currently opened.</summary>
  isOpen: boolean;
  /// <summary>Callback to close modal.</summary>
  onClose: () => void;
  /// <summary>Current project title.</summary>
  projectName: string;
  /// <summary>Metadata extracted from Redmine project custom fields.</summary>
  metadata: ProjectBudgetMetadata;
  /// <summary>Current filtered time entries to be exported.</summary>
  entries: TimeEntry[];
  /// <summary>Current date range filter label.</summary>
  dateLabel: string;
  /// <summary>Active date range preset.</summary>
  dateRangePreset?: string;
  /// <summary>Start date string of active filter.</summary>
  dateFrom?: string;
  /// <summary>End date string of active filter.</summary>
  dateTo?: string;
  /// <summary>Current hourly rate.</summary>
  defaultHourlyRate: number;
  /// <summary>Current currency code.</summary>
  defaultCurrency: string;
}

const DEFAULT_NOTES: Record<ExportLanguage, string> = {
  bg: 'Благодарим за успешното сътрудничество! Настоящият отчет отразява извършените дейности за периода.',
  en: 'Thank you for your business! This report summarizes the services and activities performed during the period.',
};

/// <summary>
/// Interactive client export modal providing company logo caching, live document preview,
/// multi-language support (BG/EN), editable title, issuer name and date, modular metric toggles,
/// per-row data exclusion, clean executive A4 PDF print, Excel CSV, and email summary.
/// </summary>
export const ClientExportModal: React.FC<ClientExportModalProps> = ({
  isOpen,
  onClose,
  projectName,
  metadata,
  entries,
  dateLabel,
  dateRangePreset,
  dateFrom,
  dateTo,
  defaultHourlyRate,
  defaultCurrency,
}) => {
  const { user } = useUser();
  const defaultIssuer = user
    ? user.name || `${user.firstname || ''} ${user.lastname || ''}`.trim()
    : '';

  // Export Language: 'bg' | 'en' (defaults to 'en')
  const [language, setLanguage] = useState<ExportLanguage>('en');

  // Active translation dictionary
  const t = exportTranslations[language];

  // Company logo state (cached in browser localStorage)
  const [companyLogo, setCompanyLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem('pm_company_logo_data') || null;
    } catch {
      return null;
    }
  });

  // Company logo position: 'top-right' | 'top-left' | 'center' (persisted in browser localStorage)
  const [logoPosition, setLogoPosition] = useState<LogoPosition>(() => {
    try {
      return (localStorage.getItem('pm_logo_position') as LogoPosition) || 'top-right';
    } catch {
      return 'top-right';
    }
  });

  // Creator name and issue date
  const [createdBy, setCreatedBy] = useState<string>(() => {
    try {
      return localStorage.getItem('pm_last_created_by') || localStorage.getItem('pm_last_issued_by') || defaultIssuer;
    } catch {
      return defaultIssuer;
    }
  });
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // Track if user has manually typed a custom title
  const [isTitleManuallyEdited, setIsTitleManuallyEdited] = useState<boolean>(false);

  // Configuration options for client export
  const [clientName, setClientName] = useState<string>(metadata.clientName || 'Client');
  const [reportTitle, setReportTitle] = useState<string>(exportTranslations.en.reportTitleDefault);
  const [periodLabel, setPeriodLabel] = useState<string>(() =>
    getLocalizedPeriodLabel('en', dateRangePreset, dateFrom, dateTo, metadata.startDate, metadata.contractEndDate, dateLabel)
  );
  const [groupBy, setGroupBy] = useState<'task' | 'date'>('task');

  // Data Exclusion state: set of entry IDs excluded from the export
  const [excludedEntryIds, setExcludedEntryIds] = useState<Set<number>>(new Set());

  // Modular Information Toggles
  const [showSummaryStats, setShowSummaryStats] = useState<boolean>(true);
  const [showContractBudget, setShowContractBudget] = useState<boolean>(metadata.budget2Contract > 0);
  const [showTotalHours, setShowTotalHours] = useState<boolean>(true);
  const [showRemainingBudget, setShowRemainingBudget] = useState<boolean>(metadata.budget2Contract > 0);
  const [showBillableHours, setShowBillableHours] = useState<boolean>(true);

  // Metadata Section Toggles
  const [showClient, setShowClient] = useState<boolean>(true);
  const [showProject, setShowProject] = useState<boolean>(true);
  const [showPeriod, setShowPeriod] = useState<boolean>(true);
  const [showMetaContractBudget, setShowMetaContractBudget] = useState<boolean>(metadata.budget2Contract > 0);
  const [showContractType, setShowContractType] = useState<boolean>(Boolean(metadata.contractType));
  const [showCreatedBy, setShowCreatedBy] = useState<boolean>(Boolean(createdBy));
  const [showIssueDate, setShowIssueDate] = useState<boolean>(true);

  // Column / table toggles
  const [showParentTask, setShowParentTask] = useState<boolean>(true);
  const [showTeamMembers, setShowTeamMembers] = useState<boolean>(true);
  const [showTaskIds, setShowTaskIds] = useState<boolean>(true);
  const [showActivities, setShowActivities] = useState<boolean>(true);
  const [showDescriptions, setShowDescriptions] = useState<boolean>(true);
  const [showBillableOnly, setShowBillableOnly] = useState<boolean>(false);
  /// <summary>Whether financial rate and total amounts are displayed in the export.</summary>
  const [showFinancials, setShowFinancials] = useState<boolean>(false);

  // Financial inputs
  const [hourlyRate, setHourlyRate] = useState<number>(defaultHourlyRate);
  const [currency, setCurrency] = useState<string>(defaultCurrency);
  /// <summary>Custom note text appended to the report footer (empty by default).</summary>
  const [customNotes, setCustomNotes] = useState<string>('');

  // Copy status feedback
  const [isCopied, setIsCopied] = useState<boolean>(false);

  // Ref to the rendered report container for clean isolated printing
  const reportContainerRef = useRef<HTMLDivElement>(null);

  /// <summary>
  /// Handles file upload for company logo, converting to base64 and persisting in localStorage.
  /// </summary>
  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const base64 = e.target?.result as string;
      if (base64) {
        setCompanyLogo(base64);
        try {
          localStorage.setItem('pm_company_logo_data', base64);
        } catch (err) {
          console.warn('Failed to cache logo in localStorage:', err);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  /// <summary>
  /// Clears company logo from state and browser localStorage.
  /// </summary>
  const handleRemoveLogo = () => {
    setCompanyLogo(null);
    try {
      localStorage.removeItem('pm_company_logo_data');
    } catch {
      // ignore
    }
  };

  /// <summary>
  /// Handles updating the company logo position and persisting to localStorage.
  /// </summary>
  /// <param name="pos">Selected logo position ('top-right' | 'top-left' | 'center').</param>
  const handleLogoPositionChange = (pos: LogoPosition) => {
    setLogoPosition(pos);
    try {
      localStorage.setItem('pm_logo_position', pos);
    } catch {
      // ignore
    }
  };

  /// <summary>
  /// Handles language switch, updating default texts and period label dynamically.
  /// </summary>
  const handleLanguageChange = (newLang: ExportLanguage) => {
    const oldT = exportTranslations[language];
    const newT = exportTranslations[newLang];
    setLanguage(newLang);

    // Update title only if user has not manually customized it
    if (!isTitleManuallyEdited && (reportTitle === oldT.reportTitleDefault || !reportTitle)) {
      setReportTitle(newT.reportTitleDefault);
    }

    // Update note if it matches previous language's default
    if (customNotes === DEFAULT_NOTES[language]) {
      setCustomNotes(DEFAULT_NOTES[newLang]);
    }

    // Update period label to match the new language
    setPeriodLabel(
      getLocalizedPeriodLabel(
        newLang,
        dateRangePreset,
        dateFrom,
        dateTo,
        metadata.startDate,
        metadata.contractEndDate,
        periodLabel
      )
    );
  };

  // Revision state to re-evaluate grouped tables when issue subjects are fetched
  const [subjectsRevision, setSubjectsRevision] = useState<number>(0);

  // Fetch issue subjects and parent tasks for any entries lacking details
  useEffect(() => {
    const missingIssueIds = Array.from(
      new Set(
        entries
          .map(e => e.issue?.id)
          .filter((id): id is number => typeof id === 'number' && id > 0)
          .filter(id => {
            const entry = entries.find(e => e.issue?.id === id);
            return !entry?.issue?.subject || !entry?.issue?.parent;
          })
      )
    );

    if (missingIssueIds.length > 0) {
      getIssues(missingIssueIds, true)
        .then(issues => {
          const issueMap = new Map<number, (typeof issues)[0]>();
          for (const issue of issues) {
            if (issue && issue.id) {
              issueMap.set(issue.id, issue);
            }
          }
          let hasChanges = false;
          for (const entry of entries) {
            if (entry.issue?.id) {
              const issueObj = issueMap.get(entry.issue.id);
              if (issueObj) {
                if (!entry.issue.subject && issueObj.subject) {
                  entry.issue.subject = issueObj.subject;
                  hasChanges = true;
                }
                if (!entry.issue.parent && issueObj.parent?.id) {
                  entry.issue.parent = {
                    id: issueObj.parent.id,
                    subject: issueObj.parent.subject,
                  };
                  hasChanges = true;
                }
              }
            }
          }
          if (hasChanges) {
            setSubjectsRevision(r => r + 1);
          }
        })
        .catch(err => {
          console.warn('Failed to fetch missing issue details in modal:', err);
        });
    }
  }, [entries]);

  // Base list of entries according to billable toggle
  const exportEntries = useMemo(() => {
    if (subjectsRevision < 0) return [];
    if (!showBillableOnly) return entries;
    return entries.filter(e => {
      return e.custom_fields?.some(
        cf =>
          (cf.name?.toLowerCase().includes('billable') || cf.id === 4) &&
          (cf.value === '1' || cf.value === 'true')
      );
    });
  }, [entries, showBillableOnly, subjectsRevision]);

  // Exclude-aware entries (only included items)
  const includedEntries = useMemo(() => {
    return exportEntries.filter(e => !excludedEntryIds.has(e.id));
  }, [exportEntries, excludedEntryIds]);

  /// <summary>
  /// Toggles exclusion state for an individual time entry ID.
  /// </summary>
  const toggleEntryExclusion = (id: number) => {
    setExcludedEntryIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /// <summary>
  /// Toggles exclusion state for all time entries belonging to a given task.
  /// </summary>
  const toggleTaskExclusion = (taskEntryIds?: number[]) => {
    if (!taskEntryIds || taskEntryIds.length === 0) return;
    setExcludedEntryIds(prev => {
      const next = new Set(prev);
      const allExcluded = taskEntryIds.every(id => next.has(id));
      for (const id of taskEntryIds) {
        if (allExcluded) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  /// <summary>
  /// Toggles exclusion state for all currently displayed entries.
  /// </summary>
  const toggleAllExclusion = () => {
    setExcludedEntryIds(prev => {
      if (prev.size > 0) return new Set();
      return new Set(exportEntries.map(e => e.id));
    });
  };

  /// <summary>
  /// Restores all excluded entries back into the report.
  /// </summary>
  const handleRestoreAll = () => {
    setExcludedEntryIds(new Set());
  };

  // Aggregated totals (calculated strictly from included entries)
  const totals = useMemo(() => {
    let hours = 0;
    let billableHours = 0;
    for (const e of includedEntries) {
      const h = Number(e.hours) || 0;
      hours += h;
      const isBillable = e.custom_fields?.some(
        cf =>
          (cf.name?.toLowerCase().includes('billable') || cf.id === 4) &&
          (cf.value === '1' || cf.value === 'true')
      );
      if (isBillable || !e.custom_fields || e.custom_fields.length === 0) {
        billableHours += h;
      }
    }
    const cost = Math.round(hours * hourlyRate * 100) / 100;
    return {
      totalHours: Math.round(hours * 100) / 100,
      billableHours: Math.round(billableHours * 100) / 100,
      totalCost: cost,
    };
  }, [includedEntries, hourlyRate]);

  // Grouped tasks for 'task' view (all tasks from exportEntries to display checkboxes)
  const allGroupedTasks: TaskTimeSummary[] = useMemo(() => {
    if (subjectsRevision < 0) return [];
    return groupEntriesByTask(exportEntries);
  }, [exportEntries, subjectsRevision]);

  // Grouped tasks for email summary (only included tasks)
  const includedGroupedTasks: TaskTimeSummary[] = useMemo(() => {
    if (subjectsRevision < 0) return [];
    return groupEntriesByTask(includedEntries);
  }, [includedEntries, subjectsRevision]);

  // Full export config object
  const exportConfig: ClientExportConfig = {
    language,
    clientName,
    reportTitle,
    periodLabel,
    createdBy,
    issuedBy: createdBy,
    issueDate,
    logoPosition,
    showClient,
    showProject,
    showPeriod,
    showMetaContractBudget,
    showContractType,
    showCreatedBy,
    showIssueDate,
    groupBy,
    showSummaryStats,
    showContractBudget,
    showTotalHours,
    showRemainingBudget,
    showBillableHours,
    showTeamMembers,
    showTaskIds,
    showParentTask,
    showActivities,
    showDescriptions,
    showBillableOnly,
    showFinancials,
    hourlyRate,
    currency,
    customNotes,
  };

  /// <summary>
  /// Prints the report in an isolated iframe with pure white background and full page width,
  /// completely avoiding modal overlays, dark mode backgrounds, and centered dialog boxes.
  /// </summary>
  const handlePrint = () => {
    const reportElem = reportContainerRef.current;
    if (!reportElem) {
      window.print();
      return;
    }

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-10000px';
    iframe.style.left = '-10000px';
    iframe.style.width = '0px';
    iframe.style.height = '0px';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      window.print();
      return;
    }

    // Collect all loaded CSS style tags and links from parent document
    const styleTags = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
      .map(node => node.outerHTML)
      .join('\n');

    const pageCounterContent = language === 'bg'
      ? '"Страница " counter(page) " от " counter(pages)'
      : '"Page " counter(page) " of " counter(pages)';

    const cleanProject = (projectName || '').trim();
    const fallbackTitle = language === 'bg' ? 'Отчет за отработено време' : 'Time Tracking Report';
    const activeTitle = (reportTitle || fallbackTitle).trim();
    const printDocTitle = cleanProject && !activeTitle.toLowerCase().startsWith(cleanProject.toLowerCase())
      ? `${cleanProject} - ${activeTitle}`
      : activeTitle;

    const originalDocTitle = document.title;
    document.title = printDocTitle;

    doc.open();
    doc.write(`<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8" />
  <title>${printDocTitle}</title>
  ${styleTags}
  <style>
    @page {
      size: A4 portrait;
      margin: 14mm 10mm 15mm 10mm;
      @bottom-right {
        content: ${pageCounterContent};
        font-size: 8.5pt;
        font-weight: 500;
        color: #64748b;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      }
    }
    *, *::before, *::after {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      background-color: #ffffff !important;
      background: #ffffff !important;
      color: #0f172a !important;
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .client-report-container {
      box-shadow: none !important;
      border: none !important;
      padding: 0 !important;
      margin: 0 !important;
      max-width: 100% !important;
      width: 100% !important;
      background-color: #ffffff !important;
      background: #ffffff !important;
      color: #0f172a !important;
    }
    /* Prevent table footer from repeating on every page */
    .client-report-table tfoot {
      display: table-row-group !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .client-report-table .action-col,
    .client-report-table tr.is-excluded {
      display: none !important;
    }
    .client-report-table {
      width: 100% !important;
    }
    .client-report-task-group-row {
      background-color: #f1f5f9 !important;
      border-top: 1.5px solid #94a3b8 !important;
      border-bottom: 1px solid #cbd5e1 !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .client-report-task-group-row td {
      background-color: #f1f5f9 !important;
    }
    .client-report-parent-task-row {
      background-color: #f1f5f9 !important;
      border-top: 1.5px solid #4f46e5 !important;
      border-bottom: 1px solid #cbd5e1 !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .client-report-parent-task-row td {
      background-color: #f1f5f9 !important;
      border-left: 2.5px solid #4f46e5 !important;
    }
    .client-report-child-task-row {
      background-color: #fafbfc !important;
      border-top: 1px dashed #cbd5e1 !important;
      border-bottom: 1px solid #e2e8f0 !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .client-report-child-task-row td {
      background-color: #fafbfc !important;
      border-left: 2px solid #cbd5e1 !important;
    }
    .client-report-sub-entry-row {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .client-report-header,
    .client-report-summary-bar,
    .client-report-table tr {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
  </style>
</head>
<body>
  ${reportElem.outerHTML}
</body>
</html>`);
    doc.close();

    // Small delay to allow images and styles to parse before triggering print
    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch (err) {
        console.warn('Iframe print error, falling back to window.print():', err);
        window.print();
      } finally {
        setTimeout(() => {
          document.title = originalDocTitle;
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1500);
      }
    }, 250);
  };

  /// <summary>
  /// Triggers Excel CSV export with UTF-8 BOM, including only non-excluded entries.
  /// </summary>
  const handleExcelExport = () => {
    exportToCsv(includedEntries, exportConfig, projectName);
  };

  /// <summary>
  /// Formats date for display in the report.
  /// </summary>
  const formattedIssueDate = useMemo(() => {
    if (!issueDate) return '';
    try {
      const parts = issueDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
        return d.toLocaleDateString(language === 'bg' ? 'bg-BG' : 'en-GB', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
      }
    } catch {
      // fallback
    }
    return issueDate;
  }, [issueDate, language]);

  /// <summary>
  /// Copies structured Markdown summary to clipboard in the selected language.
  /// </summary>
  const handleCopyEmailSummary = async () => {
    let md = `**${reportTitle}**\n`;
    if (showProject) {
      md += `**${t.project}:** ${projectName}\n`;
    }
    if (showClient && clientName) {
      md += `**${t.client}:** ${clientName}\n`;
    }
    if (showPeriod && periodLabel) {
      md += `**${t.period}:** ${periodLabel}\n`;
    }
    if (showContractType && metadata.contractType) {
      md += `**${t.contractType}:** ${metadata.contractType}\n`;
    }
    if (showCreatedBy && createdBy) {
      md += `**${t.createdBy}:** ${createdBy}\n`;
    }
    if (showIssueDate && formattedIssueDate) {
      md += `**${t.issueDate}:** ${formattedIssueDate}\n`;
    }
    if (showContractBudget && metadata.budget2Contract > 0) {
      md += `**${t.contractBudget}:** ${metadata.budget2Contract.toFixed(2)} ${t.hoursShort}\n`;
    }
    if (showTotalHours) {
      md += `**${t.totalHours}:** ${totals.totalHours.toFixed(2)} ${t.hoursShort}\n`;
    }
    if (showRemainingBudget && metadata.budget2Contract > 0) {
      const remaining = Math.round((metadata.budget2Contract - totals.totalHours) * 100) / 100;
      md += `**${t.remainingBudget}:** ${remaining.toFixed(2)} ${t.hoursShort}\n`;
    }
    if (showBillableHours) {
      md += `**${t.billableHours}:** ${totals.billableHours.toFixed(2)} ${t.hoursShort}\n`;
    }
    if (showFinancials && hourlyRate > 0) {
      md += `**${t.totalAmount}:** ${totals.totalCost.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-US', { minimumFractionDigits: 2 })} ${currency} (${t.rate}: ${hourlyRate} ${currency}/${t.hoursShort})\n`;
    }
    md += `\n### ${t.summaryTitle}:\n`;

    includedGroupedTasks.forEach(task => {
      const taskCost =
        showFinancials && hourlyRate > 0
          ? ` (${(task.totalHours * hourlyRate).toFixed(2)} ${currency})`
          : '';
      const taskIdStr = showTaskIds && task.issueId ? `#${task.issueId} ` : '';

      if (task.isParent && task.children && task.children.length > 0) {
        md += `- **[${language === 'bg' ? 'Родителска задача' : 'Parent Task'}] ${taskIdStr}${task.subject}**: ${task.totalHours.toFixed(2)} ${t.hoursShort}${taskCost} (${task.children.length} ${t.subtasks})\n`;
        task.children.forEach(child => {
          const childCost =
            showFinancials && hourlyRate > 0
              ? ` (${(child.totalHours * hourlyRate).toFixed(2)} ${currency})`
              : '';
          const childIdStr = showTaskIds && child.issueId ? `#${child.issueId} ` : '';
          md += `  * **↳ ${childIdStr}${child.subject}**: ${child.totalHours.toFixed(2)} ${t.hoursShort}${childCost}\n`;
          if (showDescriptions && child.comments.length > 0) {
            child.comments.slice(0, 3).forEach(c => {
              md += `    - ${c}\n`;
            });
          }
        });
      } else {
        md += `- **${taskIdStr}${task.subject}**: ${task.totalHours.toFixed(2)} ${t.hoursShort}${taskCost}\n`;
        if (showDescriptions && task.comments.length > 0) {
          task.comments.slice(0, 3).forEach(c => {
            md += `  * ${c}\n`;
          });
        }
      }
    });

    if (customNotes) {
      md += `\n_${customNotes}_\n`;
    }

    try {
      await navigator.clipboard.writeText(md);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  const isAllIncluded = excludedEntryIds.size === 0;
  const isPartiallyExcluded = excludedEntryIds.size > 0 && excludedEntryIds.size < exportEntries.length;

  const hasAnyMetaField =
    (showClient && Boolean(clientName)) ||
    (showProject && Boolean(projectName)) ||
    (showPeriod && Boolean(periodLabel)) ||
    (showMetaContractBudget && metadata.budget2Contract > 0) ||
    (showContractType && Boolean(metadata.contractType));

  const hasAnySummaryMetric =
    showSummaryStats &&
    ((showContractBudget && metadata.budget2Contract > 0) ||
      showTotalHours ||
      (showRemainingBudget && metadata.budget2Contract > 0) ||
      showBillableHours ||
      (showFinancials && hourlyRate > 0));

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconBriefcase size={22} color="var(--mantine-color-blue-filled)" />
          <Title order={3}>Client Report Export</Title>
        </Group>
      }
      size="92%"
      styles={{
        body: { maxHeight: '86vh', overflowY: 'auto', padding: '16px 20px' },
      }}
    >
      <Grid gap="lg">
        {/* LEFT COLUMN: Controls & Settings */}
        <Grid.Col span={{ base: 12, md: 4 }} className="client-settings-col">
          <Stack gap="md">
            <Paper withBorder p="md" radius="md" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
              <Group justify="space-between" align="center" mb="xs">
                <Title order={5}>Report Settings</Title>
                <IconAdjustments size={18} color="gray" />
              </Group>

              <Stack gap="sm">
                {/* Language Switcher */}
                <div>
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    <Group gap={4}>
                      <IconLanguage size={14} />
                      <span>Export Language:</span>
                    </Group>
                  </Text>
                  <SegmentedControl
                    size="xs"
                    fullWidth
                    value={language}
                    onChange={val => handleLanguageChange(val as ExportLanguage)}
                    data={[
                      { value: 'bg', label: '🇧🇬 Български' },
                      { value: 'en', label: '🇬🇧 English' },
                    ]}
                  />
                </div>

                {/* Company Logo Upload & Cache */}
                <div>
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    <Group gap={4}>
                      <IconPhoto size={14} />
                      <span>{t.companyLogo}:</span>
                    </Group>
                  </Text>
                  <Group gap="xs" align="center">
                    {companyLogo ? (
                      <>
                        <img
                          src={companyLogo}
                          alt="Logo Preview"
                          style={{
                            maxHeight: 28,
                            maxWidth: 100,
                            objectFit: 'contain',
                            border: '1px solid #cbd5e1',
                            borderRadius: 4,
                            padding: 2,
                            backgroundColor: '#ffffff',
                          }}
                        />
                        <FileButton onChange={handleLogoUpload} accept="image/png,image/jpeg,image/webp,image/svg+xml">
                          {props => (
                            <Button {...props} size="xs" variant="light" color="blue">
                              Change
                            </Button>
                          )}
                        </FileButton>
                        <ActionIcon color="red" variant="subtle" size="sm" onClick={handleRemoveLogo} title={t.removeLogo}>
                          <IconTrash size={16} />
                        </ActionIcon>
                      </>
                    ) : (
                      <FileButton onChange={handleLogoUpload} accept="image/png,image/jpeg,image/webp,image/svg+xml">
                        {props => (
                          <Button {...props} size="xs" variant="light" leftSection={<IconUpload size={14} />}>
                            {t.uploadLogo}
                          </Button>
                        )}
                      </FileButton>
                    )}
                  </Group>
                  <Text size="10px" c="dimmed" mt={2}>
                    {t.logoHint}
                  </Text>
                </div>

                {/* Logo Position Selector */}
                {companyLogo && (
                  <div>
                    <Text size="xs" fw={600} c="dimmed" mb={4}>
                      {t.logoPosition}:
                    </Text>
                    <SegmentedControl
                      size="xs"
                      fullWidth
                      value={logoPosition}
                      onChange={val => handleLogoPositionChange(val as LogoPosition)}
                      data={[
                        { value: 'top-right', label: t.logoPosTopRight },
                        { value: 'top-left', label: t.logoPosTopLeft },
                        { value: 'center', label: t.logoPosCenter },
                      ]}
                    />
                  </div>
                )}

                {/* Editable Document Title */}
                <TextInput
                  size="xs"
                  label="Document Title"
                  description="Freely edit document title"
                  value={reportTitle}
                  onChange={e => {
                    setReportTitle(e.target.value);
                    setIsTitleManuallyEdited(true);
                  }}
                />

                <TextInput
                  size="xs"
                  label={t.client}
                  value={clientName}
                  onChange={e => setClientName(e.target.value)}
                />

                <TextInput
                  size="xs"
                  label={t.period}
                  value={periodLabel}
                  onChange={e => setPeriodLabel(e.target.value)}
                />

                {/* Creator and Date Inputs */}
                <Group grow>
                  <TextInput
                    size="xs"
                    label={t.createdBy}
                    placeholder="Creator name"
                    value={createdBy}
                    onChange={e => {
                      setCreatedBy(e.target.value);
                      try {
                        localStorage.setItem('pm_last_created_by', e.target.value);
                        localStorage.setItem('pm_last_issued_by', e.target.value);
                      } catch {
                        // ignore
                      }
                    }}
                  />

                  <TextInput
                    size="xs"
                    type="date"
                    label={t.issueDate}
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
                  />
                </Group>

                <Divider my="xs" />

                {/* Metadata Section Toggles */}
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  {t.metaFieldsTitle}:
                </Text>

                <SimpleGrid cols={1} spacing="xs">
                  <Switch
                    size="xs"
                    label={`${t.client} (${clientName || '-'})`}
                    checked={showClient}
                    onChange={e => setShowClient(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label={`${t.project} (${projectName})`}
                    checked={showProject}
                    onChange={e => setShowProject(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label={t.period}
                    checked={showPeriod}
                    onChange={e => setShowPeriod(e.currentTarget.checked)}
                  />

                  {metadata.budget2Contract > 0 && (
                    <Switch
                      size="xs"
                      label={`${t.contractBudget} (${metadata.budget2Contract.toFixed(2)} ${t.hoursShort})`}
                      checked={showMetaContractBudget}
                      onChange={e => setShowMetaContractBudget(e.currentTarget.checked)}
                    />
                  )}

                  {metadata.contractType && (
                    <Switch
                      size="xs"
                      label={`${t.contractType} (${metadata.contractType})`}
                      checked={showContractType}
                      onChange={e => setShowContractType(e.currentTarget.checked)}
                    />
                  )}

                  <Switch
                    size="xs"
                    label={t.showCreatedBy}
                    checked={showCreatedBy}
                    onChange={e => setShowCreatedBy(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label={t.showIssueDate}
                    checked={showIssueDate}
                    onChange={e => setShowIssueDate(e.currentTarget.checked)}
                  />
                </SimpleGrid>

                <Divider my="xs" />

                {/* Grouping Mode */}
                <div>
                  <Text size="xs" fw={600} c="dimmed" mb={4}>
                    Table Format:
                  </Text>
                  <SegmentedControl
                    size="xs"
                    fullWidth
                    value={groupBy}
                    onChange={val => setGroupBy(val as 'task' | 'date')}
                    data={[
                      { value: 'task', label: 'By Task' },
                      { value: 'date', label: 'Chronological' },
                    ]}
                  />
                </div>

                {/* Modular Toggles Section */}
                <Text size="xs" fw={700} c="dimmed" tt="uppercase" mt="xs">
                  Summary Metrics:
                </Text>

                <SimpleGrid cols={1} spacing="xs">
                  <Switch
                    size="xs"
                    label="Summary metrics bar"
                    checked={showSummaryStats}
                    onChange={e => setShowSummaryStats(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label={`${t.contractBudget} (Contract Budget)`}
                    checked={showContractBudget}
                    onChange={e => setShowContractBudget(e.currentTarget.checked)}
                    disabled={metadata.budget2Contract <= 0}
                  />

                  <Switch
                    size="xs"
                    label={`${t.totalHours} (Total Hours)`}
                    checked={showTotalHours}
                    onChange={e => setShowTotalHours(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label={`${t.remainingBudget} (Remaining Budget)`}
                    checked={showRemainingBudget}
                    onChange={e => setShowRemainingBudget(e.currentTarget.checked)}
                    disabled={metadata.budget2Contract <= 0}
                  />

                  <Switch
                    size="xs"
                    label={`${t.billableHours} (Billable Hours)`}
                    checked={showBillableHours}
                    onChange={e => setShowBillableHours(e.currentTarget.checked)}
                  />
                </SimpleGrid>

                <Divider my="xs" />

                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  Table Columns & Details:
                </Text>

                <SimpleGrid cols={1} spacing="xs">
                  <Switch
                    size="xs"
                    label={t.showParentTask}
                    checked={showParentTask}
                    onChange={e => setShowParentTask(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label="Task numbers (#)"
                    checked={showTaskIds}
                    onChange={e => setShowTaskIds(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label="Activity column"
                    checked={showActivities}
                    onChange={e => setShowActivities(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label="Team member names"
                    checked={showTeamMembers}
                    onChange={e => setShowTeamMembers(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label="Descriptions / comments"
                    checked={showDescriptions}
                    onChange={e => setShowDescriptions(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label="Billable hours only"
                    checked={showBillableOnly}
                    onChange={e => setShowBillableOnly(e.currentTarget.checked)}
                  />

                  <Switch
                    size="xs"
                    label="Financial values (Rate)"
                    checked={showFinancials}
                    onChange={e => setShowFinancials(e.currentTarget.checked)}
                  />
                </SimpleGrid>

                {showFinancials && (
                  <Group grow mt="xs">
                    <NumberInput
                      size="xs"
                      label={t.rate}
                      min={0}
                      value={hourlyRate}
                      onChange={val => setHourlyRate(typeof val === 'number' ? val : 0)}
                    />
                    <Select
                      size="xs"
                      label="Currency"
                      data={['EUR', 'BGN', 'USD']}
                      value={currency}
                      onChange={val => setCurrency(val || 'EUR')}
                    />
                  </Group>
                )}

                <Textarea
                  size="xs"
                  label={t.notesTitle}
                  placeholder="Enter an additional note or explanation..."
                  rows={2}
                  value={customNotes}
                  onChange={e => setCustomNotes(e.target.value)}
                />
              </Stack>
            </Paper>

            {/* Action Export Buttons */}
            <Stack gap="xs">
              <Button
                size="md"
                color="blue"
                leftSection={<IconPrinter size={18} />}
                onClick={handlePrint}
                fullWidth
              >
                Print / Save as PDF
              </Button>

              <Button
                size="md"
                variant="light"
                color="teal"
                leftSection={<IconFileSpreadsheet size={18} />}
                onClick={handleExcelExport}
                fullWidth
              >
                Export to Excel (CSV)
              </Button>

              <Button
                size="md"
                variant="subtle"
                color={isCopied ? 'teal' : 'gray'}
                leftSection={isCopied ? <IconCheck size={18} /> : <IconCopy size={18} />}
                onClick={handleCopyEmailSummary}
                fullWidth
              >
                {isCopied ? 'Copied to clipboard!' : 'Copy Email Summary'}
              </Button>
            </Stack>
          </Stack>
        </Grid.Col>

        {/* RIGHT COLUMN: Live Document Preview */}
        <Grid.Col span={{ base: 12, md: 8 }} className="client-preview-col">
          <Stack gap="xs">
            <Group justify="space-between" align="center" className="client-preview-header-bar">
              <Group gap="xs">
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  Document Preview
                </Text>
                <Text size="11px" c="dimmed">
                  ({t.excludeHint})
                </Text>
              </Group>

              <Group gap="xs">
                {excludedEntryIds.size > 0 && (
                  <Badge color="orange" size="sm" variant="light">
                    {t.excludedCount}: {excludedEntryIds.size}
                  </Badge>
                )}
                <Badge size="sm" color="blue" variant="light">
                  {includedEntries.length} / {exportEntries.length} entries
                </Badge>
              </Group>
            </Group>

            {/* Notification when rows are excluded */}
            {excludedEntryIds.size > 0 && (
              <Alert color="orange" variant="light" p="xs" radius="sm" className="client-preview-alert">
                <Group justify="space-between" align="center">
                  <Text size="xs" fw={500}>
                    {`${excludedEntryIds.size} entries excluded. They are omitted from final PDF, Excel, and Email.`}
                  </Text>
                  <Button size="compact-xs" variant="white" color="orange" onClick={handleRestoreAll}>
                    {t.restoreAll}
                  </Button>
                </Group>
              </Alert>
            )}

            {/* Document Preview Canvas */}
            <Box
              className="client-preview-wrapper"
              bg="light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))"
            >
              <div className="client-print-document">
                <div className="client-report-container" ref={reportContainerRef}>
                  {/* Clean Document Header */}
                  <div className="client-report-header">
                    {companyLogo && logoPosition === 'center' && (
                      <div className="client-report-logo-center-wrapper">
                        <img src={companyLogo} alt="Company Logo" className="client-report-logo-center" />
                      </div>
                    )}
                    <div className="client-report-brand-row">
                      <div>
                        {companyLogo && logoPosition === 'top-left' && (
                          <img
                            src={companyLogo}
                            alt="Company Logo"
                            className="client-report-logo client-report-logo-left"
                          />
                        )}
                        <h1 className="client-report-title">{reportTitle}</h1>
                      </div>
                      <div className="client-report-date-box">
                        {companyLogo && logoPosition === 'top-right' && (
                          <img
                            src={companyLogo}
                            alt="Company Logo"
                            className="client-report-logo client-report-logo-right"
                          />
                        )}
                        {showCreatedBy && createdBy && (
                          <p className="client-report-date">
                            {t.createdBy}: <strong>{createdBy}</strong>
                          </p>
                        )}
                        {showIssueDate && formattedIssueDate && (
                          <p className="client-report-date">
                            {t.issueDate}: <strong>{formattedIssueDate}</strong>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    {hasAnyMetaField && (
                      <div className="client-report-meta-grid">
                        {showClient && clientName && (
                          <div className="client-report-meta-item">
                            <span className="client-report-meta-label">{t.client}</span>
                            <span className="client-report-meta-value">{clientName}</span>
                          </div>
                        )}
                        {showProject && projectName && (
                          <div className="client-report-meta-item">
                            <span className="client-report-meta-label">{t.project}</span>
                            <span className="client-report-meta-value">{projectName}</span>
                          </div>
                        )}
                        {showPeriod && periodLabel && (
                          <div className="client-report-meta-item">
                            <span className="client-report-meta-label">{t.period}</span>
                            <span className="client-report-meta-value">{periodLabel}</span>
                          </div>
                        )}
                        {showMetaContractBudget && metadata.budget2Contract > 0 && (
                          <div className="client-report-meta-item">
                            <span className="client-report-meta-label">{t.contractBudget}</span>
                            <span className="client-report-meta-value">
                              {metadata.budget2Contract.toFixed(2)} {t.hoursShort}
                            </span>
                          </div>
                        )}
                        {showContractType && metadata.contractType && (
                          <div className="client-report-meta-item">
                            <span className="client-report-meta-label">
                              {t.contractType}
                            </span>
                            <span className="client-report-meta-value">{metadata.contractType}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Minimalist Summary Bar (Only active metrics, no big digits) */}
                  {hasAnySummaryMetric && (
                    <div className="client-report-summary-bar">
                      {showContractBudget && metadata.budget2Contract > 0 && (
                        <div className="client-summary-item">
                          <span className="client-summary-label">{t.contractBudget}:</span>
                          <span className="client-summary-val">
                            {metadata.budget2Contract.toFixed(2)} {t.hoursShort}
                          </span>
                        </div>
                      )}

                      {showTotalHours && (
                        <div className="client-summary-item">
                          <span className="client-summary-label">{t.totalHours}:</span>
                          <span className="client-summary-val">
                            {totals.totalHours.toFixed(2)} {t.hoursShort}
                          </span>
                        </div>
                      )}

                      {showRemainingBudget && metadata.budget2Contract > 0 && (
                        <div className="client-summary-item">
                          <span className="client-summary-label">{t.remainingBudget}:</span>
                          <span
                            className={`client-summary-val ${
                              metadata.budget2Contract - totals.totalHours < 0 ? 'danger' : 'highlight'
                            }`}
                          >
                            {(metadata.budget2Contract - totals.totalHours).toFixed(2)} {t.hoursShort}
                          </span>
                        </div>
                      )}

                      {showBillableHours && (
                        <div className="client-summary-item">
                          <span className="client-summary-label">{t.billableHours}:</span>
                          <span className="client-summary-val highlight">
                            {totals.billableHours.toFixed(2)} {t.hoursShort}
                          </span>
                        </div>
                      )}

                      {showFinancials && hourlyRate > 0 && (
                        <div className="client-summary-item">
                          <span className="client-summary-label">{t.totalAmount}:</span>
                          <span className="client-summary-val highlight">
                            {totals.totalCost.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-US', {
                              minimumFractionDigits: 2,
                            })}{' '}
                            {currency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Group By Task Table with Individual Entry Sub-Rows */}
                  {groupBy === 'task' && (
                    <table className="client-report-table">
                      <thead>
                        <tr>
                          <th className="action-col">
                            <Checkbox
                              size="xs"
                              checked={isAllIncluded}
                              indeterminate={isPartiallyExcluded}
                              onChange={toggleAllExclusion}
                              aria-label="Toggle select all"
                            />
                          </th>
                          <th style={{ width: '85px' }}>{t.date}</th>
                          {showActivities && <th style={{ width: '120px' }}>{t.activity}</th>}
                          {showTeamMembers && <th style={{ width: '120px' }}>{t.teamMember}</th>}
                          {showDescriptions && <th>{t.description}</th>}
                          <th className="text-right" style={{ width: '75px' }}>{t.hours}</th>
                          {showFinancials && hourlyRate > 0 && (
                            <th className="text-right" style={{ width: '90px' }}>
                              {t.amount} ({currency})
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {allGroupedTasks.length === 0 ? (
                          <tr>
                            <td
                              colSpan={
                                2 +
                                (showActivities ? 1 : 0) +
                                (showTeamMembers ? 1 : 0) +
                                (showDescriptions ? 1 : 0) +
                                (showFinancials && hourlyRate > 0 ? 1 : 0)
                              }
                              className="text-center"
                              style={{ padding: '20px' }}
                            >
                              {t.noEntries}
                            </td>
                          </tr>
                        ) : (
                          allGroupedTasks.map(task => {
                            const isParent = Boolean(showParentTask && task.isParent && task.children && task.children.length > 0);
                            const allTaskEntryIds = task.entryIds || [];
                            const isTaskExcluded =
                              allTaskEntryIds.length > 0 &&
                              allTaskEntryIds.every(id => excludedEntryIds.has(id));
                            const isTaskPartiallyExcluded =
                              allTaskEntryIds.length > 0 &&
                              allTaskEntryIds.some(id => excludedEntryIds.has(id)) &&
                              !isTaskExcluded;

                            const taskColSpan =
                              1 +
                              (showActivities ? 1 : 0) +
                              (showTeamMembers ? 1 : 0) +
                              (showDescriptions ? 1 : 0) +
                              1 +
                              (showFinancials && hourlyRate > 0 ? 1 : 0);

                            const taskTitle = task.issueId === 0
                              ? (language === 'bg' ? 'Общ проект (без конкретна задача)' : 'General project (no specific task)')
                              : (task.subject || `#${task.issueId}`);

                            if (isParent) {
                              const parentDirectEntries = task.directEntries || [];
                              const allChildrenEntries = (task.children || []).flatMap(c => c.entries || []);
                              const allParentAndChildrenEntries = [...parentDirectEntries, ...allChildrenEntries];
                              const taskIncludedEntries = allParentAndChildrenEntries.filter(e => !excludedEntryIds.has(e.id));
                              const taskIncludedHours = taskIncludedEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
                              const taskIncludedCost = Math.round(taskIncludedHours * hourlyRate * 100) / 100;

                              return (
                                <React.Fragment key={`task-group-${task.issueId}`}>
                                  {/* Parent Task Group Header Row */}
                                  <tr className={`client-report-task-group-row client-report-parent-task-row ${isTaskExcluded ? 'is-excluded' : ''}`}>
                                    <td className="action-col">
                                      <Checkbox
                                        size="xs"
                                        checked={!isTaskExcluded}
                                        indeterminate={isTaskPartiallyExcluded}
                                        onChange={() => toggleTaskExclusion(allTaskEntryIds)}
                                        aria-label="Toggle parent task and subtasks"
                                      />
                                    </td>
                                    <td colSpan={taskColSpan}>
                                      <div className="client-report-task-group-header-content">
                                        <div className="client-report-task-group-title">
                                          <span className="client-report-parent-badge">
                                            {language === 'bg' ? 'Родителска задача' : 'Parent Task'}
                                          </span>
                                          {showTaskIds && task.issueId > 0 && (
                                            <span className="client-report-task-group-id">#{task.issueId}</span>
                                          )}
                                          <span className="client-report-task-group-subject">{taskTitle}</span>
                                          <span className="client-report-subtasks-count">
                                            ({task.children!.length} {language === 'bg' ? (task.children!.length === 1 ? 'подзадача' : 'подзадачи') : (task.children!.length === 1 ? 'subtask' : 'subtasks')})
                                          </span>
                                        </div>
                                        <div className="client-report-task-group-subtotal">
                                          <span>{taskIncludedHours.toFixed(2)} {t.hoursShort}</span>
                                          {showFinancials && hourlyRate > 0 && (
                                            <span className="client-report-task-group-cost">
                                              ({taskIncludedCost.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-US', { minimumFractionDigits: 2 })} {currency})
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                  </tr>

                                  {/* Direct entries on parent task if any */}
                                  {parentDirectEntries.map(entry => {
                                    const isEntryExcluded = excludedEntryIds.has(entry.id);
                                    const h = Number(entry.hours) || 0;
                                    const cost = Math.round(h * hourlyRate * 100) / 100;

                                    return (
                                      <tr
                                        key={`entry-${entry.id}`}
                                        className={`client-report-sub-entry-row ${isEntryExcluded ? 'is-excluded' : ''}`}
                                      >
                                        <td className="action-col">
                                          <Checkbox
                                            size="xs"
                                            checked={!isEntryExcluded}
                                            onChange={() => toggleEntryExclusion(entry.id)}
                                            aria-label="Toggle entry"
                                          />
                                        </td>
                                        <td className="client-report-sub-date" style={{ paddingLeft: '20px' }}>{entry.spent_on}</td>
                                        {showActivities && <td>{entry.activity?.name || '-'}</td>}
                                        {showTeamMembers && <td>{entry.user?.name || '-'}</td>}
                                        {showDescriptions && <td>{entry.comments || '-'}</td>}
                                        <td className="text-right" style={{ fontWeight: 600 }}>
                                          {h.toFixed(2)}
                                        </td>
                                        {showFinancials && hourlyRate > 0 && (
                                          <td className="text-right" style={{ fontWeight: 500 }}>
                                            {cost.toFixed(2)}
                                          </td>
                                        )}
                                      </tr>
                                    );
                                  })}

                                  {/* Child Tasks Rows */}
                                  {task.children!.map(child => {
                                    const isChildExcluded =
                                      child.entryIds &&
                                      child.entryIds.length > 0 &&
                                      child.entryIds.every(id => excludedEntryIds.has(id));
                                    const isChildPartiallyExcluded =
                                      child.entryIds &&
                                      child.entryIds.length > 0 &&
                                      child.entryIds.some(id => excludedEntryIds.has(id)) &&
                                      !isChildExcluded;

                                    const childIncludedEntries = (child.entries || []).filter(e => !excludedEntryIds.has(e.id));
                                    const childIncludedHours = childIncludedEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
                                    const childIncludedCost = Math.round(childIncludedHours * hourlyRate * 100) / 100;

                                    return (
                                      <React.Fragment key={`child-task-group-${child.issueId}`}>
                                        {/* Child Task Subheader Row */}
                                        <tr className={`client-report-child-task-row ${isChildExcluded ? 'is-excluded' : ''}`}>
                                          <td className="action-col">
                                            <Checkbox
                                              size="xs"
                                              checked={!isChildExcluded}
                                              indeterminate={isChildPartiallyExcluded}
                                              onChange={() => toggleTaskExclusion(child.entryIds)}
                                              aria-label="Toggle subtask"
                                            />
                                          </td>
                                          <td colSpan={taskColSpan}>
                                            <div className="client-report-task-group-header-content" style={{ paddingLeft: '14px' }}>
                                              <div className="client-report-task-group-title">
                                                <span style={{ color: '#64748b', fontWeight: 700, marginRight: 2 }}>↳</span>
                                                {showTaskIds && child.issueId > 0 && (
                                                  <span className="client-report-child-task-id">#{child.issueId}</span>
                                                )}
                                                <span className="client-report-child-task-subject">{child.subject}</span>
                                              </div>
                                              <div className="client-report-task-group-subtotal">
                                                <span>{childIncludedHours.toFixed(2)} {t.hoursShort}</span>
                                                {showFinancials && hourlyRate > 0 && (
                                                  <span className="client-report-task-group-cost">
                                                    ({childIncludedCost.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-US', { minimumFractionDigits: 2 })} {currency})
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </td>
                                        </tr>

                                        {/* Entries belonging to this child task */}
                                        {(child.entries || []).map(entry => {
                                          const isEntryExcluded = excludedEntryIds.has(entry.id);
                                          const h = Number(entry.hours) || 0;
                                          const cost = Math.round(h * hourlyRate * 100) / 100;

                                          return (
                                            <tr
                                              key={`entry-${entry.id}`}
                                              className={`client-report-sub-entry-row client-report-child-entry-row ${isEntryExcluded ? 'is-excluded' : ''}`}
                                            >
                                              <td className="action-col">
                                                <Checkbox
                                                  size="xs"
                                                  checked={!isEntryExcluded}
                                                  onChange={() => toggleEntryExclusion(entry.id)}
                                                  aria-label="Toggle entry"
                                                />
                                              </td>
                                              <td className="client-report-sub-date" style={{ paddingLeft: '32px' }}>{entry.spent_on}</td>
                                              {showActivities && <td>{entry.activity?.name || '-'}</td>}
                                              {showTeamMembers && <td>{entry.user?.name || '-'}</td>}
                                              {showDescriptions && <td>{entry.comments || '-'}</td>}
                                              <td className="text-right" style={{ fontWeight: 600 }}>
                                                {h.toFixed(2)}
                                              </td>
                                              {showFinancials && hourlyRate > 0 && (
                                                <td className="text-right" style={{ fontWeight: 500 }}>
                                                  {cost.toFixed(2)}
                                                </td>
                                              )}
                                            </tr>
                                          );
                                        })}
                                      </React.Fragment>
                                    );
                                  })}
                                </React.Fragment>
                              );
                            }

                            // Standalone task (not a parent)
                            const taskIncludedEntries = (task.entries || []).filter(e => !excludedEntryIds.has(e.id));
                            const taskIncludedHours = taskIncludedEntries.reduce((sum, e) => sum + (Number(e.hours) || 0), 0);
                            const taskIncludedCost = Math.round(taskIncludedHours * hourlyRate * 100) / 100;

                            return (
                              <React.Fragment key={`task-group-${task.issueId}`}>
                                {/* Task Group Header Row */}
                                <tr className={`client-report-task-group-row ${isTaskExcluded ? 'is-excluded' : ''}`}>
                                  <td className="action-col">
                                    <Checkbox
                                      size="xs"
                                      checked={!isTaskExcluded}
                                      indeterminate={isTaskPartiallyExcluded}
                                      onChange={() => toggleTaskExclusion(task.entryIds)}
                                      aria-label="Toggle task"
                                    />
                                  </td>
                                  <td colSpan={taskColSpan}>
                                    <div className="client-report-task-group-header-content">
                                      <div className="client-report-task-group-title">
                                        {showTaskIds && task.issueId > 0 && (
                                          <span className="client-report-task-group-id">#{task.issueId}</span>
                                        )}
                                        <span className="client-report-task-group-subject">{taskTitle}</span>
                                      </div>
                                      <div className="client-report-task-group-subtotal">
                                        <span>{taskIncludedHours.toFixed(2)} {t.hoursShort}</span>
                                        {showFinancials && hourlyRate > 0 && (
                                          <span className="client-report-task-group-cost">
                                            ({taskIncludedCost.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-US', { minimumFractionDigits: 2 })} {currency})
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                </tr>

                                {/* Individual entries under this task */}
                                {(task.entries || []).map(entry => {
                                  const isEntryExcluded = excludedEntryIds.has(entry.id);
                                  const h = Number(entry.hours) || 0;
                                  const cost = Math.round(h * hourlyRate * 100) / 100;

                                  return (
                                    <tr
                                      key={`entry-${entry.id}`}
                                      className={`client-report-sub-entry-row ${isEntryExcluded ? 'is-excluded' : ''}`}
                                    >
                                      <td className="action-col">
                                        <Checkbox
                                          size="xs"
                                          checked={!isEntryExcluded}
                                          onChange={() => toggleEntryExclusion(entry.id)}
                                          aria-label="Toggle entry"
                                        />
                                      </td>
                                      <td className="client-report-sub-date">{entry.spent_on}</td>
                                      {showActivities && <td>{entry.activity?.name || '-'}</td>}
                                      {showTeamMembers && <td>{entry.user?.name || '-'}</td>}
                                      {showDescriptions && <td>{entry.comments || '-'}</td>}
                                      <td className="text-right" style={{ fontWeight: 600 }}>
                                        {h.toFixed(2)}
                                      </td>
                                      {showFinancials && hourlyRate > 0 && (
                                        <td className="text-right" style={{ fontWeight: 500 }}>
                                          {cost.toFixed(2)}
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="action-col" />
                          <td>{t.total}</td>
                          {showActivities && <td></td>}
                          {showTeamMembers && <td></td>}
                          {showDescriptions && <td></td>}
                          <td className="text-right">{totals.totalHours.toFixed(2)}</td>
                          {showFinancials && hourlyRate > 0 && (
                            <td className="text-right">
                              {totals.totalCost.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-US', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    </table>
                  )}

                  {/* Group By Date / Chronological Table */}
                  {groupBy === 'date' && (
                    <table className="client-report-table">
                      <thead>
                        <tr>
                          <th className="action-col">
                            <Checkbox
                              size="xs"
                              checked={isAllIncluded}
                              indeterminate={isPartiallyExcluded}
                              onChange={toggleAllExclusion}
                              aria-label="Toggle select all"
                            />
                          </th>
                          <th style={{ width: '85px' }}>{t.date}</th>
                          {showParentTask && <th style={{ width: '130px' }}>{t.parentTask}</th>}
                          {showTaskIds && <th style={{ width: '75px' }}>{t.taskNo}</th>}
                          <th>{t.task}</th>
                          {showActivities && <th style={{ width: '110px' }}>{t.activity}</th>}
                          {showTeamMembers && <th style={{ width: '120px' }}>{t.teamMember}</th>}
                          {showDescriptions && <th>{t.description}</th>}
                          <th className="text-right" style={{ width: '75px' }}>{t.hours}</th>
                          {showFinancials && hourlyRate > 0 && (
                            <th className="text-right" style={{ width: '90px' }}>
                              {t.amount} ({currency})
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {exportEntries.length === 0 ? (
                          <tr>
                            <td
                              colSpan={
                                2 +
                                (showParentTask ? 1 : 0) +
                                (showTaskIds ? 1 : 0) +
                                1 +
                                (showActivities ? 1 : 0) +
                                (showTeamMembers ? 1 : 0) +
                                (showDescriptions ? 1 : 0) +
                                1 +
                                (showFinancials && hourlyRate > 0 ? 1 : 0)
                              }
                              className="text-center"
                              style={{ padding: '20px' }}
                            >
                              {t.noEntries}
                            </td>
                          </tr>
                        ) : (
                          exportEntries.map(e => {
                            const isExcluded = excludedEntryIds.has(e.id);
                            const h = Number(e.hours) || 0;
                            const cost = Math.round(h * hourlyRate * 100) / 100;

                            return (
                              <tr key={e.id} className={isExcluded ? 'is-excluded' : undefined}>
                                <td className="action-col">
                                  <Checkbox
                                    size="xs"
                                    checked={!isExcluded}
                                    onChange={() => toggleEntryExclusion(e.id)}
                                    aria-label="Toggle entry"
                                  />
                                </td>
                                <td>{e.spent_on}</td>
                                {showParentTask && (
                                  <td style={{ fontSize: '11px', color: '#475569' }}>
                                    {e.issue?.parent?.id ? (
                                      <span title={e.issue.parent.subject || ''}>
                                        <strong>#{e.issue.parent.id}</strong>
                                        {e.issue.parent.subject && (
                                          <span style={{ display: 'block', maxWidth: 130, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#64748b' }}>
                                            {e.issue.parent.subject}
                                          </span>
                                        )}
                                      </span>
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                )}
                                {showTaskIds && (
                                  <td>
                                    <strong>{e.issue?.id ? `#${e.issue.id}` : '-'}</strong>
                                  </td>
                                )}
                                <td style={{ fontWeight: 500 }}>
                                  {e.issue?.subject || (e.issue?.id ? `#${e.issue.id}` : t.allProject)}
                                </td>
                                {showActivities && <td>{e.activity?.name || '-'}</td>}
                                {showTeamMembers && <td>{e.user?.name || '-'}</td>}
                                {showDescriptions && <td>{e.comments || '-'}</td>}
                                <td className="text-right" style={{ fontWeight: 700 }}>
                                  {h.toFixed(2)}
                                </td>
                                {showFinancials && hourlyRate > 0 && (
                                  <td className="text-right" style={{ fontWeight: 600 }}>
                                    {cost.toFixed(2)}
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="action-col" />
                          <td>{t.total}</td>
                          {showParentTask && <td></td>}
                          {showTaskIds && <td></td>}
                          <td></td>
                          {showActivities && <td></td>}
                          {showTeamMembers && <td></td>}
                          {showDescriptions && <td></td>}
                          <td className="text-right">{totals.totalHours.toFixed(2)}</td>
                          {showFinancials && hourlyRate > 0 && (
                            <td className="text-right">
                              {totals.totalCost.toLocaleString(language === 'bg' ? 'bg-BG' : 'en-US', {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                          )}
                        </tr>
                      </tfoot>
                    </table>
                  )}

                  {/* Notes Block */}
                  {customNotes && (
                    <div className="client-report-notes">
                      <strong>{t.notesTitle}:</strong> {customNotes}
                    </div>
                  )}
                </div>
              </div>
            </Box>
          </Stack>
        </Grid.Col>
      </Grid>
    </Modal>
  );
};
