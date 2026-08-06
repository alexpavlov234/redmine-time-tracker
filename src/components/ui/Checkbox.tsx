import React, { forwardRef } from 'react';
import styles from './Checkbox.module.scss';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: React.ReactNode;
  error?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, error, className, ...props }, ref) => {
    return (
      <div className={`${styles.wrapper} ${className || ''}`}>
        <label className={styles.labelContainer}>
          <input
            type="checkbox"
            ref={ref}
            className={`${styles.checkbox} ${error ? styles.hasError : ''}`}
            {...props}
          />
          <span className={styles.labelText}>{label}</span>
        </label>
        {error && <span className={styles.errorText}>{error}</span>}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';
