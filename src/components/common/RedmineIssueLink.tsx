import React from 'react';
import { Anchor, ActionIcon, Group, type MantineSize } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useSettings } from '../../contexts/SettingsContext';
import { cleanTaskId } from '../../utils/formatters';

/// <summary>
/// Properties for configuring the RedmineIssueLink component.
/// </summary>
export interface RedmineIssueLinkProps {
  /// <summary>Redmine issue / task identifier (number or string, with optional '#' prefix).</summary>
  issueId: number | string;
  /// <summary>Optional subject or title for the issue.</summary>
  subject?: string;
  /// <summary>Font size for the issue anchor link.</summary>
  size?: MantineSize;
  /// <summary>Font weight for the link text.</summary>
  fw?: React.CSSProperties['fontWeight'];
  /// <summary>Whether to truncate overflow text with an ellipsis.</summary>
  truncate?: boolean;
  /// <summary>Whether to show the separate external link action icon.</summary>
  showIcon?: boolean;
  /// <summary>Size in pixels for the external link icon (defaults based on link size).</summary>
  iconSize?: number;
  /// <summary>Custom CSS styles for the wrapper group.</summary>
  style?: React.CSSProperties;
}

/// <summary>
/// Reusable component for rendering accessible Redmine issue links with automatic URL normalization,
/// trailing slash sanitization, and optional external launch icon.
/// </summary>
export const RedmineIssueLink: React.FC<RedmineIssueLinkProps> = ({
  issueId,
  subject,
  size = 'sm',
  fw = 600,
  truncate = true,
  showIcon = true,
  iconSize,
  style,
}) => {
  const { redmineUrl } = useSettings();
  const cleanId = cleanTaskId(issueId);

  if (!cleanId) return null;

  const baseUrl = (redmineUrl || '').replace(/\/+$/, '');
  const issueUrl = `${baseUrl}/issues/${cleanId}`;
  const displayText = subject ? `#${cleanId} - ${subject}` : `#${cleanId}`;

  // Default icon size based on link size
  const defaultIconSize = size === 'xs' ? 12 : size === 'lg' ? 15 : 13;
  const computedIconSize = iconSize || defaultIconSize;

  return (
    <Group gap={4} wrap="nowrap" align="center" style={style}>
      <Anchor
        href={issueUrl}
        target="_blank"
        rel="noopener noreferrer"
        size={size}
        fw={fw}
        truncate={truncate}
        underline="hover"
        aria-label={`Open Redmine issue #${cleanId}: ${subject || ''}`}
        style={{ minWidth: 0 }}
      >
        {displayText}
      </Anchor>
      {showIcon && (
        <ActionIcon
          component="a"
          href={issueUrl}
          target="_blank"
          rel="noopener noreferrer"
          size="xs"
          variant="subtle"
          color="gray"
          title={`Open issue #${cleanId} in Redmine`}
          aria-label={`Open issue #${cleanId} in new tab`}
          style={{ flexShrink: 0 }}
        >
          <IconExternalLink size={computedIconSize} />
        </ActionIcon>
      )}
    </Group>
  );
};
