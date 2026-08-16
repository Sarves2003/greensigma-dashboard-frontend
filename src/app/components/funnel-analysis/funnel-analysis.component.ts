import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { EchartBarComponent } from '../shared/echart-bar/echart-bar.component';

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

interface BreakdownPerson {
  name: string;
  phone: string;
  email: string | null;
}

interface BatchBreakdownRow {
  source: string;
  count: number;
  percentage: number;
  people: BreakdownPerson[];
}

interface BatchDetail {
  label: string;
  registrants: number;
  paid: number;
  avgDaysToPay: number | null;
  breakdown: BatchBreakdownRow[];
  chennaiRegistrantPct: number;
  nonChennaiRegistrantPct: number;
  chennaiConversionPct: number | null;
  nonChennaiConversionPct: number | null;
  chennaiRegistrants: number;
  nonChennaiRegistrants: number;
  chennaiPaidCount: number;
  nonChennaiPaidCount: number;
}

type SourceChartMode = 'total' | 'avg';

type BatchDetailMode = 'latest2' | 'custom';

@Component({
  selector: 'app-funnel-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, EchartBarComponent],
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

  // ============ Segment 3: per-batch detail (latest 2 by default, or custom picks) ============
  batchDetailMode: BatchDetailMode = 'latest2';
  selectedCustomDates: string[] = [];
  // Unchecked (default) = broad: Chennai-metro districts (Chengalpattu, Tiruvallur, Kanchipuram,
  // etc.) count as Chennai too. Checked = strict: only an exact "Chennai" match counts.
  strictChennai = false;
  batchDetails: BatchDetail[] = [];
  loadingBatchDetail = true;
  errorBatchDetail: string | null = null;

  showPeopleModal = false;
  selectedBatchLabel = '';
  selectedBreakdown: BatchBreakdownRow | null = null;

  sourceChartMode: SourceChartMode = 'total';

  // ============ Webinar date management ============
  webinarDates: WebinarDate[] = [];
  newDateInput = '';
  showDateManager = false;
  loadingDates = true;
  dateManagerError: string | null = null;

  // ============ Location data upload (fallback source for Chennai/Non-Chennai classification) ============
  showLocationUpload = false;
  locationUploadStatusCount = 0;
  locationUploadFile: File | null = null;
  locationUploadHeaders: string[] = [];
  locationUploadPreviewRows: string[][] = [];
  locationUploadTotalRows = 0;
  locationUploadNameCol: number | null = null;
  locationUploadMobileCol: number | null = null;
  locationUploadEmailCol: number | null = null;
  locationUploadLocationCol: number | null = null;
  loadingLocationPreview = false;
  locationUploadError: string | null = null;
  locationUploadSaving = false;
  locationUploadResult: { saved: number; skipped: number } | null = null;

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
    this.loadBatchDetail();
    this.loadWebinarDates();
    this.loadLocationUploadStatus();
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

  // ============ Segment 3: per-batch detail ============
  loadBatchDetail() {
    this.loadingBatchDetail = true;
    this.errorBatchDetail = null;

    const dates = this.batchDetailMode === 'custom' ? this.selectedCustomDates : undefined;

    this.apiService
      .getFunnelBatchDetail(dates, this.strictChennai)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.batchDetails = response.data;
          } else {
            this.errorBatchDetail = 'Failed to load batch detail';
          }
          this.loadingBatchDetail = false;
        },
        error: (error) => {
          this.errorBatchDetail = 'Failed to load batch detail';
          console.error(error);
          this.loadingBatchDetail = false;
        },
      });
  }

  onBatchDetailModeChange(mode: BatchDetailMode) {
    this.batchDetailMode = mode;
    if (mode === 'latest2' || this.selectedCustomDates.length > 0) {
      this.loadBatchDetail();
    }
  }

  onStrictChennaiChange() {
    if (this.batchDetailMode === 'latest2' || this.selectedCustomDates.length > 0) {
      this.loadBatchDetail();
    }
  }

  isCustomDateSelected(dateKey: string): boolean {
    return this.selectedCustomDates.includes(dateKey);
  }

  toggleCustomDate(dateKey: string) {
    const idx = this.selectedCustomDates.indexOf(dateKey);
    if (idx >= 0) {
      this.selectedCustomDates.splice(idx, 1);
    } else {
      this.selectedCustomDates.push(dateKey);
    }
    if (this.selectedCustomDates.length > 0) {
      this.loadBatchDetail();
    } else {
      this.batchDetails = [];
    }
  }

  openPeopleModal(batchLabel: string, row: BatchBreakdownRow) {
    this.selectedBatchLabel = batchLabel;
    this.selectedBreakdown = row;
    this.showPeopleModal = true;
  }

  closePeopleModal() {
    this.showPeopleModal = false;
    this.selectedBreakdown = null;
  }

  pctFromCurrentWebinar(batch: BatchDetail): number {
    if (batch.paid === 0) return 0;
    const cw = batch.breakdown.find((r) => r.source === 'Current Webinar');
    return cw ? parseFloat(((cw.count / batch.paid) * 100).toFixed(1)) : 0;
  }

  currentWebinarCount(batch: BatchDetail): number {
    return batch.breakdown.find((r) => r.source === 'Current Webinar')?.count || 0;
  }

  maxPercentageIn(batch: BatchDetail): number {
    return batch.breakdown.length > 0 ? Math.max(...batch.breakdown.map((r) => r.percentage)) : 0;
  }

  // Row intensity scaled relative to the biggest contributor in THIS batch, not a fixed 0-100 scale
  // — otherwise a batch where every source sits under 20% would render as uniformly pale.
  gradientBackground(pct: number, maxPct: number): string {
    if (maxPct <= 0) return 'rgba(45, 125, 61, 0.08)';
    const alpha = 0.1 + (pct / maxPct) * 0.55;
    return `rgba(45, 125, 61, ${alpha.toFixed(2)})`;
  }

  setSourceChartMode(mode: SourceChartMode) {
    this.sourceChartMode = mode;
  }

  // Aggregates the breakdown tables already fetched for the currently shown batch(es) — no separate
  // endpoint needed. "Total" = this source's share of paid users summed across the shown batches.
  // "Avg" = the average of that source's per-batch % across the shown batches (batches where it
  // doesn't appear count as 0%, so a source that only shows up once in a 2-batch view reads as
  // "half the time," not inflated to its single-batch percentage).
  private get sourceChartData(): { category: string; value: number }[] {
    if (this.batchDetails.length === 0) return [];

    const allSources = new Set<string>();
    this.batchDetails.forEach((b) => b.breakdown.forEach((r) => allSources.add(r.source)));

    const totalPaidAcrossBatches = this.batchDetails.reduce((sum, b) => sum + b.paid, 0);

    return [...allSources]
      .map((source) => {
        let value: number;
        if (this.sourceChartMode === 'total') {
          const totalCount = this.batchDetails.reduce(
            (sum, b) => sum + (b.breakdown.find((r) => r.source === source)?.count || 0),
            0
          );
          value = totalPaidAcrossBatches > 0 ? parseFloat(((totalCount / totalPaidAcrossBatches) * 100).toFixed(1)) : 0;
        } else {
          const sumPct = this.batchDetails.reduce(
            (sum, b) => sum + (b.breakdown.find((r) => r.source === source)?.percentage || 0),
            0
          );
          value = parseFloat((sumPct / this.batchDetails.length).toFixed(1));
        }
        return { category: source, value };
      })
      .sort((a, b) => b.value - a.value);
  }

  get sourceChartCategories(): string[] {
    return this.sourceChartData.map((d) => d.category);
  }

  get sourceChartValues(): number[] {
    return this.sourceChartData.map((d) => d.value);
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
            this.loadBatchDetail();
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
            this.loadBatchDetail();
          }
        },
        error: (error) => {
          this.dateManagerError = 'Failed to remove date';
          console.error(error);
        },
      });
  }

  // ============ Location data upload ============
  loadLocationUploadStatus() {
    this.apiService
      .getLocationUploadStatus()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.locationUploadStatusCount = response.data.count || 0;
          }
        },
        error: (error) => console.error(error),
      });
  }

  toggleLocationUpload() {
    this.showLocationUpload = !this.showLocationUpload;
  }

  onLocationFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.locationUploadFile = file;
    this.locationUploadError = null;
    this.locationUploadResult = null;
    this.locationUploadNameCol = null;
    this.locationUploadMobileCol = null;
    this.locationUploadEmailCol = null;
    this.locationUploadLocationCol = null;
    this.loadingLocationPreview = true;

    this.apiService
      .previewLocationUpload(file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.locationUploadHeaders = response.data.headers || [];
            this.locationUploadPreviewRows = response.data.previewRows || [];
            this.locationUploadTotalRows = response.data.totalRows || 0;
          } else {
            this.locationUploadError = 'Failed to read this file';
          }
          this.loadingLocationPreview = false;
        },
        error: (error) => {
          this.locationUploadError = error?.error?.error || 'Failed to read this file — check it is a valid CSV/Excel file';
          console.error(error);
          this.loadingLocationPreview = false;
        },
      });
  }

  get locationUploadMappingComplete(): boolean {
    return this.locationUploadMobileCol !== null && this.locationUploadEmailCol !== null && this.locationUploadLocationCol !== null;
  }

  submitLocationUpload() {
    if (!this.locationUploadFile || !this.locationUploadMappingComplete) return;

    this.locationUploadSaving = true;
    this.locationUploadError = null;

    this.apiService
      .commitLocationUpload(this.locationUploadFile, {
        nameCol: this.locationUploadNameCol ?? -1,
        mobileCol: this.locationUploadMobileCol!,
        emailCol: this.locationUploadEmailCol!,
        locationCol: this.locationUploadLocationCol!,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.locationUploadResult = response.data;
            this.locationUploadFile = null;
            this.locationUploadHeaders = [];
            this.locationUploadPreviewRows = [];
            this.loadLocationUploadStatus();
            this.loadBatchDetail();
          } else {
            this.locationUploadError = 'Failed to save this data';
          }
          this.locationUploadSaving = false;
        },
        error: (error) => {
          this.locationUploadError = error?.error?.error || 'Failed to save this data';
          console.error(error);
          this.locationUploadSaving = false;
        },
      });
  }
}
