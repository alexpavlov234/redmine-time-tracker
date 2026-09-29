import React, { useState, useMemo } from 'react';
import { Card, TextInput, Button, Select, NumberInput, Group, Stack, Text, Progress, Badge, ActionIcon, Divider, Alert } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSend, IconCheck, IconTrash, IconCirclePlus } from '@tabler/icons-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { createTimeEntry } from '../../../services/redmine';
import type { TimeLogPreset } from '../../../types';
import { useProjects } from '../../../contexts/ProjectsContext';
import { usePresets } from '../../../hooks/usePresets';
import { SavePresetModal } from './SavePresetModal';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';
import { CustomFieldsSection } from '../../../components/common/CustomFieldsSection';

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
  const { presets, savePreset, deletePreset } = usePresets();

  const [selectedPresetId, setSelectedPresetId] = useState<string | null>('');
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
      taskId: (value) => (value ? null : 'Task is required'),
      activityId: (value) => (value ? null : 'Activity is required'),
      hours: (value) => (value && Number(value) > 0 ? null : 'Valid hours are required'),
    },
  });

  // Initialize custom fields when they load
  React.useEffect(() => {
    if (customFields.length > 0) {
      const initialValues: Record<number, string> = {};
      const billableFieldId = localStorage.getItem('billableFieldId');
      customFields.forEach(field => {
        if (field.id === Number(billableFieldId)) {
          initialValues[field.id] = '1';
        } else {
          initialValues[field.id] = field.default_value || '';
        }
      });
      setCustomFieldValues(initialValues);
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
    setStatusResult({ success: true, message: `Preset "${name.trim()}" saved!` });
  };

  const handleDeletePreset = () => {
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && confirm(`Delete preset "${preset.name}"?`)) {
      deletePreset(preset.id);
      setSelectedPresetId('');
    }
  };

  const handleSubmit = async (values: typeof form.values) => {
    if (selectedDays.size === 0) return;

    setIsDeploying(true);
    setProgress(0);

    const days = Array.from(selectedDays).sort();
    let successCount = 0;
    let failCount = 0;

    const payloadCustomFields = Object.entries(customFieldValues)
      .filter(([_, value]) => value !== '')
      .map(([id, value]) => ({
        id: parseInt(id, 10),
        value: value,
      }));

    const hoursNum = typeof values.hours === 'string' ? parseFloat(values.hours) : values.hours;

    const cleanTaskId = values.taskId ? values.taskId.toString().replace(/^#/, '').trim() : '';
    const parsedTaskId = cleanTaskId ? parseInt(cleanTaskId, 10) : undefined;
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
      setStatusResult({ success: true, message: `Successfully logged time for ${successCount} day${successCount > 1 ? 's' : ''}.` });
    } else {
      setStatusResult({ success: false, message: `${successCount} succeeded, ${failCount} failed.` });
    }

    onSuccess();
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group justify="space-between">
          <Group gap="xs">
            <IconCheck size={20} color="var(--mantine-color-blue-filled)" />
            <Text fw={600}>Bulk Log Time</Text>
          </Group>
          <Badge size="lg" color="blue">{selectedDays.size} Days Selected</Badge>
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
            label="Load Preset"
            placeholder="-- Choose preset --"
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
                form.setFieldValue('projectId', val);
                if (!val) form.setFieldValue('taskId', '');
                form.setFieldValue('activityId', '');
              }}
              taskId={form.values.taskId}
              onTaskChange={(val) => form.setFieldValue('taskId', val)}
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
              label="Hours per day"
              placeholder="e.g. 8"
              min={0}
              decimalScale={2}
              step={0.5}
              disabled={isDeploying}
              withAsterisk
              {...form.getInputProps('hours')}
            />

            <TextInput
              label="Comments"
              placeholder="What did you work on?"
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
                <Text size="sm" c="dimmed" ta="center">Logging {progress}%...</Text>
              </Stack>
            )}

            <Group justify="space-between" mt="md">
              <Button
                variant="subtle"
                leftSection={<IconCirclePlus size={16} />}
                onClick={handleSavePreset}
                disabled={isDeploying}
              >
                Save Preset
              </Button>
              <Group>
                <Button variant="default" onClick={onCancel} disabled={isDeploying}>Cancel</Button>
                <Button type="submit" leftSection={<IconSend size={16} />} loading={isDeploying}>
                  {isDeploying ? 'Deploying...' : `Submit across ${selectedDays.size} days`}
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
