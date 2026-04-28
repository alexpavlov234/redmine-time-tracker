import React, { useState, createContext, useContext, useCallback } from 'react';
import { Modal, Button } from '../components/ui';

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
        isOpen={isOpen}
        onClose={handleCancel}
        title="Confirm Action"
        footer={
          <>
            <Button variant="secondary" onClick={handleCancel}>
              {options?.cancelText || 'Cancel'}
            </Button>
            <Button variant={options?.variant || 'primary'} onClick={handleConfirm}>
              {options?.confirmText || 'Confirm'}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, lineHeight: 1.6 }}>{options?.message}</p>
        {options?.subtitle && (
          <p style={{ margin: '0.5rem 0 0', opacity: 0.7, fontSize: '0.875rem' }}>
            {options.subtitle}
          </p>
        )}
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
