import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Modal, Button, Select, NumberInput, Textarea, Group, Stack, Text, Divider, ActionIcon, Grid, Alert, Tooltip } from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useStagedEntries } from '../../../contexts/StagedEntriesContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { usePresets } from '../../../hooks/usePresets';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { createTimeEntry, updateTimeEntry, redmineApiRequest } from '../../../services/redmine';
import { setLastActivityForTask } from '../../../services/taskActivity';
import type { TimeEntry, TimeLogPreset, StagedTimeEntry } from '../../../types';
import { IconDeviceFloppy, IconSend, IconTrash, IconGitCommit } from '@tabler/icons-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { SavePresetModal } from './SavePresetModal';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';
import { CustomFieldsSection } from '../../../components/common/CustomFieldsSection';
import { cleanTaskId, formatCustomFieldsPayload, formatDisplayDateWithRelative } from '../../../utils/formatters';

/// <summary>
/// Properties for configuring the TimeEntryFormModal component.
/// </summary>
interface TimeEntryFormModalProps {
  /// <summary>Whether the modal is currently open.</summary>
  isOpen: boolean;
  /// <summary>Callback triggered when modal is closed.</summary>
  onClose: () => void;
  /// <summary>Callback triggered when time entry is successfully saved.</summary>
  onSuccess: () => void;
  /// <summary>Existing time entry to be edited, if any.</summary>
  editEntry?: TimeEntry | null;
  /// <summary>Existing locally staged time entry to be edited, if any.</summary>
  editStagedEntry?: StagedTimeEntry | null;
  /// <summary>Existing time entry to copy data from, if any.</summary>
  copyEntry?: TimeEntry | null;
  /// <summary>Default date to populate when creating a new entry.</summary>
  defaultDate?: string;
  /// <summary>Identifier of initial preset to pre-fill.</summary>
  initialPresetId?: string | null;
  /// <summary>Optional initial preset object to pre-fill (including built-in presets).</summary>
  initialPreset?: TimeLogPreset | null;
}

/// <summary>
/// Modal dialog for logging, editing, and copying Redmine time entries.
/// </summary>
export const TimeEntryFormModal: React.FC<TimeEntryFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editEntry,
  editStagedEntry,
  copyEntry,
  defaultDate,
  initialPresetId,
  initialPreset,
}) => {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { allProjects, refreshRecentProjects } = useProjects();
  const { stageEntry, updateStagedEntry, removeStagedEntry } = useStagedEntries();
  const confirmDialog = useConfirm();
  const { language, t } = useLanguage();
  const { presets, savePreset, deletePreset } = usePresets();

  const isEditing = Boolean(editEntry);
  const isEditingStaged = Boolean(editStagedEntry);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(initialPresetId || null);
  const [selectedTaskSubject, setSelectedTaskSubject] = useState<string>('');
  const [formResult, setFormResult] = useState<{ success: boolean; message: string } | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});

  /// <summary>
  /// Updates a custom field value safely without accessing synthetic event targets asynchronously.
  /// </summary>
  /// <param name="fieldId">Custom field identifier.</param>
  /// <param name="value">New field string value.</param>
  const handleCustomFieldChange = (fieldId: number, value: string) => {
    setCustomFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };


  const { customFields } = useCustomFields();
  const billableFieldId = localStorage.getItem('billableFieldId');

  const form = useForm({
    initialValues: {
      projectId: '',
      taskId: '',
      activityId: '',
      hours: '' as string | number,
      spentOn: '',
      comments: '',
    },
    validate: {
      activityId: (value) => (value ? null : t('validationActivityRequired')),
      hours: (value) => (value && Number(value) > 0 ? null : t('validationHoursRequired')),
      spentOn: (value) => (value ? null : t('validationDateRequired')),
      taskId: (value, values) => {
        const cleanTask = value ? String(value).replace(/^#/, '').trim() : '';
        const cleanProject = values.projectId && values.projectId !== 'my_issues' ? String(values.projectId).trim() : '';
        if (!cleanTask && !cleanProject) {
          return t('validationProjectOrTaskRequired');
        }
        return null;
      },
    },
  });

  const { activities: projectActivities } = useActivitiesForProject(form.values.projectId || null, isOpen);

  const additionalTaskOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const sourceEntry = editEntry || copyEntry;
    if (sourceEntry?.issue) {
      options.push({
        value: sourceEntry.issue.id.toString(),
        label: `#${sourceEntry.issue.id} - ${sourceEntry.issue.subject || (sourceEntry.issue as any).name || ''}`,
      });
    }
    if (editStagedEntry?.issueId) {
      options.push({
        value: editStagedEntry.issueId.toString(),
        label: `#${editStagedEntry.issueId} - ${editStagedEntry.issueSubject || ''}`,
      });
    }
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && preset.taskId && preset.taskSubject) {
      options.push({
        value: preset.taskId,
        label: `#${preset.taskId} - ${preset.taskSubject}`,
      });
    }
    return options;
  }, [editEntry, editStagedEntry, copyEntry, presets, selectedPresetId]);

  const additionalActivityOptions = useMemo(() => {
    const sourceEntry = editEntry || copyEntry;
    if (sourceEntry?.activity) {
      return [
        {
          value: sourceEntry.activity.id.toString(),
          label: sourceEntry.activity.name || `Activity #${sourceEntry.activity.id}`,
        },
      ];
    }
    if (editStagedEntry?.activityId) {
      return [
        {
          value: editStagedEntry.activityId.toString(),
          label: editStagedEntry.activityName || `Activity #${editStagedEntry.activityId}`,
        },
      ];
    }
    return [];
  }, [editEntry, editStagedEntry, copyEntry]);

  const handleApplyPreset = (presetId: string | null, presetOverride?: TimeLogPreset | null) => {
    setSelectedPresetId(presetId);
    if (!presetId && !presetOverride) return;

    const preset = presetOverride || presets.find(p => p.id === presetId);
    if (preset) {
      if (preset.projectId) form.setFieldValue('projectId', preset.projectId);
      if (preset.taskId) form.setFieldValue('taskId', preset.taskId);
      setSelectedTaskSubject(preset.taskSubject || '');
      if (preset.activityId) form.setFieldValue('activityId', preset.activityId);
      if (preset.hours) form.setFieldValue('hours', preset.hours);
      if (preset.comments !== undefined) form.setFieldValue('comments', preset.comments);
      if (preset.isBillable !== undefined) {
        const bId = localStorage.getItem('billableFieldId');
        if (bId) {
          setCustomFieldValues(prev => ({
            ...prev,
            [parseInt(bId)]: preset.isBillable ? '1' : '0'
          }));
        }
      }
    }
  };

  const initializedTargetRef = useRef<string | null>(null);

  /// <summary>
  /// Manages form initialization and complete state cleanup across modal open/close lifecycles.
  /// When closed, completely cleans up all form fields, errors, presets, and custom fields to avoid stale data leaking.
  /// When opened, initializes values according to the requested edit entry, copy entry, or date preset.
  /// </summary>
  useEffect(() => {
    if (!isOpen) {
      if (initializedTargetRef.current !== null) {
        initializedTargetRef.current = null;
        form.reset();
        form.clearErrors();
        setFormResult(null);
        setIsSubmitting(false);
        setSelectedPresetId(null);
        setSelectedTaskSubject('');
        setCustomFieldValues({});
      }
      return;
    }

    const currentTargetKey = editEntry
      ? `edit_${editEntry.id}`
      : editStagedEntry
      ? `edit_staged_${editStagedEntry.localId}`
      : copyEntry
      ? `copy_${copyEntry.id}_${defaultDate || ''}`
      : `new_${defaultDate || ''}_${initialPreset?.id || initialPresetId || ''}`;

    // Only populate if opening freshly or switching to a different entry/date/preset
    if (initializedTargetRef.current !== currentTargetKey) {
      initializedTargetRef.current = currentTargetKey;
      form.clearErrors();
      setFormResult(null);
      setIsSubmitting(false);

      if (editEntry) {
        form.setValues({
          projectId: editEntry.project?.id?.toString() || '',
          taskId: editEntry.issue?.id?.toString() || '',
          activityId: editEntry.activity?.id?.toString() || '',
          hours: editEntry.hours,
          spentOn: editEntry.spent_on,
          comments: editEntry.comments || '',
        });
        setSelectedTaskSubject(editEntry.issue?.subject || '');

        const initialValues: Record<number, string> = {};
        if (editEntry.custom_fields) {
          editEntry.custom_fields.forEach(f => {
            initialValues[f.id] = f.value;
          });
        }
        setCustomFieldValues(initialValues);
        setSelectedPresetId(null);
      } else if (editStagedEntry) {
        form.setValues({
          projectId: editStagedEntry.projectId || '',
          taskId: editStagedEntry.issueId?.toString() || '',
          activityId: editStagedEntry.activityId?.toString() || '',
          hours: editStagedEntry.hours,
          spentOn: editStagedEntry.spent_on,
          comments: editStagedEntry.comments || '',
        });
        setSelectedTaskSubject(editStagedEntry.issueSubject || '');

        const initialValues: Record<number, string> = {};
        if (editStagedEntry.custom_fields) {
          editStagedEntry.custom_fields.forEach(f => {
            initialValues[f.id] = String(f.value);
          });
        }
        setCustomFieldValues(initialValues);
        setSelectedPresetId(null);
      } else if (copyEntry) {
        form.setValues({
          projectId: copyEntry.project?.id?.toString() || '',
          taskId: copyEntry.issue?.id?.toString() || '',
          activityId: copyEntry.activity?.id?.toString() || '',
          hours: copyEntry.hours,
          spentOn: defaultDate || '',
          comments: copyEntry.comments || '',
        });
        setSelectedTaskSubject(copyEntry.issue?.subject || '');

        const initialValues: Record<number, string> = {};
        if (copyEntry.custom_fields) {
          copyEntry.custom_fields.forEach(f => {
            initialValues[f.id] = f.value;
          });
        }
        setCustomFieldValues(initialValues);
        setSelectedPresetId(null);
      } else {
        const now = new Date();
        const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        form.setValues({
          projectId: '',
          taskId: '',
          activityId: '',
          hours: '',
          spentOn: defaultDate || localToday,
          comments: '',
        });
        setSelectedPresetId(initialPreset?.id || initialPresetId || null);
        setSelectedTaskSubject('');

        const initialValues: Record<number, string> = {};
        const bId = localStorage.getItem('billableFieldId');
        customFields.forEach(field => {
          if (field.id === Number(bId)) {
            initialValues[field.id] = '1';
          } else {
            initialValues[field.id] = field.default_value || '';
          }
        });
        setCustomFieldValues(initialValues);

        if (initialPreset || initialPresetId) {
          handleApplyPreset(initialPreset?.id || initialPresetId || null, initialPreset || null);
        }
      }

      const sourceActId = editEntry?.activity?.id || editStagedEntry?.activityId || copyEntry?.activity?.id;
      if (sourceActId) {
        form.setFieldValue('activityId', sourceActId.toString());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editEntry, editStagedEntry, copyEntry, defaultDate, initialPresetId, initialPreset]);

  /// <summary>
  /// Sets default values for newly loaded custom fields without resetting any existing user input.
  /// </summary>
  useEffect(() => {
    if (!isOpen || isEditing || isEditingStaged || customFields.length === 0) return;

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
  }, [isOpen, isEditing, customFields]);

  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);

  const handleSavePreset = () => {
    setIsSavePresetModalOpen(true);
  };

  const handleExecuteSavePreset = (name: string) => {
    const { projectId, taskId, activityId, hours, comments } = form.values;

    const project = allProjects.find(p => p.id.toString() === projectId);
    const taskOpt = additionalTaskOptions.find(t => t.value === taskId);
    const matchedActivity = projectActivities.find(a => a.id.toString() === activityId);

    const newPreset: TimeLogPreset = {
      id: 'preset_' + Date.now(),
      name: name.trim(),
      projectId,
      projectName: project?.name || '',
      taskId,
      taskSubject: selectedTaskSubject || (taskOpt ? taskOpt.label.replace(/^#\d+\s*-\s*/, '') : ''),
      activityId,
      activityName: matchedActivity?.name || '',
      hours: typeof hours === 'string' ? parseFloat(hours) || 0 : hours,
      comments,
      isBillable: customFieldValues[Number(billableFieldId)] === '1',
    };

    savePreset(newPreset);
    setSelectedPresetId(newPreset.id);
    setFormResult({ success: true, message: `${t('presetSavedPrefix')} „${name.trim()}“` });
  };

  const handleDeletePreset = async () => {
    const preset = presets.find(p => p.id === selectedPresetId);
    if (!preset) return;
    const confirmed = await confirmDialog({
      message: `${t('deletePresetConfirmPrefix')} „${preset.name}“?`,
      variant: 'danger',
      confirmText: t('deleteBtn'),
    });
    if (confirmed) {
      deletePreset(preset.id);
      setSelectedPresetId('');
      setFormResult({ success: true, message: t('presetDeletedMsg') });
    }
  };

  /// <summary>
  /// Commits (stages) or updates a staged time entry locally without pushing to Redmine yet.
  /// </summary>
  const handleCommitLocal = () => {
    if (isSubmitting) return;
    const validation = form.validate();
    if (validation.hasErrors) return;

    setIsSubmitting(true);

    const values = form.values;
    const payloadCustomFields = formatCustomFieldsPayload(customFieldValues);
    const cleanId = cleanTaskId(values.taskId);
    const parsedTaskId = cleanId ? parseInt(cleanId, 10) : undefined;
    const validTaskId = (parsedTaskId && !isNaN(parsedTaskId)) ? parsedTaskId : undefined;
    const cleanProjectId = values.projectId && values.projectId !== 'my_issues' ? values.projectId.toString().trim() : '';

    const matchedProject = allProjects.find(p => p.id.toString() === cleanProjectId);
    const projectName = matchedProject?.name || editStagedEntry?.projectName || copyEntry?.project?.name || t('generalNoProject');

    const matchedActivity = projectActivities.find(a => a.id.toString() === values.activityId);
    const activityName =
      matchedActivity?.name ||
      (editStagedEntry?.activityId?.toString() === values.activityId ? editStagedEntry.activityName : undefined) ||
      (copyEntry?.activity?.id?.toString() === values.activityId ? copyEntry.activity.name : undefined) ||
      `#${values.activityId}`;

    const preset = presets.find(p => p.id === selectedPresetId);
    const resolvedTaskSubject =
      selectedTaskSubject ||
      (validTaskId && preset?.taskId === String(validTaskId) ? preset.taskSubject : undefined) ||
      (validTaskId && editStagedEntry?.issueId === validTaskId ? editStagedEntry.issueSubject : undefined) ||
      undefined;

    const stagedData = {
      projectId: cleanProjectId,
      projectName,
      issueId: validTaskId,
      issueSubject: resolvedTaskSubject,
      activityId: parseInt(values.activityId, 10),
      activityName,
      hours: typeof values.hours === 'string' ? parseFloat(values.hours) : values.hours,
      comments: values.comments.trim(),
      spent_on: values.spentOn,
      ...(payloadCustomFields.length > 0 ? { custom_fields: payloadCustomFields } : { custom_fields: undefined }),
    };

    if (isEditingStaged && editStagedEntry) {
      updateStagedEntry(editStagedEntry.localId, stagedData);
      setFormResult({ success: true, message: t('committedUpdatedMsg') });
    } else {
      stageEntry(stagedData);
      setFormResult({ success: true, message: t('committedSuccessMsg') });
    }

    setTimeout(() => {
      onSuccess();
      onClose();
    }, 500);
  };

  const handleSubmit = async (values: typeof form.values) => {
    setIsSubmitting(true);
    setFormResult(null);
    try {
      const payloadCustomFields = formatCustomFieldsPayload(customFieldValues);
      const cleanId = cleanTaskId(values.taskId);
      const parsedTaskId = cleanId ? parseInt(cleanId, 10) : undefined;
      const validTaskId = (parsedTaskId && !isNaN(parsedTaskId)) ? parsedTaskId : undefined;

      const cleanProjectId = values.projectId && values.projectId !== 'my_issues' ? values.projectId.toString().trim() : '';

      const data = {
        hours: typeof values.hours === 'string' ? parseFloat(values.hours) : values.hours,
        comments: values.comments.trim(),
        activity_id: parseInt(values.activityId, 10),
        spent_on: values.spentOn,
        ...(validTaskId ? { issue_id: validTaskId } : (cleanProjectId ? { project_id: cleanProjectId } : {})),
        ...(payloadCustomFields.length > 0 && { custom_fields: payloadCustomFields }),
      };

      if (isEditing && editEntry) {
        await updateTimeEntry(editEntry.id, data);
        setFormResult({ success: true, message: t('timeEntryUpdatedSuccess') });
      } else {
        await createTimeEntry(data);
        if (isEditingStaged && editStagedEntry) {
          if (editStagedEntry.statusId && validTaskId) {
            try {
              await redmineApiRequest(`/issues/${validTaskId}.json`, 'PUT', {
                issue: { status_id: editStagedEntry.statusId },
              });
            } catch {
              // Status update failure should not revert created time entry
            }
          }
          removeStagedEntry(editStagedEntry.localId);
        }
        if (validTaskId && values.activityId) {
          setLastActivityForTask(validTaskId, values.activityId);
        }
        setFormResult({ success: true, message: t('timeEntryCreatedSuccess') });
      }

      // Update recently used projects
      refreshRecentProjects().catch(() => {});

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 600);
    } catch (err: any) {
      setFormResult({ success: false, message: err.message || t('timeEntrySubmitFailed') });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={
        <Text fw={600}>
          {isEditingStaged
            ? t('editStagedTitle')
            : copyEntry
            ? t('copyTimeEntryModalTitle')
            : isEditing
            ? t('editTimeEntryModalTitle')
            : t('logTimeModalTitle')}
        </Text>
      }
      size="80%"
      fullScreen={isMobile}
      centered
    >
      <Stack gap="md">
        {formResult && (
          <Alert color={formResult.success ? 'green' : 'red'}>
            {formResult.message}
          </Alert>
        )}
        {!isEditing && !isEditingStaged && (
          <>
            <Group align="flex-end">
              <Select
                label={t('loadPresetLabel')}
                placeholder={t('choosePresetPlaceholder')}
                value={selectedPresetId}
                onChange={(val) => handleApplyPreset(val)}
                data={presets.map(p => ({ value: p.id, label: p.name }))}
                style={{ flex: 1 }}
              />
              <ActionIcon
                variant="light"
                color="red"
                size="input-sm"
                onClick={handleDeletePreset}
                disabled={!selectedPresetId}
                aria-label={t('deletePresetTooltip')}
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
            <Divider />
          </>
        )}

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <Grid>
              {/* Left Column: Project, Activity, Task, Hours & Date */}
              <Grid.Col span={{ base: 12, md: 6 }}>
                <Stack gap="md">
                  <ProjectTaskActivityFields
                    projectId={form.values.projectId}
                    onProjectChange={(val) => {
                      if (form.values.projectId !== val) {
                        form.setFieldValue('projectId', val);
                        if (!val) form.setFieldValue('taskId', '');
                        form.setFieldValue('activityId', '');
                      }
                    }}
                    taskId={form.values.taskId}
                    onTaskChange={(val, task) => {
                      form.setFieldValue('taskId', val);
                      if (task?.subject) {
                        setSelectedTaskSubject(task.subject);
                      } else if (!val) {
                        setSelectedTaskSubject('');
                      }
                    }}
                    activityId={form.values.activityId}
                    onActivityChange={(val) => form.setFieldValue('activityId', val)}
                    includeMyIssues={true}
                    activityRequired={true}
                    disabled={isSubmitting}
                    additionalTaskOptions={additionalTaskOptions}
                    additionalActivityOptions={additionalActivityOptions}
                  />

                  {/* Side-by-side: Hours & Date */}
                  <Group align="flex-start" wrap="nowrap">
                    <NumberInput
                      label={t('hoursLabel')}
                      withAsterisk
                      min={0}
                      decimalScale={2}
                      step={0.5}
                      w={120}
                      {...form.getInputProps('hours')}
                    />
                    <DatePickerInput
                      label={t('dateLabel')}
                      placeholder={t('dateLabel')}
                      valueFormat="D MMMM YYYY"
                      valueFormatter={({ date }) => {
                        if (!date || Array.isArray(date)) return '';
                        return formatDisplayDateWithRelative(date, language);
                      }}
                      withAsterisk
                      allowDeselect={false}
                      disabled={isSubmitting}
                      style={{ flex: 1 }}
                      value={form.values.spentOn || null}
                      onChange={(val) => form.setFieldValue('spentOn', val || '')}
                      error={form.errors.spentOn}
                    />
                  </Group>
                </Stack>
              </Grid.Col>

              {/* Right Column: Comments & Custom Fields */}
              <Grid.Col span={{ base: 12, md: 6 }} style={{ display: 'flex', flexDirection: 'column' }}>
                <Stack gap="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Textarea
                    label={t('commentsLabel')}
                    placeholder={t('commentsOptionalPlaceholder')}
                    minRows={5}
                    styles={{
                      root: { flex: 1, display: 'flex', flexDirection: 'column' },
                      wrapper: { flex: 1, display: 'flex', flexDirection: 'column' },
                      input: { flex: 1, height: '100%', minHeight: 120, resize: 'vertical' },
                    }}
                    {...form.getInputProps('comments')}
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

            <Group justify="space-between" mt="md" wrap="wrap">
              <Button
                variant="outline"
                onClick={handleSavePreset}
                disabled={isSubmitting}
              >
                {t('savePresetBtn')}
              </Button>
              <Group gap="sm">
                {!isEditing && (
                  <Tooltip label={t('commitForLaterTooltip')}>
                    <Button
                      variant="light"
                      color="orange"
                      leftSection={isEditingStaged ? <IconDeviceFloppy size={16} /> : <IconGitCommit size={16} />}
                      onClick={handleCommitLocal}
                      disabled={isSubmitting}
                    >
                      {isEditingStaged ? t('saveStagedBtn') : t('commitBtn')}
                    </Button>
                  </Tooltip>
                )}
                <Button
                  type="submit"
                  leftSection={isEditing ? <IconDeviceFloppy size={16} /> : <IconSend size={16} />}
                  loading={isSubmitting}
                >
                  {isEditing ? t('updateBtn') : t('pushToRedmineBtn')}
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Stack>

      <SavePresetModal
        isOpen={isSavePresetModalOpen}
        onClose={() => setIsSavePresetModalOpen(false)}
        onSave={handleExecuteSavePreset}
      />
    </Modal>
  );
};
