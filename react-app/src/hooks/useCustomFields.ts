import { useState, useEffect } from 'react';
import type { CustomField } from '../types';
import { getTimeEntryCustomFields } from '../services/redmine';

/**
 * Hook to fetch and cache time entry custom fields.
 * Mimics the dynamic behavior of the original standard app.
 */
const CACHE_KEY = 'redmine_custom_fields_cache';

export const useCustomFields = () => {
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const fetchFields = async () => {
      // 1. Try to load from cache first for immediate UI
      const cached = localStorage.getItem(CACHE_KEY);
      let cacheValid = false;
      if (cached) {
        try {
          const { fields, timestamp } = JSON.parse(cached);
          if (isMounted) {
            setCustomFields(fields);
            setIsLoading(false);
          }
          // Only refresh from network if cache is older than 1 hour
          if (Date.now() - timestamp < 1000 * 60 * 60) {
            cacheValid = true;
          }
        } catch (e) {
          localStorage.removeItem(CACHE_KEY);
        }
      }

      if (cacheValid) return;

      let fetchedFields: CustomField[] = [];
      
      try {
        fetchedFields = await getTimeEntryCustomFields();
        setError(null);
        
        // Update cache
        localStorage.setItem(CACHE_KEY, JSON.stringify({
          fields: fetchedFields,
          timestamp: Date.now()
        }));
      } catch (err: any) {
        console.warn('Failed to fetch custom fields, using cache/synthesis fallback:', err);
      }

      if (isMounted) {
        let finalFields = fetchedFields.length > 0 ? [...fetchedFields] : [...customFields];
        
        // Enrich fields that are missing formats (common in fallback results)
        finalFields = finalFields.map(f => {
          if (!f.field_format) {
            // 1. Try to infer from name (strongest hint for Billable)
            const name = f.name.toLowerCase();
            if (name.includes('billable') || name.includes('billing')) {
              return { ...f, field_format: 'bool' };
            }

            // 2. Try to infer from value if present
            const val = f.value;
            if (val === '0' || val === '1') {
              return { ...f, field_format: 'bool' };
            }
            if (val && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
              return { ...f, field_format: 'date' };
            }
            if (val && !isNaN(Number(val)) && val.trim() !== '') {
              return { ...f, field_format: 'float' };
            }
          }
          return f;
        });

        let billableId = localStorage.getItem('billableFieldId');
        
        // Auto-detect billable if we have fields but no ID in storage
        if (!billableId && finalFields.length > 0) {
          const detected = finalFields.find(f => 
            f.name.toLowerCase().includes('billable') || 
            f.name.toLowerCase().includes('billing')
          );
          if (detected) {
            billableId = detected.id.toString();
            localStorage.setItem('billableFieldId', billableId);
            console.log('Auto-detected and saved billable field ID:', billableId);
          }
        }

        if (billableId) {
          const hasBillable = finalFields.some(f => f.id === Number(billableId));
          if (!hasBillable) {
            finalFields.push({
              id: Number(billableId),
              name: 'Billable',
              field_format: 'bool',
              default_value: '1'
            });
          }
        }
        
        setCustomFields(finalFields);
        setIsLoading(false);
      }
    };

    fetchFields();

    return () => {
      isMounted = false;
    };
  }, []);

  return { customFields, isLoading, error };
};
