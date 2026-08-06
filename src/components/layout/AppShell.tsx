import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { AppShell as MantineAppShell, Group, Title, ActionIcon, useMantineColorScheme, Alert, Button } from '@mantine/core';
import { IconClock, IconCalendarEvent, IconSettings, IconSun, IconMoon, IconSunMoon, IconAlertCircle } from '@tabler/icons-react';

export const AppShell: React.FC = () => {
  const { isConfigured } = useSettings();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const location = useLocation();

  const toggleColorScheme = () => {
    if (colorScheme === 'light') setColorScheme('dark');
    else if (colorScheme === 'dark') setColorScheme('auto');
    else setColorScheme('light');
  };

  const getThemeIcon = () => {
    if (colorScheme === 'light') return <IconSun size={20} stroke={1.5} />;
    if (colorScheme === 'dark') return <IconMoon size={20} stroke={1.5} />;
    return <IconSunMoon size={20} stroke={1.5} />;
  };

  const navLinks = [
    { label: 'Tracker', icon: IconClock, to: '/' },
    { label: 'Logged Time', icon: IconCalendarEvent, to: '/logged-time' },
    { label: 'Settings', icon: IconSettings, to: '/settings' },
  ];

  return (
    <MantineAppShell
      header={{ height: 60 }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Title order={3}>Redmine Time Tracker</Title>
          
          <Group gap="sm">
            {navLinks.map((link) => {
              const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
              return (
                <Button
                  key={link.label}
                  component={NavLink}
                  to={link.to}
                  variant={isActive ? 'light' : 'subtle'}
                  color={isActive ? 'blue' : 'gray'}
                  leftSection={<link.icon size={18} stroke={1.5} />}
                >
                  {link.label}
                </Button>
              );
            })}
            <ActionIcon onClick={toggleColorScheme} variant="subtle" size="lg" aria-label="Toggle color scheme">
              {getThemeIcon()}
            </ActionIcon>
          </Group>
        </Group>
      </MantineAppShell.Header>

      <MantineAppShell.Main>
        {!isConfigured && (
          <Alert icon={<IconAlertCircle size={16} />} title="Configuration Required" color="blue" mb="md">
            Please configure your Redmine URL and API Key in the <NavLink to="/settings" style={{ fontWeight: 'bold' }}>Settings</NavLink> page to get started.
          </Alert>
        )}
        <Outlet />
      </MantineAppShell.Main>
    </MantineAppShell>
  );
};
