import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Paper,
  Group,
  Stack,
  Text,
  ActionIcon,
  Tooltip,
  Badge,
  Modal,
  TextInput,
  Button,
  Box,
  Portal,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerStop,
  IconChevronRight,
  IconChevronLeft,
  IconChevronUp,
  IconChevronDown,
  IconGripVertical,
  IconClock,
} from '@tabler/icons-react';
import { useQueueTimer } from '../../../hooks/useQueueTimer';
import { useSettings } from '../../../contexts/SettingsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatTime } from '../../../utils/formatters';
import { RedmineIssueLink } from '../../../components/common/RedmineIssueLink';
import { SummaryModal } from '../../tracker/components/SummaryModal';

type TimerAnchor = 'tl' | 'tc' | 'tr' | 'bl' | 'bc' | 'br';

const ANCHOR_KEYS: TimerAnchor[] = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'];
const COLLAPSED_STORAGE_KEY = 'floating_timer_collapsed';
const ANCHOR_STORAGE_KEY = 'floating_timer_anchor';
const DRAG_THRESHOLD = 5;
const EDGE_MARGIN = 16;

function isValidAnchor(val: string | null): val is TimerAnchor {
  return val !== null && (ANCHOR_KEYS as string[]).includes(val);
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function getHeaderOffset(): number {
  const header = document.querySelector('header');
  if (header) {
    const rect = header.getBoundingClientRect();
    return Math.max(EDGE_MARGIN, rect.bottom + 12);
  }
  return 72;
}

function getViewport(): { vw: number; vh: number } {
  return {
    vw: document.documentElement.clientWidth || window.innerWidth,
    vh: document.documentElement.clientHeight || window.innerHeight,
  };
}

/// <summary>
/// Global floating timer widget docked across non-Tracker pages with 6-anchor drag snapping,
/// dynamic header avoidance, edge-aware collapse/expand docking, and live playback controls.
/// </summary>
export const FloatingSideTimer: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConfigured } = useSettings();
  const { t } = useLanguage();
  const timer = useQueueTimer();
  const { isRunning, totalElapsedTime, activeTodo } = timer;

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [anchor, setAnchor] = useState<TimerAnchor>(() => {
    try {
      const saved = localStorage.getItem(ANCHOR_STORAGE_KEY);
      return isValidAnchor(saved) ? saved : 'br';
    } catch {
      return 'br';
    }
  });
  const [isSummaryOpen, setIsSummaryOpen] = useState<boolean>(false);
  const [showFirstActivityModal, setShowFirstActivityModal] = useState<boolean>(false);
  const [firstActivityText, setFirstActivityText] = useState<string>('');
  const [pendingTodoId, setPendingTodoId] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const anchorRef = useRef<TimerAnchor>(anchor);
  const isCollapsedRef = useRef<boolean>(isCollapsed);
  const isDraggingRef = useRef<boolean>(false);
  const snapTimerRef = useRef<number | null>(null);

  useEffect(() => {
    anchorRef.current = anchor;
  }, [anchor]);

  useEffect(() => {
    isCollapsedRef.current = isCollapsed;
  }, [isCollapsed]);

  const isOnTrackerPage = location.pathname === '/';

  // Close floating summary modal automatically if user returns to Tracker page
  useEffect(() => {
    if (!isOnTrackerPage || !isSummaryOpen) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) {
        setIsSummaryOpen(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isOnTrackerPage, isSummaryOpen]);

  const getEdgeMarginForAnchor = useCallback((anchorKey: TimerAnchor, collapsed: boolean) => {
    if (collapsed && (anchorKey === 'tl' || anchorKey === 'bl' || anchorKey === 'tr' || anchorKey === 'br')) {
      return 0;
    }
    return EDGE_MARGIN;
  }, []);

  const getSnapPositions = useCallback(
    (el: HTMLElement) => {
      const rect = el.getBoundingClientRect();
      const { vw, vh } = getViewport();
      const topOffset = getHeaderOffset();
      const sideOffset = isCollapsedRef.current ? 0 : EDGE_MARGIN;

      const leftSnap = sideOffset;
      const centerSnapX = (vw - rect.width) / 2;
      const rightSnap = vw - rect.width - sideOffset;

      const topSnap = topOffset;
      const bottomSnap = vh - rect.height - EDGE_MARGIN;

      return {
        targets: [
          { key: 'tl' as TimerAnchor, left: leftSnap, top: topSnap, x: leftSnap + rect.width / 2, y: topSnap + rect.height / 2 },
          { key: 'tc' as TimerAnchor, left: centerSnapX, top: topSnap, x: centerSnapX + rect.width / 2, y: topSnap + rect.height / 2 },
          { key: 'tr' as TimerAnchor, left: rightSnap, top: topSnap, x: rightSnap + rect.width / 2, y: topSnap + rect.height / 2 },
          { key: 'bl' as TimerAnchor, left: leftSnap, top: bottomSnap, x: leftSnap + rect.width / 2, y: bottomSnap + rect.height / 2 },
          { key: 'bc' as TimerAnchor, left: centerSnapX, top: bottomSnap, x: centerSnapX + rect.width / 2, y: bottomSnap + rect.height / 2 },
          { key: 'br' as TimerAnchor, left: rightSnap, top: bottomSnap, x: rightSnap + rect.width / 2, y: bottomSnap + rect.height / 2 },
        ],
      };
    },
    []
  );

  const applyEdgeAnchor = useCallback(
    (el: HTMLElement, anchorKey: TimerAnchor) => {
      const topOffset = getHeaderOffset();
      const sideOffset = getEdgeMarginForAnchor(anchorKey, isCollapsedRef.current);
      el.style.transition = 'none';

      switch (anchorKey) {
        case 'tl':
          el.style.left = `${sideOffset}px`;
          el.style.top = `${topOffset}px`;
          el.style.right = 'auto';
          el.style.bottom = 'auto';
          el.style.transform = 'none';
          break;
        case 'tc':
          el.style.left = '50%';
          el.style.top = `${topOffset}px`;
          el.style.right = 'auto';
          el.style.bottom = 'auto';
          el.style.transform = 'translateX(-50%)';
          break;
        case 'tr':
          el.style.left = 'auto';
          el.style.top = `${topOffset}px`;
          el.style.right = `${sideOffset}px`;
          el.style.bottom = 'auto';
          el.style.transform = 'none';
          break;
        case 'bl':
          el.style.left = `${sideOffset}px`;
          el.style.top = 'auto';
          el.style.right = 'auto';
          el.style.bottom = `${EDGE_MARGIN}px`;
          el.style.transform = 'none';
          break;
        case 'bc':
          el.style.left = '50%';
          el.style.top = 'auto';
          el.style.right = 'auto';
          el.style.bottom = `${EDGE_MARGIN}px`;
          el.style.transform = 'translateX(-50%)';
          break;
        case 'br':
        default:
          el.style.left = 'auto';
          el.style.top = 'auto';
          el.style.right = `${sideOffset}px`;
          el.style.bottom = `${EDGE_MARGIN}px`;
          el.style.transform = 'none';
          break;
      }
    },
    [getEdgeMarginForAnchor]
  );

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  }, []);

  const handlePlay = useCallback(async () => {
    if (activeTodo) {
      const result = await timer.startTimerForTodo(activeTodo.id);
      if (result === 'needs_prompt') {
        setPendingTodoId(activeTodo.id);
        setFirstActivityText(activeTodo.note || '');
        setShowFirstActivityModal(true);
      }
    } else {
      timer.startWithoutTask();
    }
  }, [activeTodo, timer]);

  const handleStop = useCallback(() => {
    timer.stopTimer();
    if (totalElapsedTime > 0 || activeTodo) {
      setIsSummaryOpen(true);
    }
  }, [timer, totalElapsedTime, activeTodo]);

  const handleFirstActivitySubmit = () => {
    if (!firstActivityText.trim() || pendingTodoId === null) return;
    timer.startAfterPrompt(pendingTodoId, firstActivityText.trim());
    setShowFirstActivityModal(false);
    setFirstActivityText('');
    setPendingTodoId(null);
  };

  const handleFirstActivityCancel = () => {
    setShowFirstActivityModal(false);
    setFirstActivityText('');
    setPendingTodoId(null);
  };

  const hasActiveTimer = Boolean(activeTodo) || isRunning || totalElapsedTime > 0;

  // Apply edge anchor positioning whenever collapse state, anchor, or visibility changes (unless dragging)
  useEffect(() => {
    if (!isConfigured || isOnTrackerPage || !hasActiveTimer) return;
    const el = containerRef.current;
    if (!el || isDraggingRef.current) return;
    applyEdgeAnchor(el, anchor);
  }, [isCollapsed, anchor, hasActiveTimer, isOnTrackerPage, isConfigured, applyEdgeAnchor]);

  // Attach pointer drag lifecycle with 6-anchor Euclidean snapping & dynamic header avoidance
  useEffect(() => {
    if (!isConfigured || isOnTrackerPage || !hasActiveTimer) return;
    const el = containerRef.current;
    if (!el) return;

    let isPointerDown = false;
    let isDragging = false;
    let wasDragged = false;
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    function getClosestAnchor(targetEl: HTMLElement, currentLeft: number, currentTop: number) {
      const rect = targetEl.getBoundingClientRect();
      const centerX = currentLeft + rect.width / 2;
      const centerY = currentTop + rect.height / 2;
      const { targets } = getSnapPositions(targetEl);

      let closest = targets[0];
      let minDistance = Infinity;

      for (const target of targets) {
        const dx = centerX - target.x;
        const dy = centerY - target.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDistance) {
          minDistance = dist;
          closest = target;
        }
      }

      return closest;
    }

    function updateAnchorHighlights(activeAnchorKey: TimerAnchor) {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const dots = overlay.querySelectorAll('.floating-timer-anchor-dot');
      dots.forEach((dot) => {
        if (dot.getAttribute('data-anchor') === activeAnchorKey) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }

    function updateOverlayPositions(targetEl: HTMLElement) {
      const overlay = overlayRef.current;
      if (!overlay) return;
      const { targets } = getSnapPositions(targetEl);
      targets.forEach((target) => {
        const dot = overlay.querySelector(`[data-anchor="${target.key}"]`) as HTMLElement | null;
        if (dot) {
          dot.style.left = `${target.x}px`;
          dot.style.top = `${target.y}px`;
        }
      });
    }

    function snapToAnchor(targetEl: HTMLElement, anchorKey: TimerAnchor, animate = true) {
      const { targets } = getSnapPositions(targetEl);
      const target = targets.find((tItem) => tItem.key === anchorKey) || targets.find((tItem) => tItem.key === 'br')!;

      anchorRef.current = target.key;
      setAnchor(target.key);
      try {
        localStorage.setItem(ANCHOR_STORAGE_KEY, target.key);
      } catch {
        // ignore storage errors
      }

      if (snapTimerRef.current !== null) {
        window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }

      if (animate) {
        targetEl.style.transition =
          'left 0.28s cubic-bezier(0.25, 1, 0.5, 1), top 0.28s cubic-bezier(0.25, 1, 0.5, 1)';
        targetEl.style.left = `${target.left}px`;
        targetEl.style.top = `${target.top}px`;
        targetEl.style.bottom = 'auto';
        targetEl.style.right = 'auto';
        targetEl.style.transform = 'none';

        const finalizeSnap = () => {
          targetEl.removeEventListener('transitionend', finalizeSnap);
          if (snapTimerRef.current !== null) {
            window.clearTimeout(snapTimerRef.current);
            snapTimerRef.current = null;
          }
          if (!isDraggingRef.current) {
            applyEdgeAnchor(targetEl, target.key);
          }
        };

        targetEl.addEventListener('transitionend', finalizeSnap, { once: true });
        snapTimerRef.current = window.setTimeout(finalizeSnap, 320);
      } else {
        applyEdgeAnchor(targetEl, target.key);
      }
    }

    function onPointerDown(e: PointerEvent) {
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      if (!isCollapsedRef.current) {
        const target = e.target as HTMLElement | null;
        if (target?.closest('button, a, input, textarea')) {
          return;
        }
      }

      isPointerDown = true;
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = el!.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      if (snapTimerRef.current !== null) {
        window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }

      el!.style.transition = 'none';
      el!.style.transform = 'none';
      el!.style.left = `${rect.left}px`;
      el!.style.top = `${rect.top}px`;
      el!.style.bottom = 'auto';
      el!.style.right = 'auto';

      window.addEventListener('pointermove', onPointerMove, { passive: false });
      window.addEventListener('pointerup', onPointerUp, { passive: false });
      window.addEventListener('pointercancel', onPointerCancel, { passive: false });
    }

    function onPointerMove(e: PointerEvent) {
      if (!isPointerDown) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      if (!isDragging && (Math.abs(deltaX) > DRAG_THRESHOLD || Math.abs(deltaY) > DRAG_THRESHOLD)) {
        isDragging = true;
        isDraggingRef.current = true;
        wasDragged = true;
        el!.classList.add('is-dragging');
        document.body.style.userSelect = 'none';

        const overlay = overlayRef.current;
        if (overlay) {
          updateOverlayPositions(el!);
          overlay.classList.add('visible');
        }
      }

      if (isDragging) {
        if (e.cancelable) {
          e.preventDefault();
        }

        const rect = el!.getBoundingClientRect();
        const topOffset = getHeaderOffset();
        const padding = 8;
        const { vw, vh } = getViewport();

        const maxLeft = vw - rect.width - padding;
        const maxTop = vh - rect.height - padding;

        const newLeft = clamp(initialLeft + deltaX, padding, Math.max(padding, maxLeft));
        const newTop = clamp(initialTop + deltaY, topOffset, Math.max(topOffset, maxTop));

        el!.style.left = `${newLeft}px`;
        el!.style.top = `${newTop}px`;

        const closest = getClosestAnchor(el!, newLeft, newTop);
        updateAnchorHighlights(closest.key);
      }
    }

    function onPointerUp() {
      if (!isPointerDown) return;

      isPointerDown = false;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);

      document.body.style.userSelect = '';

      const overlay = overlayRef.current;
      if (overlay) {
        overlay.classList.remove('visible');
      }

      if (isDragging) {
        wasDragged = true;
        const rect = el!.getBoundingClientRect();
        const closest = getClosestAnchor(el!, rect.left, rect.top);

        snapToAnchor(el!, closest.key, true);

        window.setTimeout(() => {
          el?.classList.remove('is-dragging');
          isDragging = false;
          isDraggingRef.current = false;
          window.setTimeout(() => {
            wasDragged = false;
          }, 150);
        }, 50);
      } else {
        isDraggingRef.current = false;
        applyEdgeAnchor(el!, anchorRef.current);
      }
    }

    function onPointerCancel() {
      onPointerUp();
    }

    function onClickCapture(e: MouseEvent) {
      if (wasDragged || isDragging) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        wasDragged = false;
      }
    }

    function onWindowResize() {
      if (!el) return;
      if (!isDragging) {
        applyEdgeAnchor(el, anchorRef.current);
      } else {
        updateOverlayPositions(el);
      }
    }

    applyEdgeAnchor(el, anchorRef.current);

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('click', onClickCapture, true);
    window.addEventListener('resize', onWindowResize);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('resize', onWindowResize);
      document.body.style.userSelect = '';
      isDraggingRef.current = false;
      if (snapTimerRef.current !== null) {
        window.clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
    };
  }, [isConfigured, isOnTrackerPage, hasActiveTimer, applyEdgeAnchor, getSnapPositions]);

  if (!isConfigured || isOnTrackerPage || (!hasActiveTimer && !isSummaryOpen)) {
    return null;
  }

  const accentColor = isRunning ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-orange-filled)';
  const dotBg = isRunning ? 'var(--mantine-color-blue-filled)' : 'var(--mantine-color-orange-filled)';

  const isLeft = anchor === 'tl' || anchor === 'bl';
  const isRight = anchor === 'tr' || anchor === 'br';
  const isTopCenter = anchor === 'tc';
  const isBottomCenter = anchor === 'bc';

  const collapsedTooltipPosition = isLeft
    ? 'right'
    : isTopCenter
    ? 'bottom'
    : isBottomCenter
    ? 'top'
    : 'left';

  const renderExpandChevron = () => {
    if (isLeft) return <IconChevronRight size={16} />;
    if (isTopCenter) return <IconChevronDown size={16} />;
    if (isBottomCenter) return <IconChevronUp size={16} />;
    return <IconChevronLeft size={16} />;
  };

  const renderCollapseChevron = () => {
    if (isLeft) return <IconChevronLeft size={17} />;
    if (isTopCenter) return <IconChevronUp size={17} />;
    if (isBottomCenter) return <IconChevronDown size={17} />;
    return <IconChevronRight size={17} />;
  };

  const collapsedPaperStyle: React.CSSProperties = isRight
    ? {
        borderRadius: '10px 0 0 10px',
        borderRight: 'none',
        borderLeft: `3px solid ${accentColor}`,
      }
    : isLeft
    ? {
        borderRadius: '0 10px 10px 0',
        borderLeft: 'none',
        borderRight: `3px solid ${accentColor}`,
      }
    : {
        borderRadius: '999px',
        borderLeft: `3px solid ${accentColor}`,
      };

  return (
    <>
      {hasActiveTimer && (
        <>
          <Portal>
            <div ref={overlayRef} className="floating-timer-anchors-overlay" aria-hidden="true">
              {ANCHOR_KEYS.map((key) => (
                <div key={key} className="floating-timer-anchor-dot" data-anchor={key}>
                  <span className="dot-inner" />
                </div>
              ))}
            </div>
          </Portal>

          <Box ref={containerRef} className="floating-side-timer">
            {isCollapsed ? (
              <Tooltip label={t('showTimerFromSideTooltip')} position={collapsedTooltipPosition}>
                <Paper
                  withBorder
                  shadow="md"
                  p="xs"
                  bg="var(--mantine-color-body)"
                  className="floating-side-timer-surface"
                  role="button"
                  tabIndex={0}
                  aria-label={t('showTimerFromSideTooltip')}
                  onClick={toggleCollapsed}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      toggleCollapsed();
                    }
                  }}
                  style={collapsedPaperStyle}
                >
                  <Group gap={6} wrap="nowrap">
                    {isRight ? (
                      <>
                        {renderExpandChevron()}
                        <Box
                          className={`floating-timer-dot${isRunning ? ' floating-timer-dot-running' : ''}`}
                          style={{ backgroundColor: dotBg }}
                        />
                        <Text
                          size="xs"
                          fw={700}
                          c={isRunning ? 'blue' : 'orange'}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatTime(totalElapsedTime)}
                        </Text>
                        <Box className="floating-side-timer-handle" aria-hidden="true">
                          <IconGripVertical size={14} />
                        </Box>
                      </>
                    ) : (
                      <>
                        <Box className="floating-side-timer-handle" aria-hidden="true">
                          <IconGripVertical size={14} />
                        </Box>
                        <Box
                          className={`floating-timer-dot${isRunning ? ' floating-timer-dot-running' : ''}`}
                          style={{ backgroundColor: dotBg }}
                        />
                        <Text
                          size="xs"
                          fw={700}
                          c={isRunning ? 'blue' : 'orange'}
                          style={{ fontVariantNumeric: 'tabular-nums' }}
                        >
                          {formatTime(totalElapsedTime)}
                        </Text>
                        {renderExpandChevron()}
                      </>
                    )}
                  </Group>
                </Paper>
              </Tooltip>
            ) : (
              <Paper
                withBorder
                shadow="lg"
                p="sm"
                radius="md"
                bg="var(--mantine-color-body)"
                className="floating-side-timer-surface"
                w={290}
                style={{
                  maxWidth: 'calc(100vw - 32px)',
                  borderLeft: `3px solid ${accentColor}`,
                }}
              >
                <Stack gap="xs">
                  {/* Top Row: Drag handle, Time & Collapse/Open Tracker actions */}
                  <Group justify="space-between" align="center" wrap="nowrap">
                    <Group gap={6} align="center" wrap="nowrap">
                      <Tooltip label={t('dragTimerTooltip')} position="top">
                        <Box className="floating-side-timer-handle" aria-label={t('dragTimerTooltip')}>
                          <IconGripVertical size={16} />
                        </Box>
                      </Tooltip>
                      <Box
                        className={`floating-timer-dot${isRunning ? ' floating-timer-dot-running' : ''}`}
                        style={{ backgroundColor: dotBg }}
                      />
                      <Text
                        fz="xl"
                        fw={700}
                        c={isRunning ? 'blue' : 'orange'}
                        style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}
                      >
                        {formatTime(totalElapsedTime)}
                      </Text>
                    </Group>

                    <Group gap={4} wrap="nowrap">
                      <Tooltip label={t('openTrackerTooltip')} position="top">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => navigate('/')}
                          aria-label={t('openTrackerTooltip')}
                        >
                          <IconClock size={16} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label={t('hideTimerToSideTooltip')} position="top">
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={toggleCollapsed}
                          aria-label={t('hideTimerToSideTooltip')}
                        >
                          {renderCollapseChevron()}
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  </Group>

                  {/* Active Task Info */}
                  <Stack gap={2}>
                    {activeTodo?.projectName && (
                      <Text size="xs" fw={700} c="dimmed" tt="uppercase" truncate>
                        {activeTodo.projectName}
                      </Text>
                    )}
                    {activeTodo?.taskId ? (
                      <RedmineIssueLink
                        issueId={activeTodo.taskId}
                        subject={activeTodo.taskSubject}
                        size="sm"
                        fw={600}
                      />
                    ) : (
                      <Text size="sm" fw={600} lineClamp={2}>
                        {activeTodo?.taskSubject || t('generalWorkTaskSubject')}
                      </Text>
                    )}
                  </Stack>

                  {/* Playback Controls & Status Badge */}
                  <Group justify="space-between" align="center" gap="xs" mt={4}>
                    <Group gap="xs" wrap="nowrap">
                      {!isRunning ? (
                        <Tooltip label={t('startTrackingTooltip')}>
                          <ActionIcon
                            variant="filled"
                            color="blue"
                            size="lg"
                            radius="xl"
                            onClick={handlePlay}
                            aria-label={t('startTrackingTooltip')}
                          >
                            <IconPlayerPlay size={18} fill="currentColor" />
                          </ActionIcon>
                        </Tooltip>
                      ) : (
                        <Tooltip label={t('pauseTimerTooltip')}>
                          <ActionIcon
                            variant="filled"
                            color="orange"
                            size="lg"
                            radius="xl"
                            onClick={timer.pauseTimer}
                            aria-label={t('pauseTimerTooltip')}
                          >
                            <IconPlayerPause size={18} fill="currentColor" />
                          </ActionIcon>
                        </Tooltip>
                      )}

                      <Tooltip label={t('stopAndLogTooltip')}>
                        <ActionIcon
                          variant="light"
                          color="red"
                          size="lg"
                          radius="xl"
                          onClick={handleStop}
                          disabled={totalElapsedTime === 0 && !isRunning}
                          aria-label={t('stopAndLogTooltip')}
                        >
                          <IconPlayerStop size={18} fill="currentColor" />
                        </ActionIcon>
                      </Tooltip>
                    </Group>

                    <Badge size="xs" variant="light" color={isRunning ? 'blue' : 'orange'}>
                      {isRunning ? t('timerRunning') : t('timerPaused')}
                    </Badge>
                  </Group>
                </Stack>
              </Paper>
            )}
          </Box>
        </>
      )}

      {isSummaryOpen && (
        <SummaryModal isOpen={isSummaryOpen} onClose={() => setIsSummaryOpen(false)} />
      )}

      {/* First Activity Prompt Modal */}
      <Modal
        opened={showFirstActivityModal}
        onClose={handleFirstActivityCancel}
        title={<Text fw={600}>{t('firstPerformedTaskQuestion')}</Text>}
        size="md"
        centered
        radius="md"
      >
        <Stack gap="md">
          <TextInput
            label={t('performedTaskDescLabel')}
            placeholder={t('performedTaskPlaceholder')}
            value={firstActivityText}
            onChange={(e) => setFirstActivityText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleFirstActivitySubmit();
            }}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button
              leftSection={<IconPlayerPlay size={16} fill="currentColor" />}
              onClick={handleFirstActivitySubmit}
              disabled={!firstActivityText.trim()}
            >
              {t('startTrackingBtn')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
};
