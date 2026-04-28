import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { useSettings } from '../../contexts/SettingsContext';
import { AlertCircle } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export const AppShell: React.FC = () => {
  const { isConfigured } = useSettings();

  return (
    <div className="app-container">
      <Header />

      {!isConfigured && (
        <div style={{
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderLeft: '4px solid #3b82f6',
          padding: '1rem',
          borderRadius: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          <AlertCircle className="text-primary" />
          <p style={{ margin: 0 }}>
            Please configure your Redmine URL and API Key in the{' '}
            <NavLink to="/settings" style={{ fontWeight: 'bold', textDecoration: 'underline' }}>
              Settings
            </NavLink>{' '}
            page to get started.
          </p>
        </div>
      )}

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
};
