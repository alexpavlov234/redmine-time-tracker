import React, { useState, createContext, useContext, useCallback } from 'react';
import { Modal, Button, Text, Group } from '@mantine/core';

interface ConfirmOptions {
  message: string;
  subtitle?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
}

interface ConfirmContextProps {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextProps | undefined>(undefined);

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
        title={<Text fw={600}>Confirm Action</Text>}
        centered
      >
        <Text size="sm" style={{ lineHeight: 1.6 }}>{options?.message}</Text>
        {options?.subtitle && (
          <Text size="xs" c="dimmed" mt="xs">
            {options.subtitle}
          </Text>
        )}

        <Group justify="flex-end" mt="xl">
          <Button variant="default" onClick={handleCancel}>
            {options?.cancelText || 'Cancel'}
          </Button>
          <Button color={options?.variant === 'danger' ? 'red' : 'blue'} onClick={handleConfirm}>
            {options?.confirmText || 'Confirm'}
          </Button>
        </Group>
      </Modal>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error('useConfirm must be used within a ConfirmProvider');
  }
  return context.confirm;
};
