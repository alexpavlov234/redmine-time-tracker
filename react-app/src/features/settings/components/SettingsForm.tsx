import React, { useState } from 'react';
import { Card, Input, Button } from '../../../components/ui';
import { useSettings } from '../../../contexts/SettingsContext';
import { useToast } from '../../../contexts/ToastContext';
import styles from './SettingsForm.module.scss';
import { Settings, Save, Link2 } from 'lucide-react';
import { getCurrentUser, detectBillableField } from '../../../services/redmine';

export const SettingsForm: React.FC = () => {
  const { apiKey, redmineUrl, setApiKey, setRedmineUrl } = useSettings();
  const { showSuccess, showError, showInfo } = useToast();

  const [localApiKey, setLocalApiKey] = useState(apiKey);
  const [localUrl, setLocalUrl] = useState(redmineUrl);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSave = () => {
    setApiKey(localApiKey.trim());
    setRedmineUrl(localUrl.trim().replace(/\/$/, ''));
    setTestResult({ success: true, message: 'Settings saved. Projects will refresh automatically.' });
    showSuccess('Settings saved!');
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Save first so the API service uses the new credentials
    setApiKey(localApiKey.trim());
    setRedmineUrl(localUrl.trim().replace(/\/$/, ''));

    try {
      const user = await getCurrentUser();
      setTestResult({
        success: true,
        message: `Connection successful! Logged in as: ${user.firstname} ${user.lastname}`,
      });
      showSuccess(`Connected as ${user.firstname} ${user.lastname}`);

      // Auto-detect billable field
      const bf = await detectBillableField();
      if (bf) {
        showInfo(`Auto-detected billable field: "${bf.name}" (ID: ${bf.id})`);
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Failed to connect.',
      });
      showError(err.message || 'Connection failed.');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card
      title={<div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Settings size={20} style={{ color: 'var(--color-primary)' }} /> Redmine Configuration</div>}
      className={styles.settingsCard}
    >
      <div className={styles.formContainer}>
        <Input
          label="Redmine URL"
          placeholder="https://your-redmine-instance.com"
          value={localUrl}
          onChange={(e) => setLocalUrl(e.target.value)}
          fullWidth
        />
        <Input
          label="API Access Key"
          type="password"
          placeholder="Your personal Redmine API Key"
          value={localApiKey}
          onChange={(e) => setLocalApiKey(e.target.value)}
          fullWidth
        />

        {testResult && (
          <div className={`${styles.alert} ${testResult.success ? styles.alertSuccess : styles.alertError}`}>
            {testResult.message}
          </div>
        )}

        <div className={styles.actions}>
          <Button icon={Save} onClick={handleSave} variant="primary">
            Save Settings
          </Button>
          <Button icon={Link2} onClick={handleTest} variant="secondary" isLoading={isTesting}>
            Test Connection
          </Button>
        </div>
      </div>
    </Card>
  );
};
