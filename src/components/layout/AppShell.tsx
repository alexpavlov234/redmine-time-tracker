import React from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../../contexts/SettingsContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStagedEntries } from '../../contexts/StagedEntriesContext';
import { FloatingSideTimer } from '../../features/timer/components/FloatingSideTimer';
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
  Badge,
  Menu,
  NavLink as MantineNavLink,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconClock,
  IconCalendarEvent,
  IconCalendarCheck,
  IconSettings,
  IconSun,
  IconMoon,
  IconSunMoon,
  IconAlertCircle,
  IconBriefcase,
  IconChecklist,
  IconNotes,
  IconLanguage,
  IconArrowsExchange,
  IconCheck,
  IconChevronDown,
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

const timeGroupLinks: NavItem[] = [
  { labelKey: 'navLoggedTime', icon: IconCalendarEvent, to: '/logged-time' },
  { labelKey: 'navValidation', icon: IconCalendarCheck, to: '/validation' },
  { labelKey: 'navTimeTransfer', icon: IconArrowsExchange, to: '/transfer' },
];

const workspaceGroupLinks: NavItem[] = [
  { labelKey: 'navPersonalTasks', icon: IconChecklist, to: '/tasks' },
  { labelKey: 'navNotes', icon: IconNotes, to: '/notes' },
  { labelKey: 'navProjects', icon: IconBriefcase, to: '/projects' },
];

const allMobileLinks: NavItem[] = [
  { labelKey: 'navTracker', icon: IconClock, to: '/' },
  ...timeGroupLinks,
  ...workspaceGroupLinks,
];

/// <summary>
/// Main application shell providing responsive header navigation, color scheme toggling,
/// bilingual switcher (BG / EN), mobile drawer navigation, and a unified page container.
/// </summary>
export const AppShell: React.FC = () => {
  const { isConfigured } = useSettings();
  const { language, setLanguage, toggleLanguage, t } = useLanguage();
  const { stagedEntries } = useStagedEntries();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const location = useLocation();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure();
  const isTrackerActive = location.pathname === '/';
  const isTimeGroupActive = timeGroupLinks.some((l) => location.pathname.startsWith(l.to));
  const isWorkspaceGroupActive = workspaceGroupLinks.some((l) => location.pathname.startsWith(l.to));
  const isSettingsActive = location.pathname.startsWith('/settings');

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

            {/* Desktop Navigation: Tracker standalone + grouped dropdowns */}
            <Group gap="xs" visibleFrom="sm" wrap="nowrap">
              <Button
                component={NavLink}
                to="/"
                variant={isTrackerActive ? 'light' : 'subtle'}
                color={isTrackerActive ? 'blue' : 'gray'}
                size="sm"
                leftSection={<IconClock size={17} stroke={1.5} />}
              >
                {t('navTracker')}
              </Button>

              {/* Time Dropdown: Logged Time, Validation, Time Transfer */}
              <Menu shadow="md" width={230} position="bottom-start" withArrow>
                <Menu.Target>
                  <Button
                    variant={isTimeGroupActive ? 'light' : 'subtle'}
                    color={isTimeGroupActive ? 'blue' : 'gray'}
                    size="sm"
                    leftSection={<IconCalendarEvent size={17} stroke={1.5} />}
                    rightSection={
                      <Group gap={6} wrap="nowrap">
                        {stagedEntries.length > 0 && (
                          <Badge size="xs" circle color="orange" variant="filled">
                            {stagedEntries.length}
                          </Badge>
                        )}
                        <IconChevronDown size={14} />
                      </Group>
                    }
                  >
                    {t('navGroupTime')}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {timeGroupLinks.map((link) => {
                    const isActive = location.pathname.startsWith(link.to);
                    const showStagedBadge = link.to === '/logged-time' && stagedEntries.length > 0;
                    return (
                      <Menu.Item
                        key={link.to}
                        leftSection={<link.icon size={16} stroke={1.5} />}
                        rightSection={
                          showStagedBadge ? (
                            <Badge size="xs" circle color="orange" variant="filled">
                              {stagedEntries.length}
                            </Badge>
                          ) : undefined
                        }
                        color={isActive ? 'blue' : undefined}
                        fw={isActive ? 600 : 400}
                        onClick={() => navigate(link.to)}
                      >
                        {t(link.labelKey)}
                      </Menu.Item>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>

              {/* Workspace Dropdown: Personal Tasks, Notes, Projects */}
              <Menu shadow="md" width={210} position="bottom-start" withArrow>
                <Menu.Target>
                  <Button
                    variant={isWorkspaceGroupActive ? 'light' : 'subtle'}
                    color={isWorkspaceGroupActive ? 'blue' : 'gray'}
                    size="sm"
                    leftSection={<IconChecklist size={17} stroke={1.5} />}
                    rightSection={<IconChevronDown size={14} />}
                  >
                    {t('navGroupWorkspace')}
                  </Button>
                </Menu.Target>
                <Menu.Dropdown>
                  {workspaceGroupLinks.map((link) => {
                    const isActive = location.pathname.startsWith(link.to);
                    return (
                      <Menu.Item
                        key={link.to}
                        leftSection={<link.icon size={16} stroke={1.5} />}
                        color={isActive ? 'blue' : undefined}
                        fw={isActive ? 600 : 400}
                        onClick={() => navigate(link.to)}
                      >
                        {t(link.labelKey)}
                      </Menu.Item>
                    );
                  })}
                </Menu.Dropdown>
              </Menu>

              {/* Settings, Language & Theme Dropdown */}
              <Menu shadow="md" width={210} position="bottom-end" withArrow>
                <Menu.Target>
                  <Tooltip label={t('navSettings')}>
                    <ActionIcon
                      variant={isSettingsActive ? 'light' : 'subtle'}
                      color={isSettingsActive ? 'blue' : 'gray'}
                      size="lg"
                      aria-label={t('navSettings')}
                    >
                      <IconSettings size={20} stroke={1.5} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>

                <Menu.Dropdown>
                  <Menu.Item
                    leftSection={<IconSettings size={16} />}
                    onClick={() => navigate('/settings')}
                    color={isSettingsActive ? 'blue' : undefined}
                  >
                    {t('navSettings')}
                  </Menu.Item>

                  <Menu.Divider />

                  <Menu.Label>{t('languageLabel')}</Menu.Label>
                  <Menu.Item
                    leftSection={<IconLanguage size={16} />}
                    rightSection={language === 'bg' ? <IconCheck size={14} /> : null}
                    onClick={() => setLanguage('bg')}
                  >
                    Български (БГ)
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconLanguage size={16} />}
                    rightSection={language === 'en' ? <IconCheck size={14} /> : null}
                    onClick={() => setLanguage('en')}
                  >
                    English (EN)
                  </Menu.Item>

                  <Menu.Divider />

                  <Menu.Label>{t('toggleColorScheme')}</Menu.Label>
                  <Menu.Item
                    leftSection={<IconSun size={16} />}
                    rightSection={colorScheme === 'light' ? <IconCheck size={14} /> : null}
                    onClick={() => setColorScheme('light')}
                  >
                    {t('themeLight')}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconMoon size={16} />}
                    rightSection={colorScheme === 'dark' ? <IconCheck size={14} /> : null}
                    onClick={() => setColorScheme('dark')}
                  >
                    {t('themeDark')}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<IconSunMoon size={16} />}
                    rightSection={colorScheme === 'auto' ? <IconCheck size={14} /> : null}
                    onClick={() => setColorScheme('auto')}
                  >
                    {t('themeAuto')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
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
          {allMobileLinks.map((link) => {
            const isActive = link.to === '/' ? location.pathname === '/' : location.pathname.startsWith(link.to);
            const showStagedBadge = link.to === '/logged-time' && stagedEntries.length > 0;
            return (
              <MantineNavLink
                key={link.to}
                component={NavLink}
                to={link.to}
                label={t(link.labelKey)}
                leftSection={<link.icon size={20} stroke={1.5} />}
                rightSection={
                  showStagedBadge ? (
                    <Badge size="xs" circle color="orange" variant="filled">
                      {stagedEntries.length}
                    </Badge>
                  ) : undefined
                }
                active={isActive}
                onClick={close}
              />
            );
          })}

          <MantineNavLink
            component={NavLink}
            to="/settings"
            label={t('navSettings')}
            leftSection={<IconSettings size={20} stroke={1.5} />}
            active={isSettingsActive}
            onClick={close}
          />

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

      <FloatingSideTimer />
    </MantineAppShell>
  );
};
