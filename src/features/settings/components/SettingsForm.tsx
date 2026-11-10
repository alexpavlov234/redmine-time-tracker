import React, { useState } from 'react';
import { Card, TextInput, PasswordInput, Button, Group, Stack, Alert, Title, Switch, Text, SegmentedControl } from '@mantine/core';
import { useSettings } from '../../../contexts/SettingsContext';
import { useLanguage } from '../../../contexts/LanguageContext';
import type { AppLanguage } from '../../../i18n/translations';
import { IconDeviceFloppy, IconLink, IconLanguage } from '@tabler/icons-react';
import { getCurrentUser, detectBillableField } from '../../../services/redmine';

/// <summary>
/// Redmine configuration and application preferences form with bilingual language selector.
/// </summary>
export const SettingsForm: React.FC = () => {
  const { 
    apiKey, 
    redmineUrl, 
    usePerformedTasksList, 
    promptStatusOnStart,
    setApiKey, 
    setRedmineUrl, 
    setUsePerformedTasksList,
    setPromptStatusOnStart
  } = useSettings();
  const { language, setLanguage, t } = useLanguage();

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localUrl, setLocalUrl] = useState(redmineUrl);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = () => {
    setApiKey(localApiKey.trim());
    setRedmineUrl(localUrl.trim().replace(/\/$/, ''));
    setTestResult({ success: true, message: t('settingsSavedMsg') });
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Save first so the API service uses the new credentials
    setApiKey(localApiKey.trim());
    setRedmineUrl(localUrl.trim().replace(/\/$/, ''));

    try {
      const user = await getCurrentUser();
      const bf = await detectBillableField();
      setTestResult({
        success: true,
        message: `Connection successful! Logged in as: ${user.firstname} ${user.lastname}${bf ? ` (Billable field: "${bf.name}")` : ''}`,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to connect.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Stack gap="lg">
      {/* Consistent Top Page Header */}
      <Group justify="space-between" align="center" wrap="wrap">
        <Title order={2}>{t('navSettings')}</Title>
      </Group>

      <Card shadow="sm" padding="lg" radius="md" withBorder>
        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Group gap="xs">
              <IconLanguage size={18} />
              <Text size="sm" fw={600}>{t('languageLabel')}</Text>
            </Group>
            <SegmentedControl
              value={language}
              onChange={(val) => setLanguage(val as AppLanguage)}
              data={[
                { label: 'Български (БГ)', value: 'bg' },
                { label: 'English (EN)', value: 'en' },
              ]}
            />
          </Group>

          <TextInput
            label={t('redmineUrlLabel')}
            placeholder="https://your-redmine-instance.com"
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            w="100%"
          />
          <PasswordInput
            label={t('apiKeyLabel')}
            placeholder={t('apiKeyPlaceholder')}
            value={localApiKey}
            onChange={(e) => setLocalApiKey(e.target.value)}
            w="100%"
          />

          <Group justify="space-between" align="center" mt="xs">
            <Stack gap={2}>
              <Text size="sm" fw={600}>{t('usePerformedListLabel')}</Text>
              <Text size="xs" c="dimmed">
                {t('usePerformedListDesc')}
              </Text>
            </Stack>
            <Switch
              checked={usePerformedTasksList}
              onChange={(e) => setUsePerformedTasksList(e.currentTarget.checked)}
              size="md"
            />
          </Group>

          <Group justify="space-between" align="center">
            <Stack gap={2}>
              <Text size="sm" fw={600}>{t('promptStatusLabel')}</Text>
              <Text size="xs" c="dimmed">
                {t('promptStatusDesc')}
              </Text>
            </Stack>
            <Switch
              checked={promptStatusOnStart}
              onChange={(e) => setPromptStatusOnStart(e.currentTarget.checked)}
              size="md"
            />
          </Group>

          {testResult && (
            <Alert color={testResult.success ? 'green' : 'red'}>
              {testResult.message}
            </Alert>
          )}

          <Group mt="sm">
            <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSave}>
              {t('saveSettingsBtn')}
            </Button>
            <Button leftSection={<IconLink size={16} />} onClick={handleTest} variant="light" loading={isTesting}>
              {t('testConnectionBtn')}
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
};
