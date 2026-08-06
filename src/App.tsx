import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './contexts/SettingsContext';
import { UserProvider } from './contexts/UserContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { QueueProvider } from './contexts/QueueContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AppShell } from './components/layout/AppShell';
import { SettingsForm } from './features/settings/components/SettingsForm';
import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';

import { TrackerDashboard } from './features/tracker/components/TrackerDashboard';
import { LoggedTimeDashboard } from './features/calendar/components/LoggedTimeDashboard';

function App() {
  return (
    <MantineProvider defaultColorScheme="auto">
      <SettingsProvider>
        <UserProvider>
          <ProjectsProvider>
            <QueueProvider>
              <ConfirmProvider>
                <Router>
                  <Routes>
                    <Route path="/" element={<AppShell />}>
                      <Route index element={<TrackerDashboard />} />
                      <Route path="logged-time" element={<LoggedTimeDashboard />} />
                      <Route path="settings" element={<SettingsForm />} />
                    </Route>
                  </Routes>
                </Router>
              </ConfirmProvider>
            </QueueProvider>
          </ProjectsProvider>
        </UserProvider>
      </SettingsProvider>
    </MantineProvider>
  );
}

export default App;
