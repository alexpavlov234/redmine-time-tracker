import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import {
  AppShell as MantineAppShell,
  Group,
  Title,
  ActionIcon,
  useMantineColorScheme,
  Alert,
  Button,
  Burger,
  Stack,
  ThemeIcon,
  Badge,
  Container,
  Tooltip,
  NavLink as MantineNavLink,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconClock,
  IconCalendarEvent,
  IconSettings,
  IconSun,
  IconMoon,
  IconSunMoon,
  IconAlertCircle,
  IconBriefcase,
  IconChecklist,
  IconCheck,
  IconNotes,
} from '@tabler/icons-react';

/// <summary>
/// Navigation item definition for application routes.
/// </summary>
interface NavItem {
  /// <summary>Display label for the link.</summary>
  label: string;
  /// <summary>Tabler icon component for the item.</summary>
  icon: typeof IconClock;
  /// <summary>Target router destination path.</summary>
  to: string;
}

const navLinks: NavItem[] = [
  { label: 'Tracker', icon: IconClock, to: '/' },
  { label: 'Personal Tasks', icon: IconChecklist, to: '/tasks' },
  { label: 'Notes', icon: IconNotes, to: '/notes' },
  { label: 'Logged Time', icon: IconCalendarEvent, to: '/logged-time' },
  { label: 'Projects', icon: IconBriefcase, to: '/projects' },
  { label: 'Settings', icon: IconSettings, to: '/settings' },
];

/// <summary>
/// Main application shell providing responsive header navigation, color scheme toggling,
/// mobile drawer navigation, and routed page view container.
/// </summary>
export const AppShell: React.FC = () => {
  const { isConfigured } = useSettings();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const location = useLocation();
  const [opened, { toggle, close }] = useDisclosure();

  /// <summary>
  /// Toggles between light, dark, and auto system color schemes.
  /// </summary>
  const toggleColorScheme = () => {
    if (colorScheme === 'light') setColorScheme('dark');
    else if (colorScheme === 'dark') setColorScheme('auto');
    else setColorScheme('light');
  };

  /// <summary>
  /// Returns the corresponding icon matching the active theme mode.
  /// </summary>
  const getThemeIcon = () => {
    if (colorScheme === 'light') return <IconSun size={19} stroke={1.5} />;
    if (colorScheme === 'dark') return <IconMoon size={19} stroke={1.5} />;
    return <IconSunMoon size={19} stroke={1.5} />;
  };

  return (
    <MantineAppShell
      header={{ height: 60 }}
      navbar={{
        width: 250,
        breakpoint: 'sm',
        collapsed: { desktop: true, mobile: !opened },
      }}
      padding="md"
    >
      <MantineAppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          {/* Logo & Brand title */}
          <Group gap="sm" wrap="nowrap">
            <Burger
              opened={opened}
              onClick={toggle}
              hiddenFrom="sm"
              size="sm"
              aria-label="Toggle navigation menu"
            />
            <ThemeIcon size="md" radius="md" variant="gradient" gradient={{ from: 'blue', to: 'cyan' }}>
              <IconClock size={20} stroke={2} />
            </ThemeIcon>
            <Title order={3} size="h4" style={{ whiteSpace: 'nowrap' }}>
              Redmine Time Tracker
            </Title>
            {isConfigured ? (
              <Badge
                variant="light"
                color="green"
                size="xs"
                visibleFrom="md"
                leftSection={<IconCheck size={10} />}
              >
                Connected
              </Badge>
            ) : (
              <Badge
                variant="light"
                color="orange"
                size="xs"
                visibleFrom="md"
                leftSection={<IconAlertCircle size={10} />}
              >
                Setup needed
              </Badge>
            )}
          </Group>

          {/* Desktop Navigation Links */}
          <Group gap="xs" visibleFrom="sm" wrap="nowrap">
            {navLinks.map((link) => {
              const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
              return (
                <Button
                  key={link.label}
                  component={NavLink}
                  to={link.to}
                  variant={isActive ? 'light' : 'subtle'}
                  color={isActive ? 'blue' : 'gray'}
                  size="sm"
                  leftSection={<link.icon size={17} stroke={1.5} />}
                >
                  {link.label}
                </Button>
              );
            })}
            <Tooltip label={`Color scheme: ${colorScheme}`}>
              <ActionIcon
                onClick={toggleColorScheme}
                variant="subtle"
                size="lg"
                aria-label="Toggle color scheme"
              >
                {getThemeIcon()}
              </ActionIcon>
            </Tooltip>
          </Group>

          {/* Mobile Theme Toggle */}
          <Group gap="xs" hiddenFrom="sm">
            <ActionIcon
              onClick={toggleColorScheme}
              variant="subtle"
              size="lg"
              aria-label="Toggle color scheme"
            >
              {getThemeIcon()}
            </ActionIcon>
          </Group>
        </Group>
      </MantineAppShell.Header>

      {/* Mobile Drawer Navigation */}
      <MantineAppShell.Navbar p="md">
        <Stack gap="xs">
          {navLinks.map((link) => {
            const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
            return (
              <MantineNavLink
                key={link.label}
                component={NavLink}
                to={link.to}
                label={link.label}
                leftSection={<link.icon size={20} stroke={1.5} />}
                active={isActive}
                onClick={close}
              />
            );
          })}
        </Stack>
      </MantineAppShell.Navbar>

      {/* Main Content Area */}
      <MantineAppShell.Main>
        <Container size="xl" px={0}>
          {!isConfigured && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title="Configuration Required"
              color="blue"
              mb="md"
              radius="md"
            >
              Please configure your Redmine URL and API Key in the{' '}
              <NavLink to="/settings" style={{ fontWeight: 600, color: 'inherit' }}>
                Settings
              </NavLink>{' '}
              page to get started.
            </Alert>
          )}
          <Outlet />
        </Container>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
};
