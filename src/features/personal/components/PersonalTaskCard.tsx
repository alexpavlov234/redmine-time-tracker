import React from 'react';
import { Card, Group, Text, Checkbox, ActionIcon, Badge, Tooltip } from '@mantine/core';
import { IconTrash, IconNote, IconChevronRight } from '@tabler/icons-react';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { PersonalTask } from '../../../types';

/// <summary>
/// Props for the simplified PersonalTaskCard component.
/// </summary>
interface PersonalTaskCardProps {
  /// <summary>Personal task item to render.</summary>
  task: PersonalTask;
  /// <summary>Toggles completion status of the task.</summary>
  onToggleCompleted: (id: string) => void;
  /// <summary>Opens the full-page task detail and sticky notes view.</summary>
  onOpenTask: (id: string) => void;
  /// <summary>Deletes the task.</summary>
  onDelete: (id: string) => void;
}

/// <summary>
/// Streamlined row card representing a single personal task with a checkbox,
/// title, sticky notes counter badge, and quick delete button.
/// </summary>
export const PersonalTaskCard: React.FC<PersonalTaskCardProps> = ({
  task,
  onToggleCompleted,
  onOpenTask,
  onDelete,
}) => {
  const { t } = useLanguage();
  const noteCount = task.stickyNotes?.length ?? 0;

  return (
    <Card
      withBorder
      radius="md"
      p="sm"
      style={{
        opacity: task.completed ? 0.65 : 1,
        transition: 'background-color 0.15s ease, opacity 0.15s ease, transform 0.12s ease',
        cursor: 'pointer',
      }}
      onClick={() => onOpenTask(task.id)}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
            <Checkbox
              checked={task.completed}
              onChange={() => onToggleCompleted(task.id)}
              size="md"
              color="teal"
            />
          </div>

          <Text
            fw={500}
            size="md"
            style={{
              textDecoration: task.completed ? 'line-through' : 'none',
              wordBreak: 'break-word',
              flex: 1,
            }}
          >
            {task.title}
          </Text>
        </Group>

        <Group gap="xs" wrap="nowrap">
          {noteCount > 0 && (
            <Badge
              variant="light"
              color="blue"
              size="sm"
              leftSection={<IconNote size={12} />}
            >
              {noteCount === 1
                ? t('notesCountSingle')
                : `${noteCount} ${t('notesCountPlural')}`}
            </Badge>
          )}

          <Tooltip label={t('deleteBtnTooltip')}>
            <ActionIcon
              variant="subtle"
              color="red"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(task.id);
              }}
            >
              <IconTrash size={15} />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={t('openTaskTooltip')}>
            <ActionIcon variant="subtle" color="gray" size="sm">
              <IconChevronRight size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Card>
  );
};
