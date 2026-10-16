import React, { useState } from 'react';
import { ActionIcon, Tooltip, Badge, Box } from '@mantine/core';
import { IconNotes } from '@tabler/icons-react';
import { useTaskNotes } from '../../hooks/useTaskNotes';
import { TaskNoteModal } from './TaskNoteModal';

/// <summary>
/// Properties for configuring the TaskNoteButton component.
/// </summary>
export interface TaskNoteButtonProps {
  /// <summary>Task ID to connect notes with.</summary>
  taskId: number | string | null | undefined;
  /// <summary>Optional task subject for display inside the notes modal.</summary>
  taskSubject?: string;
  /// <summary>Visual size of the action icon button.</summary>
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /// <summary>Callback executed after note is updated.</summary>
  onNoteUpdated?: (newNote: string) => void;
}

/// <summary>
/// Interactive icon button that displays note presence status and opens the task notes modal on click.
/// Shows a badge with the count of notes if there are multiple notes on the task.
/// </summary>
export const TaskNoteButton: React.FC<TaskNoteButtonProps> = ({
  taskId,
  taskSubject,
  size = 'sm',
  onNoteUpdated,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { getNotes } = useTaskNotes();

  const cleanTaskId = taskId ? String(taskId).replace(/^#/, '').trim() : '';
  if (!cleanTaskId) return null;

  const taskNotes = getNotes(cleanTaskId);
  const count = taskNotes.length;
  const hasNote = count > 0;

  const tooltipLabel = hasNote
    ? `${count} note${count > 1 ? 's' : ''}: "${taskNotes[0].title || taskNotes[0].content.slice(0, 40)}..."`
    : 'Add note for this task';

  return (
    <>
      <Tooltip label={tooltipLabel}>
        <Box style={{ position: 'relative', display: 'inline-block' }}>
          <ActionIcon
            size={size}
            variant={hasNote ? 'filled' : 'subtle'}
            color={hasNote ? 'blue' : 'gray'}
            onClick={(e) => {
              e.stopPropagation();
              setIsModalOpen(true);
            }}
            aria-label={hasNote ? `View ${count} task note(s)` : 'Add task note'}
          >
            <IconNotes size={size === 'xs' ? 14 : size === 'sm' ? 16 : 18} />
          </ActionIcon>
          {count > 1 && (
            <Badge
              size="xs"
              circle
              color="indigo"
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                pointerEvents: 'none',
                minWidth: 14,
                height: 14,
                fontSize: 9,
                padding: 0,
              }}
            >
              {count}
            </Badge>
          )}
        </Box>
      </Tooltip>

      <TaskNoteModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        taskId={cleanTaskId}
        taskSubject={taskSubject}
        onSaved={onNoteUpdated}
      />
    </>
  );
};
