import React from 'react';
import { Stack, Group, Text, Checkbox, Select, Textarea, NumberInput, TextInput } from '@mantine/core';
import { IconListCheck } from '@tabler/icons-react';
import type { CustomField } from '../../types';

/// <summary>
/// Properties for configuring the CustomFieldsSection component.
/// </summary>
interface CustomFieldsSectionProps {
  /// <summary>List of custom field definitions available from Redmine.</summary>
  customFields: CustomField[];
  /// <summary>Dictionary mapping custom field ID to its current string value.</summary>
  values: Record<number, string>;
  /// <summary>Callback invoked when a custom field's value changes.</summary>
  onChange: (fieldId: number, value: string) => void;
  /// <summary>Whether all input controls in this section should be disabled.</summary>
  disabled?: boolean;
}

/// <summary>
/// Shared UI component that dynamically renders Redmine custom fields (boolean checkboxes,
/// list dropdowns, multiline textareas, numeric inputs, and standard text/date inputs).
/// </summary>
export const CustomFieldsSection: React.FC<CustomFieldsSectionProps> = ({
  customFields,
  values,
  onChange,
  disabled = false,
}) => {
  if (customFields.length === 0) return null;

  return (
    <Stack gap="sm" pt="xs">
      <Group gap="xs">
        <IconListCheck size={14} color="var(--mantine-color-dimmed)" />
        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
          Custom Fields
        </Text>
      </Group>

      <Group grow wrap="wrap">
        {customFields.map(field => {
          const value = values[field.id] || '';
          const format = field.field_format || '';
          const isLikelyBool =
            format === 'bool' ||
            format === 'boolean' ||
            field.name.toLowerCase().includes('billable') ||
            field.name.toLowerCase().includes('billing');

          if (isLikelyBool) {
            return (
              <Checkbox
                key={field.id}
                label={field.name}
                checked={value === '1'}
                onChange={e => onChange(field.id, e.currentTarget.checked ? '1' : '0')}
                disabled={disabled}
              />
            );
          }

          if (format === 'list' || format === 'user' || format === 'version') {
            return (
              <Select
                key={field.id}
                label={field.name}
                placeholder={`-- Select ${field.name} --`}
                value={value}
                onChange={v => onChange(field.id, v || '')}
                data={field.possible_values?.map(v => ({ value: v, label: v })) || []}
                required={field.is_required || field.required}
                disabled={disabled}
              />
            );
          }

          if (format === 'text') {
            return (
              <Textarea
                key={field.id}
                label={field.name}
                value={value}
                onChange={e => onChange(field.id, e.currentTarget.value)}
                required={field.is_required || field.required}
                minRows={2}
                autosize
                disabled={disabled}
                style={{ flex: '1 1 100%' }}
              />
            );
          }

          if (format === 'int' || format === 'float') {
            return (
              <NumberInput
                key={field.id}
                label={field.name}
                value={value ? parseFloat(value) : ''}
                onChange={v => onChange(field.id, v === '' ? '' : String(v))}
                required={field.is_required || field.required}
                decimalScale={format === 'float' ? 2 : 0}
                disabled={disabled}
              />
            );
          }

          return (
            <TextInput
              key={field.id}
              label={field.name}
              value={value}
              onChange={e => onChange(field.id, e.currentTarget.value)}
              required={field.is_required || field.required}
              type={format === 'date' ? 'date' : 'text'}
              disabled={disabled}
            />
          );
        })}
      </Group>
    </Stack>
  );
};
