import React, { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Header.module.scss';
import { Clock, CalendarDays, Settings, Moon, Sun, SunMoon } from 'lucide-react';

type Theme = 'light' | 'dark' | 'auto';

export const Header: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) || 'auto';
  });

  const applyTheme = (t: Theme) => {
    if (t === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      document.documentElement.setAttribute('data-theme', t);
    }
    localStorage.setItem('theme', t);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Listen for OS preference changes when in auto mode
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'auto') applyTheme('auto');
    };
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, [theme]);

  const cycleTheme = () => {
    setTheme(prev => {
      switch (prev) {
        case 'light': return 'dark';
        case 'dark': return 'auto';
        case 'auto': default: return 'light';
      }
    });
  };

  const themeIcon = () => {
    switch (theme) {
      case 'light': return <Sun size={20} />;
      case 'dark': return <Moon size={20} />;
      case 'auto': return <SunMoon size={20} />;
    }
  };

  const themeTitle = () => {
    switch (theme) {
      case 'light': return 'Switch to dark theme';
      case 'dark': return 'Switch to auto theme';
      case 'auto': return 'Switch to light theme';
    }
  };

  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Redmine Time Tracker</h1>

      <nav className={styles.navContainer}>
        <div className={styles.navLinks}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            <Clock size={18} /> Tracker
          </NavLink>
          <NavLink
            to="/logged-time"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            <CalendarDays size={18} /> Logged Time
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
          >
            <Settings size={18} /> Settings
          </NavLink>
        </div>

        <button onClick={cycleTheme} className={styles.themeToggle} aria-label={themeTitle()} title={themeTitle()}>
          {themeIcon()}
        </button>
      </nav>
    </header>
  );
};
