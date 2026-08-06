import React, { forwardRef } from 'react';
import styles from './Input.module.scss';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, fullWidth, className, ...props }, ref) => {
    return (
      <div className={`${styles.wrapper} ${fullWidth ? styles.fullWidth : ''} ${className || ''}`}>
        {label && <label className={styles.label}>{label}</label>}
        <div className={styles.inputContainer}>
          <textarea
            ref={ref}
            className={`${styles.input} ${error ? styles.hasError : ''}`}
            style={{ resize: 'vertical', minHeight: '80px' }}
            {...props}
          />
        </div>
        {error && <span className={styles.errorText}>{error}</span>}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';
