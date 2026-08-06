import React, { useState } from 'react';
import { Modal, Button, Group, Stack, Text, Select, Anchor } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { redmineApiRequest } from '../../../services/redmine';
import { notifications } from '@mantine/notifications';
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
  const { issueStatuses } = useProjects();
  const { redmineUrl } = useSettings();
  const [selectedStatusId, setSelectedStatusId] = useState<string | null>(() => {
    const inProgress = issueStatuses.find(s => 
      s.name.toLowerCase().includes('in progress') || 
      s.name.toLowerCase().includes('в процес') ||
      s.name.toLowerCase().includes('progress')
    );
    return inProgress ? String(inProgress.id) : (issueStatuses.length > 0 ? String(issueStatuses[0].id) : null);
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateAndStart = async () => {
    if (!taskId) return;

    if (selectedStatusId) {
      setIsUpdating(true);
      try {
        await redmineApiRequest(`/issues/${taskId}.json`, 'PUT', {
          issue: { status_id: parseInt(selectedStatusId, 10) },
        });
        notifications.show({
          title: 'Status Updated',
          message: `Task #${taskId} status updated in Redmine.`,
          color: 'green',
        });
      } catch (err: any) {
        notifications.show({
          title: 'Warning',
          message: 'Could not update task status in Redmine.',
          color: 'orange',
        });
      } finally {
        setIsUpdating(false);
      }
    }

    onConfirmStart();
    onClose();
  };

  const handleSkipAndStart = () => {
    onConfirmStart();
    onClose();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={<Text fw={600}>Update Task Status to "In Progress"?</Text>}
      size="80%"
      fullScreen={isMobile}
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          You are starting tracking on{' '}
          {taskId ? (
            <Anchor href={`${redmineUrl}/issues/${taskId}`} target="_blank" fw={700} underline="hover">
              #{taskId} {taskSubject ? `- ${taskSubject}` : ''} <IconExternalLink size={12} />
            </Anchor>
          ) : (
            <Text component="span" fw={700}>Task #{taskId}</Text>
          )}.
          Would you like to update its status in Redmine?
        </Text>

        {issueStatuses.length > 0 && (
          <Select
            label="Target Status"
            value={selectedStatusId}
            onChange={setSelectedStatusId}
            data={issueStatuses.map(s => ({ value: String(s.id), label: s.name }))}
          />
        )}

        <Group justify="flex-end" mt="md">
          <Button variant="outline" onClick={handleSkipAndStart}>
            Skip Status Change
          </Button>
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            rightSection={<IconArrowRight size={14} />}
            onClick={handleUpdateAndStart}
            loading={isUpdating}
            color="blue"
          >
            Update & Start
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
