import React, { useState, useRef, useCallback, useEffect } from 'react';
import styles from './Autocomplete.module.scss';

export interface AutocompleteItem {
  id: string | number;
  label: string;
  /** Optional secondary label shown dimmed */
  sublabel?: string;
}

interface AutocompleteProps {
  label?: string;
  placeholder?: string;
  items: AutocompleteItem[];
  value: string;
  displayValue: string;
  onChange: (item: AutocompleteItem | null) => void;
  disabled?: boolean;
  required?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
}

/**
 * Accessible, keyboard‑navigable autocomplete input.
 * Matches the old `initAutocomplete` utility but as a proper React component.
 */
export const Autocomplete: React.FC<AutocompleteProps> = ({
  label,
  placeholder,
  items,
  value,
  displayValue,
  onChange,
  disabled,
  required,
  fullWidth,
  loading,
}) => {
  const [query, setQuery] = useState(displayValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display value from parent
  useEffect(() => {
    setQuery(displayValue);
  }, [displayValue]);

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

    // If user clears the input, notify parent
    if (!e.target.value.trim()) {
      onChange(null);
    }
  };

  const handleSelect = useCallback((item: AutocompleteItem) => {
    setQuery(item.label);
    setIsOpen(false);
    setActiveIndex(-1);
    onChange(item);
  }, [onChange]);

  const handleFocus = () => {
    setIsOpen(true);
  };

  const handleBlur = () => {
    // Delay to allow click events on list items to fire first
    setTimeout(() => {
      setIsOpen(false);

      // If the query doesn't match the selected value, restore or clear
      if (value && query !== displayValue) {
        setQuery(displayValue);
      } else if (!value && query) {
        // Check if user typed something that matches exactly one item
        const exact = items.find(i => i.label.toLowerCase() === query.toLowerCase());
        if (exact) {
          handleSelect(exact);
        } else {
          setQuery('');
          onChange(null);
        }
      }
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        return;
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

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const child = listRef.current.children[activeIndex] as HTMLElement;
      child?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const wrapperClass = `${styles.wrapper} ${fullWidth ? styles.fullWidth : ''}`;

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
          className={styles.input}
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
              onChange(null);
              inputRef.current?.focus();
            }}
            type="button"
            aria-label="Clear selection"
          >
            ×
          </button>
        )}
      </div>

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
};
