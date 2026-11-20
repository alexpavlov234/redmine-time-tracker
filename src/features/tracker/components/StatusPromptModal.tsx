import React, { useState } from 'react';
import { Modal, Button, Group, Stack, Text, Select, Anchor, Alert } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { redmineApiRequest } from '../../../services/redmine';
import { IconPlayerPlay, IconArrowRight, IconExternalLink } from '@tabler/icons-react';

interface StatusPromptModalProps {
  isOpen: boolean;
  taskId: string | null;
  taskSubject?: string;
  onClose: () => void;
  onConfirmStart: () => void;
}

export const StatusPromptModal: React.FC<StatusPromptModalProps> = ({
  isOpen,
  taskId,
  taskSubject,
  onClose,
  onConfirmStart,
}) => {
  const isMobile = useMediaQuery('(max-width: 48em)');
  const { issueStatuses, ensureStatusesLoaded } = useProjects();
  const { redmineUrl } = useSettings();
  const { t } = useLanguage();
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [statusResult, setStatusResult] = useState<{ success: boolean; message: string } | null>(null);

  React.useEffect(() => {
    setStatusResult(null);
    setSelectedStatusId(null);
    if (isOpen) {
      ensureStatusesLoaded();
    }
  }, [isOpen, taskId, ensureStatusesLoaded]);

  React.useEffect(() => {
    if (issueStatuses.length > 0 && !selectedStatusId) {
      const inProgress = issueStatuses.find(s => 
        s.name.toLowerCase().includes('in progress') || 
        s.name.toLowerCase().includes('в процес') ||
        s.name.toLowerCase().includes('progress')
      );
      setSelectedStatusId(inProgress ? String(inProgress.id) : String(issueStatuses[0].id));
    }
  }, [issueStatuses, selectedStatusId]);

  const handleUpdateAndStart = async () => {
    if (!taskId) return;

    if (selectedStatusId) {
      setIsUpdating(true);
      setStatusResult(null);
      try {
        await redmineApiRequest(`/issues/${taskId}.json`, 'PUT', {
          issue: { status_id: parseInt(selectedStatusId, 10) },
        });
        setStatusResult({ success: true, message: `${t('statusUpdatedMsgPrefix')} #${taskId} ${t('statusUpdatedMsgSuffix')}` });
        setTimeout(() => {
          onConfirmStart();
          onClose();
        }, 600);
      } catch (err: any) {
        setStatusResult({ success: false, message: err.message || t('statusUpdateFailedMsg') });
      } finally {
        setIsUpdating(false);
      }
    } else {
      onConfirmStart();
      onClose();
    }
  };

  const handleSkipAndStart = () => {
    onConfirmStart();
    onClose();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={<Text fw={600}>{t('statusPromptTitle')}</Text>}
      size="80%"
      fullScreen={isMobile}
      centered
    >
      <Stack gap="md">
        {statusResult && (
          <Alert color={statusResult.success ? 'green' : 'red'}>
            {statusResult.message}
          </Alert>
        )}
        <Text size="sm">
          {t('statusPromptBodyStart')}{' '}
          {taskId ? (
            <Anchor href={`${redmineUrl}/issues/${taskId}`} target="_blank" fw={700} underline="hover">
              #{taskId} {taskSubject ? `- ${taskSubject}` : ''} <IconExternalLink size={12} />
            </Anchor>
          ) : (
            <Text component="span" fw={700}>#{taskId}</Text>
          )}{' '}
          — {t('statusPromptBodyQuestion')}
        </Text>

        {issueStatuses.length > 0 && (
          <Select
            label={t('targetStatusLabel')}
            value={selectedStatusId}
            onChange={setSelectedStatusId}
            data={issueStatuses.map(s => ({ value: String(s.id), label: s.name }))}
          />
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={handleSkipAndStart}>
            {t('skipStatusChangeBtn')}
          </Button>
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            rightSection={<IconArrowRight size={14} />}
            onClick={handleUpdateAndStart}
            loading={isUpdating}
            color="blue"
          >
            {t('updateAndStartBtn')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
