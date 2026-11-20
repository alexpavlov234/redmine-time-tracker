import React, { useState, useEffect, useRef } from 'react';
import { Modal, Button, Select, Textarea, Checkbox, NumberInput, Group, Stack, Text, Alert, Grid, Paper, Tooltip } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useStagedEntries } from '../../../contexts/StagedEntriesContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { redmineApiRequest, getIssue } from '../../../services/redmine';
import { formatTime, cleanTaskId, formatCustomFieldsPayload } from '../../../utils/formatters';
import { IconSend, IconCheck, IconGitCommit, IconTrash } from '@tabler/icons-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { useSettings } from '../../../contexts/SettingsContext';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';
import { CustomFieldsSection } from '../../../components/common/CustomFieldsSection';
import { getLastActivityForTask, setLastActivityForTask } from '../../../services/taskActivity';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';

/// <summary>
/// Properties for configuring the SummaryModal component.
/// </summary>
interface SummaryModalProps {
  /// <summary>Whether the modal is currently open.</summary>
  isOpen: boolean;
  /// <summary>Callback triggered when modal is closed.</summary>
  onClose: () => void;
}

/// <summary>
/// Modal dialog for reviewing logged queue activity and submitting time logs to Redmine.
/// </summary>
export const SummaryModal: React.FC<SummaryModalProps> = ({ isOpen, onClose }) => {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { usePerformedTasksList } = useSettings();
  const { t } = useLanguage();
  const confirmDialog = useConfirm();
  const { stageEntry } = useStagedEntries();
  const { totalElapsedTime, activities, resetTimer, activeTodo } = useQueueTimer();
  const { allProjects, issueStatuses, ensureStatusesLoaded, ensureProjectsLoaded, refreshRecentProjects } = useProjects();

  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [selectedTaskSubject, setSelectedTaskSubject] = useState<string>('');
  const { activities: projectActivities, defaultActivityId } = useActivitiesForProject(
    activeTodo?.projectId || selectedProjectId || null,
    isOpen
  );

  const [comments, setComments] = useState('');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [isResolvingLastActivity, setIsResolvingLastActivity] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [changeStatus, setChangeStatus] = useState(false);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [manualHours, setManualHours] = useState<number | string>(0);

  /// <summary>
  /// Updates a custom field value safely without accessing synthetic event targets asynchronously.
  /// </summary>
  /// <param name="fieldId">Custom field identifier.</param>
  /// <param name="value">New field string value.</param>
  const handleCustomFieldChange = (fieldId: number, value: string) => {
    setCustomFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const { customFields } = useCustomFields();

  const prevIsOpenRef = useRef(false);

  /// <summary>
  /// Populates form only when the modal dialog transitions from closed to open.
  /// Prevents background re-renders and timer intervals from erasing user edits.
  /// </summary>
  useEffect(() => {
    if (!isOpen) {
      if (prevIsOpenRef.current) {
        prevIsOpenRef.current = false;
        setSelectedProjectId('');
        setSelectedTaskId('');
        setSelectedTaskSubject('');
        setComments('');
        setManualHours(0.1);
        setActivityId(null);
        setIsResolvingLastActivity(false);
        setSubmitResult(null);
        setChangeStatus(false);
        setStatusId(null);
        setIsSubmitting(false);
        setCustomFieldValues({});
      }
      return;
    }

    if (!prevIsOpenRef.current) {
      prevIsOpenRef.current = true;

      if (activeTodo?.taskId) {
        setSelectedProjectId(activeTodo.projectId || '');
        if (!activeTodo.projectId) {
          const parsedTaskNum = parseInt(cleanTaskId(activeTodo.taskId), 10);
          if (!isNaN(parsedTaskNum) && parsedTaskNum > 0) {
            getIssue(parsedTaskNum)
              .then((issue) => {
                if (!prevIsOpenRef.current || !issue) return;
                if (issue.project?.id) {
                  setSelectedProjectId(String(issue.project.id));
                }
                if (!activeTodo.taskSubject && issue.subject) {
                  setSelectedTaskSubject(issue.subject);
                }
              })
              .catch(() => {});
          }
        }
      } else {
        setSelectedProjectId(allProjects.length > 0 ? allProjects[0].id.toString() : '');
        ensureProjectsLoaded();
      }
      setSelectedTaskId(activeTodo?.taskId || '');
      setSelectedTaskSubject(activeTodo?.taskSubject || '');

      // Build comments from activities or todo note
      if (usePerformedTasksList && activities.length > 0) {
        const detailsText = activities
          .map(act => act.text.trim())
          .filter(Boolean)
          .join(' ');
        setComments(detailsText);
      } else {
        setComments(activeTodo?.note || '');
      }
      setSubmitResult(null);
      setChangeStatus(false);
      setStatusId(null);
      setIsSubmitting(false);

      const rawHours = totalElapsedTime / 3600;
      let hoursCalc: number;
      if (rawHours <= 0) {
        hoursCalc = 0.1;
      } else {
        hoursCalc = Math.ceil(rawHours * 20) / 20;
        hoursCalc = Math.max(0.1, hoursCalc);
      }
      setManualHours(parseFloat(hoursCalc.toFixed(2)));

      // Set activity from todo, or check last used activity for task
      if (activeTodo?.activityId) {
        setIsResolvingLastActivity(false);
        setActivityId(String(activeTodo.activityId));
      } else if (activeTodo?.taskId) {
        setIsResolvingLastActivity(true);
        getLastActivityForTask(activeTodo.taskId)
          .then(actId => {
            if (actId && prevIsOpenRef.current) {
              setActivityId(actId);
            }
          })
          .finally(() => {
            if (prevIsOpenRef.current) {
              setIsResolvingLastActivity(false);
            }
          });
      } else {
        setIsResolvingLastActivity(false);
      }

      // Initialize custom field values
      const initialValues: Record<number, string> = {};
      const bId = localStorage.getItem('billableFieldId');
      customFields.forEach(field => {
        if (field.id === Number(bId)) {
          initialValues[field.id] = '1'; // Default billable to true
        } else {
          initialValues[field.id] = field.default_value || '';
        }
      });
      setCustomFieldValues(initialValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  /// <summary>
  /// Sets default values for newly loaded custom fields without overwriting user input.
  /// </summary>
  useEffect(() => {
    if (!isOpen || customFields.length === 0) return;

    setCustomFieldValues(prev => {
      const bId = localStorage.getItem('billableFieldId');
      const updated = { ...prev };
      let changed = false;

      customFields.forEach(field => {
        if (updated[field.id] === undefined) {
          changed = true;
          if (field.id === Number(bId)) {
            updated[field.id] = '1';
          } else {
            updated[field.id] = field.default_value || '';
          }
        }
      });

      return changed ? updated : prev;
    });
  }, [isOpen, customFields]);

  /// <summary>
  /// Auto-selects the project's default activity if no specific or last-used activity is set.
  /// </summary>
  useEffect(() => {
    if (isOpen && !isResolvingLastActivity && !activityId && defaultActivityId && !activeTodo?.activityId) {
      setActivityId(String(defaultActivityId));
    }
  }, [isOpen, isResolvingLastActivity, activityId, defaultActivityId, activeTodo?.activityId]);

  const validateAndBuildCommon = () => {
    const rawIssueId = selectedTaskId || activeTodo?.taskId || '';
    const cleanIssueStr = cleanTaskId(rawIssueId);
    const parsedIssueId = cleanIssueStr ? parseInt(cleanIssueStr, 10) : undefined;
    const validIssueId = (parsedIssueId && !isNaN(parsedIssueId)) ? parsedIssueId : undefined;

    const rawProjectId = selectedProjectId || activeTodo?.projectId || '';
    const cleanProjectId = (rawProjectId && rawProjectId !== 'my_issues') ? rawProjectId.trim() : '';

    if (!validIssueId && !cleanProjectId) {
      setSubmitResult({ success: false, message: t('validationProjectOrTaskRequired') });
      return null;
    }

    if (!activityId) {
      setSubmitResult({ success: false, message: t('validationActivityRequired') });
      return null;
    }

    const hoursFormatted = typeof manualHours === 'string' ? parseFloat(manualHours) : manualHours;
    if (isNaN(hoursFormatted) || hoursFormatted <= 0) {
      setSubmitResult({ success: false, message: t('validationHoursRequired') });
      return null;
    }

    const now = new Date();
    const spentOn = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    return {
      validIssueId,
      cleanProjectId,
      hoursFormatted,
      spentOn,
      payloadCustomFields: formatCustomFieldsPayload(customFieldValues),
    };
  };

  /// <summary>
  /// Commits (stages) the time entry locally for batch pushing later from the calendar.
  /// </summary>
  const handleCommit = () => {
    if (isSubmitting || submitResult?.success) return;
    const validated = validateAndBuildCommon();
    if (!validated) return;

    setIsSubmitting(true);

    const { validIssueId, cleanProjectId, hoursFormatted, spentOn, payloadCustomFields } = validated;
    const matchedProject = allProjects.find(p => p.id.toString() === cleanProjectId);
    const projectName = activeTodo?.projectName || matchedProject?.name || t('generalNoProject');
    const matchedActivity = projectActivities.find(a => a.id.toString() === activityId);
    const activityName = matchedActivity?.name || activeTodo?.activityName || `#${activityId}`;

    stageEntry({
      projectId: cleanProjectId,
      projectName,
      issueId: validIssueId,
      issueSubject: selectedTaskSubject || activeTodo?.taskSubject || undefined,
      activityId: parseInt(activityId!, 10),
      activityName,
      hours: hoursFormatted,
      comments: comments.trim(),
      spent_on: spentOn,
      ...(payloadCustomFields.length > 0 && { custom_fields: payloadCustomFields }),
      ...(changeStatus && statusId && validIssueId ? { statusId } : {}),
    });

    setSubmitResult({ success: true, message: t('committedSuccessMsg') });

    setTimeout(() => {
      onClose();
      resetTimer(true);
    }, 700);
  };

  const handleSubmit = async () => {
    const validated = validateAndBuildCommon();
    if (!validated) return;

    const { validIssueId, cleanProjectId, hoursFormatted, spentOn, payloadCustomFields } = validated;

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      const timeEntryPayload: any = {
        time_entry: {
          ...(validIssueId ? { issue_id: validIssueId } : { project_id: cleanProjectId }),
          hours: hoursFormatted,
          comments: comments.trim(),
          activity_id: parseInt(activityId!, 10),
          spent_on: spentOn,
          ...(payloadCustomFields.length > 0 && { custom_fields: payloadCustomFields }),
        },
      };

      // Step 1: Submit time entry
      await redmineApiRequest('/time_entries.json', 'POST', timeEntryPayload);

      // Step 2: Update issue status if requested
      if (changeStatus && statusId && validIssueId) {
        try {
          await redmineApiRequest(`/issues/${validIssueId}.json`, 'PUT', {
            issue: { status_id: statusId },
          });
        } catch {
          // Status update failed silently
        }
      }

      setSubmitResult({ success: true, message: t('timeEntryCreatedSuccess') });

      if (validIssueId && activityId) {
        setLastActivityForTask(validIssueId, activityId);
      }
      refreshRecentProjects().catch(() => {});

      // Auto-close & advance queue
      setTimeout(() => {
        onClose();
        resetTimer(true); // remove from queue + advance
      }, 800);
    } catch (err: any) {
      setSubmitResult({ success: false, message: err.message || t('timeEntrySubmitFailed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDiscard = async () => {
    if (isSubmitting || submitResult?.success) return;
    const confirmed = await confirmDialog({
      message: t('discardTimerConfirm'),
      subtitle: t('discardTimerSubtitle'),
      variant: 'danger',
      confirmText: t('deleteBtn'),
      cancelText: t('cancelBtn'),
    });
    if (!confirmed) return;
    resetTimer(true);
    onClose();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={<Text fw={600} size="lg">{t('submitTimeEntryModalTitle')}</Text>}
      size="80%"
      fullScreen={isMobile}
      centered
    >
      <Grid>
        {/* Left Column: Hours, Activity, Task info, Status change */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="md">
            {/* Task or Project info */}
            {activeTodo?.taskId ? (
              <>
                <Paper withBorder p="sm" radius="md" bg="var(--mantine-color-default)">
                  <Stack gap={2}>
                    <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                      {activeTodo.projectName}
                    </Text>
                    <RedmineIssueLink
                      issueId={activeTodo.taskId}
                      subject={selectedTaskSubject || activeTodo.taskSubject}
                      size="md"
                      fw={700}
                    />
                  </Stack>
                </Paper>

                {/* Side-by-side: Hours & Activity */}
                <Group align="flex-start" wrap="nowrap">
                  <NumberInput
                    label={t('hoursLabel')}
                    description={`${t('recordedLabel')}: ${formatTime(totalElapsedTime)}`}
                    value={manualHours}
                    onChange={setManualHours}
                    decimalScale={2}
                    step={0.1}
                    min={0.1}
                    withAsterisk
                    w={120}
                  />

                  <Select
                    label={t('activityLabel')}
                    placeholder={t('selectActivityPlaceholder')}
                    value={activityId}
                    onChange={setActivityId}
                    data={projectActivities.map(a => ({ value: a.id.toString(), label: `${a.name}${a.is_default ? ` ${t('defaultTag')}` : ''}` }))}
                    required
                    style={{ flex: 1 }}
                  />
                </Group>
              </>
            ) : (
              <>
                <ProjectTaskActivityFields
                  projectId={selectedProjectId}
                  onProjectChange={(val) => {
                    setSelectedProjectId(val);
                    if (!val) setSelectedTaskId('');
                  }}
                  taskId={selectedTaskId}
                  onTaskChange={(val, task) => {
                    setSelectedTaskId(val);
                    if (task?.subject) {
                      setSelectedTaskSubject(task.subject);
                    } else if (!val) {
                      setSelectedTaskSubject('');
                    }
                  }}
                  activityId={activityId || ''}
                  onActivityChange={(val) => setActivityId(val)}
                  includeMyIssues={true}
                  activityRequired={true}
                  projectRequired={true}
                  taskRequired={false}
                  layout="stacked"
                />

                <NumberInput
                  label={t('hoursLabel')}
                  description={`${t('recordedLabel')}: ${formatTime(totalElapsedTime)}`}
                  value={manualHours}
                  onChange={setManualHours}
                  decimalScale={2}
                  step={0.1}
                  min={0.1}
                  withAsterisk
                />
              </>
            )}

            {/* Status Change row */}
            <Group align="flex-end" wrap="nowrap">
              <Checkbox
                label={t('updateStatusLabel')}
                checked={changeStatus}
                onChange={e => {
                  const checked = e.currentTarget.checked;
                  setChangeStatus(checked);
                  if (checked) {
                    ensureStatusesLoaded();
                  }
                }}
                mb={8}
              />

              {changeStatus && (
                <Select
                  placeholder={t('selectStatusPlaceholder')}
                  value={statusId}
                  onChange={setStatusId}
                  onDropdownOpen={ensureStatusesLoaded}
                  data={issueStatuses.map(s => ({ value: s.id.toString(), label: s.name }))}
                  style={{ flex: 1 }}
                />
              )}
            </Group>
          </Stack>
        </Grid.Col>

        {/* Right Column: Comments & Custom Fields */}
        <Grid.Col span={{ base: 12, md: 6 }} style={{ display: 'flex', flexDirection: 'column' }}>
          <Stack gap="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Textarea
              label={t('commentsLabel')}
              value={comments}
              onChange={(e) => setComments(e.currentTarget.value)}
              placeholder={t('detailedSummaryPlaceholder')}
              minRows={6}
              styles={{
                root: { flex: 1, display: 'flex', flexDirection: 'column' },
                wrapper: { flex: 1, display: 'flex', flexDirection: 'column' },
                input: { flex: 1, height: '100%', minHeight: 140, resize: 'vertical' },
              }}
            />

            <CustomFieldsSection
              customFields={customFields}
              values={customFieldValues}
              onChange={handleCustomFieldChange}
              disabled={isSubmitting}
            />
          </Stack>
        </Grid.Col>
      </Grid>

      {submitResult && (
        <Alert color={submitResult.success ? 'green' : 'red'} mt="md">
          {submitResult.message}
        </Alert>
      )}

      <Group justify="space-between" align="center" wrap="wrap" gap="sm" mt="lg">
        <Tooltip label={t('discardTimerTooltip')}>
          <Button
            variant="light"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={handleDiscard}
            disabled={isSubmitting || submitResult?.success}
          >
            {t('deleteBtn')}
          </Button>
        </Tooltip>

        <Group gap="sm" wrap="wrap">
          <Button variant="default" onClick={onClose}>
            {t('cancelBtn')}
          </Button>
          <Tooltip label={t('commitForLaterTooltip')}>
            <Button
              leftSection={<IconGitCommit size={16} />}
              onClick={handleCommit}
              disabled={isSubmitting || submitResult?.success}
              color="orange"
              variant="light"
              size="md"
            >
              {t('commitBtn')}
            </Button>
          </Tooltip>
          <Button
            leftSection={submitResult?.success ? <IconCheck size={16} /> : <IconSend size={16} />}
            onClick={handleSubmit}
            disabled={isSubmitting || submitResult?.success}
            loading={isSubmitting}
            color={submitResult?.success ? 'green' : 'blue'}
            size="md"
          >
            {submitResult?.success ? t('submittedBtn') : t('pushToRedmineBtn')}
          </Button>
        </Group>
      </Group>
    </Modal>
  );
};
