import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Select, TextInput, NumberInput, Textarea, Group, Stack, Text, Divider, ActionIcon, Grid, Alert } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useProjects } from '../../../contexts/ProjectsContext';
import { usePresets } from '../../../hooks/usePresets';
import { createTimeEntry, updateTimeEntry } from '../../../services/redmine';
import type { TimeEntry, TimeLogPreset } from '../../../types';
import { IconDeviceFloppy, IconSend, IconTrash } from '@tabler/icons-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { SavePresetModal } from './SavePresetModal';
import { ProjectTaskActivityFields } from '../../../components/common/ProjectTaskActivityFields';
import { CustomFieldsSection } from '../../../components/common/CustomFieldsSection';

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
  /// <summary>Existing time entry to copy data from, if any.</summary>
  copyEntry?: TimeEntry | null;
  /// <summary>Default date to populate when creating a new entry.</summary>
  defaultDate?: string;
  /// <summary>Identifier of initial preset to pre-fill.</summary>
  initialPresetId?: string | null;
}

/// <summary>
/// Modal dialog for logging, editing, and copying Redmine time entries.
/// </summary>
export const TimeEntryFormModal: React.FC<TimeEntryFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editEntry,
  copyEntry,
  defaultDate,
  initialPresetId,
}) => {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { allProjects, refreshRecentProjects } = useProjects();
  const { presets, savePreset, deletePreset } = usePresets();

  const isEditing = Boolean(editEntry);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(initialPresetId || null);
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

  useEffect(() => {
    if (!isOpen) setFormResult(null);
  }, [isOpen]);

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
      activityId: (value) => (value ? null : 'Activity is required'),
      hours: (value) => (value && Number(value) > 0 ? null : 'Valid hours are required'),
      spentOn: (value) => (value ? null : 'Date is required'),
      taskId: (value, values) => {
        const cleanTask = value ? String(value).replace(/^#/, '').trim() : '';
        const cleanProject = values.projectId && values.projectId !== 'my_issues' ? String(values.projectId).trim() : '';
        if (!cleanTask && !cleanProject) {
          return 'Either Project or Task ID is required';
        }
        return null;
      },
    },
  });

  const additionalTaskOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const sourceEntry = editEntry || copyEntry;
    if (sourceEntry?.issue) {
      options.push({
        value: sourceEntry.issue.id.toString(),
        label: `#${sourceEntry.issue.id} - ${sourceEntry.issue.subject || (sourceEntry.issue as any).name || ''}`,
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
  }, [editEntry, copyEntry, presets, selectedPresetId]);

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
    return [];
  }, [editEntry, copyEntry]);

  useEffect(() => {
    if (!isOpen) return;

    if (editEntry) {
      form.setValues({
        projectId: editEntry.project?.id?.toString() || '',
        taskId: editEntry.issue?.id?.toString() || '',
        activityId: editEntry.activity?.id?.toString() || '',
        hours: editEntry.hours,
        spentOn: editEntry.spent_on,
        comments: editEntry.comments || '',
      });

      if (editEntry.custom_fields) {
        const initialValues: Record<number, string> = {};
        editEntry.custom_fields.forEach(f => {
          initialValues[f.id] = f.value;
        });
        setCustomFieldValues(prev => ({ ...prev, ...initialValues }));
      }
    } else if (copyEntry) {
      form.setValues({
        projectId: copyEntry.project?.id?.toString() || '',
        taskId: copyEntry.issue?.id?.toString() || '',
        activityId: copyEntry.activity?.id?.toString() || '',
        hours: copyEntry.hours,
        spentOn: '', // Date is intentionally left empty when copying
        comments: copyEntry.comments || '',
      });

      const initialValues: Record<number, string> = {};
      if (copyEntry.custom_fields) {
        copyEntry.custom_fields.forEach(f => {
          initialValues[f.id] = f.value;
        });
      }
      setCustomFieldValues(initialValues);
    } else {
      form.setValues({
        projectId: '',
        taskId: '',
        activityId: '',
        hours: '',
        spentOn: defaultDate || new Date().toISOString().split('T')[0],
        comments: '',
      });
      setSelectedPresetId('');

      const initialValues: Record<number, string> = {};
      customFields.forEach(field => {
        if (field.id === Number(billableFieldId)) {
          initialValues[field.id] = '1';
        } else {
          initialValues[field.id] = field.default_value || '';
        }
      });
      setCustomFieldValues(initialValues);

      if (initialPresetId) {
        handleApplyPreset(initialPresetId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editEntry, copyEntry, defaultDate, initialPresetId, customFields, billableFieldId]);

  useEffect(() => {
    const sourceActId = editEntry?.activity?.id || copyEntry?.activity?.id;
    if (isOpen && sourceActId) {
      form.setFieldValue('activityId', sourceActId.toString());
    }
  }, [isOpen, editEntry, copyEntry]);

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

  const [isSavePresetModalOpen, setIsSavePresetModalOpen] = useState(false);

  const handleSavePreset = () => {
    setIsSavePresetModalOpen(true);
  };

  const handleExecuteSavePreset = (name: string) => {
    const { projectId, taskId, activityId, hours, comments } = form.values;

    const project = allProjects.find(p => p.id.toString() === projectId);
    const taskOpt = additionalTaskOptions.find(t => t.value === taskId);

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
    setFormResult({ success: true, message: `Preset "${name.trim()}" saved!` });
  };

  const handleDeletePreset = () => {
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && confirm(`Delete preset "${preset.name}"?`)) {
      deletePreset(preset.id);
      setSelectedPresetId('');
      setFormResult({ success: true, message: 'Preset deleted.' });
    }
  };

  const handleSubmit = async (values: typeof form.values) => {
    setIsSubmitting(true);
    setFormResult(null);
    try {
      const payloadCustomFields = Object.entries(customFieldValues)
        .filter(([_, value]) => value !== '')
        .map(([id, value]) => ({
          id: parseInt(id, 10),
          value: value,
        }));

      const cleanTaskId = values.taskId ? values.taskId.toString().replace(/^#/, '').trim() : '';
      const parsedTaskId = cleanTaskId ? parseInt(cleanTaskId, 10) : undefined;
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
        setFormResult({ success: true, message: 'Time entry updated successfully!' });
      } else {
        await createTimeEntry(data);
        setFormResult({ success: true, message: 'Time entry created successfully!' });
      }

      // Update recently used projects
      refreshRecentProjects().catch(() => {});

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 600);
    } catch (err: any) {
      setFormResult({ success: false, message: err.message || 'Failed to save time entry.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={<Text fw={600}>{copyEntry ? 'Copy Time Entry' : (isEditing ? 'Edit Time Entry' : 'Log Time')}</Text>}
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
        {!isEditing && (
          <>
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
                disabled={!selectedPresetId}
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
                    disabled={isSubmitting}
                    additionalTaskOptions={additionalTaskOptions}
                    additionalActivityOptions={additionalActivityOptions}
                  />

                  {/* Side-by-side: Hours & Date */}
                  <Group align="flex-start" wrap="nowrap">
                    <NumberInput
                      label="Hours"
                      withAsterisk
                      min={0}
                      decimalScale={2}
                      step={0.5}
                      w={120}
                      {...form.getInputProps('hours')}
                    />
                    <TextInput
                      label="Date"
                      type="date"
                      withAsterisk
                      style={{ flex: 1 }}
                      {...form.getInputProps('spentOn')}
                    />
                  </Group>
                </Stack>
              </Grid.Col>

              {/* Right Column: Comments & Custom Fields */}
              <Grid.Col span={{ base: 12, md: 6 }} style={{ display: 'flex', flexDirection: 'column' }}>
                <Stack gap="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Textarea
                    label="Comments"
                    placeholder="Optional detailed description..."
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

            <Group justify="space-between" mt="md">
              <Button
                variant="outline"
                onClick={handleSavePreset}
                disabled={isSubmitting}
              >
                Save Preset
              </Button>
              <Button
                type="submit"
                leftSection={isEditing ? <IconDeviceFloppy size={16} /> : <IconSend size={16} />}
                loading={isSubmitting}
              >
                {isEditing ? 'Update' : 'Submit'}
              </Button>
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
