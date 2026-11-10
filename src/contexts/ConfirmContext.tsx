import React, { useState, createContext, useContext, useCallback } from 'react';
import { Modal, Button, Text, Group } from '@mantine/core';
import { useLanguage } from './LanguageContext';

/// <summary>
/// Options for configuring a confirmation prompt modal.
/// </summary>
export interface ConfirmOptions {
  /// <summary>Primary message or question to confirm.</summary>
  message: string;
  /// <summary>Optional subtitle or supporting detail text.</summary>
  subtitle?: string;
  /// <summary>Text label for the confirmation button.</summary>
  confirmText?: string;
  /// <summary>Text label for the cancellation button.</summary>
  cancelText?: string;
  /// <summary>Visual variant: 'danger' (red button) or 'primary' (blue button).</summary>
  variant?: 'danger' | 'primary';
}

/// <summary>
/// Context interface exposing confirmation dialog triggers.
/// </summary>
interface ConfirmContextProps {
  /// <summary>Displays an asynchronous modal confirmation and resolves to boolean.</summary>
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextProps | undefined>(undefined);

/// <summary>
/// Provider component rendering the unified asynchronous confirmation modal.
/// </summary>
export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [resolver, setResolver] = useState<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setOptions(opts);
      setResolver(() => resolve);
      setIsOpen(true);
    });
  }, []);

  const handleConfirm = () => {
    setIsOpen(false);
    resolver?.(true);
  };

  const handleCancel = () => {
    setIsOpen(false);
    resolver?.(false);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <Modal
        opened={isOpen}
        onClose={handleCancel}
        title={<Text fw={600}>{t('confirmActionTitle')}</Text>}
        size="md"
        centered
        radius="md"
      >
        <Text size="sm" style={{ lineHeight: 1.6 }}>{options?.message}</Text>
        {options?.subtitle && (
          <Text size="xs" c="dimmed" mt="xs">
            {options.subtitle}
          </Text>
        )}

        <Group justify="flex-end" mt="xl">
          <Button variant="default" onClick={handleCancel}>
            {options?.cancelText || t('cancelBtn')}
          </Button>
          <Button color={options?.variant === 'danger' ? 'red' : 'blue'} onClick={handleConfirm}>
            {options?.confirmText || t('confirmBtn')}
          </Button>
        </Group>
      </Modal>
    </ConfirmContext.Provider>
  );
};

/// <summary>
/// Hook to trigger user confirmation dialogs across components.
/// </summary>
export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
};
