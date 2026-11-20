import React, { useState } from 'react';
import {
  Card,
  Group,
  Stack,
  Text,
  Title,
  Badge,
  Progress,
  SimpleGrid,
  SegmentedControl,
  ThemeIcon,
  Tooltip,
  NumberInput,
  Select,
  Collapse,
  Button,
  Divider,
  Alert,
  Paper,
} from '@mantine/core';
import {
  IconTrendingUp,
  IconAlertTriangle,
  IconCheck,
  IconCalendar,
  IconCurrencyEuro,
  IconCoin,
  IconClock,
  IconAdjustments,
} from '@tabler/icons-react';
import type { ProjectBudgetMetadata, ProjectBudgetStats } from '../../../types/pm';
import type { BudgetThresholdType } from '../hooks/useProjectManagerData';
import { useLanguage } from '../../../contexts/LanguageContext';
import { formatDisplayDate } from '../../../utils/formatters';

/// <summary>
/// Properties for ProjectBudgetCard.
/// </summary>
interface ProjectBudgetCardProps {
  /// <summary>Project title.</summary>
  projectName: string;
  /// <summary>Metadata extracted from Redmine project custom fields.</summary>
  metadata: ProjectBudgetMetadata;
  /// <summary>Computed statistics for budget progress and burn rate.</summary>
  stats: ProjectBudgetStats;
  /// <summary>Currently active budget threshold ('contract', 'estimate', 'profitability').</summary>
  activeBudgetType: BudgetThresholdType;
  /// <summary>Callback to change active budget threshold.</summary>
  onBudgetTypeChange: (type: BudgetThresholdType) => void;
  /// <summary>Configured hourly billing rate.</summary>
  hourlyRate: number;
  /// <summary>Callback to update hourly rate.</summary>
  onHourlyRateChange: (rate: number) => void;
  /// <summary>Currency code (e.g. 'EUR', 'BGN').</summary>
  currency: string;
  /// <summary>Callback to update currency.</summary>
  onCurrencyChange: (currency: string) => void;
}

/// <summary>
/// Visual card component displaying project budget health, movement, and burn rate.
/// </summary>
export const ProjectBudgetCard: React.FC<ProjectBudgetCardProps> = ({
  projectName,
  metadata,
  stats,
  activeBudgetType,
  onBudgetTypeChange,
  hourlyRate,
  onHourlyRateChange,
  currency,
  onCurrencyChange,
}) => {
  const { language, t } = useLanguage();
  const [showFinancialSettings, setShowFinancialSettings] = useState<boolean>(false);

  // Status color mapping
  const getStatusColor = () => {
    if (stats.healthStatus === 'over_budget') return 'red';
    if (stats.healthStatus === 'warning') return 'orange';
    return 'teal';
  };

  const getStatusBadge = () => {
    if (stats.healthStatus === 'over_budget') {
      return (
        <Badge color="red" size="lg" variant="light" leftSection={<IconAlertTriangle size={14} />}>
          {t('pmStatusOverBudget')} ({stats.percentageUsed}%)
        </Badge>
      );
    }
    if (stats.healthStatus === 'warning') {
      return (
        <Badge color="orange" size="lg" variant="light" leftSection={<IconAlertTriangle size={14} />}>
          {t('pmStatusWarning')} ({stats.percentageUsed}%)
        </Badge>
      );
    }
    return (
      <Badge color="teal" size="lg" variant="light" leftSection={<IconCheck size={14} />}>
        {t('pmStatusOnTrack')} ({stats.percentageUsed}%)
      </Badge>
    );
  };

  const spentCost = hourlyRate > 0 ? Math.round(stats.totalSpentHours * hourlyRate) : 0;
  const targetCost = hourlyRate > 0 ? Math.round(stats.targetHours * hourlyRate) : 0;
  const remainingCost = hourlyRate > 0 ? Math.round(stats.remainingHours * hourlyRate) : 0;

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Stack gap="md">
        {/* Top Header: Title, Client, Dates, and Health Status */}
        <Group justify="space-between" align="flex-start">
          <div>
            <Group gap="xs" mb={4}>
              <Title order={3}>{projectName}</Title>
              {metadata.clientName && (
                <Badge color="blue" size="md" variant="outline">
                  {t('pmClientLabel')}: {metadata.clientName}
                </Badge>
              )}
              {metadata.contractType && (
                <Badge color="gray" size="sm" variant="subtle">
                  {metadata.contractType}
                </Badge>
              )}
              {metadata.isUmbrella && (
                <Badge color="grape" size="sm" variant="light">
                  {t('pmUmbrellaProjectBadge')}
                </Badge>
              )}
            </Group>

            <Group gap="md">
              {metadata.startDate && (
                <Group gap={4}>
                  <IconCalendar size={14} color="gray" />
                  <Text size="xs" c="dimmed">
                    {t('pmStartLabel')}: <Text span fw={600}>{formatDisplayDate(metadata.startDate, language)}</Text>
                  </Text>
                </Group>
              )}
              {metadata.contractEndDate && (
                <Group gap={4}>
                  <IconCalendar size={14} color="gray" />
                  <Text size="xs" c="dimmed">
                    {t('pmContractEndLabel')}: <Text span fw={600}>{formatDisplayDate(metadata.contractEndDate, language)}</Text>
                  </Text>
                </Group>
              )}
            </Group>
          </div>

          <Group gap="xs">
            {getStatusBadge()}
            <Tooltip label={t('pmFinancialsTooltip')}>
              <Button
                variant={showFinancialSettings ? 'light' : 'subtle'}
                color="gray"
                size="xs"
                leftSection={<IconAdjustments size={14} />}
                onClick={() => setShowFinancialSettings(prev => !prev)}
              >
                {t('pmFinancialsBtn')}
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {/* Financial Settings Collapse */}
        <Collapse expanded={showFinancialSettings}>
          <Card withBorder padding="sm" radius="sm" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
            <Group gap="md" align="flex-end">
              <NumberInput
                label={t('pmHourlyRateLabel')}
                description={t('pmHourlyRateDesc')}
                placeholder="e.g. 60"
                min={0}
                value={hourlyRate}
                onChange={val => onHourlyRateChange(typeof val === 'number' ? val : 0)}
                style={{ width: 220 }}
                leftSection={<IconCurrencyEuro size={16} />}
              />
              <Select
                label={t('pmCurrencyLabel')}
                data={[
                  { value: 'EUR', label: 'EUR (€)' },
                  { value: 'USD', label: 'USD ($)' },
                  { value: 'BGN', label: 'BGN (лв.)' },
                ]}
                value={currency}
                onChange={val => onCurrencyChange(val || 'EUR')}
                style={{ width: 140 }}
              />
            </Group>
          </Card>
        </Collapse>

        {metadata.isUmbrella && (
          <Alert icon={<IconAlertTriangle size={16} />} color="grape" title={t('pmUmbrellaAlertTitle')} radius="sm">
            {t('pmUmbrellaAlertBody')}
          </Alert>
        )}

        <Divider />

        {/* Budget Threshold Switcher */}
        <Group justify="space-between" align="center" wrap="wrap">
          <Text size="sm" fw={600} c="dimmed">
            {t('pmActiveThresholdLabel')}
          </Text>
          <SegmentedControl
            size="xs"
            value={activeBudgetType}
            onChange={val => onBudgetTypeChange(val as BudgetThresholdType)}
            data={[
              {
                value: 'contract',
                label: `${t('pmThresholdContract')}: ${metadata.budget2Contract}h`,
                disabled: metadata.budget2Contract <= 0,
              },
              {
                value: 'estimate',
                label: `${t('pmThresholdEstimate')}: ${metadata.budget1Estimate}h`,
                disabled: metadata.budget1Estimate <= 0,
              },
              {
                value: 'profitability',
                label: `${t('pmThresholdProfitability')}: ${metadata.budget3Profitability}h`,
                disabled: metadata.budget3Profitability <= 0,
              },
            ]}
          />
        </Group>

        {/* Progress Bar */}
        <div>
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={600}>
              {t('pmConsumedHoursLabel')} <Text span fw={700} c={getStatusColor()}>{stats.totalSpentHours}h</Text> {t('pmOfWord')} {stats.targetHours}h
            </Text>
            <Text size="sm" fw={700} c={getStatusColor()}>
              {stats.percentageUsed}%
            </Text>
          </Group>
          <Progress
            value={Math.min(stats.percentageUsed, 100)}
            color={getStatusColor()}
            size="xl"
            radius="xl"
            striped={stats.percentageUsed >= 90}
            animated={stats.percentageUsed >= 95}
          />
        </div>

        {/* KPI Metrics Grid matching other dashboards */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {/* Target Budget Hours */}
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  {t('pmTargetBudgetKpi')}
                </Text>
                <Group align="baseline" gap="xs" mt="xs">
                  <Text fz={28} fw={700}>
                    {stats.targetHours}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('hoursShort')}
                  </Text>
                </Group>
              </div>
              <ThemeIcon variant="light" color="blue" size="lg" radius="md">
                <IconClock size={20} />
              </ThemeIcon>
            </Group>
            {hourlyRate > 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                {t('pmValueLabel')}: {targetCost.toLocaleString()} {currency}
              </Text>
            )}
          </Paper>

          {/* Spent Hours */}
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  {t('pmTotalLoggedKpi')}
                </Text>
                <Group align="baseline" gap="xs" mt="xs">
                  <Text fz={28} fw={700} c={getStatusColor()}>
                    {stats.totalSpentHours}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('hoursShort')}
                  </Text>
                </Group>
              </div>
              <ThemeIcon variant="light" color={getStatusColor()} size="lg" radius="md">
                <IconCheck size={20} />
              </ThemeIcon>
            </Group>
            {hourlyRate > 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                {t('pmCostLabel')}: {spentCost.toLocaleString()} {currency}
              </Text>
            )}
          </Paper>

          {/* Remaining Hours */}
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  {t('pmRemainingBudgetKpi')}
                </Text>
                <Group align="baseline" gap="xs" mt="xs">
                  <Text fz={28} fw={700} c={stats.remainingHours < 0 ? 'red' : 'teal'}>
                    {stats.remainingHours}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('hoursShort')}
                  </Text>
                </Group>
              </div>
              <ThemeIcon variant="light" color={stats.remainingHours < 0 ? 'red' : 'teal'} size="lg" radius="md">
                <IconCoin size={20} />
              </ThemeIcon>
            </Group>
            {hourlyRate > 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                {t('pmBalanceLabel')}: {remainingCost.toLocaleString()} {currency}
              </Text>
            )}
          </Paper>

          {/* Burn Rate / Velocity */}
          <Paper withBorder p="md" radius="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                  {t('pmWeeklyBurnRateKpi')}
                </Text>
                <Group align="baseline" gap="xs" mt="xs">
                  <Text fz={28} fw={700} c="violet">
                    {stats.weeklyBurnRate}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {t('pmHoursPerWeekUnit')}
                  </Text>
                </Group>
              </div>
              <ThemeIcon variant="light" color="violet" size="lg" radius="md">
                <IconTrendingUp size={20} />
              </ThemeIcon>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              {t('pmThisMonthLabel')}: {stats.spentThisMonth}h | {t('pmLastMonthLabel')}: {stats.spentLastMonth}h
            </Text>
          </Paper>
        </SimpleGrid>
      </Stack>
    </Card>
  );
};
