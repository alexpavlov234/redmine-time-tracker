import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import type { AppLanguage, TranslationKey } from '../../i18n/translations';
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
  Container,
  Tooltip,
  SegmentedControl,
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
  IconNotes,
  IconLanguage,
} from '@tabler/icons-react';

/// <summary>
/// Navigation item definition for application routes.
/// </summary>
interface NavItem {
  /// <summary>Translation key for the display label.</summary>
  labelKey: TranslationKey;
  /// <summary>Tabler icon component for the item.</summary>
  icon: typeof IconClock;
  /// <summary>Target router destination path.</summary>
  to: string;
}

const navLinks: NavItem[] = [
  { labelKey: 'navTracker', icon: IconClock, to: '/' },
  { labelKey: 'navPersonalTasks', icon: IconChecklist, to: '/tasks' },
  { labelKey: 'navNotes', icon: IconNotes, to: '/notes' },
  { labelKey: 'navLoggedTime', icon: IconCalendarEvent, to: '/logged-time' },
  { labelKey: 'navProjects', icon: IconBriefcase, to: '/projects' },
  { labelKey: 'navSettings', icon: IconSettings, to: '/settings' },
];

/// <summary>
/// Main application shell providing responsive header navigation, color scheme toggling,
/// bilingual switcher (BG / EN), mobile drawer navigation, and a unified page container.
/// </summary>
export const AppShell: React.FC = () => {
  const { isConfigured } = useSettings();
  const { language, setLanguage, toggleLanguage, t } = useLanguage();
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
        <Container size="xl" h="100%" px={0}>
          <Group h="100%" justify="space-between" wrap="nowrap">
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
                {t('appTitle')}
              </Title>
            </Group>

            {/* Desktop Navigation Links */}
            <Group gap="xs" visibleFrom="sm" wrap="nowrap">
              {navLinks.map((link) => {
                const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
                return (
                  <Button
                    key={link.to}
                    component={NavLink}
                    to={link.to}
                    variant={isActive ? 'light' : 'subtle'}
                    color={isActive ? 'blue' : 'gray'}
                    size="sm"
                    leftSection={<link.icon size={17} stroke={1.5} />}
                  >
                    {t(link.labelKey)}
                  </Button>
                );
              })}

              <Tooltip label={t('toggleLanguage')}>
                <SegmentedControl
                  size="xs"
                  value={language}
                  onChange={(val) => setLanguage(val as AppLanguage)}
                  data={[
                    { label: 'БГ', value: 'bg' },
                    { label: 'EN', value: 'en' },
                  ]}
                  ml={4}
                />
              </Tooltip>

              <Tooltip label={t('toggleColorScheme')}>
                <ActionIcon
                  onClick={toggleColorScheme}
                  variant="subtle"
                  size="lg"
                  aria-label={t('toggleColorScheme')}
                >
                  {getThemeIcon()}
                </ActionIcon>
              </Tooltip>
            </Group>

            {/* Mobile Language & Theme Toggle */}
            <Group gap="xs" hiddenFrom="sm" wrap="nowrap">
              <Button
                variant="subtle"
                size="compact-xs"
                leftSection={<IconLanguage size={15} />}
                onClick={toggleLanguage}
              >
                {language.toUpperCase()}
              </Button>
              <ActionIcon
                onClick={toggleColorScheme}
                variant="subtle"
                size="lg"
                aria-label={t('toggleColorScheme')}
              >
                {getThemeIcon()}
              </ActionIcon>
            </Group>
          </Group>
        </Container>
      </MantineAppShell.Header>

      {/* Mobile Drawer Navigation */}
      <MantineAppShell.Navbar p="md">
        <Stack gap="xs">
          {navLinks.map((link) => {
            const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
            return (
              <MantineNavLink
                key={link.to}
                component={NavLink}
                to={link.to}
                label={t(link.labelKey)}
                leftSection={<link.icon size={20} stroke={1.5} />}
                active={isActive}
                onClick={close}
              />
            );
          })}

          <SegmentedControl
            mt="sm"
            fullWidth
            value={language}
            onChange={(val) => setLanguage(val as AppLanguage)}
            data={[
              { label: 'Български (БГ)', value: 'bg' },
              { label: 'English (EN)', value: 'en' },
            ]}
          />
        </Stack>
      </MantineAppShell.Navbar>

      {/* Main Content Area — unified Container size="xl" across all pages */}
      <MantineAppShell.Main>
        <Container size="xl" px={0}>
          {!isConfigured && (
            <Alert
              icon={<IconAlertCircle size={16} />}
              title={t('configRequiredAlertTitle')}
              color="blue"
              mb="md"
              radius="md"
            >
              {t('configRequiredAlertPrefix')}
              <NavLink to="/settings" style={{ fontWeight: 600, color: 'inherit' }}>
                {t('navSettings')}
              </NavLink>
              {t('configRequiredAlertSuffix')}
            </Alert>
          )}
          <Outlet />
        </Container>
      </MantineAppShell.Main>
    </MantineAppShell>
  );
};
