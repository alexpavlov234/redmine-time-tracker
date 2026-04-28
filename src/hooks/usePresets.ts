import { useState, useCallback, useEffect } from 'react';
import type { TimeLogPreset } from '../types';

const STORAGE_KEY = 'timeLogPresets';

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
}

/**
 * Hook for managing time log presets.
 * Presets are saved to localStorage and shared across components.
 */
export const usePresets = () => {
  const [presets, setPresets] = useState<TimeLogPreset[]>(loadFromStorage);

  // Sync if another tab changes storage
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setPresets(loadFromStorage());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
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
