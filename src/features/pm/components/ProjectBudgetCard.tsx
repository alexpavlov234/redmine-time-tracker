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
          Критично / Надвишен бюджет ({stats.percentageUsed}%)
        </Badge>
      );
    }
    if (stats.healthStatus === 'warning') {
      return (
        <Badge color="orange" size="lg" variant="light" leftSection={<IconAlertTriangle size={14} />}>
          Внимание: Наближава лимита ({stats.percentageUsed}%)
        </Badge>
      );
    }
    return (
      <Badge color="teal" size="lg" variant="light" leftSection={<IconCheck size={14} />}>
        В норма ({stats.percentageUsed}%)
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
                  Клиент: {metadata.clientName}
                </Badge>
              )}
              {metadata.contractType && (
                <Badge color="gray" size="sm" variant="subtle">
                  {metadata.contractType}
                </Badge>
              )}
              {metadata.isUmbrella && (
                <Badge color="grape" size="sm" variant="light">
                  Umbrella проект
                </Badge>
              )}
            </Group>

            <Group gap="md">
              {metadata.startDate && (
                <Group gap={4}>
                  <IconCalendar size={14} color="gray" />
                  <Text size="xs" c="dimmed">
                    Начало: <Text span fw={600}>{metadata.startDate}</Text>
                  </Text>
                </Group>
              )}
              {metadata.contractEndDate && (
                <Group gap={4}>
                  <IconCalendar size={14} color="gray" />
                  <Text size="xs" c="dimmed">
                    Край по договор: <Text span fw={600}>{metadata.contractEndDate}</Text>
                  </Text>
                </Group>
              )}
            </Group>
          </div>

          <Group gap="xs">
            {getStatusBadge()}
            <Tooltip label="Настройки на часова ставка и валута">
              <Button
                variant={showFinancialSettings ? 'light' : 'subtle'}
                color="gray"
                size="xs"
                leftSection={<IconAdjustments size={14} />}
                onClick={() => setShowFinancialSettings(prev => !prev)}
              >
                Финанси
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {/* Financial Settings Collapse */}
        <Collapse expanded={showFinancialSettings}>
          <Card withBorder padding="sm" radius="sm" bg="light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-7))">
            <Group gap="md" align="flex-end">
              <NumberInput
                label="Часова ставка"
                description="За изчисляване на стойност по проекта"
                placeholder="напр. 60"
                min={0}
                value={hourlyRate}
                onChange={val => onHourlyRateChange(typeof val === 'number' ? val : 0)}
                style={{ width: 180 }}
                leftSection={<IconCurrencyEuro size={16} />}
              />
              <Select
                label="Валута"
                data={[
                  { value: 'EUR', label: 'EUR (€)' },
                  { value: 'BGN', label: 'BGN (лв.)' },
                  { value: 'USD', label: 'USD ($)' },
                ]}
                value={currency}
                onChange={val => onCurrencyChange(val || 'EUR')}
                style={{ width: 130 }}
              />
            </Group>
          </Card>
        </Collapse>

        {metadata.isUmbrella && (
          <Alert icon={<IconAlertTriangle size={16} />} color="grape" title="Контейнерен (Umbrella) проект" radius="sm">
            Този проект е обозначен в Redmine като Umbrella (структурна папка). Договорните бюджети и отчетеното време се следят в отделните подпроекти (напр. по конкретен договор). Изберете съответния подпроект от списъка горе за преглед на точните часове.
          </Alert>
        )}

        <Divider />

        {/* Budget Threshold Switcher */}
        <Group justify="space-between" align="center">
          <Text size="sm" fw={600} c="dimmed">
            Следен бюджет от полетата на Redmine:
          </Text>
          <SegmentedControl
            size="xs"
            value={activeBudgetType}
            onChange={val => onBudgetTypeChange(val as BudgetThresholdType)}
            data={[
              {
                value: 'contract',
                label: `Договор: ${metadata.budget2Contract} ч.`,
                disabled: metadata.budget2Contract <= 0,
              },
              {
                value: 'estimate',
                label: `Оценка: ${metadata.budget1Estimate} ч.`,
                disabled: metadata.budget1Estimate <= 0,
              },
              {
                value: 'profitability',
                label: `Рентабилност: ${metadata.budget3Profitability} ч.`,
                disabled: metadata.budget3Profitability <= 0,
              },
            ]}
          />
        </Group>

        {/* Progress Bar */}
        <div>
          <Group justify="space-between" mb={6}>
            <Text size="sm" fw={600}>
              Усвоени часове: <Text span fw={700} c={getStatusColor()}>{stats.totalSpentHours} ч.</Text> от {stats.targetHours} ч.
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

        {/* KPI Metrics Grid */}
        <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
          {/* Total Budget Hours */}
          <Card withBorder padding="xs" radius="sm">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Целеви бюджет
                </Text>
                <Text size="xl" fw={700}>
                  {stats.targetHours} <Text span size="sm" fw={500} c="dimmed">ч.</Text>
                </Text>
              </div>
              <ThemeIcon variant="light" color="blue" size="lg" radius="md">
                <IconClock size={20} />
              </ThemeIcon>
            </Group>
            {hourlyRate > 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                Стойност: {targetCost.toLocaleString()} {currency}
              </Text>
            )}
          </Card>

          {/* Spent Hours */}
          <Card withBorder padding="xs" radius="sm">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Отчетени общо
                </Text>
                <Text size="xl" fw={700} c={getStatusColor()}>
                  {stats.totalSpentHours} <Text span size="sm" fw={500} c="dimmed">ч.</Text>
                </Text>
              </div>
              <ThemeIcon variant="light" color={getStatusColor()} size="lg" radius="md">
                <IconCheck size={20} />
              </ThemeIcon>
            </Group>
            {hourlyRate > 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                Стойност: {spentCost.toLocaleString()} {currency}
              </Text>
            )}
          </Card>

          {/* Remaining Hours */}
          <Card withBorder padding="xs" radius="sm">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Оставащ бюджет
                </Text>
                <Text size="xl" fw={700} c={stats.remainingHours < 0 ? 'red' : 'teal'}>
                  {stats.remainingHours} <Text span size="sm" fw={500} c="dimmed">ч.</Text>
                </Text>
              </div>
              <ThemeIcon variant="light" color={stats.remainingHours < 0 ? 'red' : 'teal'} size="lg" radius="md">
                <IconCoin size={20} />
              </ThemeIcon>
            </Group>
            {hourlyRate > 0 && (
              <Text size="xs" c="dimmed" mt={4}>
                Остатък: {remainingCost.toLocaleString()} {currency}
              </Text>
            )}
          </Card>

          {/* Burn Rate / Velocity */}
          <Card withBorder padding="xs" radius="sm">
            <Group justify="space-between">
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Burn Rate (Темп)
                </Text>
                <Text size="xl" fw={700}>
                  {stats.weeklyBurnRate} <Text span size="sm" fw={500} c="dimmed">ч./седм.</Text>
                </Text>
              </div>
              <ThemeIcon variant="light" color="violet" size="lg" radius="md">
                <IconTrendingUp size={20} />
              </ThemeIcon>
            </Group>
            <Text size="xs" c="dimmed" mt={4}>
              Този м.: {stats.spentThisMonth} ч. | Мин. м.: {stats.spentLastMonth} ч.
            </Text>
          </Card>
        </SimpleGrid>
      </Stack>
    </Card>
  );
};
