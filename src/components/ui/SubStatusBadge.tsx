'use client';

import sharedStyles from '@/components/ui/dashboard.module.css';

interface SubStatusBadgeProps {
  status: string;
  /**
   * When true, renders the status string verbatim (no snake_case -> Title Case
   * conversion). Defaults to false (title-casing with underscore splitting).
   */
  raw?: boolean;
}

/**
 * Shared subscription status badge used across Directory, Dashboard,
 * CubProfileDrawer, and Engagements views.
 *
 * Colour mapping:
 *   active  → green
 *   expired → red
 *   *       → orange (pending / paused / unknown)
 */
export function SubStatusBadge({ status, raw = false }: SubStatusBadgeProps) {
  const cls =
    status === 'active' ? sharedStyles.badgeGreen
    : status === 'expired' ? sharedStyles.badgeRed
    : sharedStyles.badgeOrange;

  const label = raw
    ? status
    : (status || '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  return <span className={`${sharedStyles.badge} ${cls}`}>{label}</span>;
}
