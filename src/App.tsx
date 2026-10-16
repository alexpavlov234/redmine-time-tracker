import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { SettingsProvider } from './contexts/SettingsContext';
import { UserProvider } from './contexts/UserContext';
import { ProjectsProvider } from './contexts/ProjectsContext';
import { QueueProvider } from './contexts/QueueContext';
import { ConfirmProvider } from './contexts/ConfirmContext';
import { AppShell } from './components/layout/AppShell';
import { SettingsForm } from './features/settings/components/SettingsForm';
import '@mantine/core/styles.css';
import '@mantine/tiptap/styles.css';
import '@mantine/dates/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';

import { TrackerDashboard } from './features/tracker/components/TrackerDashboard';
import { LoggedTimeDashboard } from './features/calendar/components/LoggedTimeDashboard';
import { ProjectManagerDashboard } from './features/pm/components/ProjectManagerDashboard';
import { PersonalTasksDashboard } from './features/personal/components/PersonalTasksDashboard';
import { NotesDashboard } from './features/notes/components/NotesDashboard';

/// <summary>
/// Global Mantine UI theme configuration.
/// </summary>
const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  autoContrast: true,
  cursorType: 'pointer',
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

/// <summary>
/// Root application component with state providers, theme, and client routing.
/// </summary>
function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <SettingsProvider>
        <UserProvider>
          <ProjectsProvider>
            <QueueProvider>
              <ConfirmProvider>
                <Router>
                  <Routes>
                    <Route path="/" element={<AppShell />}>
                      <Route index element={<TrackerDashboard />} />
                      <Route path="tasks" element={<PersonalTasksDashboard />} />
                      <Route path="notes" element={<NotesDashboard />} />
                      <Route path="logged-time" element={<LoggedTimeDashboard />} />
                      <Route path="projects" element={<ProjectManagerDashboard />} />
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
