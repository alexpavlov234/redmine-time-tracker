import React, { useState, useRef, useEffect, forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import styles from './Select.module.scss';
import inputStyles from './Input.module.scss';

export interface SelectItem {
  id: string | number;
  label: string;
  sublabel?: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
  
  // Autocomplete props
  enableAutocomplete?: boolean;
  items?: SelectItem[];
  value?: string;
  displayValue?: string;
  onItemChange?: (item: SelectItem | null) => void;
  loading?: boolean;
  placeholder?: string;

  // For native select
  onChange?: SelectHTMLAttributes<HTMLSelectElement>['onChange'];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ 
    label, 
    error, 
    fullWidth, 
    className = '', 
    children, 
    
    enableAutocomplete,
    items = [],
    value,
    displayValue = '',
    onItemChange,
    loading,
    
    onChange,
    required,
    disabled,
    placeholder,
    ...props 
  }, ref) => {

    const [query, setQuery] = useState(displayValue);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const listRef = useRef<HTMLUListElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Sync display value from parent
    useEffect(() => {
      if (enableAutocomplete) {
        setQuery(displayValue);
      }
    }, [displayValue, enableAutocomplete]);

    if (!enableAutocomplete) {
      const wrapperClass = `${inputStyles.wrapper} ${fullWidth ? inputStyles.fullWidth : ''} ${className}`;
      return (
        <div className={wrapperClass}>
          {label && (
            <label className={inputStyles.label}>
              {label}
              {required && <span className={inputStyles.required}>*</span>}
            </label>
          )}
          <div className={inputStyles.inputContainer}>
            <select
              ref={ref}
              className={`${inputStyles.input} ${error ? inputStyles.hasError : ''}`}
              onChange={onChange}
              value={value}
              disabled={disabled}
              required={required}
              {...props}
            >
              {children}
            </select>
          </div>
          {error && <span className={inputStyles.errorText}>{error}</span>}
        </div>
      );
    }

    // --- Autocomplete mode ---
    
    const filtered = items.filter(item => {
      if (!query) return true;
      const q = query.toLowerCase();
      return (
        item.label.toLowerCase().includes(q) ||
        (item.sublabel && item.sublabel.toLowerCase().includes(q)) ||
        String(item.id).includes(q)
      );
    });

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      setIsOpen(true);
      setActiveIndex(-1);

      if (!e.target.value.trim() && onItemChange) {
        onItemChange(null);
      }
    };

    const handleSelect = (item: SelectItem) => {
      setQuery(item.label);
      setIsOpen(false);
      setActiveIndex(-1);
      if (onItemChange) onItemChange(item);
    };

    const handleFocus = () => {
      setIsOpen(true);
    };

    const handleBlur = () => {
      setTimeout(() => {
        setIsOpen(false);
        if (value && query !== displayValue) {
          setQuery(displayValue);
        } else if (!value && query) {
          const exact = items.find(i => i.label.toLowerCase() === query.toLowerCase());
          if (exact) {
            handleSelect(exact);
          } else {
            setQuery('');
            if (onItemChange) onItemChange(null);
          }
        }
      }, 200);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (!isOpen || filtered.length === 0) {
        if (e.key === 'ArrowDown') {
          setIsOpen(true);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(prev => (prev + 1) % filtered.length);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(prev => (prev - 1 + filtered.length) % filtered.length);
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < filtered.length) {
            handleSelect(filtered[activeIndex]);
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setActiveIndex(-1);
          break;
      }
    };

    useEffect(() => {
      if (activeIndex >= 0 && listRef.current) {
        const child = listRef.current.children[activeIndex] as HTMLElement;
        child?.scrollIntoView({ block: 'nearest' });
      }
    }, [activeIndex]);

    const wrapperClass = `${styles.wrapper} ${fullWidth ? styles.fullWidth : ''} ${className}`;

    return (
      <div className={wrapperClass} ref={containerRef}>
        {label && (
          <label className={styles.label}>
            {label}
            {required && <span className={styles.required}>*</span>}
          </label>
        )}

        <div className={styles.inputContainer}>
          <input
            ref={inputRef}
            type="text"
            className={`${styles.input} ${error ? styles.hasError : ''}`}
            placeholder={loading ? 'Loading...' : placeholder || 'Type to search...'}
            value={query}
            onChange={handleInputChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled || loading}
            autoComplete="off"
            role="combobox"
            aria-expanded={isOpen}
            aria-autocomplete="list"
          />

          {value && (
            <button
              className={styles.clearBtn}
              onClick={() => {
                setQuery('');
                if (onItemChange) onItemChange(null);
                inputRef.current?.focus();
              }}
              type="button"
              aria-label="Clear selection"
            >
              ×
            </button>
          )}
        </div>
        
        {error && <span className={styles.errorText}>{error}</span>}

        {isOpen && filtered.length > 0 && (
          <ul className={styles.dropdown} ref={listRef} role="listbox">
            {filtered.slice(0, 50).map((item, idx) => (
              <li
                key={item.id}
                className={`${styles.option} ${idx === activeIndex ? styles.active : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                role="option"
                aria-selected={idx === activeIndex}
              >
                <span className={styles.optionLabel}>{item.label}</span>
                {item.sublabel && (
                  <span className={styles.optionSublabel}>{item.sublabel}</span>
                )}
              </li>
            ))}
            {filtered.length > 50 && (
              <li className={styles.moreHint}>
                ...and {filtered.length - 50} more. Type to narrow results.
              </li>
            )}
          </ul>
        )}

        {isOpen && filtered.length === 0 && query && (
          <ul className={styles.dropdown}>
            <li className={styles.noResults}>No results found</li>
          </ul>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
