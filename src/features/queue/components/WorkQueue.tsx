import React, { useState, useRef } from 'react';
import { Card, Button } from '../../../components/ui';
import { useQueue } from '../../../contexts/QueueContext';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useConfirm } from '../../../contexts/ConfirmContext';
import styles from './WorkQueue.module.scss';
import { GripVertical, Trash2, Layers, Play, Pause } from 'lucide-react';
import { formatTime } from '../../../utils/formatters';

export const WorkQueue: React.FC = () => {
  const { todos, removeTodo, reorderTodos, activeTodoId } = useQueue();
  const timer = useQueueTimer();
  const confirm = useConfirm();

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragItemRef = useRef<number | null>(null);

  // First activity prompt state (for starting from queue items)
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptTodoId, setPromptTodoId] = useState<number | null>(null);
  const [promptText, setPromptText] = useState('');

  const handlePlayPause = async (todoId: number) => {
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    // If this todo is already running, pause it
    if (activeTodoId === todoId && timer.isRunning) {
      timer.pauseTimer();
      return;
    }

    // Start this todo
    const result = await timer.startTimerForTodo(todoId);
    if (result === 'needs_prompt') {
      setPromptTodoId(todoId);
      setPromptText(todo.note || '');
      setShowPrompt(true);
    }
  };

  const handlePromptSubmit = () => {
    if (!promptText.trim() || promptTodoId === null) return;
    (timer as any).startAfterPrompt(promptTodoId, promptText.trim());
    setShowPrompt(false);
    setPromptText('');
    setPromptTodoId(null);
  };

  const handleDelete = async (id: number) => {
    const isActive = activeTodoId === id;
    const confirmed = await confirm({
      message: isActive
        ? 'This task is currently being tracked. Are you sure you want to remove it?'
        : 'Are you sure you want to remove this task from the queue?',
      variant: 'danger',
      confirmText: 'Remove',
    });
    if (confirmed) {
      if (isActive) {
        timer.resetTimer(false);
      }
      removeTodo(id);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (index: number) => {
    dragItemRef.current = index;
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragItemRef.current !== null && dragItemRef.current !== index) {
      reorderTodos(dragItemRef.current, index);
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragItemRef.current = null;
  };

  return (
    <>
      <Card
        title={<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Layers size={20} className="text-primary" /> Work Queue</div>}
        headerAction={<span className={styles.badge}>{todos.length}</span>}
        className={styles.queueCard}
      >
        <p className={styles.subtitle}>Drag to reorder. First task is active when timer starts.</p>

        {todos.length === 0 ? (
          <div className={styles.emptyState}>
            Your queue is empty. Add a task below to get started.
          </div>
        ) : (
          <ul className={styles.list}>
            {todos.map((todo, index) => {
              const isActive = activeTodoId === todo.id;
              const isThisRunning = isActive && timer.isRunning;
              const elapsedSec = Math.floor((todo.elapsedMs || 0) / 1000);

              return (
                <li
                  key={todo.id}
                  className={`
                    ${styles.listItem}
                    ${isActive ? styles.active : ''}
                    ${dragIndex === index ? styles.dragging : ''}
                    ${dragOverIndex === index ? styles.dragOver : ''}
                  `}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                >
                  <div className={styles.dragHandle}>
                    <GripVertical size={16} />
                  </div>

                  <div className={styles.content}>
                    <div className={styles.projectName}>{todo.projectName}</div>
                    <div className={styles.taskSubject}>#{todo.taskId} - {todo.taskSubject}</div>
                    {todo.activityName && (
                      <div className={styles.activityName}>{todo.activityName}</div>
                    )}
                    {todo.note && <div className={styles.note}>{todo.note}</div>}
                  </div>

                  <div className={styles.actions}>
                    {(elapsedSec > 0 || isThisRunning) && (
                      <span className={`${styles.elapsed} ${isThisRunning ? styles.running : ''}`}>
                        {isThisRunning ? formatTime(timer.totalElapsedTime) : formatTime(elapsedSec)}
                      </span>
                    )}
                    <Button
                      variant={isThisRunning ? 'warning' : 'primary'}
                      size="sm"
                      icon={isThisRunning ? Pause : Play}
                      onClick={() => handlePlayPause(todo.id)}
                      aria-label={isThisRunning ? 'Pause' : 'Start'}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={Trash2}
                      onClick={() => handleDelete(todo.id)}
                      className={styles.deleteBtn}
                      aria-label="Remove task"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Inline first-activity prompt for queue item starts */}
      {showPrompt && (
        <div className={styles.promptOverlay} onClick={() => { setShowPrompt(false); }}>
          <div className={styles.promptCard} onClick={e => e.stopPropagation()}>
            <h4 style={{ margin: '0 0 0.75rem' }}>What is your first performed task?</h4>
            <input
              className={styles.promptInput}
              type="text"
              placeholder="e.g., Investigating bug #123"
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handlePromptSubmit(); }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
              <Button variant="secondary" size="sm" onClick={() => setShowPrompt(false)}>Cancel</Button>
              <Button variant="primary" size="sm" icon={Play} onClick={handlePromptSubmit} disabled={!promptText.trim()}>
                Start
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
