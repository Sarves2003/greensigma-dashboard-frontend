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

type ChannelKey = 'webinar' | 'leadform';
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

  // ============ Overview: Key Metrics — anchored to the latest sheet row, no filter ============
  overviewCategories: MetricCategoryConfig[] = [
    { key: 'revenue', label: 'Revenue', icon: '💰', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#16a34a', accentBg: '#eef7f0' },
    { key: 'cac', label: 'Overall CAC', icon: '📐', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#d97706', accentBg: '#fef6e7' },
    { key: 'paidUsers', label: 'Paid Users', icon: '👤', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#0369a1', accentBg: '#eff6ff' },
    { key: 'adsSpent', label: 'Ads Spent', icon: '📣', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: true, accent: '#dc2626', accentBg: '#fef2f2' },
    { key: 'leads', label: 'Leads Registered', icon: '🧲', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#7c3aed', accentBg: '#f5f3ff' },
    { key: 'cpp', label: 'Webinar CPL', icon: '🎯', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#0891b2', accentBg: '#ecfeff' },
  ];

  // ============ Webinar / Lead Form channel tabs — same shape, channel-specific columns ============
  channelCategories: MetricCategoryConfig[] = [
    { key: 'leads', label: 'Leads Registered', icon: '🧲', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#7c3aed', accentBg: '#f5f3ff' },
    { key: 'adsSpent', label: 'Amount Spent', icon: '📣', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: true, accent: '#dc2626', accentBg: '#fef2f2' },
    { key: 'cac', label: 'CAC', icon: '📐', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#d97706', accentBg: '#fef6e7' },
    { key: 'revenue', label: 'Revenue', icon: '💰', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#16a34a', accentBg: '#eef7f0' },
    { key: 'convertedUsers', label: 'Paid Users', icon: '👤', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#0369a1', accentBg: '#eff6ff' },
    { key: 'cpl', label: 'CPL', icon: '🎯', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#0891b2', accentBg: '#ecfeff' },
    { key: 'netRoas', label: 'Net ROAS', icon: '📈', prefix: '', decimals: '1.0-2', isAvg: true, lowerIsBetter: false, accent: '#be185d', accentBg: '#fdf2f8' },
  ];

  keyMetrics: Record<string, MetricBreakdown> = {};
  loadingKeyMetrics = true;
  keyMetricsError: string | null = null;

  channelMetricsCache: Partial<Record<ChannelKey, Record<string, MetricBreakdown>>> = {};
  loadingChannelMetrics = false;
  channelMetricsError: string | null = null;

  get activeChannelMetrics(): Record<string, MetricBreakdown> {
    if (this.activeSubTab === 'overview') return {};
    return this.channelMetricsCache[this.activeSubTab] || {};
  }

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

    this.apiService
      .getGsHealthKeyMetrics()
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

    this.apiService
      .getGsHealthChannelMetrics(channel)
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
