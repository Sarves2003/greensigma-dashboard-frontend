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

interface MetricSlice {
  label: string | null;
  value: number | null;
}

interface MetricBreakdown {
  currentMonth: MetricSlice;
  lastMonth: MetricSlice;
  currentQuarter: MetricSlice;
  lastQuarter: MetricSlice;
  currentYearAvgPerMonth: MetricSlice;
  previousYearAvgPerMonth: MetricSlice;
  currentYearTotal: MetricSlice;
  previousYearTotal: MetricSlice;
  currentYearBest: MetricSlice;
  previousYearBest: MetricSlice;
}

interface MetricCategoryConfig {
  key: 'revenue' | 'cac' | 'paidUsers' | 'adsSpent' | 'leads' | 'cpp';
  label: string;
  icon: string;
  prefix: string;
  decimals: string;
  isAvg: boolean;
  lowerIsBetter: boolean;
  accent: string;
  accentBg: string;
}

interface Delta {
  pct: number;
  direction: 'up' | 'down' | 'flat';
  sentiment: 'good' | 'bad' | 'flat';
}

@Component({
  selector: 'app-gs-health',
  standalone: true,
  imports: [CommonModule, FormsModule, EchartBarComponent, EchartLineComponent],
  templateUrl: './gs-health.component.html',
  styleUrls: ['./gs-health.component.scss'],
})
export class GsHealthComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  // ============ Segment 1: Key Metrics — anchored to the latest sheet row, no filter ============
  metricCategories: MetricCategoryConfig[] = [
    { key: 'revenue', label: 'Revenue', icon: '💰', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#16a34a', accentBg: '#eef7f0' },
    { key: 'cac', label: 'CAC', icon: '📐', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#d97706', accentBg: '#fef6e7' },
    { key: 'paidUsers', label: 'Paid Users', icon: '👤', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#0369a1', accentBg: '#eff6ff' },
    { key: 'adsSpent', label: 'Ads Spent', icon: '📣', prefix: '₹', decimals: '1.0-0', isAvg: false, lowerIsBetter: true, accent: '#dc2626', accentBg: '#fef2f2' },
    { key: 'leads', label: 'Webinar Leads', icon: '🧲', prefix: '', decimals: '1.0-0', isAvg: false, lowerIsBetter: false, accent: '#7c3aed', accentBg: '#f5f3ff' },
    { key: 'cpp', label: 'Webinar CPP', icon: '📣', prefix: '₹', decimals: '1.0-2', isAvg: true, lowerIsBetter: true, accent: '#0891b2', accentBg: '#ecfeff' },
  ];

  keyMetrics: Record<string, MetricBreakdown> = {};
  loadingKeyMetrics = true;
  keyMetricsError: string | null = null;

  // ============ Segment 2: Trends — has its own local filter, scoped only to this segment ============
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

  // ============ Segment 1 ============
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

  getDelta(current: number | null | undefined, previous: number | null | undefined, lowerIsBetter: boolean): Delta | null {
    if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) {
      return null;
    }

    const pct = ((current - previous) / Math.abs(previous)) * 100;
    const direction: Delta['direction'] = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';

    let sentiment: Delta['sentiment'] = 'flat';
    if (direction !== 'flat') {
      const isIncrease = direction === 'up';
      sentiment = isIncrease === !lowerIsBetter ? 'good' : 'bad';
    }

    return { pct: Math.abs(parseFloat(pct.toFixed(1))), direction, sentiment };
  }

  // ============ Segment 2 ============
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
