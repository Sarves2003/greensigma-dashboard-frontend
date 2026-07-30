import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { KPICardComponent } from '../shared/kpi-card/kpi-card.component';
import { FilterBarComponent } from '../shared/filter-bar/filter-bar.component';

@Component({
  selector: 'app-retention',
  standalone: true,
  imports: [CommonModule, FormsModule, KPICardComponent, FilterBarComponent],
  templateUrl: './retention.component.html',
  styleUrls: ['./retention.component.scss'],
})
export class RetentionComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;

  cohortColumns: string[] = [];
  cohortRows: any[] = [];
  kpiComparison: any = {};

  granularity: 'monthly' | 'quarterly' | 'yearly' = 'monthly';

  currentFilter = {
    period: 'today',
    startDate: '',
    endDate: '',
    userType: '',
    referralCode: '',
    state: '',
    district: '',
  };

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

    const params = {
      period: this.currentFilter.period,
      startDate: this.currentFilter.startDate,
      endDate: this.currentFilter.endDate,
      userType: this.currentFilter.userType,
      referralCode: this.currentFilter.referralCode,
      state: this.currentFilter.state,
      district: this.currentFilter.district,
      granularity: this.granularity,
    };

    // Get cohort retention
    this.apiService
      .getCohortRetention(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.cohortColumns = response.data.columns || [];
            this.cohortRows = response.data.rows || [];
          }
          this.loading = false;
          if (!response.success) {
            this.error = 'Failed to load cohort retention data';
          }
        },
        error: (error) => {
          this.error = 'Failed to load cohort retention data';
          console.error(error);
          this.loading = false;
        },
      });

    // Get KPI comparison
    this.apiService
      .getKPIComparison(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.data) {
            this.kpiComparison = response.data;
          }
        },
        error: (error) => console.error(error),
      });
  }

  onFilterChange(filters: any) {
    // RETENTION-SPECIFIC: Enforce minimum 2 months
    const validPeriods = ['last3months', 'thisMonth', 'lastMonth', 'custom', '3months', '6months'];

    if (!validPeriods.includes(filters.period)) {
      // Override to last3months if user selects invalid period
      filters.period = 'last3months';
      this.error = 'Minimum 2 months required for cohort retention analysis. Using Last 3 Months.';
    } else {
      this.error = null;
    }

    this.currentFilter = filters;
    this.loadDashboard();
  }

  onGranularityChange() {
    this.loadDashboard();
  }

  getRetentionColor(retention: number | null): string {
    if (retention === null || retention === undefined) return 'transparent';
    if (retention >= 80) return '#10b981'; // Green
    if (retention >= 60) return '#3b82f6'; // Blue
    if (retention >= 40) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  }

  getCellValue(row: any, col: string): number | null {
    return row.values ? row.values[col] : null;
  }

  getCellDisplay(row: any, col: string): string {
    const value = this.getCellValue(row, col);
    return value === null || value === undefined ? '-' : `${value}%`;
  }
}
