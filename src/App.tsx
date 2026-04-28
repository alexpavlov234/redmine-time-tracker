import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './contexts/SettingsContext';
import { UserProvider } from './contexts/UserContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { QueueProvider } from './contexts/QueueContext';
import { ToastProvider } from './contexts/ToastContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AppShell } from './components/layout/AppShell';
import { SettingsForm } from './features/settings/components/SettingsForm';
import './styles/main.scss';

import { TrackerDashboard } from './features/tracker/components/TrackerDashboard';
import { LoggedTimeDashboard } from './features/calendar/components/LoggedTimeDashboard';

function App() {
  return (
    <SettingsProvider>
      <UserProvider>
        <ProjectsProvider>
          <QueueProvider>
            <ToastProvider>
              <ConfirmProvider>
                <BrowserRouter basename="/redmine-time-tracker">
                  <Routes>
                    <Route path="/" element={<AppShell />}>
                      <Route index element={<TrackerDashboard />} />
                      <Route path="logged-time" element={<LoggedTimeDashboard />} />
                      <Route path="settings" element={<SettingsForm />} />
                    </Route>
                  </Routes>
                </BrowserRouter>
              </ConfirmProvider>
            </ToastProvider>
          </QueueProvider>
        </ProjectsProvider>
      </UserProvider>
    </SettingsProvider>
  );
}

export default App;
