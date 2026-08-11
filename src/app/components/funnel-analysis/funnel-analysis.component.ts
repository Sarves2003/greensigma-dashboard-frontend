import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

type FunnelPeriod = 'thisMonth' | 'lastMonth' | 'custom';

interface Segment1Row {
  tag: string;
  count: number;
  percentage: number;
}

interface Segment2Row {
  tag: string;
  total: number;
  converted: number;
  conversionRate: number;
}

interface BatchRow {
  label: string;
  registrants: number;
  converted: number;
  conversionRate: number | null;
}

interface AttemptRow {
  attempt: number;
  count: number;
  percentage: number;
}

interface WebinarDate {
  _id: string;
  date: string;
  label: string;
}

@Component({
  selector: 'app-funnel-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './funnel-analysis.component.html',
  styleUrls: ['./funnel-analysis.component.scss'],
})
export class FunnelAnalysisComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  // ============ Segment 1: period-filtered Tribe conversions by funnel ============
  period: FunnelPeriod = 'thisMonth';
  customStart = '';
  customEnd = '';
  segment1Total = 0;
  segment1Rows: Segment1Row[] = [];
  loadingSegment1 = true;
  errorSegment1: string | null = null;

  // ============ Segment 2: all-time per-funnel conversion table ============
  segment2Rows: Segment2Row[] = [];
  loadingSegment2 = true;
  errorSegment2: string | null = null;

  // ============ Segment 3: webinar batch analysis ============
  batchRows: BatchRow[] = [];
  attemptRows: AttemptRow[] = [];
  totalPaid = 0;
  resolvedPaid = 0;
  unresolvedCount = 0;
  attemptDataAvailable = 0;
  loadingSegment3 = true;
  errorSegment3: string | null = null;

  // ============ Webinar date management ============
  webinarDates: WebinarDate[] = [];
  newDateInput = '';
  showDateManager = false;
  loadingDates = true;
  dateManagerError: string | null = null;

  private destroy$ = new Subject<void>();
  private segment1Trigger$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    // switchMap cancels any still-in-flight Segment 1 request when a newer one is triggered,
    // so a slower stale response (e.g. from a period you've since clicked away from) can never
    // land after a faster one and silently overwrite it with the wrong data.
    this.segment1Trigger$
      .pipe(
        switchMap(() => {
          this.loadingSegment1 = true;
          this.errorSegment1 = null;

          const params: any = { period: this.period };
          if (this.period === 'custom' && this.customStart && this.customEnd) {
            params.startDate = this.customStart;
            params.endDate = this.customEnd;
          }

          return this.apiService.getFunnelSegment1(params);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.segment1Total = response.data.total || 0;
            this.segment1Rows = response.data.rows || [];
          }
          this.loadingSegment1 = false;
        },
        error: (error) => {
          this.errorSegment1 = 'Failed to load Segment 1 data';
          console.error(error);
          this.loadingSegment1 = false;
        },
      });

    this.loadSegment1();
    this.loadSegment2();
    this.loadSegment3();
    this.loadWebinarDates();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============ Segment 1 ============
  loadSegment1() {
    this.segment1Trigger$.next();
  }

  onPeriodChange(p: FunnelPeriod) {
    this.period = p;
    if (p !== 'custom') this.loadSegment1();
  }

  onCustomRangeChange() {
    if (this.customStart && this.customEnd) {
      this.period = 'custom';
      this.loadSegment1();
    }
  }

  // ============ Segment 2 ============
  loadSegment2() {
    this.loadingSegment2 = true;
    this.errorSegment2 = null;

    this.apiService
      .getFunnelSegment2()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.segment2Rows = response.data.rows || [];
          }
          this.loadingSegment2 = false;
        },
        error: (error) => {
          this.errorSegment2 = 'Failed to load Segment 2 data';
          console.error(error);
          this.loadingSegment2 = false;
        },
      });
  }

  get segment2TotalLeads(): number {
    return this.segment2Rows.reduce((sum, r) => sum + r.total, 0);
  }

  get segment2TotalConverted(): number {
    return this.segment2Rows.reduce((sum, r) => sum + r.converted, 0);
  }

  // ============ Segment 3 ============
  loadSegment3() {
    this.loadingSegment3 = true;
    this.errorSegment3 = null;

    this.apiService
      .getFunnelSegment3()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.batchRows = response.data.batchRows || [];
            this.attemptRows = response.data.attemptRows || [];
            this.totalPaid = response.data.totalPaid || 0;
            this.resolvedPaid = response.data.resolvedPaid || 0;
            this.unresolvedCount = response.data.unresolvedCount || 0;
            this.attemptDataAvailable = response.data.attemptDataAvailable || 0;
          }
          this.loadingSegment3 = false;
        },
        error: (error) => {
          this.errorSegment3 = 'Failed to load Segment 3 data';
          console.error(error);
          this.loadingSegment3 = false;
        },
      });
  }

  // ============ Webinar date management ============
  loadWebinarDates() {
    this.loadingDates = true;
    this.apiService
      .getWebinarBatchDates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.webinarDates = response.data;
          }
          this.loadingDates = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingDates = false;
        },
      });
  }

  toggleDateManager() {
    this.showDateManager = !this.showDateManager;
  }

  addDate() {
    if (!this.newDateInput) return;
    this.dateManagerError = null;

    this.apiService
      .addWebinarBatchDate(this.newDateInput)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.webinarDates = response.data;
            this.newDateInput = '';
            this.loadSegment3();
          }
        },
        error: (error) => {
          this.dateManagerError = 'Failed to add date';
          console.error(error);
        },
      });
  }

  removeDate(id: string) {
    this.apiService
      .removeWebinarBatchDate(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.webinarDates = response.data;
            this.loadSegment3();
          }
        },
        error: (error) => {
          this.dateManagerError = 'Failed to remove date';
          console.error(error);
        },
      });
  }
}
