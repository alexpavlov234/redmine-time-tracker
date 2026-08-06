import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, TextInput, Textarea, Checkbox, NumberInput, Group, Stack, Text, Alert, Anchor, Grid } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useQueue } from '../../../contexts/QueueContext';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { useProjects } from '../../../contexts/ProjectsContext';
import { notifications } from '@mantine/notifications';
import { redmineApiRequest } from '../../../services/redmine';
import { formatTime } from '../../../utils/formatters';
import { IconSend, IconCheck, IconListCheck, IconExternalLink } from '@tabler/icons-react';
import { useCustomFields } from '../../../hooks/useCustomFields';

import { useSettings } from '../../../contexts/SettingsContext';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({ isOpen, onClose }) => {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { usePerformedTasksList, redmineUrl } = useSettings();
  const { totalElapsedTime, activities, resetTimer, activeTodo } = useQueueTimer();
  const { } = useQueue();
  const { issueStatuses, setIssueStatuses } = useProjects();

  const projectId = activeTodo?.projectId || '';
  const { activities: projectActivities, defaultActivityId } = useActivitiesForProject(projectId || null);

  const [comments, setComments] = useState('');
  const [activityId, setActivityId] = useState<string | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [changeStatus, setChangeStatus] = useState(false);
  const [statusId, setStatusId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);
  const [manualHours, setManualHours] = useState<number | string>(0);

  const { customFields } = useCustomFields();
  const billableFieldId = localStorage.getItem('billableFieldId');

  // Populate form when modal opens
  useEffect(() => {
    if (isOpen) {
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

      // Set activity from todo or default
      if (activeTodo?.activityId) {
        setActivityId(String(activeTodo.activityId));
      } else if (defaultActivityId) {
        setActivityId(String(defaultActivityId));
      }

      // Load issue statuses if needed
      if (issueStatuses.length === 0) {
        redmineApiRequest('/issue_statuses.json')
          .then(data => setIssueStatuses(data.issue_statuses || []))
          .catch(() => {});
      }

      // Initialize custom field values
      const initialValues: Record<number, string> = {};
      customFields.forEach(field => {
        if (field.id === Number(billableFieldId)) {
          initialValues[field.id] = '1'; // Default billable to true
        } else {
          initialValues[field.id] = field.default_value || '';
        }
      });
      setCustomFieldValues(initialValues);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activities, activeTodo, defaultActivityId, issueStatuses.length, setIssueStatuses, customFields, billableFieldId]);

  // Update activity when project activities load
  useEffect(() => {
    if (activeTodo?.activityId) {
      setActivityId(String(activeTodo.activityId));
    } else if (defaultActivityId) {
      setActivityId(String(defaultActivityId));
    }
  }, [projectActivities, defaultActivityId, activeTodo?.activityId]);

  const handleSubmit = async () => {
    const issueId = activeTodo?.taskId;
    if (!issueId) {
      notifications.show({ title: 'Error', message: 'No issue selected.', color: 'red' });
      return;
    }

    if (!activityId) {
      notifications.show({ title: 'Error', message: 'Please select an activity.', color: 'red' });
      return;
    }

    const hoursFormatted = typeof manualHours === 'string' ? parseFloat(manualHours) : manualHours;
    if (isNaN(hoursFormatted) || hoursFormatted <= 0) {
      notifications.show({ title: 'Error', message: 'Please enter a valid number of hours.', color: 'red' });
      return;
    }

    setIsSubmitting(true);
    setSubmitResult(null);

    try {
      // Build payload
      const payloadCustomFields = Object.entries(customFieldValues)
        .filter(([_, value]) => value !== '')
        .map(([id, value]) => ({
          id: parseInt(id, 10),
          value: value,
        }));

      const timeEntryPayload: any = {
        time_entry: {
          issue_id: issueId,
          hours: hoursFormatted,
          comments: comments.trim(),
          activity_id: parseInt(activityId),
          spent_on: new Date().toISOString().split('T')[0],
          ...(payloadCustomFields.length > 0 && { custom_fields: payloadCustomFields }),
        },
      };

      // Step 1: Submit time entry
      await redmineApiRequest('/time_entries.json', 'POST', timeEntryPayload);

      // Step 2: Update issue status if requested
      if (changeStatus && statusId) {
        try {
          await redmineApiRequest(`/issues/${issueId}.json`, 'PUT', {
            issue: { status_id: statusId },
          });
        } catch {
          notifications.show({ title: 'Error', message: 'Time entry submitted, but status update failed.', color: 'red' });
        }
      }

      setSubmitResult({ success: true, message: 'Time entry submitted successfully!' });
      notifications.show({ title: 'Success', message: 'Time entry submitted!', color: 'green' });

      // Auto-close & advance queue
      setTimeout(() => {
        onClose();
        resetTimer(true); // remove from queue + advance
      }, 800);
    } catch (err: any) {
      setSubmitResult({ success: false, message: err.message || 'Failed to submit.' });
      notifications.show({ title: 'Error', message: 'Failed to submit time entry.', color: 'red' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={<Text fw={600} size="lg">Submit Time Entry</Text>}
      size="80%"
      fullScreen={isMobile}
      centered
    >
      <Grid>
        {/* Left Column: Hours, Task info, Activity, Status change */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="md">
            {/* Total Time */}
            <Stack align="center" gap="xs" p="md" bg="var(--mantine-color-default)" style={{ borderRadius: 'var(--mantine-radius-md)' }}>
              <Text size="xs" tt="uppercase" c="dimmed" fw={600}>Logged Time (Hours)</Text>
              <NumberInput
                value={manualHours}
                onChange={setManualHours}
                decimalScale={2}
                step={0.1}
                min={0.1}
                size="xl"
                styles={{ input: { textAlign: 'center', fontWeight: 700 } }}
                w={120}
              />
              <Text size="xs" c="dimmed">Timer recorded: {formatTime(totalElapsedTime)}</Text>
            </Stack>

            {/* Task info */}
            {activeTodo && (
              <Stack gap={2}>
                <Text size="xs" fw={700} c="dimmed" tt="uppercase">
                  {activeTodo.projectName}
                </Text>
                <Group gap={6} wrap="nowrap">
                  <Anchor href={`${redmineUrl}/issues/${activeTodo.taskId}`} target="_blank" size="md" fw={700} underline="hover">
                    #{activeTodo.taskId} - {activeTodo.taskSubject}
                  </Anchor>
                  <IconExternalLink size={14} color="var(--mantine-color-dimmed)" />
                </Group>
              </Stack>
            )}

            <Select
              label="Activity"
              placeholder="-- Select activity --"
              value={activityId}
              onChange={setActivityId}
              data={projectActivities.map(a => ({ value: a.id.toString(), label: `${a.name}${a.is_default ? ' (default)' : ''}` }))}
              required
            />

            <Checkbox
              label="Change issue status after submission"
              checked={changeStatus}
              onChange={e => setChangeStatus(e.currentTarget.checked)}
              mt="xs"
            />

            {changeStatus && (
              <Select
                placeholder="-- Select status --"
                value={statusId}
                onChange={setStatusId}
                data={issueStatuses.map(s => ({ value: s.id.toString(), label: s.name }))}
              />
            )}
          </Stack>
        </Grid.Col>

        {/* Right Column: Comments & Custom Fields */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="md">
            <Textarea
              label="Comments"
              value={comments}
              onChange={(e) => setComments(e.currentTarget.value)}
              minRows={5}
              autosize
              placeholder="Detailed work summary..."
            />

            {/* Dynamic Custom Fields */}
            {customFields.length > 0 && (
              <Stack gap="sm" pt="xs">
                <Group gap="xs">
                  <IconListCheck size={14} color="var(--mantine-color-dimmed)" />
                  <Text size="xs" fw={700} tt="uppercase" c="dimmed">Custom Fields</Text>
                </Group>
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
              </Stack>
            )}
          </Stack>
        </Grid.Col>
      </Grid>

      {submitResult && (
        <Alert color={submitResult.success ? 'green' : 'red'} mt="md">
          {submitResult.message}
        </Alert>
      )}

      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose}>
          Cancel
        </Button>
        <Button
          leftSection={submitResult?.success ? <IconCheck size={16} /> : <IconSend size={16} />}
          onClick={handleSubmit}
          disabled={isSubmitting || submitResult?.success}
          loading={isSubmitting}
          color={submitResult?.success ? 'green' : 'blue'}
          size="md"
        >
          {submitResult?.success ? 'Submitted!' : 'Submit to Redmine'}
        </Button>
      </Group>
    </Modal>
  );
};
