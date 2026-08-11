// Mirrors the key strings in the backend's src/config/permissions.ts registry.
// Guards and templates reference these constants; the Owner's admin screen instead
// renders the full catalog fetched live from GET /api/admin/permission-registry.
export const PERMISSIONS = {
  productMetrics: 'tab:product-metrics',
  productMetricsSignup: 'card:product-metrics:signup-engagement',
  productMetricsActivation: 'card:product-metrics:activation-rate',
  productMetricsActiveUserCards: 'card:product-metrics:active-user-cards',
  productMetricsActiveUserBreakdown: 'card:product-metrics:active-user-breakdown',

  gsHealth: 'tab:gs-health',
  gsHealthKeyMetrics: 'card:gs-health:key-metrics',
  gsHealthTrends: 'card:gs-health:trends',

  funnelAnalysis: 'tab:funnel-analysis',
  funnelSegment1: 'card:funnel-analysis:segment1',
  funnelSegment2: 'card:funnel-analysis:segment2',
  funnelSegment3: 'card:funnel-analysis:segment3',
  funnelDateManager: 'card:funnel-analysis:date-manager',

  unrealizedPnl: 'tab:unrealized-pnl',
  unrealizedPnlExport: 'card:unrealized-pnl:export',

  portfolio: 'tab:portfolio',
  retention: 'tab:retention',
} as const;
