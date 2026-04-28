import React, { useState, useEffect } from 'react';
import { Modal, Button, Select, Input } from '../../../components/ui';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useQueue } from '../../../contexts/QueueContext';
import { useActivitiesForProject } from '../../../hooks/useActivitiesForProject';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useToast } from '../../../contexts/ToastContext';
import { redmineApiRequest } from '../../../services/redmine';
import { formatTime } from '../../../utils/formatters';
import { Send, CheckCircle, ListTodo } from 'lucide-react';
import { useCustomFields } from '../../../hooks/useCustomFields';

interface SummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SummaryModal: React.FC<SummaryModalProps> = ({ isOpen, onClose }) => {
  const { totalElapsedTime, activities, resetTimer, activeTodo } = useQueueTimer();
  const { } = useQueue();
  const { issueStatuses, setIssueStatuses } = useProjects();
  const { showSuccess, showError } = useToast();

  const projectId = activeTodo?.projectId || '';
  const { activities: projectActivities, defaultActivityId } = useActivitiesForProject(projectId || null);

  const [comments, setComments] = useState('');
  const [activityId, setActivityId] = useState('');
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [changeStatus, setChangeStatus] = useState(false);
  const [statusId, setStatusId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ success: boolean; message: string } | null>(null);

  const { customFields } = useCustomFields();
  const billableFieldId = localStorage.getItem('billableFieldId');

  // Populate form when modal opens
  useEffect(() => {
    if (isOpen) {
      // Build comments from activities
      const detailsText = activities
        .map(act => act.text.trim())
        .filter(Boolean)
        .join(' ');
      setComments(detailsText);
      setSubmitResult(null);
      setChangeStatus(false);
      setStatusId('');
      setIsSubmitting(false);

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
      showError('No issue selected.');
      return;
    }

    if (!activityId) {
      showError('Please select an activity.');
      return;
    }

    // Round hours UP to 0.05 increments
    const rawHours = totalElapsedTime / 3600;
    let hours: number;
    if (rawHours <= 0) {
      hours = 0.1;
    } else {
      hours = Math.ceil(rawHours * 20) / 20;
      hours = Math.max(0.1, hours);
    }
    const hoursFormatted = parseFloat(hours.toFixed(2));

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
          showError('Time entry submitted, but status update failed.');
        }
      }

      setSubmitResult({ success: true, message: 'Time entry submitted successfully!' });
      showSuccess('Time entry submitted!');

      // Auto-close & advance queue
      setTimeout(() => {
        onClose();
        resetTimer(true); // remove from queue + advance
      }, 800);
    } catch (err: any) {
      setSubmitResult({ success: false, message: err.message || 'Failed to submit.' });
      showError('Failed to submit time entry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Submit Time Entry"
      footer={
        <Button
          variant="primary"
          icon={submitResult?.success ? CheckCircle : Send}
          onClick={handleSubmit}
          disabled={isSubmitting || submitResult?.success}
          isLoading={isSubmitting}
        >
          {submitResult?.success ? 'Submitted!' : 'Submit to Redmine'}
        </Button>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Total Time */}
        <div style={{
          textAlign: 'center',
          padding: '1rem',
          borderRadius: '0.75rem',
          background: 'var(--color-surface, rgba(255,255,255,0.05))',
        }}>
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', opacity: 0.6 }}>Total Time</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace' }}>
            {formatTime(totalElapsedTime)}
          </div>
        </div>

        {/* Task info */}
        {activeTodo && (
          <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>
            <strong>{activeTodo.projectName}</strong>
            <span style={{ margin: '0 0.5rem' }}>→</span>
            #{activeTodo.taskId} - {activeTodo.taskSubject}
          </div>
        )}

        {/* Comments */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem', fontSize: '0.875rem' }}>
            Comments
          </label>
          <textarea
            rows={3}
            value={comments}
            onChange={e => setComments(e.target.value)}
            style={{
              width: '100%',
              padding: '0.625rem',
              borderRadius: '0.5rem',
              border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
              background: 'var(--color-surface, rgba(255,255,255,0.05))',
              color: 'inherit',
              fontFamily: 'inherit',
              fontSize: '0.875rem',
              resize: 'vertical',
            }}
          />
        </div>

        {/* Activity */}
        <Select
          label="Activity"
          value={activityId}
          onChange={e => setActivityId(e.target.value)}
          fullWidth
          required
        >
          <option value="">-- Select activity --</option>
          {projectActivities.map(a => (
            <option key={a.id} value={a.id.toString()}>
              {a.name}{a.is_default ? ' (default)' : ''}
            </option>
          ))}
        </Select>

        {/* Dynamic Custom Fields */}
        {customFields.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '0.5rem 0' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', opacity: 0.5, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <ListTodo size={14} /> Custom Fields
            </div>
            {customFields.map(field => {
              const value = customFieldValues[field.id] || '';
              
              const format = field.field_format || (field as any).format;
              const isLikelyBool = format === 'bool' || 
                                   format === 'boolean' ||
                                   field.name.toLowerCase().includes('billable') ||
                                   field.name.toLowerCase().includes('billing');

              if (isLikelyBool) {
                return (
                  <label key={field.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={value === '1'}
                      onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.checked ? '1' : '0' }))}
                      style={{ width: '1rem', height: '1rem' }}
                    />
                    <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{field.name}</span>
                  </label>
                );
              }
              
              if (field.field_format === 'list' || field.field_format === 'user' || field.field_format === 'version') {
                return (
                  <Select
                    key={field.id}
                    label={field.name}
                    value={value}
                    onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                    fullWidth
                    required={field.is_required || field.required}
                  >
                    <option value="">-- Select {field.name} --</option>
                    {field.possible_values?.map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </Select>
                );
              }

              if (field.field_format === 'text') {
                return (
                  <div key={field.id} style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.375rem', fontSize: '0.875rem' }}>
                      {field.name}{field.is_required ? ' *' : ''}
                    </label>
                    <textarea
                      rows={3}
                      value={value}
                      onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                      required={field.is_required || field.required}
                      style={{
                        width: '100%',
                        padding: '0.625rem',
                        borderRadius: '0.5rem',
                        border: '1px solid var(--color-border, rgba(255,255,255,0.1))',
                        background: 'var(--color-surface, rgba(255,255,255,0.05))',
                        color: 'inherit',
                        fontFamily: 'inherit',
                        fontSize: '0.875rem',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                );
              }

              const inputType = 
                field.field_format === 'int' ? 'number' :
                field.field_format === 'float' ? 'number' :
                field.field_format === 'date' ? 'date' : 'text';

              return (
                <Input
                  key={field.id}
                  label={field.name}
                  type={inputType}
                  step={field.field_format === 'float' ? 'any' : undefined}
                  value={value}
                  onChange={e => setCustomFieldValues(prev => ({ ...prev, [field.id]: e.target.value }))}
                  fullWidth
                  required={field.is_required || field.required}
                  placeholder={`Enter ${field.name.toLowerCase()}...`}
                />
              );
            })}
          </div>
        )}

        {/* Change Status */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={changeStatus}
            onChange={e => setChangeStatus(e.target.checked)}
            style={{ width: '1rem', height: '1rem' }}
          />
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Change issue status after submission</span>
        </label>

        {changeStatus && (
          <Select
            value={statusId}
            onChange={e => setStatusId(e.target.value)}
            fullWidth
          >
            <option value="">-- Select status --</option>
            {issueStatuses.map(s => (
              <option key={s.id} value={s.id.toString()}>{s.name}</option>
            ))}
          </Select>
        )}

        {/* Status message */}
        {submitResult && (
          <div style={{
            padding: '0.75rem',
            borderRadius: '0.5rem',
            background: submitResult.success
              ? 'rgba(34, 197, 94, 0.15)'
              : 'rgba(239, 68, 68, 0.15)',
            color: submitResult.success ? '#22c55e' : '#ef4444',
            fontSize: '0.875rem',
          }}>
            {submitResult.message}
          </div>
        )}
      </div>
    </Modal>
  );
};
