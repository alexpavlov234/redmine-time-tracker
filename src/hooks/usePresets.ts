import { useState, useCallback, useEffect } from 'react';
import type { TimeLogPreset } from '../types';

const STORAGE_KEY = 'timeLogPresets';
const PRESETS_UPDATED_EVENT = 'timeLogPresetsUpdated';

function loadFromStorage(): TimeLogPreset[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistToStorage(presets: TimeLogPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(PRESETS_UPDATED_EVENT));
  }
}

/**
 * Hook for managing time log presets.
 * Presets are saved to localStorage and shared across components.
 */
export const usePresets = () => {
  const [presets, setPresets] = useState<TimeLogPreset[]>(loadFromStorage);

  // Sync across tabs and same-tab hook instances
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setPresets(loadFromStorage());
      }
    };
    const handleCustom = () => {
      setPresets(loadFromStorage());
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(PRESETS_UPDATED_EVENT, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(PRESETS_UPDATED_EVENT, handleCustom);
    };
  }, []);

  const savePreset = useCallback((preset: TimeLogPreset) => {
    setPresets(prev => {
      const existingIndex = prev.findIndex(p => p.id === preset.id);
      let next: TimeLogPreset[];
      if (existingIndex >= 0) {
        next = [...prev];
        next[existingIndex] = preset;
      } else {
        next = [...prev, preset];
      }
      persistToStorage(next);
      return next;
    });
  }, []);

  const deletePreset = useCallback((id: string) => {
    setPresets(prev => {
      const next = prev.filter(p => p.id !== id);
      persistToStorage(next);
      return next;
    });
  }, []);

  return { presets, savePreset, deletePreset };
};
