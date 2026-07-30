import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';
import { ApiService } from '../../services/api.service';
import { KPICardComponent } from '../shared/kpi-card/kpi-card.component';

@Component({
  selector: 'app-gs-health',
  standalone: true,
  imports: [CommonModule, FormsModule, NgChartsModule, KPICardComponent],
  templateUrl: './gs-health.component.html',
  styleUrls: ['./gs-health.component.scss'],
})
export class GsHealthComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;

  periodMode: 'months' | 'custom' = 'months';
  months: 2 | 3 = 3;
  startMonth = '';
  endMonth = '';

  revenueView: 'monthly' | 'cumulative' = 'monthly';

  cards: any = {};
  table: any[] = [];

  private labels: string[] = [];
  private cacSeries: number[] = [];
  private cacRatioSeries: number[] = [];
  private netRevenueMonthlySeries: number[] = [];
  private netRevenueCumulativeSeries: number[] = [];
  private cppSeries: number[] = [];
  private netRoasSeries: number[] = [];

  cacConfig: ChartConfiguration | null = null;
  cacRatioConfig: ChartConfiguration | null = null;
  netRevenueConfig: ChartConfiguration | null = null;
  cppConfig: ChartConfiguration | null = null;
  netRoasConfig: ChartConfiguration | null = null;

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadDashboard();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboard() {
    this.loading = true;
    this.error = null;

    const params: any = {};
    if (this.periodMode === 'custom' && this.startMonth && this.endMonth) {
      params.startMonth = this.startMonth;
      params.endMonth = this.endMonth;
    } else {
      params.months = this.months;
    }

    this.apiService
      .getGsHealthSummary(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.cards = response.data.cards || {};
            this.table = response.data.table || [];

            const charts = response.data.charts || {};
            this.labels = charts.labels || [];
            this.cacSeries = charts.cac || [];
            this.cacRatioSeries = charts.cacRatio || [];
            this.netRevenueMonthlySeries = charts.netRevenueMonthly || [];
            this.netRevenueCumulativeSeries = charts.netRevenueCumulative || [];
            this.cppSeries = charts.cpp || [];
            this.netRoasSeries = charts.netRoas || [];

            this.buildCharts();
          } else {
            this.error = 'Failed to load Revenue Metrics data';
          }
          this.loading = false;
        },
        error: (err) => {
          this.error = 'Failed to load Revenue Metrics data';
          console.error(err);
          this.loading = false;
        },
      });
  }

  onPeriodModeChange() {
    this.loadDashboard();
  }

  onMonthsChange(m: 2 | 3) {
    this.months = m;
    this.periodMode = 'months';
    this.loadDashboard();
  }

  onCustomRangeChange() {
    if (this.startMonth && this.endMonth) {
      this.periodMode = 'custom';
      this.loadDashboard();
    }
  }

  toggleRevenueView(view: 'monthly' | 'cumulative') {
    this.revenueView = view;
    this.buildNetRevenueChart();
  }

  private buildCharts() {
    this.buildCacChart();
    this.buildCacRatioChart();
    this.buildNetRevenueChart();
    this.buildCppChart();
    this.buildNetRoasChart();
  }

  private buildCacChart() {
    this.cacConfig = {
      type: 'bar',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: 'CAC (₹)',
            data: this.cacSeries,
            backgroundColor: '#3b82f6',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    } as ChartConfiguration;
  }

  private buildCacRatioChart() {
    this.cacRatioConfig = {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: 'CAC Ratio (x)',
            data: this.cacRatioSeries,
            borderColor: '#f59e0b',
            backgroundColor: 'rgba(245, 158, 11, 0.3)',
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    } as ChartConfiguration;
  }

  private buildNetRevenueChart() {
    const isCumulative = this.revenueView === 'cumulative';
    this.netRevenueConfig = {
      type: isCumulative ? 'line' : 'bar',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: isCumulative ? 'Cumulative Net Revenue (₹)' : 'Net Revenue (₹)',
            data: isCumulative ? this.netRevenueCumulativeSeries : this.netRevenueMonthlySeries,
            backgroundColor: isCumulative ? 'rgba(16, 185, 129, 0.3)' : '#10b981',
            borderColor: '#10b981',
            fill: isCumulative,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: true, position: 'top' } },
      },
    } as ChartConfiguration;
  }

  private buildCppChart() {
    this.cppConfig = {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: 'CPP (₹)',
            data: this.cppSeries,
            borderColor: '#8b5cf6',
            backgroundColor: 'rgba(139, 92, 246, 0.3)',
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    } as ChartConfiguration;
  }

  private buildNetRoasChart() {
    this.netRoasConfig = {
      type: 'line',
      data: {
        labels: this.labels,
        datasets: [
          {
            label: 'Net ROAS (x)',
            data: this.netRoasSeries,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.3)',
            fill: true,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: { y: { beginAtZero: true } },
        plugins: { legend: { display: false } },
      },
    } as ChartConfiguration;
  }
}
