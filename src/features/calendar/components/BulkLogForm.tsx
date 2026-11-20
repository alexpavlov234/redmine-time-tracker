import React, { useState, useMemo } from 'react';
import { Card, TextInput, Button, Select, NumberInput, Group, Stack, Text, Progress, Badge, ActionIcon, Divider, Alert, Tooltip } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSend, IconCheck, IconTrash, IconCirclePlus, IconGitCommit } from '@tabler/icons-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { createTimeEntry } from '../../../services/redmine';
import type { TimeLogPreset } from '../../../types';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useStagedEntries } from '../../../contexts/StagedEntriesContext';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { usePresets } from '../../../hooks/usePresets';
import { SavePresetModal } from './SavePresetModal';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';
import { CustomFieldsSection } from '../../../components/common/CustomFieldsSection';
import { cleanTaskId, formatCustomFieldsPayload } from '../../../utils/formatters';

/// <summary>
/// Properties for configuring the BulkLogForm component.
/// </summary>
interface BulkLogFormProps {
  /// <summary>Set of date strings representing selected calendar days to log time for.</summary>
  selectedDays: Set<string>;
  /// <summary>Callback triggered when bulk time entries are successfully logged.</summary>
  onSuccess: () => void;
  /// <summary>Callback triggered when bulk logging is cancelled.</summary>
  onCancel: () => void;
}

/// <summary>
/// Component for bulk logging time entries across multiple selected calendar days.
/// </summary>
export const BulkLogForm: React.FC<BulkLogFormProps> = ({ selectedDays, onSuccess, onCancel }) => {
  const { allProjects, refreshRecentProjects } = useProjects();
  const { stageEntries } = useStagedEntries();
  const confirmDialog = useConfirm();
  const { t } = useLanguage();
  const { presets, savePreset, deletePreset } = usePresets();

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>('');
  const [selectedTaskSubject, setSelectedTaskSubject] = useState<string>('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});

  /// <summary>
  /// Updates a custom field value safely without accessing synthetic event targets asynchronously.
  /// </summary>
  /// <param name="fieldId">Custom field identifier.</param>
  /// <param name="value">New field string value.</param>
  const handleCustomFieldChange = (fieldId: number, value: string) => {
    setCustomFieldValues(prev => ({ ...prev, [fieldId]: value }));
  };

  const [isDeploying, setIsDeploying] = useState(false);
  const [progress, setProgress] = useState(0);

  const [statusResult, setStatusResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);

  const { customFields } = useCustomFields();

  const form = useForm({
    initialValues: {
      projectId: '',
      taskId: '',
      activityId: '',
      hours: '' as string | number,
      comments: '',
    },
    validate: {
      taskId: (value) => (value ? null : t('validationTaskRequired')),
      activityId: (value) => (value ? null : t('validationActivityRequired')),
      hours: (value) => (value && Number(value) > 0 ? null : t('validationHoursRequired')),
    },
  });

  const { activities: projectActivities } = useActivitiesForProject(form.values.projectId || null, true);

  /// <summary>
  /// Sets default values for newly loaded custom fields without overwriting user selections.
  /// </summary>
  React.useEffect(() => {
    if (customFields.length > 0) {
      setCustomFieldValues(prev => {
        const initialValues: Record<number, string> = { ...prev };
        let hasChanges = false;
        const billableFieldId = localStorage.getItem('billableFieldId');
        customFields.forEach(field => {
          if (initialValues[field.id] === undefined) {
            hasChanges = true;
            if (field.id === Number(billableFieldId)) {
              initialValues[field.id] = '1';
            } else {
              initialValues[field.id] = field.default_value || '';
            }
          }
        });
        return hasChanges ? initialValues : prev;
      });
    }
  }, [customFields]);

  const additionalTaskOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && preset.taskId && preset.taskSubject) {
      options.push({
        value: preset.taskId,
        label: `#${preset.taskId} - ${preset.taskSubject}`,
      });
    }
    return options;
  }, [presets, selectedPresetId]);

  const handleApplyPreset = (presetId: string | null) => {
    setSelectedPresetId(presetId);
    if (!presetId) return;

    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      if (preset.projectId) form.setFieldValue('projectId', preset.projectId);
      if (preset.taskId) form.setFieldValue('taskId', preset.taskId);
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

  const handleSavePreset = () => {
    setIsSavePresetModalOpen(true);
  };

  const handleExecuteSavePreset = (name: string) => {
    const { projectId, taskId, activityId, hours, comments } = form.values;
    const project = allProjects.find(p => p.id.toString() === projectId);
    const taskOpt = additionalTaskOptions.find(t => t.value === taskId);

    const billableFieldId = localStorage.getItem('billableFieldId');

    const newPreset: TimeLogPreset = {
      id: 'preset_' + Date.now(),
      name: name.trim(),
      projectId,
      projectName: project?.name || '',
      taskId,
      taskSubject: taskOpt ? taskOpt.label.replace(/^#\d+\s*-\s*/, '') : '',
      activityId,
      hours: typeof hours === 'string' ? parseFloat(hours) || 0 : hours,
      comments,
      isBillable: customFieldValues[Number(billableFieldId)] === '1',
    };

    savePreset(newPreset);
    setSelectedPresetId(newPreset.id);
    setStatusResult({ success: true, message: `${t('presetSavedPrefix')} „${name.trim()}“` });
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
      setStatusResult({ success: true, message: t('presetDeletedMsg') });
    }
  };

  /// <summary>
  /// Commits (stages) entries for all selected days locally without pushing to Redmine yet.
  /// </summary>
  const handleCommitBulk = () => {
    if (selectedDays.size === 0) return;
    const validation = form.validate();
    if (validation.hasErrors) return;

    const values = form.values;
    const days = Array.from(selectedDays).sort();
    const payloadCustomFields = formatCustomFieldsPayload(customFieldValues);
    const hoursNum = typeof values.hours === 'string' ? parseFloat(values.hours) : values.hours;

    const cleanId = cleanTaskId(values.taskId);
    const parsedTaskId = cleanId ? parseInt(cleanId, 10) : undefined;
    const validTaskId = (parsedTaskId && !isNaN(parsedTaskId)) ? parsedTaskId : undefined;
    const cleanProjectId = values.projectId && values.projectId !== 'my_issues' ? values.projectId.toString().trim() : '';

    const matchedProject = allProjects.find(p => p.id.toString() === cleanProjectId);
    const projectName = matchedProject?.name || t('generalNoProject');
    const matchedActivity = projectActivities.find(a => a.id.toString() === values.activityId);
    const activityName = matchedActivity?.name || `Activity #${values.activityId}`;
    const preset = presets.find(p => p.id === selectedPresetId);
    const resolvedTaskSubject =
      selectedTaskSubject ||
      (validTaskId && preset?.taskId === String(validTaskId) ? preset.taskSubject : undefined) ||
      undefined;

    stageEntries(
      days.map(dateStr => ({
        projectId: cleanProjectId,
        projectName,
        issueId: validTaskId,
        issueSubject: resolvedTaskSubject,
        activityId: parseInt(values.activityId, 10),
        activityName,
        hours: hoursNum,
        comments: values.comments.trim(),
        spent_on: dateStr,
        ...(payloadCustomFields.length > 0 ? { custom_fields: payloadCustomFields } : {}),
      }))
    );

    setStatusResult({ success: true, message: t('committedSuccessMsg') });
    onSuccess();
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (selectedDays.size === 0) return;

    setIsDeploying(true);
    setProgress(0);

    const days = Array.from(selectedDays).sort();
    let successCount = 0;
    let failCount = 0;

    const payloadCustomFields = formatCustomFieldsPayload(customFieldValues);
    const hoursNum = typeof values.hours === 'string' ? parseFloat(values.hours) : values.hours;

    const cleanId = cleanTaskId(values.taskId);
    const parsedTaskId = cleanId ? parseInt(cleanId, 10) : undefined;
    const validTaskId = (parsedTaskId && !isNaN(parsedTaskId)) ? parsedTaskId : undefined;

    const cleanProjectId = values.projectId && values.projectId !== 'my_issues' ? values.projectId.toString().trim() : '';

    for (const dateStr of days) {
      try {
        await createTimeEntry({
          hours: hoursNum,
          comments: values.comments.trim(),
          activity_id: parseInt(values.activityId, 10),
          spent_on: dateStr,
          ...(validTaskId ? { issue_id: validTaskId } : (cleanProjectId ? { project_id: cleanProjectId } : {})),
          ...(payloadCustomFields.length > 0 && { custom_fields: payloadCustomFields }),
        });
        successCount++;
        setProgress(Math.round((successCount + failCount) / days.length * 100));
      } catch (err) {
        failCount++;
        setProgress(Math.round((successCount + failCount) / days.length * 100));
        console.error(`Failed to log time for ${dateStr}`, err);
      }
    }

    setIsDeploying(false);

    // Update recently used projects
    refreshRecentProjects().catch(() => {});

    if (failCount === 0) {
      const dayWord = successCount === 1 ? t('bulkDayWordSingle') : t('bulkDayWordPlural');
      setStatusResult({ success: true, message: `${t('bulkSuccessPrefix')} ${successCount} ${dayWord}.` });
      setTimeout(() => {
        onSuccess();
      }, 700);
    } else {
      setStatusResult({
        success: false,
        message: `${t('bulkPartialPrefix')} ${successCount}, ${t('bulkPartialFailed')} ${failCount}.`,
      });
    }
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconCheck size={20} color="var(--mantine-color-blue-filled)" />
            <Text fw={600}>{t('bulkLogCardTitle')}</Text>
          </Group>
          <Badge size="lg" color="blue">{selectedDays.size} {t('daysSelectedBadge')}</Badge>
        </Group>
      </Card.Section>

      <Stack gap="md" mt="md">
        {statusResult && (
          <Alert color={statusResult.success ? 'green' : 'red'}>
            {statusResult.message}
          </Alert>
        )}
        <Group align="flex-end">
          <Select
            label={t('loadPresetLabel')}
            placeholder={t('choosePresetPlaceholder')}
            value={selectedPresetId}
            onChange={handleApplyPreset}
            data={presets.map(p => ({ value: p.id, label: p.name }))}
            style={{ flex: 1 }}
          />
          <ActionIcon
            variant="light"
            color="red"
            size="input-sm"
            onClick={handleDeletePreset}
            disabled={!selectedPresetId || isDeploying}
            aria-label={t('deletePresetTooltip')}
          >
            <IconTrash size={16} />
          </ActionIcon>
        </Group>

        <Divider />

        <form onSubmit={form.onSubmit(handleSubmit)}>
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
              projectRequired={true}
              disabled={isDeploying}
              additionalTaskOptions={additionalTaskOptions}
              layout="stacked"
            />

            <NumberInput
              label={t('hoursPerDayLabel')}
              placeholder={t('hoursPerDayPlaceholder')}
              min={0}
              decimalScale={2}
              step={0.5}
              disabled={isDeploying}
              withAsterisk
              {...form.getInputProps('hours')}
            />

            <TextInput
              label={t('commentsLabel')}
              placeholder={t('bulkCommentsPlaceholder')}
              disabled={isDeploying}
              {...form.getInputProps('comments')}
            />

            <CustomFieldsSection
              customFields={customFields}
              values={customFieldValues}
              onChange={handleCustomFieldChange}
              disabled={isDeploying}
            />

            {isDeploying && (
              <Stack gap={4} mt="sm">
                <Progress value={progress} size="xl" striped animated />
                <Text size="sm" c="dimmed" ta="center">{t('loggingProgressLabel')} {progress}%...</Text>
              </Stack>
            )}

            <Group justify="space-between" mt="md">
              <Button
                variant="subtle"
                leftSection={<IconCirclePlus size={16} />}
                onClick={handleSavePreset}
                disabled={isDeploying}
              >
                {t('savePresetBtn')}
              </Button>
              <Group gap="xs" wrap="wrap">
                <Button variant="default" onClick={onCancel} disabled={isDeploying}>{t('cancelBtn')}</Button>
                <Tooltip label={t('commitForLaterTooltip')}>
                  <Button
                    variant="light"
                    color="orange"
                    leftSection={<IconGitCommit size={16} />}
                    onClick={handleCommitBulk}
                    disabled={isDeploying}
                  >
                    {`${t('commitAcrossDaysBtn')} ${selectedDays.size} ${selectedDays.size === 1 ? t('bulkDayWordSingle') : t('bulkDayWordPlural')}`}
                  </Button>
                </Tooltip>
                <Button type="submit" leftSection={<IconSend size={16} />} loading={isDeploying}>
                  {isDeploying
                    ? t('deployingBtn')
                    : `${t('submitAcrossDaysPrefix')} ${selectedDays.size} ${selectedDays.size === 1 ? t('bulkDayWordSingle') : t('bulkDayWordPlural')}`}
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
    </Card>
  );
};
