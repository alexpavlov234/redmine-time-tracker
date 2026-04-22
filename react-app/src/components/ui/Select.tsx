import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import styles from './Input.module.scss';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, fullWidth, className = '', children, ...props }, ref) => {
    const wrapperClass = `${styles.wrapper} ${fullWidth ? styles.fullWidth : ''} ${className}`;
    
    return (
      <div className={wrapperClass}>
        {label && (
          <label className={styles.label}>
            {label}
            {props.required && <span className={styles.required}>*</span>}
          </label>
        )}
        <div className={styles.inputContainer}>
          <select
            ref={ref}
            className={`${styles.input} ${error ? styles.hasError : ''}`}
            {...props}
          >
            {children}
          </select>
        </div>
        {error && <span className={styles.errorMessage}>{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
