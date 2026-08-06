import React, { useState } from 'react';
import { Card, TextInput, PasswordInput, Button, Group, Stack, Alert, Title, Switch, Text } from '@mantine/core';
import { useSettings } from '../../../contexts/SettingsContext';
import { IconSettings, IconDeviceFloppy, IconLink } from '@tabler/icons-react';
import { getCurrentUser, detectBillableField } from '../../../services/redmine';

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

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localUrl, setLocalUrl] = useState(redmineUrl);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = () => {
    setApiKey(localApiKey.trim());
    setRedmineUrl(localUrl.trim().replace(/\/$/, ''));
    setTestResult({ success: true, message: 'Settings saved. Projects will refresh automatically.' });
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
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Card.Section withBorder inheritPadding py="xs">
        <Group gap="xs">
          <IconSettings size={20} />
          <Title order={4}>Redmine Configuration</Title>
        </Group>
      </Card.Section>

      <Stack mt="md">
        <TextInput
          label="Redmine URL"
          placeholder="https://your-redmine-instance.com"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          w="100%"
        />
        <PasswordInput
          label="API Access Key"
          placeholder="Your personal Redmine API Key"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          w="100%"
        />

        <Group justify="space-between" align="center" mt="sm">
          <Stack gap={2}>
            <Text size="sm" fw={600}>Use Performed Tasks List</Text>
            <Text size="xs" c="dimmed">
              Enabled: Prompts for sub-tasks on timer start & populates comments. Disabled: Direct time logging.
            </Text>
          </Stack>
          <Switch
            checked={usePerformedTasksList}
            onChange={(e) => setUsePerformedTasksList(e.currentTarget.checked)}
            size="md"
          />
        </Group>

        <Group justify="space-between" align="center" mt="xs">
          <Stack gap={2}>
            <Text size="sm" fw={600}>Prompt to update Status to "In Progress"</Text>
            <Text size="xs" c="dimmed">
              Ask to update task status in Redmine when starting a timer session.
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

        <Group mt="md">
          <Button leftSection={<IconDeviceFloppy size={16} />} onClick={handleSave}>
            Save Settings
          </Button>
          <Button leftSection={<IconLink size={16} />} onClick={handleTest} variant="light" loading={isTesting}>
            Test Connection
          </Button>
        </Group>
      </Stack>
    </Card>
  );
};
