import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { FilterBarComponent } from '../shared/filter-bar/filter-bar.component';
import { StatTileComponent } from '../shared/stat-tile/stat-tile.component';
import { EchartBarComponent } from '../shared/echart-bar/echart-bar.component';

type DayWindow = 7 | 15 | 30 | 60 | 90;
type FlowUserType = 'all' | 'Tribe' | 'Free' | 'Webinar';
type MonthPeriod = 'thisMonth' | 'lastMonth' | 'last3Months';
type DistributionPeriod = 'thisMonth' | 'lastMonth' | 'last3Months' | 'custom';
type SumAvgMode = 'sum' | 'avg';
type Granularity = 'daily' | 'monthly' | 'quarterly' | 'daywise';

@Component({
  selector: 'app-product-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, FilterBarComponent, StatTileComponent, EchartBarComponent],
  templateUrl: './product-metrics.component.html',
  styleUrls: ['./product-metrics.component.scss'],
})
export class ProductMetricsComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  loading = true;
  error: string | null = null;

  // ============ Segment 1: signup & engagement metrics (obeys its own filter bar) ============
  currentFilter = {
    period: 'today',
    startDate: '',
    endDate: '',
    userType: '',
    referralCode: '',
    state: '',
    district: '',
  };

  metrics: any = {};

  // ============ Segment 2: activation rate, Real only (ignores the filter above) ============
  dayWindowOptions: DayWindow[] = [7, 15, 30, 60, 90];
  activationDayWindow: DayWindow = 30;
  activationBlock: 'current' | 'previous' | 'custom' = 'current';
  activationStartMonth = '';
  activationEndMonth = '';
  activationRateRows: { monthLabel: string; poolSize: number; activatedCount: number; rate: number | null }[] = [];
  loadingActivation = true;

  // ============ Segment 3: active user flow (DAU / MAU / stickiness) ============
  flowUserType: FlowUserType = 'all';
  monthPeriodOptions: { value: MonthPeriod; label: string }[] = [
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'last3Months', label: 'Last 3 Months' },
  ];

  dauWindow: DayWindow = 30;
  dauMode: SumAvgMode = 'avg';
  dauUniqueUsers = 0;
  dauAverage = 0;
  dauToday = 0;
  loadingDau = true;

  mauPeriod: MonthPeriod = 'thisMonth';
  mauMode: SumAvgMode = 'avg';
  mauMonths: { monthLabel: string; activeUsers: number }[] = [];
  mauUniqueUsers = 0;
  loadingMau = true;

  ratioPeriod: MonthPeriod = 'thisMonth';
  ratioValue = 0;
  loadingRatio = true;

  // ============ Segment 3b: engagement distribution (days-active-per-user histogram) ============
  distributionUserType: FlowUserType = 'all';
  distributionPeriodOptions: { value: DistributionPeriod; label: string }[] = [
    { value: 'thisMonth', label: 'This Month' },
    { value: 'lastMonth', label: 'Last Month' },
    { value: 'last3Months', label: 'Last 3 Months' },
    { value: 'custom', label: 'Custom' },
  ];
  distributionPeriod: DistributionPeriod = 'thisMonth';
  distributionStartDate = '';
  distributionEndDate = '';
  distributionRangeStart = '';
  distributionRangeEnd = '';
  distributionMau = 0;
  distributionBuckets: { label: string; users: number; pct: number }[] = [];
  loadingDistribution = true;

  // ============ Segment 4: active user breakdown bar chart ============
  granularityOptions: { value: Granularity; label: string }[] = [
    { value: 'daily', label: 'Daily' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'daywise', label: 'Day of Week' },
  ];

  breakdownUserType: FlowUserType = 'all';
  breakdownMode: SumAvgMode = 'avg';
  breakdownGranularity: Granularity = 'daily';
  breakdownStartDate = '';
  breakdownEndDate = '';
  breakdownBars: { label: string; sum: number; avg: number }[] = [];
  loadingBreakdown = true;

  private destroy$ = new Subject<void>();
  private breakdownTrigger$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.loadSegment1();
    this.loadActivationRate();
    this.loadDau();
    this.loadMau();
    this.loadRatio();
    this.loadDistribution();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    this.breakdownStartDate = this.formatDateInput(monthStart);
    this.breakdownEndDate = this.formatDateInput(now);

    // switchMap cancels any still-in-flight request when a newer one is triggered, so a slow
    // stale response (e.g. an unfiltered "All" query) can never overwrite a faster later one.
    this.breakdownTrigger$
      .pipe(
        switchMap(() => {
          this.loadingBreakdown = true;
          return this.apiService.getActiveUserBreakdownPlot({
            userType: this.breakdownUserType,
            granularity: this.breakdownGranularity,
            startDate: this.breakdownStartDate,
            endDate: this.breakdownEndDate,
          });
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.breakdownBars = response.data.bars || [];
          }
          this.loadingBreakdown = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingBreakdown = false;
        },
      });

    this.loadBreakdown();
  }

  private formatDateInput(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private get segment1Params() {
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

  onFilterChange(filter: any) {
    this.currentFilter = filter;
    this.loadSegment1();
  }

  loadSegment1() {
    this.loading = true;
    this.error = null;

    this.apiService
      .getKeyMetricsV2(this.segment1Params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.metrics = response.data;
          this.loading = false;
        },
        error: (error) => {
          this.error = 'Failed to load metrics';
          console.error(error);
          this.loading = false;
        },
      });
  }

  // ============ Segment 2 ============
  private monthKeyOffset(monthsAgo: number): string {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  loadActivationRate() {
    this.loadingActivation = true;
    const params: any = { type: 'real', dayWindow: this.activationDayWindow };

    if (this.activationBlock === 'current') {
      params.months = 3;
    } else if (this.activationBlock === 'previous') {
      params.startMonth = this.monthKeyOffset(5);
      params.endMonth = this.monthKeyOffset(3);
    } else if (this.activationStartMonth && this.activationEndMonth) {
      params.startMonth = this.activationStartMonth;
      params.endMonth = this.activationEndMonth;
    }

    this.apiService
      .getActivationRatePlot(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.activationRateRows = response.data.rows || [];
          }
          this.loadingActivation = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingActivation = false;
        },
      });
  }

  onActivationBlockChange(block: 'current' | 'previous') {
    this.activationBlock = block;
    this.loadActivationRate();
  }

  onActivationCustomChange() {
    if (this.activationStartMonth && this.activationEndMonth) {
      this.activationBlock = 'custom';
      this.loadActivationRate();
    }
  }

  onDayWindowChange(days: DayWindow) {
    this.activationDayWindow = days;
    this.loadActivationRate();
  }

  // ============ Segment 3 ============
  onFlowUserTypeChange(type: FlowUserType) {
    this.flowUserType = type;
    this.loadDau();
    this.loadMau();
    this.loadRatio();
  }

  loadDau() {
    this.loadingDau = true;
    this.apiService
      .getActiveUserFlowPlot({ userType: this.flowUserType, dayWindow: this.dauWindow })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const rows: { activeUsers: number }[] = response.data.dailyRows || [];
            const sum = rows.reduce((total, r) => total + r.activeUsers, 0);
            this.dauAverage = rows.length > 0 ? Math.round(sum / rows.length) : 0;
            this.dauUniqueUsers = response.data.rollingActiveUsers || 0;
            this.dauToday = response.data.todayActiveUsers || 0;
          }
          this.loadingDau = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingDau = false;
        },
      });
  }

  onDauWindowChange(days: DayWindow) {
    this.dauWindow = days;
    this.loadDau();
  }

  onDauModeChange(mode: SumAvgMode) {
    this.dauMode = mode;
  }

  get dauValue(): number {
    return this.dauMode === 'sum' ? this.dauUniqueUsers : this.dauAverage;
  }

  loadMau() {
    this.loadingMau = true;
    this.apiService
      .getActiveUserFlowMonthlyPlot({ userType: this.flowUserType, period: this.mauPeriod })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.mauMonths = response.data.months || [];
            this.mauUniqueUsers = response.data.combinedActiveUsers || 0;
          }
          this.loadingMau = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingMau = false;
        },
      });
  }

  onMauPeriodChange(period: MonthPeriod) {
    this.mauPeriod = period;
    this.loadMau();
  }

  onMauModeChange(mode: SumAvgMode) {
    this.mauMode = mode;
  }

  get mauValue(): number {
    if (this.mauMode === 'sum') return this.mauUniqueUsers;
    if (this.mauMonths.length === 0) return 0;
    const sum = this.mauMonths.reduce((total, m) => total + m.activeUsers, 0);
    return Math.round(sum / this.mauMonths.length);
  }

  loadRatio() {
    this.loadingRatio = true;
    this.apiService
      .getActiveUserFlowMonthlyPlot({ userType: this.flowUserType, period: this.ratioPeriod })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.ratioValue = response.data.stickinessRatio || 0;
          }
          this.loadingRatio = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingRatio = false;
        },
      });
  }

  onRatioPeriodChange(period: MonthPeriod) {
    this.ratioPeriod = period;
    this.loadRatio();
  }

  periodLabel(period: MonthPeriod): string {
    return this.monthPeriodOptions.find((p) => p.value === period)?.label || '';
  }

  // ============ Segment 3b ============
  loadDistribution() {
    if (this.distributionPeriod === 'custom' && (!this.distributionStartDate || !this.distributionEndDate)) return;

    this.loadingDistribution = true;
    const params: any = { userType: this.distributionUserType, period: this.distributionPeriod };
    if (this.distributionPeriod === 'custom') {
      params.startDate = this.distributionStartDate;
      params.endDate = this.distributionEndDate;
    }

    this.apiService
      .getEngagementDistributionPlot(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.distributionMau = response.data.mau || 0;
            this.distributionBuckets = response.data.buckets || [];
            this.distributionRangeStart = response.data.rangeStart || '';
            this.distributionRangeEnd = response.data.rangeEnd || '';
          }
          this.loadingDistribution = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingDistribution = false;
        },
      });
  }

  onDistributionUserTypeChange(type: FlowUserType) {
    this.distributionUserType = type;
    this.loadDistribution();
  }

  onDistributionPeriodChange(period: DistributionPeriod) {
    this.distributionPeriod = period;
    if (period !== 'custom') this.loadDistribution();
  }

  onDistributionCustomRangeChange() {
    if (this.distributionStartDate && this.distributionEndDate) {
      this.distributionPeriod = 'custom';
      this.loadDistribution();
    }
  }

  // ============ Segment 4 ============
  // Type / Granularity / Date Range only stage a selection — nothing is fetched until
  // applyBreakdownFilters() runs. Sum/Avg needs no fetch at all: the backend already
  // returns both numbers per bar, so it's a pure client-side toggle.
  loadBreakdown() {
    this.breakdownTrigger$.next();
  }

  onBreakdownUserTypeChange(type: FlowUserType) {
    this.breakdownUserType = type;
  }

  onBreakdownModeChange(mode: SumAvgMode) {
    this.breakdownMode = mode;
  }

  onBreakdownGranularityChange(granularity: Granularity) {
    this.breakdownGranularity = granularity;
  }

  applyBreakdownFilters() {
    if (this.breakdownStartDate && this.breakdownEndDate) {
      this.loadBreakdown();
    }
  }

  get breakdownLabels(): string[] {
    return this.breakdownBars.map((b) => b.label);
  }

  get breakdownValues(): number[] {
    return this.breakdownBars.map((b) => (this.breakdownMode === 'sum' ? b.sum : b.avg));
  }
}
