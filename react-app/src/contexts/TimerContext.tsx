import React, { createContext, useContext, useState } from 'react';
import type { Activity } from '../types';

interface TimerContextProps {
  startTime: number | null;
  pausedTime: number;
  totalElapsedTime: number;
  activities: Activity[];
  startTimer: () => void;
  pauseTimer: () => void;
  stopTimer: () => void;
  addActivity: (activity: Activity) => void;
  setActivities: (activities: Activity[]) => void;
  isRunning: boolean;
}

const TimerContext = createContext<TimerContextProps | undefined>(undefined);

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [startTime, setStartTime] = useState<number | null>(null);
  const [pausedTime, setPausedTime] = useState<number>(0);
  const [totalElapsedTime, setTotalElapsedTime] = useState<number>(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [timerInterval, setTimerInterval] = useState<number | null>(null);

  const isRunning = timerInterval !== null;

  const updateTime = () => {
    if (startTime) {
      const now = Date.now();
      const newTotalElapsedTime = (now - startTime + pausedTime) / 1000;
      setTotalElapsedTime(newTotalElapsedTime);
    }
  };

  const startTimer = () => {
    if (timerInterval) return; // Already running

    if (startTime === null && pausedTime === 0) {
      // First start
      setStartTime(Date.now());
      setPausedTime(0);
      setActivities([]);
    } else {
      // Resuming
      setStartTime(Date.now());
    }

    const intervalId = window.setInterval(updateTime, 1000);
    setTimerInterval(intervalId);
  };

  const pauseTimer = () => {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    setTimerInterval(null);

    if (startTime) {
      const elapsed = Date.now() - startTime;
      setPausedTime((prev) => prev + elapsed);
      setStartTime(null);
    }
  };

  const stopTimer = () => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    
    // We keep totalElapsedTime as is, so it can be picked up by the summary form
    setStartTime(null);
  };

  const addActivity = (activity: Activity) => {
    setActivities((prev) => [...prev, activity]);
  };

  return (
    <TimerContext.Provider
      value={{
        startTime,
        pausedTime,
        totalElapsedTime,
        activities,
        startTimer,
        pauseTimer,
        stopTimer,
        addActivity,
        setActivities,
        isRunning,
      }}
    >
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (!context) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
};
