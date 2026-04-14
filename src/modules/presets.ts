import { state, setPresets } from '../state/index.js';
import { TimeLogPreset } from '../types/index.js';

export function loadPresets() {
    const raw = localStorage.getItem('timeLogPresets');
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                setPresets(parsed);
            }
        } catch (e) {
            console.error('Failed to parse time log presets', e);
        }
    }
}

export function savePreset(preset: TimeLogPreset) {
    const current = [...state.presets];
    const existingIndex = current.findIndex(p => p.id === preset.id);
    if (existingIndex >= 0) {
        current[existingIndex] = preset;
    } else {
        current.push(preset);
    }
    
    setPresets(current);
    localStorage.setItem('timeLogPresets', JSON.stringify(current));
    
    // Dispatch an event so components can update their UI
    window.dispatchEvent(new CustomEvent('presetsUpdated'));
}

export function deletePreset(id: string) {
    const next = state.presets.filter(p => p.id !== id);
    setPresets(next);
    localStorage.setItem('timeLogPresets', JSON.stringify(next));
    
    window.dispatchEvent(new CustomEvent('presetsUpdated'));
}
