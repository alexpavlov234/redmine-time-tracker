import React, { useState, useEffect, useMemo } from 'react';
import { Modal, Button, Select, TextInput, NumberInput, Checkbox, Textarea, Group, Stack, Text, Divider, ActionIcon, Grid, Alert } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useTasksForProject } from '../../../hooks/useTasksForProject';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { usePresets } from '../../../hooks/usePresets';
import { createTimeEntry, updateTimeEntry, getIssue } from '../../../services/redmine';
import type { TimeEntry, TimeLogPreset, RedmineIssue } from '../../../types';
import { IconDeviceFloppy, IconSend, IconTrash, IconListCheck } from '@tabler/icons-react';
import { useCustomFields } from '../../../hooks/useCustomFields';
import { SavePresetModal } from './SavePresetModal';

interface TimeEntryFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editEntry?: TimeEntry | null;
  copyEntry?: TimeEntry | null;
  defaultDate?: string;
  initialPresetId?: string | null;
}

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
  const { allProjects } = useProjects();
  const { presets, savePreset, deletePreset } = usePresets();

  const isEditing = Boolean(editEntry);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingIssue, setIsLoadingIssue] = useState(false);
  const [loadedTask, setLoadedTask] = useState<RedmineIssue | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(initialPresetId || null);
  const [formResult, setFormResult] = useState<{ success: boolean; message: string } | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});

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

  const { tasks, isLoading: isLoadingTasks } = useTasksForProject(form.values.projectId || null);
  const { activities, isLoading: isLoadingActivities } = useActivitiesForProject(form.values.projectId || null);

  const projectOptions = useMemo(() => {
    return allProjects.map(p => ({
      value: p.id.toString(),
      label: p.name,
    }));
  }, [allProjects]);

  const activityOptions = useMemo(() => {
    const options = activities.map(a => ({
      value: a.id.toString(),
      label: a.name,
    }));

    const sourceEntry = editEntry || copyEntry;
    if (sourceEntry?.activity && !options.some(o => o.value === sourceEntry.activity.id.toString())) {
      options.unshift({
        value: sourceEntry.activity.id.toString(),
        label: sourceEntry.activity.name || `Activity #${sourceEntry.activity.id}`,
      });
    }

    return options;
  }, [activities, editEntry, copyEntry]);

  const taskOptions = useMemo(() => {
    const options = tasks.map(t => ({
      value: t.id.toString(),
      label: `#${t.id} - ${t.subject}`,
    }));
    if (loadedTask && !options.some(o => o.value === loadedTask.id.toString())) {
      options.push({
        value: loadedTask.id.toString(),
        label: `#${loadedTask.id} - ${loadedTask.subject}`,
      });
    }
    const sourceEntry = editEntry || copyEntry;
    if (sourceEntry?.issue && !options.some(o => o.value === sourceEntry.issue!.id.toString())) {
      options.push({
        value: sourceEntry.issue.id.toString(),
        label: `#${sourceEntry.issue.id} - ${sourceEntry.issue.subject || (sourceEntry.issue as any).name || ''}`,
      });
    }
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset && preset.taskId && preset.taskSubject && !options.some(o => o.value === preset.taskId)) {
      options.push({
        value: preset.taskId,
        label: `#${preset.taskId} - ${preset.taskSubject}`,
      });
    }
    return options;
  }, [tasks, loadedTask, editEntry, copyEntry, presets, selectedPresetId]);

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
  }, [isOpen, editEntry, copyEntry, activities]);

  const handleTaskChange = (val: string | null) => {
    const newTaskId = val || '';
    form.setFieldValue('taskId', newTaskId);
    
    if (val && !form.values.projectId) {
      const task = tasks.find(t => t.id.toString() === val) || (loadedTask?.id.toString() === val ? loadedTask : null);
      if (task?.project?.id) {
        form.setFieldValue('projectId', task.project.id.toString());
      }
    }
  };

  const handleQuickLoad = async (id: string) => {
    if (!id) return;
    setIsLoadingIssue(true);
    try {
      const cleanId = id.replace(/^#/, '').trim();
      const issue = await getIssue(parseInt(cleanId, 10));
      setLoadedTask(issue);
      form.setFieldValue('taskId', issue.id.toString());
      if (issue.project) {
        form.setFieldValue('projectId', issue.project.id.toString());
      }
    } catch (error: any) {
      // Ignore or handle error
    } finally {
      setIsLoadingIssue(false);
    }
  };

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
    const task = tasks.find(t => t.id.toString() === taskId);

    const newPreset: TimeLogPreset = {
      id: 'preset_' + Date.now(),
      name: name.trim(),
      projectId,
      projectName: project?.name || '',
      taskId,
      taskSubject: task?.subject || '',
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
                  <Select
                    label="Project"
                    placeholder="Search projects..."
                    data={[{ value: 'my_issues', label: '--- My Assigned Issues ---' }, ...projectOptions]}
                    searchable
                    {...form.getInputProps('projectId')}
                    onChange={(val) => {
                      form.setFieldValue('projectId', val || '');
                      if (!val) form.setFieldValue('taskId', '');
                      form.setFieldValue('activityId', '');
                    }}
                  />

                  <Select
                    label="Activity"
                    placeholder={isLoadingActivities ? 'Loading...' : '-- Select activity --'}
                    data={activityOptions}
                    withAsterisk
                    disabled={isSubmitting}
                    {...form.getInputProps('activityId')}
                  />

                  <Group align="flex-start" wrap="nowrap">
                    <TextInput
                      label="Task ID"
                      placeholder="ID..."
                      w={110}
                      {...form.getInputProps('taskId')}
                      onBlur={() => {
                        if (form.values.taskId && form.values.taskId !== loadedTask?.id?.toString()) {
                          handleQuickLoad(form.values.taskId);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (form.values.taskId) handleQuickLoad(form.values.taskId);
                        }
                      }}
                      disabled={isLoadingIssue || isSubmitting}
                    />
                    <Select
                      label="Task Name"
                      placeholder={isLoadingTasks ? 'Loading tasks...' : 'Search tasks...'}
                      data={taskOptions}
                      searchable
                      withAsterisk
                      {...form.getInputProps('taskId')}
                      onChange={handleTaskChange}
                      disabled={isLoadingTasks || isSubmitting}
                      style={{ flex: 1 }}
                    />
                  </Group>

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

                  {/* Dynamic Custom Fields */}
                  {customFields.length > 0 && (
                    <Stack gap="sm" pt="xs">
                      <Group gap="xs">
                        <IconListCheck size={14} color="var(--mantine-color-dimmed)" />
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">Custom Fields</Text>
                      </Group>
                      <Group grow>
                        {customFields.map(field => {
                          const value = customFieldValues[field.id] || '';
                          const format = field.field_format || (field as any).format;
                          const isLikelyBool = format === 'bool' || 
                                               format === 'boolean' ||
                                               field.name.toLowerCase().includes('billable') ||
                                               field.name.toLowerCase().includes('billing');

                          if (isLikelyBool) {
                            return (
                              <Checkbox
                                key={field.id}
                                label={field.name}
                                checked={value === '1'}
                                onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.currentTarget.checked ? '1' : '0' }))}
                              />
                            );
                          }
                          
                          if (format === 'list' || format === 'user' || format === 'version') {
                            return (
                              <Select
                                key={field.id}
                                label={field.name}
                                placeholder={`-- Select ${field.name} --`}
                                value={value}
                                onChange={v => setCustomFieldValues(prev => ({ ...prev, [field.id]: v || '' }))}
                                data={field.possible_values?.map(v => ({ value: v, label: v })) || []}
                                required={field.is_required || field.required}
                              />
                            );
                          }

                          if (format === 'text') {
                            return (
                              <Textarea
                                key={field.id}
                                label={field.name}
                                value={value}
                                onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.currentTarget.value }))}
                                required={field.is_required || field.required}
                                minRows={2}
                                autosize
                                style={{ flex: '1 1 100%' }}
                              />
                            );
                          }

                          if (format === 'int' || format === 'float') {
                            return (
                              <NumberInput
                                key={field.id}
                                label={field.name}
                                value={value ? parseFloat(value) : ''}
                                onChange={v => setCustomFieldValues(prev => ({ ...prev, [field.id]: v === '' ? '' : String(v) }))}
                                required={field.is_required || field.required}
                                decimalScale={format === 'float' ? 2 : 0}
                              />
                            );
                          }

                          return (
                            <TextInput
                              key={field.id}
                              label={field.name}
                              value={value}
                              onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.currentTarget.value }))}
                              required={field.is_required || field.required}
                              type={format === 'date' ? 'date' : 'text'}
                            />
                          );
                        })}
                      </Group>
                    </Stack>
                  )}
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
