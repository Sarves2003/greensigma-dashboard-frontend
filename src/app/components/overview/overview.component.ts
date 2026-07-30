import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { ApiService } from '../../services/api.service';
import { KPICardComponent } from '../shared/kpi-card/kpi-card.component';
import { FilterBarComponent } from '../shared/filter-bar/filter-bar.component';

interface LedgerOption {
  key: string;
  label: string;
}

const LEDGER_OPTIONS: LedgerOption[] = [
  { key: 'login', label: 'Login' },
  { key: 'stockScore', label: 'Stock Score' },
  { key: 'stockBacktest', label: 'Stock Backtest' },
  { key: 'etfScore', label: 'ETF Score' },
  { key: 'etfBacktest', label: 'ETF Backtest' },
  { key: 'intraday', label: 'Intraday' },
  { key: 'portfolio', label: 'Portfolio Created' },
  { key: 'broker', label: 'Broker Connected' },
];

@Component({
  selector: 'app-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, NgChartsModule, KPICardComponent, FilterBarComponent],
  templateUrl: './overview.component.html',
  styleUrls: ['./overview.component.scss'],
})
export class OverviewComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;

  ledgerOptions = LEDGER_OPTIONS;

  currentFilter = {
    period: 'today',
    startDate: '',
    endDate: '',
    userType: '',
    referralCode: '',
    state: '',
    district: '',
  };

  // Key Metrics
  keyMetrics: any = {};

  // Feature Usage
  featureUsage: any[] = [];

  // Plot 1: New Signups Monthly
  signupsMonthlyConfig: ChartConfiguration | null = null;
  loadingPlot1 = true;

  // Plot 2: Ledger usage by cohort
  plot2Ledger: string[] = ['login'];
  ledgerCohortConfig: ChartConfiguration | null = null;
  loadingPlot2 = true;

  // Plot 3: 30-day activation rate
  plot3Type: 'real' | 'paper' = 'real';
  plot3Block: 'current' | 'previous' | 'custom' = 'current';
  plot3StartMonth = '';
  plot3EndMonth = '';
  activationRateRows: { monthLabel: string; poolSize: number; activatedCount: number; rate: number | null }[] = [];
  loadingPlot3 = true;

  // Plot 4: Live-capital deployment rate
  plot4PeriodMode: 'months' | 'custom' = 'months';
  plot4Months: 1 | 3 = 1;
  plot4StartMonth = '';
  plot4EndMonth = '';
  liveCapitalRateConfig: ChartConfiguration | null = null;
  loadingPlot4 = true;

  // Plot 5: Monthly Active Paid Users
  plot5Ledger: string[] = ['login'];
  monthlyActivePaidConfig: ChartConfiguration | null = null;
  loadingPlot5 = true;

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadDashboard();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private get globalParams() {
    return {
      period: this.currentFilter.period,
      startDate: this.currentFilter.startDate,
      endDate: this.currentFilter.endDate,
      userType: this.currentFilter.userType,
      referralCode: this.currentFilter.referralCode,
      state: this.currentFilter.state,
      district: this.currentFilter.district,
    };
  }

  loadDashboard() {
    this.loading = true;
    this.error = null;

    this.apiService.getKeyMetricsV2(this.globalParams).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success && response.data) this.keyMetrics = response.data;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Failed to load key metrics';
        console.error(err);
        this.loading = false;
      },
    });

    this.apiService.getFeatureUsageV2(this.globalParams).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success && response.data) this.featureUsage = response.data;
      },
      error: (err) => console.error(err),
    });

    this.loadPlot1();
    this.loadPlot2();
    this.loadPlot3();
    this.loadPlot4();
    this.loadPlot5();
  }

  onFilterChange(filter: any) {
    this.currentFilter = filter;
    this.loadDashboard();
  }

  // ============ PLOT 1 ============
  loadPlot1() {
    this.loadingPlot1 = true;
    this.apiService.getSignupsMonthlyPlot(this.globalParams).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const d = response.data;
          this.signupsMonthlyConfig = {
            type: 'bar',
            data: {
              labels: d.labels,
              datasets: [{ label: 'New Signups', data: d.values, backgroundColor: '#3b82f6' }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
              scales: { y: { beginAtZero: true } },
              plugins: { legend: { display: false } },
            },
          } as ChartConfiguration;
        }
        this.loadingPlot1 = false;
      },
      error: (err) => { console.error(err); this.loadingPlot1 = false; },
    });
  }

  // ============ PLOT 2 ============
  loadPlot2() {
    this.loadingPlot2 = true;
    const params = { ...this.globalParams, ledger: this.plot2Ledger.join(',') };
    this.apiService.getLedgerCohortPlot(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const d = response.data;
          this.ledgerCohortConfig = {
            type: 'bar',
            data: {
              labels: d.labels,
              datasets: [{ label: 'Ledger Usage Count', data: d.values, backgroundColor: '#10b981' }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
              scales: { y: { beginAtZero: true } },
              plugins: { legend: { display: false } },
            },
          } as ChartConfiguration;
        }
        this.loadingPlot2 = false;
      },
      error: (err) => { console.error(err); this.loadingPlot2 = false; },
    });
  }

  onPlot2LedgerToggle(key: string) {
    const idx = this.plot2Ledger.indexOf(key);
    if (idx >= 0) {
      if (this.plot2Ledger.length > 1) this.plot2Ledger.splice(idx, 1);
    } else {
      this.plot2Ledger.push(key);
    }
    this.loadPlot2();
  }

  // ============ PLOT 3 ============
  private monthKeyOffset(monthsAgo: number): string {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  loadPlot3() {
    this.loadingPlot3 = true;
    const params: any = { type: this.plot3Type };

    if (this.plot3Block === 'current') {
      params.months = 3; // this month + 2 back, e.g. May-Jul
    } else if (this.plot3Block === 'previous') {
      params.startMonth = this.monthKeyOffset(5); // e.g. Feb
      params.endMonth = this.monthKeyOffset(3); // e.g. Apr
    } else if (this.plot3StartMonth && this.plot3EndMonth) {
      params.startMonth = this.plot3StartMonth;
      params.endMonth = this.plot3EndMonth;
    }

    this.apiService.getActivationRatePlot(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.activationRateRows = response.data.rows || [];
        }
        this.loadingPlot3 = false;
      },
      error: (err) => { console.error(err); this.loadingPlot3 = false; },
    });
  }

  onPlot3TypeChange(type: 'real' | 'paper') {
    this.plot3Type = type;
    this.loadPlot3();
  }

  onPlot3BlockChange(block: 'current' | 'previous') {
    this.plot3Block = block;
    this.loadPlot3();
  }

  onPlot3CustomChange() {
    if (this.plot3StartMonth && this.plot3EndMonth) {
      this.plot3Block = 'custom';
      this.loadPlot3();
    }
  }

  // ============ PLOT 4 ============
  loadPlot4() {
    this.loadingPlot4 = true;
    const params: any = {};
    if (this.plot4PeriodMode === 'custom' && this.plot4StartMonth && this.plot4EndMonth) {
      params.startMonth = this.plot4StartMonth;
      params.endMonth = this.plot4EndMonth;
    } else {
      params.months = this.plot4Months;
    }

    this.apiService.getLiveCapitalRatePlot(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const d = response.data;
          this.liveCapitalRateConfig = {
            type: 'bar',
            data: {
              labels: d.labels,
              datasets: [{ label: 'Live-Capital Deployment Rate (%)', data: d.values, backgroundColor: '#ef4444' }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
              scales: { y: { beginAtZero: true } },
              plugins: { legend: { display: false } },
            },
          } as ChartConfiguration;
        }
        this.loadingPlot4 = false;
      },
      error: (err) => { console.error(err); this.loadingPlot4 = false; },
    });
  }

  onPlot4MonthsChange(m: 1 | 3) {
    this.plot4Months = m;
    this.plot4PeriodMode = 'months';
    this.loadPlot4();
  }

  onPlot4CustomChange() {
    if (this.plot4StartMonth && this.plot4EndMonth) {
      this.plot4PeriodMode = 'custom';
      this.loadPlot4();
    }
  }

  // ============ PLOT 5 ============
  loadPlot5() {
    this.loadingPlot5 = true;
    const params = { ledger: this.plot5Ledger.join(',') };
    this.apiService.getMonthlyActivePaidPlot(params).pipe(takeUntil(this.destroy$)).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const d = response.data;
          this.monthlyActivePaidConfig = {
            type: 'line',
            data: {
              labels: d.labels,
              datasets: [{
                label: 'Monthly Active Paid Users',
                data: d.values,
                borderColor: '#0369a1',
                backgroundColor: 'rgba(3, 105, 161, 0.3)',
                fill: true,
                tension: 0.3,
              }],
            },
            options: {
              responsive: true,
              maintainAspectRatio: true,
              scales: { y: { beginAtZero: true } },
              plugins: { legend: { display: false } },
            },
          } as ChartConfiguration;
        }
        this.loadingPlot5 = false;
      },
      error: (err) => { console.error(err); this.loadingPlot5 = false; },
    });
  }

  onPlot5LedgerToggle(key: string) {
    const idx = this.plot5Ledger.indexOf(key);
    if (idx >= 0) {
      if (this.plot5Ledger.length > 1) this.plot5Ledger.splice(idx, 1);
    } else {
      this.plot5Ledger.push(key);
    }
    this.loadPlot5();
  }
}
