import React, { useState } from 'react';
import { Modal, TextInput, Button, Group, Stack, Text } from '@mantine/core';
import { useLanguage } from '../../../contexts/LanguageContext';

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
  const { t } = useLanguage();
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
      title={<Text fw={600}>{t('savePresetBtn')}</Text>}
      size="sm"
      centered
    >
      <Stack gap="md">
        <TextInput
          label={t('presetNameLabel')}
          placeholder={t('presetNamePlaceholder')}
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
            {t('cancelBtn')}
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim()}>
            {t('savePresetBtn')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
};
