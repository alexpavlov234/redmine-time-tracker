import React, { useState, useMemo } from 'react';
import {
  Stack,
  Group,
  Title,
  Text,
  Button,
  TextInput,
  SegmentedControl,
  SimpleGrid,
  Paper,
  Badge,
  ActionIcon,
} from '@mantine/core';
import {
  IconPlus,
  IconSearch,
  IconNotes,
  IconTag,
  IconX,
} from '@tabler/icons-react';
import { useTaskNotes } from '../../../hooks/useTaskNotes';
import { useConfirm } from '../../../contexts/ConfirmContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { NoteCard } from './NoteCard';
import { NoteEditModal } from './NoteEditModal';
import type { NoteItem } from '../../../types';

/// <summary>
/// Dashboard page for managing, searching, labeling, and categorizing both general notes and task-linked notes.
/// </summary>
export const NotesDashboard: React.FC = () => {
  const { allNotes, allLabels, saveNoteItem, deleteNoteItem } = useTaskNotes();
  const confirm = useConfirm();
  const { t } = useLanguage();

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'general' | 'tasks'>('all');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);

  /// <summary>
  /// Filters the list of notes based on active tab, search keywords, and selected label tag.
  /// </summary>
  const filteredNotes = useMemo(() => {
    return allNotes
      .filter((note) => {
        // Tab filtering
        if (activeTab === 'general' && note.taskId) return false;
        if (activeTab === 'tasks' && !note.taskId) return false;

        // Label filtering
        if (selectedLabel && (!note.labels || !note.labels.includes(selectedLabel))) {
          return false;
        }

        // Search text filtering
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchTitle = note.title?.toLowerCase().includes(q);
          const matchContent = note.content.toLowerCase().includes(q);
          const matchTaskId = note.taskId?.toLowerCase().includes(q);
          const matchTaskSubject = note.taskSubject?.toLowerCase().includes(q);
          const matchLabels = note.labels?.some((l) => l.toLowerCase().includes(q));

          if (!matchTitle && !matchContent && !matchTaskId && !matchTaskSubject && !matchLabels) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        // Pinned notes always surface first
        if (Boolean(b.pinned) !== Boolean(a.pinned)) {
          return b.pinned ? 1 : -1;
        }
        return b.updatedAt - a.updatedAt;
      });
  }, [allNotes, activeTab, selectedLabel, searchQuery]);

  /// <summary>
  /// Opens modal for editing an existing note.
  /// </summary>
  const handleEdit = (note: NoteItem) => {
    setEditingNote(note);
    setIsModalOpen(true);
  };

  /// <summary>
  /// Opens modal for creating a new note.
  /// </summary>
  const handleCreateNew = () => {
    setEditingNote(null);
    setIsModalOpen(true);
  };

  /// <summary>
  /// Toggles pinned state for a note.
  /// </summary>
  const handleTogglePin = (note: NoteItem) => {
    saveNoteItem({
      ...note,
      pinned: !note.pinned,
    });
  };

  /// <summary>
  /// Deletes a note after confirmation dialog.
  /// </summary>
  const handleDelete = async (noteId: string) => {
    const isConfirmed = await confirm({
      message: t('deleteNoteConfirmMsg'),
      confirmText: t('deleteBtn'),
      cancelText: t('cancelBtn'),
      variant: 'danger',
    });

    if (isConfirmed) {
      deleteNoteItem(noteId);
    }
  };

  return (
    <Stack gap="lg">
      {/* Header with Title and Add Button */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t('notesTitle')}</Title>
        <Button
          leftSection={<IconPlus size={18} />}
          onClick={handleCreateNew}
          color="blue"
        >
          {t('newNoteBtn')}
        </Button>
      </Group>

      {/* Filter and Search Bar */}
      <Paper p="md" radius="md" withBorder bg="var(--mantine-color-default)">
        <Stack gap="sm">
          <Group justify="space-between" align="center" wrap="wrap">
            <SegmentedControl
              value={activeTab}
              onChange={(val) => setActiveTab(val as 'all' | 'general' | 'tasks')}
              data={[
                { label: `${t('allNotesTab')} (${allNotes.length})`, value: 'all' },
                { label: `${t('generalNotesTab')} (${allNotes.filter((n) => !n.taskId).length})`, value: 'general' },
                { label: `${t('taskNotesTab')} (${allNotes.filter((n) => Boolean(n.taskId)).length})`, value: 'tasks' },
              ]}
            />

            <TextInput
              placeholder={t('searchNotesPlaceholder')}
              leftSection={<IconSearch size={16} />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.currentTarget.value)}
              style={{ flex: 1, minWidth: 220 }}
              rightSection={
                searchQuery ? (
                  <ActionIcon variant="subtle" size="xs" onClick={() => setSearchQuery('')}>
                    <IconX size={14} />
                  </ActionIcon>
                ) : null
              }
            />
          </Group>

          {/* Quick Label Tag Filter Bar */}
          {allLabels.length > 0 && (
            <Group gap="xs" wrap="wrap" align="center">
              <Text size="xs" fw={600} c="dimmed">
                {t('filterByLabelText')}
              </Text>
              {allLabels.map((lbl) => {
                const isSelected = selectedLabel === lbl;
                return (
                  <Badge
                    key={lbl}
                    size="sm"
                    variant={isSelected ? 'filled' : 'light'}
                    color={isSelected ? 'blue' : 'gray'}
                    leftSection={<IconTag size={12} />}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedLabel(isSelected ? null : lbl)}
                  >
                    {lbl}
                  </Badge>
                );
              })}
              {selectedLabel && (
                <Button
                  variant="subtle"
                  size="compact-xs"
                  color="gray"
                  onClick={() => setSelectedLabel(null)}
                >
                  {t('clearFilterBtn')}
                </Button>
              )}
            </Group>
          )}
        </Stack>
      </Paper>

      {/* Notes Grid */}
      {filteredNotes.length === 0 ? (
        <Paper p="xl" withBorder radius="md" ta="center" bg="var(--mantine-color-default)">
          <Stack align="center" gap="sm">
            <IconNotes size={40} color="var(--mantine-color-gray-5)" />
            <Text fw={600}>{t('noNotesFound')}</Text>
            <Text size="sm" c="dimmed">
              {searchQuery || selectedLabel
                ? t('noNotesFilterHint')
                : t('noNotesEmptyHint')}
            </Text>
            {!searchQuery && !selectedLabel && (
              <Button
                leftSection={<IconPlus size={16} />}
                variant="light"
                onClick={handleCreateNew}
                mt="xs"
              >
                {t('createNoteBtn')}
              </Button>
            )}
          </Stack>
        </Paper>
      ) : (
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {filteredNotes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onSelectLabel={(lbl) => setSelectedLabel(lbl)}
            />
          ))}
        </SimpleGrid>
      )}

      {/* Create / Edit Note Modal */}
      <NoteEditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        note={editingNote}
      />
    </Stack>
  );
};
