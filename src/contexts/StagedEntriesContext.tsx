import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import type { StagedTimeEntry } from '../types';
import {
  loadStagedEntries,
  saveStagedEntries,
  generateStagedId,
  pushSingleStagedEntryToRedmine,
} from '../services/stagedEntries';
import { useProjects } from './ProjectsContext';

export type NewStagedEntryInput = Omit<StagedTimeEntry, 'localId' | 'createdAt' | 'lastError'>;

export interface PushBatchResult {
  pushedCount: number;
  failedCount: number;
  errors: Array<{ localId: string; message: string }>;
}

interface StagedEntriesContextProps {
  stagedEntries: StagedTimeEntry[];
  stagedByDate: Record<string, StagedTimeEntry[]>;
  totalStagedHours: number;
  isPushing: boolean;
  pushProgress: { current: number; total: number } | null;
  stageEntry: (input: NewStagedEntryInput) => StagedTimeEntry;
  stageEntries: (inputs: NewStagedEntryInput[]) => StagedTimeEntry[];
  updateStagedEntry: (localId: string, updates: Partial<Omit<StagedTimeEntry, 'localId' | 'createdAt'>>) => void;
  removeStagedEntry: (localId: string) => void;
  pushEntry: (localId: string) => Promise<{ success: boolean; error?: string }>;
  pushDay: (dateStr: string) => Promise<PushBatchResult>;
  pushAll: () => Promise<PushBatchResult>;
}

const StagedEntriesContext = createContext<StagedEntriesContextProps | undefined>(undefined);

/// <summary>
/// Context provider managing locally committed (staged) time entries and batch push to Redmine.
/// </summary>
export const StagedEntriesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { refreshRecentProjects } = useProjects();
  const [stagedEntries, setStagedEntries] = useState<StagedTimeEntry[]>(() => loadStagedEntries());
  const [isPushing, setIsPushing] = useState(false);
  const [pushProgress, setPushProgress] = useState<{ current: number; total: number } | null>(null);

  const persistUpdate = useCallback((updater: (prev: StagedTimeEntry[]) => StagedTimeEntry[]) => {
    setStagedEntries(prev => {
      const next = updater(prev);
      saveStagedEntries(next);
      return next;
    });
  }, []);

  const stageEntry = useCallback(
    (input: NewStagedEntryInput): StagedTimeEntry => {
      const entry: StagedTimeEntry = {
        ...input,
        localId: generateStagedId(),
        createdAt: Date.now(),
      };
      persistUpdate(prev => [...prev, entry]);
      return entry;
    },
    [persistUpdate]
  );

  const stageEntries = useCallback(
    (inputs: NewStagedEntryInput[]): StagedTimeEntry[] => {
      const now = Date.now();
      const created: StagedTimeEntry[] = inputs.map((input, idx) => ({
        ...input,
        localId: `staged_${now}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        createdAt: now + idx,
      }));
      persistUpdate(prev => [...prev, ...created]);
      return created;
    },
    [persistUpdate]
  );

  const updateStagedEntry = useCallback(
    (localId: string, updates: Partial<Omit<StagedTimeEntry, 'localId' | 'createdAt'>>) => {
      persistUpdate(prev =>
        prev.map(item =>
          item.localId === localId ? { ...item, ...updates, lastError: undefined } : item
        )
      );
    },
    [persistUpdate]
  );

  const removeStagedEntry = useCallback(
    (localId: string) => {
      persistUpdate(prev => prev.filter(item => item.localId !== localId));
    },
    [persistUpdate]
  );

  const executeBatchPush = useCallback(
    async (targets: StagedTimeEntry[]): Promise<PushBatchResult> => {
      if (targets.length === 0) {
        return { pushedCount: 0, failedCount: 0, errors: [] };
      }

      setIsPushing(true);
      setPushProgress({ current: 0, total: targets.length });

      const succeededIds = new Set<string>();
      const errorMap = new Map<string, string>();
      const errors: Array<{ localId: string; message: string }> = [];

      for (let i = 0; i < targets.length; i++) {
        const entry = targets[i];
        try {
          await pushSingleStagedEntryToRedmine(entry);
          succeededIds.add(entry.localId);
        } catch (err: any) {
          const message = err?.message || 'Failed to send entry to Redmine';
          errorMap.set(entry.localId, message);
          errors.push({ localId: entry.localId, message });
        }
        setPushProgress({ current: i + 1, total: targets.length });
      }

      persistUpdate(prev =>
        prev
          .filter(item => !succeededIds.has(item.localId))
          .map(item =>
            errorMap.has(item.localId) ? { ...item, lastError: errorMap.get(item.localId) } : item
          )
      );

      if (succeededIds.size > 0) {
        refreshRecentProjects().catch(() => {});
      }

      setIsPushing(false);
      setPushProgress(null);

      return {
        pushedCount: succeededIds.size,
        failedCount: errors.length,
        errors,
      };
    },
    [persistUpdate, refreshRecentProjects]
  );

  const pushEntry = useCallback(
    async (localId: string): Promise<{ success: boolean; error?: string }> => {
      const target = stagedEntries.find(e => e.localId === localId);
      if (!target) return { success: false, error: 'Entry not found' };
      const res = await executeBatchPush([target]);
      if (res.pushedCount > 0) {
        return { success: true };
      }
      return { success: false, error: res.errors[0]?.message || 'Submission failed' };
    },
    [stagedEntries, executeBatchPush]
  );

  const pushDay = useCallback(
    async (dateStr: string): Promise<PushBatchResult> => {
      const targets = stagedEntries.filter(e => e.spent_on === dateStr);
      return executeBatchPush(targets);
    },
    [stagedEntries, executeBatchPush]
  );

  const pushAll = useCallback(async (): Promise<PushBatchResult> => {
    return executeBatchPush([...stagedEntries]);
  }, [stagedEntries, executeBatchPush]);

  const stagedByDate = useMemo(() => {
    const grouped: Record<string, StagedTimeEntry[]> = {};
    stagedEntries.forEach(entry => {
      if (!grouped[entry.spent_on]) {
        grouped[entry.spent_on] = [];
      }
      grouped[entry.spent_on].push(entry);
    });
    return grouped;
  }, [stagedEntries]);

  const totalStagedHours = useMemo(
    () => stagedEntries.reduce((sum, e) => sum + e.hours, 0),
    [stagedEntries]
  );

  return (
    <StagedEntriesContext.Provider
      value={{
        stagedEntries,
        stagedByDate,
        totalStagedHours,
        isPushing,
        pushProgress,
        stageEntry,
        stageEntries,
        updateStagedEntry,
        removeStagedEntry,
        pushEntry,
        pushDay,
        pushAll,
      }}
    >
      {children}
    </StagedEntriesContext.Provider>
  );
};

export const useStagedEntries = () => {
  const ctx = useContext(StagedEntriesContext);
  if (!ctx) {
    throw new Error('useStagedEntries must be used within a StagedEntriesProvider');
  }
  return ctx;
};
