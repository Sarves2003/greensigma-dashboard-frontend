import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { EchartBarComponent } from '../shared/echart-bar/echart-bar.component';
import { EchartLineComponent } from '../shared/echart-line/echart-line.component';
import { MetricCategoryCardComponent, MetricBreakdown, MetricCategoryConfig } from '../shared/metric-category-card/metric-category-card.component';

type ChannelKey = 'webinar' | 'demo' | 'renewal';

interface TargetMonth {
  monthKey: string;
  monthLabel: string;
  totalRevenue: number;
  netRevenue: number;
  webinar: number;
  demo: number;
  renewal: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Accepts what people actually type for a rupee amount: 3000000, 30,00,000, 30L, 30 lakh, 1.5cr, 250k.
const AMOUNT_MULTIPLIERS: Record<string, number> = {
  '': 1, k: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7,
};
type SubTab = 'overview' | ChannelKey;

@Component({
  selector: 'app-gs-health',
  standalone: true,
  imports: [CommonModule, FormsModule, EchartBarComponent, EchartLineComponent, MetricCategoryCardComponent],
  templateUrl: './gs-health.component.html',
  styleUrls: ['./gs-health.component.scss'],
})
export class GsHealthComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  activeSubTab: SubTab = 'overview';

  // ============ Overall: Key Metrics — anchored to the latest sheet row, no filter ============
  // Revenue here is Webinar + Demo Funnel + Renewal added together.
  overviewCategories: MetricCategoryConfig[] = [
    { key: 'totalRevenue', label: 'Total Revenue', icon: '💵', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#15803d', accentBg: '#ecfdf3' },
    { key: 'revenue', label: 'Net Revenue', icon: '💰', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#16a34a', accentBg: '#eef7f0' },
    { key: 'cac', label: 'Overall CAC', icon: '📐', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#d97706', accentBg: '#fef6e7' },
    { key: 'paidUsers', label: 'Paid Users (Webinar + Demo)', icon: '👤', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#0369a1', accentBg: '#eff6ff' },
    { key: 'webinarAds', label: 'Webinar Ads Spent', icon: '🎥', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: true, accent: '#dc2626', accentBg: '#fef2f2', description: 'Webinar ads, including GST' },
    { key: 'demoAds', label: 'Demo Funnel Ads Spent', icon: '📝', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: true, accent: '#ea580c', accentBg: '#fff7ed', description: 'Demo Funnel ads, including GST' },
    { key: 'marketing', label: 'Marketing Spent', icon: '🛍️', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: true, accent: '#b45309', accentBg: '#fffbeb', description: 'Exly + AiSensy + Periskope (Marketing Spending) + UGC & Influencer cost' },
    { key: 'leads', label: 'Leads Registered', icon: '🧲', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#7c3aed', accentBg: '#f5f3ff' },
    { key: 'cpp', label: 'Webinar CPL', icon: '🎯', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#0891b2', accentBg: '#ecfeff' },
  ];

  // ============ Webinar / Demo Funnel tabs — same shape, funnel-specific columns ============
  channelCategories: MetricCategoryConfig[] = [
    { key: 'leads', label: 'Leads Registered', icon: '🧲', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#7c3aed', accentBg: '#f5f3ff' },
    { key: 'adsSpent', label: 'Amount Spent', icon: '📣', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: true, accent: '#dc2626', accentBg: '#fef2f2' },
    { key: 'cac', label: 'CAC', icon: '📐', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#d97706', accentBg: '#fef6e7' },
    { key: 'totalRevenue', label: 'Total Revenue', icon: '💵', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#15803d', accentBg: '#ecfdf3' },
    { key: 'revenue', label: 'Net Revenue', icon: '💰', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#16a34a', accentBg: '#eef7f0' },
    { key: 'convertedUsers', label: 'Paid Users', icon: '👤', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#0369a1', accentBg: '#eff6ff' },
    { key: 'cpl', label: 'CPL', icon: '🎯', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#0891b2', accentBg: '#ecfeff' },
    { key: 'netRoas', label: 'Net ROAS', icon: '📈', prefix: '', decimals: '1.0-2', isAvg: true, lowerIsBetter: false, accent: '#be185d', accentBg: '#fdf2f8' },
  ];

  // Renewal tab — the sheet only tracks these for renewals (no ad spend / CPL / CAC / ROAS columns).
  renewalCategories: MetricCategoryConfig[] = [
    { key: 'expectedRenewals', label: 'Expected Renewals', icon: '🗓️', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#7c3aed', accentBg: '#f5f3ff' },
    { key: 'renewedUsers', label: 'Renewed Users', icon: '🔁', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#0369a1', accentBg: '#eff6ff' },
    { key: 'totalRevenue', label: 'Total Revenue', icon: '💵', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#15803d', accentBg: '#ecfdf3' },
    { key: 'revenue', label: 'Net Revenue', icon: '💰', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#16a34a', accentBg: '#eef7f0' },
  ];

  categoriesFor(tab: ChannelKey): MetricCategoryConfig[] {
    return tab === 'renewal' ? this.renewalCategories : this.channelCategories;
  }

  keyMetrics: Record<string, MetricBreakdown> = {};
  loadingKeyMetrics = true;
  keyMetricsError: string | null = null;

  // "As of" anchor for the Key Metrics cards (Overall/Webinar/Demo Funnel/Renewal) — shared across all
  // four sub-tabs since they all mean the same thing by "current month". Auto mode (default)
  // lets the backend skip a brand-new, still-empty month on its own; Custom lets you pin the
  // anchor to a specific month (e.g. pick August so a Jun-Aug report doesn't show September's
  // empty row as "current").
  asOfMode: 'auto' | 'custom' = 'auto';
  asOfMonth = '';

  channelMetricsCache: Partial<Record<ChannelKey, Record<string, MetricBreakdown>>> = {};
  loadingChannelMetrics = false;
  channelMetricsError: string | null = null;

  get activeChannelMetrics(): Record<string, MetricBreakdown> {
    if (this.activeSubTab === 'overview') return {};
    return this.channelMetricsCache[this.activeSubTab] || {};
  }

  // ============ Summarize popup: current month vs previous month ============
  showSummaryModal = false;
  loadingSummary = false;
  summaryError: string | null = null;
  summaryMonthKey = '';
  monthSummary: {
    currentKey: string;
    currentLabel: string;
    previousLabel: string | null;
    months: { key: string; label: string }[];
    rows: {
      key: string;
      label: string;
      format: 'currency' | 'number';
      lowerIsBetter: boolean;
      current: number;
      previous: number | null;
      delta: number | null;
      pct: number | null;
    }[];
  } | null = null;

  // ============ Monthly revenue target popup ============
  // One revenue target per month, shared/saved server-side. "Achieved" is that month's Total Revenue
  // from the sheet (Webinar + Demo Funnel + Renewal); everything below recomputes live as you type.
  showTargetModal = false;
  loadingTargets = false;
  savingTarget = false;
  targetError: string | null = null;
  targetMonths: TargetMonth[] = [];
  savedTargets: Record<string, number> = {};
  targetMonthKey = '';
  targetInput = '';

  // ============ Trends — has its own local filter, scoped only to this segment ============
  loading = true;
  error: string | null = null;

  periodMode: 'preset' | 'custom' = 'preset';
  preset: 'thisMonth' | 'lastMonth' | 'last2' | 'last3' = 'last3';
  startMonth = '';
  endMonth = '';

  revenueView: 'monthly' | 'cumulative' = 'monthly';

  table: any[] = [];

  labels: string[] = [];
  cacSeries: number[] = [];
  cacRatioSeries: number[] = [];
  netRevenueMonthlySeries: number[] = [];
  netRevenueCumulativeSeries: number[] = [];
  cppSeries: number[] = [];
  netRoasSeries: number[] = [];

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.loadKeyMetrics();
    this.loadTrends();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============ Overview ============
  loadKeyMetrics() {
    this.loadingKeyMetrics = true;
    this.keyMetricsError = null;

    const anchor = this.asOfMode === 'custom' && this.asOfMonth ? this.asOfMonth : undefined;

    this.apiService
      .getGsHealthKeyMetrics(anchor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.keyMetrics = response.data;
          } else {
            this.keyMetricsError = 'No data available yet.';
          }
          this.loadingKeyMetrics = false;
        },
        error: (err) => {
          this.keyMetricsError = 'Failed to load key metrics';
          console.error(err);
          this.loadingKeyMetrics = false;
        },
      });
  }

  // Re-fetches whichever sub-tab is currently visible with the new anchor.
  onAsOfChange() {
    if (this.activeSubTab === 'overview') {
      this.loadKeyMetrics();
    } else {
      this.channelMetricsCache = {};
      this.loadChannelMetrics(this.activeSubTab);
    }
  }

  setAsOfMode(mode: 'auto' | 'custom') {
    this.asOfMode = mode;
    if (mode === 'auto' || this.asOfMonth) this.onAsOfChange();
  }

  // ============ Summarize popup ============
  // Opens on whatever month Key Metrics is anchored to; the dropdown inside the popup then lets you
  // jump to any other month (its "previous month" is simply the one before it).
  openSummaryModal() {
    this.showSummaryModal = true;
    const anchor = this.asOfMode === 'custom' && this.asOfMonth ? this.asOfMonth : undefined;
    this.loadSummary(anchor);
  }

  onSummaryMonthChange(monthKey: string) {
    this.summaryMonthKey = monthKey;
    this.loadSummary(monthKey);
  }

  // The month list is newest-first, so +1 steps to an earlier month and -1 to a later one.
  canStepSummary(delta: number): boolean {
    const months = this.monthSummary?.months || [];
    const i = months.findIndex((m) => m.key === this.summaryMonthKey);
    return i >= 0 && i + delta >= 0 && i + delta < months.length;
  }

  stepSummaryMonth(delta: number) {
    if (!this.canStepSummary(delta) || !this.monthSummary) return;
    const months = this.monthSummary.months;
    const i = months.findIndex((m) => m.key === this.summaryMonthKey);
    this.onSummaryMonthChange(months[i + delta].key);
  }

  private loadSummary(monthKey?: string) {
    this.loadingSummary = true;
    this.summaryError = null;

    this.apiService
      .getGsHealthMonthSummary(monthKey)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.monthSummary = { ...response.data, months: response.data.months || [] };
            this.summaryMonthKey = response.data.currentKey;
          } else {
            this.summaryError = 'No data available yet.';
          }
          this.loadingSummary = false;
        },
        error: (err) => {
          this.summaryError = 'Failed to load the summary';
          console.error(err);
          this.loadingSummary = false;
        },
      });
  }

  closeSummaryModal() {
    this.showSummaryModal = false;
  }

  // Green when the change is an improvement for that metric, red when it's a setback (a rise in CAC or
  // spend is bad, a rise in revenue or users is good), grey when unchanged.
  summaryChangeClass(row: { delta: number | null; lowerIsBetter: boolean }): string {
    if (row.delta === null || row.delta === 0) return 'flat';
    return (row.delta < 0) === row.lowerIsBetter ? 'good' : 'bad';
  }

  // ============ Revenue target popup ============
  openTargetModal() {
    this.showTargetModal = true;
    this.targetError = null;
    if (this.targetMonths.length === 0) this.loadTargets();
  }

  closeTargetModal() {
    this.showTargetModal = false;
  }

  private loadTargets() {
    this.loadingTargets = true;
    this.apiService
      .getGsHealthRevenueTargets()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.targetMonths = response.data.months || [];
            this.savedTargets = response.data.targets || {};
            const start = response.data.defaultMonth || this.targetMonths[this.targetMonths.length - 1]?.monthKey || '';
            this.selectTargetMonth(start);
          } else {
            this.targetError = 'Could not load targets.';
          }
          this.loadingTargets = false;
        },
        error: (err) => {
          this.targetError = 'Could not load targets.';
          console.error(err);
          this.loadingTargets = false;
        },
      });
  }

  monthLabelFor(monthKey: string): string {
    const known = this.targetMonths.find((m) => m.monthKey === monthKey);
    if (known) return known.monthLabel;
    const [y, m] = monthKey.split('-').map(Number);
    return y && m ? `${MONTH_NAMES[m - 1]} ${y}` : monthKey;
  }

  // Every month in the sheet, any month that already has a target, and the month after the latest
  // sheet month — so next month's target can be set before its numbers exist. Oldest -> newest.
  private get monthKeysAsc(): string[] {
    const keys = new Set<string>(this.targetMonths.map((m) => m.monthKey));
    Object.keys(this.savedTargets).forEach((k) => keys.add(k));
    const latest = this.targetMonths[this.targetMonths.length - 1]?.monthKey;
    if (latest) {
      const [y, m] = latest.split('-').map(Number);
      keys.add(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`);
    }
    return [...keys].sort();
  }

  get monthOptions(): { key: string; label: string }[] {
    return [...this.monthKeysAsc].reverse().map((key) => ({ key, label: this.monthLabelFor(key) }));
  }

  selectTargetMonth(monthKey: string) {
    this.targetMonthKey = monthKey;
    const saved = this.savedTargets[monthKey];
    this.targetInput = saved ? String(saved) : '';
    this.targetError = null;
  }

  canStepMonth(delta: number): boolean {
    const keys = this.monthKeysAsc;
    const i = keys.indexOf(this.targetMonthKey) + delta;
    return i >= 0 && i < keys.length;
  }

  stepTargetMonth(delta: number) {
    if (!this.canStepMonth(delta)) return;
    const keys = this.monthKeysAsc;
    this.selectTargetMonth(keys[keys.indexOf(this.targetMonthKey) + delta]);
  }

  private parseAmount(raw: string): number | null {
    const t = (raw || '').toLowerCase().replace(/[₹,\s]/g, '').replace(/^rs\.?/, '');
    if (!t) return null;
    const m = t.match(/^(\d+(?:\.\d+)?)(k|l|lac|lacs|lakh|lakhs|cr|crore|crores)?$/);
    if (!m) return null;
    return Math.round(parseFloat(m[1]) * AMOUNT_MULTIPLIERS[m[2] || '']);
  }

  get achievedMonth(): TargetMonth | undefined {
    return this.targetMonths.find((m) => m.monthKey === this.targetMonthKey);
  }

  get achieved(): number {
    return this.achievedMonth?.totalRevenue || 0;
  }

  get parsedTarget(): number | null {
    return this.parseAmount(this.targetInput);
  }

  get remainingToTarget(): number {
    return Math.max((this.parsedTarget || 0) - this.achieved, 0);
  }

  get aboveTarget(): number {
    return this.parsedTarget ? Math.max(this.achieved - this.parsedTarget, 0) : 0;
  }

  get percentAchieved(): number {
    return this.parsedTarget ? (this.achieved / this.parsedTarget) * 100 : 0;
  }

  get percentLeft(): number {
    return this.parsedTarget ? Math.max(100 - this.percentAchieved, 0) : 0;
  }

  // 0 -> 1 as revenue climbs toward the target (capped at 1 once it's reached).
  private get progressFraction(): number {
    return this.parsedTarget ? Math.min(this.percentAchieved / 100, 1) : 0;
  }

  // "Achieved" box: a faint green that deepens the closer revenue gets to the target.
  get achievedBoxStyle(): Record<string, string> {
    if (!this.parsedTarget) return {};
    const p = this.progressFraction;
    return {
      background: `rgba(22, 163, 74, ${(0.06 + 0.5 * p).toFixed(2)})`,
      'border-color': `rgba(22, 163, 74, ${(0.2 + 0.6 * p).toFixed(2)})`,
    };
  }

  // "Left to achieve" box: strong red at the start that fades out as the gap closes. Once the target is
  // hit the box turns into the green "Above target" box via its .done class, so no inline style then.
  get leftBoxStyle(): Record<string, string> {
    if (!this.parsedTarget || this.remainingToTarget === 0) return {};
    const p = this.progressFraction;
    return {
      background: `rgba(220, 38, 38, ${(0.05 + 0.4 * (1 - p)).toFixed(2)})`,
      'border-color': `rgba(220, 38, 38, ${(0.15 + 0.5 * (1 - p)).toFixed(2)})`,
    };
  }

  get canSaveTarget(): boolean {
    const t = this.parsedTarget;
    return !this.savingTarget && !!t && t > 0 && t !== this.savedTargets[this.targetMonthKey];
  }

  saveTarget() {
    if (!this.canSaveTarget) return;
    this.persistTarget(this.parsedTarget);
  }

  clearTarget() {
    if (this.savingTarget) return;
    this.persistTarget(null);
  }

  private persistTarget(target: number | null) {
    const monthKey = this.targetMonthKey;
    this.savingTarget = true;
    this.targetError = null;
    this.apiService
      .saveGsHealthRevenueTarget(monthKey, target)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success) {
            if (target) {
              this.savedTargets = { ...this.savedTargets, [monthKey]: target };
            } else {
              const { [monthKey]: _removed, ...rest } = this.savedTargets;
              this.savedTargets = rest;
              this.targetInput = '';
            }
          } else {
            this.targetError = 'Could not save the target.';
          }
          this.savingTarget = false;
        },
        error: (err) => {
          this.targetError = 'Could not save the target.';
          console.error(err);
          this.savingTarget = false;
        },
      });
  }

  // ============ Channel tabs ============
  setSubTab(tab: SubTab) {
    this.activeSubTab = tab;
    if (tab !== 'overview' && !this.channelMetricsCache[tab]) {
      this.loadChannelMetrics(tab);
    }
  }

  private loadChannelMetrics(channel: ChannelKey) {
    this.loadingChannelMetrics = true;
    this.channelMetricsError = null;
    const anchor = this.asOfMode === 'custom' && this.asOfMonth ? this.asOfMonth : undefined;

    this.apiService
      .getGsHealthChannelMetrics(channel, anchor)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.channelMetricsCache[channel] = response.data;
          } else {
            this.channelMetricsError = 'No data available yet.';
          }
          this.loadingChannelMetrics = false;
        },
        error: (err) => {
          this.channelMetricsError = 'Failed to load channel metrics';
          console.error(err);
          this.loadingChannelMetrics = false;
        },
      });
  }

  // ============ Trends ============
  loadTrends() {
    this.loading = true;
    this.error = null;

    const params: any = {};
    if (this.periodMode === 'custom' && this.startMonth && this.endMonth) {
      params.startMonth = this.startMonth;
      params.endMonth = this.endMonth;
    } else {
      params.preset = this.preset;
    }

    this.apiService
      .getGsHealthSummary(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.table = response.data.table || [];

            const charts = response.data.charts || {};
            this.labels = charts.labels || [];
            this.cacSeries = charts.cac || [];
            this.cacRatioSeries = charts.cacRatio || [];
            this.netRevenueMonthlySeries = charts.netRevenueMonthly || [];
            this.netRevenueCumulativeSeries = charts.netRevenueCumulative || [];
            this.cppSeries = charts.cpp || [];
            this.netRoasSeries = charts.netRoas || [];
          } else {
            this.error = 'Failed to load trend data';
          }
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Failed to load trend data';
          console.error(err);
          this.loading = false;
        },
      });
  }

  onPresetChange(p: 'thisMonth' | 'lastMonth' | 'last2' | 'last3') {
    this.preset = p;
    this.periodMode = 'preset';
    this.loadTrends();
  }

  onCustomRangeChange() {
    if (this.startMonth && this.endMonth) {
      this.periodMode = 'custom';
      this.loadTrends();
    }
  }

  toggleRevenueView(view: 'monthly' | 'cumulative') {
    this.revenueView = view;
  }

  get netRevenueSeries(): number[] {
    return this.revenueView === 'cumulative' ? this.netRevenueCumulativeSeries : this.netRevenueMonthlySeries;
  }
}
