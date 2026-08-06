import React, { useState } from 'react';
import { Modal, TextInput, Button, Group, Stack, Text } from '@mantine/core';
import { IconBookmark } from '@tabler/icons-react';

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (presetName: string) => void;
}

export const SavePresetModal: React.FC<SavePresetModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');

  const handleConfirm = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
    onClose();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={() => {
        setName('');
        onClose();
      }}
      title={
        <Group gap="xs">
          <IconBookmark size={20} color="var(--mantine-color-blue-filled)" />
          <Text fw={600}>Save Preset</Text>
        </Group>
      }
      size="sm"
      centered
    >
      <Stack gap="md">
        <TextInput
          label="Preset Name"
          placeholder="e.g. Standard Day, Daily Standup..."
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConfirm();
          }}
          data-autofocus
          required
        />

        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            Save Preset
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
