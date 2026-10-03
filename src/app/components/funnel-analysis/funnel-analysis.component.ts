import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { EchartBarComponent } from '../shared/echart-bar/echart-bar.component';
import { EchartConversionBarComponent } from '../shared/echart-conversion-bar/echart-conversion-bar.component';

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
  createdOn: string | null;
}

interface BatchBreakdownRow {
  source: string;
  count: number;
  percentage: number;
  people: BreakdownPerson[];
}

// Webinar / Organic / Sales Team split of the per-batch detail (by the paid sheet's Lead column).
type LeadGroup = 'webinar' | 'organic' | 'salesteam';

const LEAD_GROUPS: LeadGroup[] = ['webinar', 'organic', 'salesteam'];

// Each of the three cards has its own independent "Showing" filter and its own loaded data.
interface LeadCardState {
  mode: BatchDetailMode;
  customDates: string[];
  // Unchecked (default) = broad: Chennai-metro districts (Chengalpattu, Tiruvallur, Kanchipuram,
  // etc.) count as Chennai too. Checked = strict: only an exact "Chennai" match counts.
  strictChennai: boolean;
  batches: BatchDetail[];
  loading: boolean;
  error: string | null;
}

// Just what the source-contribution chart needs, merged across all three Lead groups per batch.
interface ChartBatch {
  label: string;
  paid: number;
  breakdown: { source: string; count: number; percentage: number }[];
}

// One bar in the "Current Webinar Conversion %" segment: of everyone paid (Webinar Lead group) for
// this exact date, how many registered for that SAME webinar (the "Current Webinar" breakdown row).
interface ConversionBar {
  key: string; // YYYY-MM-DD
  label: string; // the date's human label, e.g. "21Jun2025"
  webinarNames: string[];
  paid: number;
  currentCount: number;
  pct: number | null; // null when paid === 0 (nothing to take a percentage of)
}

// One bar in the "Previous Webinar Conversion %" segment: of everyone paid for this batch, how many
// registered for the webinar immediately BEFORE it in the master Webinar Dates list — "immediately
// before" is worked out per bar, so it shifts automatically as the date selection changes.
interface PrevWebinarBar {
  key: string;
  label: string;
  prevKey: string | null; // null only for the very first master date — nothing comes before it
  prevLabel: string | null;
  paid: number;
  prevCount: number;
  pct: number | null; // null when paid === 0 or there's no earlier webinar to compare against
}

interface BatchDetail {
  label: string;
  webinarNames: string[];
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

type BatchDetailMode = 'latest' | 'custom';

@Component({
  selector: 'app-funnel-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule, EchartBarComponent, EchartConversionBarComponent],
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

  // ============ Segment 3: per-batch detail (latest webinar by default, or custom picks) ============
  // One independent filter + data set per card: Webinar (Lead starts with "Webinar"), Organic and
  // Sales Team. chartBatches merges whatever the three cards currently show, per batch, so the
  // moved source-contribution chart still covers every paid user shown above.
  leadCards: Record<LeadGroup, LeadCardState> = {
    webinar: this.newLeadCard(),
    organic: this.newLeadCard(),
    salesteam: this.newLeadCard(),
  };
  private leadCardSubs: Partial<Record<LeadGroup, Subscription>> = {};
  chartBatches: ChartBatch[] = [];

  showPeopleModal = false;
  selectedBatchLabel = '';
  selectedBreakdown: BatchBreakdownRow | null = null;

  sourceChartMode: SourceChartMode = 'total';

  // ============ Current Webinar Conversion % (new segment, always the Webinar Lead group) ============
  // User-picked subset of the master webinar dates to compare; defaults to the latest 6 once the
  // date list has loaded, so the chart isn't empty on first render.
  conversionSelectedDates: string[] = [];
  conversionBars: ConversionBar[] = [];
  conversionLoading = false;
  conversionError: string | null = null;
  private conversionDefaultsSet = false;

  // ============ Previous Webinar Conversion % (same idea, but vs. whichever webinar came right
  // before each selected date in the master list — dynamic per bar, not a fixed date) ============
  prevSelectedDates: string[] = [];
  prevBars: PrevWebinarBar[] = [];
  prevLoading = false;
  prevError: string | null = null;
  private prevDefaultsSet = false;

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
    this.loadAllLeadCards();
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
  private newLeadCard(): LeadCardState {
    return { mode: 'latest', customDates: [], strictChennai: false, batches: [], loading: true, error: null };
  }

  // Template helper: the ng-template context variable is untyped, so it goes through here.
  card(group: LeadGroup): LeadCardState {
    return this.leadCards[group];
  }

  loadAllLeadCards() {
    LEAD_GROUPS.forEach((g) => this.loadLeadCard(g));
  }

  loadLeadCard(group: LeadGroup) {
    const card = this.leadCards[group];
    card.loading = true;
    card.error = null;

    const dates = card.mode === 'custom' ? card.customDates : undefined;

    // A newer request for the same card supersedes any still in flight, so a slow earlier
    // response can't overwrite the latest selection.
    this.leadCardSubs[group]?.unsubscribe();
    this.leadCardSubs[group] = this.apiService
      .getFunnelBatchDetail(dates, card.strictChennai, [group])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            card.batches = (response.data[group] as BatchDetail[]) || [];
          } else {
            card.error = 'Failed to load batch detail';
          }
          card.loading = false;
          this.rebuildChart();
        },
        error: (error) => {
          card.error = 'Failed to load batch detail';
          console.error(error);
          card.loading = false;
        },
      });
  }

  onLeadModeChange(group: LeadGroup, mode: BatchDetailMode) {
    const card = this.leadCards[group];
    card.mode = mode;
    if (mode === 'latest' || card.customDates.length > 0) {
      this.loadLeadCard(group);
    }
  }

  onLeadStrictChennaiChange(group: LeadGroup) {
    const card = this.leadCards[group];
    if (card.mode === 'latest' || card.customDates.length > 0) {
      this.loadLeadCard(group);
    }
  }

  isLeadCustomDateSelected(group: LeadGroup, dateKey: string): boolean {
    return this.leadCards[group].customDates.includes(dateKey);
  }

  toggleLeadCustomDate(group: LeadGroup, dateKey: string) {
    const card = this.leadCards[group];
    const idx = card.customDates.indexOf(dateKey);
    if (idx >= 0) {
      card.customDates.splice(idx, 1);
    } else {
      card.customDates.push(dateKey);
    }
    if (card.customDates.length > 0) {
      this.loadLeadCard(group);
    } else {
      this.leadCardSubs[group]?.unsubscribe();
      card.batches = [];
      card.loading = false;
      this.rebuildChart();
    }
  }

  // Adds the shown Lead groups back together per batch (paid summed, same-source counts summed,
  // percentages recomputed against the combined paid) — an all-funnel view for the chart.
  private rebuildChart() {
    const byLabel = new Map<string, BatchDetail[]>();
    LEAD_GROUPS.forEach((g) =>
      this.leadCards[g].batches.forEach((b) => {
        if (!byLabel.has(b.label)) byLabel.set(b.label, []);
        byLabel.get(b.label)!.push(b);
      })
    );
    this.chartBatches = [...byLabel.entries()].map(([label, parts]) => {
      const paid = parts.reduce((sum, p) => sum + p.paid, 0);
      const counts = new Map<string, number>();
      parts.forEach((p) => p.breakdown.forEach((r) => counts.set(r.source, (counts.get(r.source) || 0) + r.count)));
      const breakdown = [...counts.entries()].map(([source, count]) => ({
        source,
        count,
        percentage: paid > 0 ? parseFloat(((count / paid) * 100).toFixed(1)) : 0,
      }));
      return { label, paid, breakdown };
    });
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
    const batches = this.chartBatches;
    if (batches.length === 0) return [];

    const allSources = new Set<string>();
    batches.forEach((b) => b.breakdown.forEach((r) => allSources.add(r.source)));

    const totalPaidAcrossBatches = batches.reduce((sum, b) => sum + b.paid, 0);

    return [...allSources]
      .map((source) => {
        let value: number;
        if (this.sourceChartMode === 'total') {
          const totalCount = batches.reduce(
            (sum, b) => sum + (b.breakdown.find((r) => r.source === source)?.count || 0),
            0
          );
          value = totalPaidAcrossBatches > 0 ? parseFloat(((totalCount / totalPaidAcrossBatches) * 100).toFixed(1)) : 0;
        } else {
          const sumPct = batches.reduce(
            (sum, b) => sum + (b.breakdown.find((r) => r.source === source)?.percentage || 0),
            0
          );
          value = parseFloat((sumPct / batches.length).toFixed(1));
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
            this.initConversionDefaults();
            this.initPrevDefaults();
          }
          this.loadingDates = false;
        },
        error: (error) => {
          console.error(error);
          this.loadingDates = false;
        },
      });
  }

  // Master webinar dates as YYYY-MM-DD keys, oldest first (shared by both conversion segments).
  get masterDateKeys(): string[] {
    return this.webinarDates.map((d) => d.date.slice(0, 10));
  }

  // ============ Current Webinar Conversion % ============
  private initConversionDefaults() {
    if (this.conversionDefaultsSet || this.webinarDates.length === 0) return;
    this.conversionDefaultsSet = true;
    this.selectLatestConversionDates(6);
  }

  isConversionDateSelected(key: string): boolean {
    return this.conversionSelectedDates.includes(key);
  }

  toggleConversionDate(key: string) {
    const i = this.conversionSelectedDates.indexOf(key);
    if (i >= 0) this.conversionSelectedDates.splice(i, 1);
    else this.conversionSelectedDates.push(key);
    this.loadConversionData();
  }

  selectAllConversionDates() {
    this.conversionSelectedDates = this.webinarDates.map((d) => d.date.slice(0, 10));
    this.loadConversionData();
  }

  selectLatestConversionDates(n: number) {
    this.conversionSelectedDates = this.webinarDates.map((d) => d.date.slice(0, 10)).slice(-n);
    this.loadConversionData();
  }

  clearConversionDates() {
    this.conversionSelectedDates = [];
    this.conversionBars = [];
    this.conversionError = null;
  }

  private conversionLabelFor(key: string): string {
    return this.webinarDates.find((d) => d.date.slice(0, 10) === key)?.label || key;
  }

  loadConversionData() {
    if (this.conversionSelectedDates.length === 0) {
      this.conversionBars = [];
      return;
    }

    this.conversionLoading = true;
    this.conversionError = null;

    // Chart left-to-right in date order, not the order the user happened to click chips in.
    const orderedKeys = this.webinarDates
      .map((d) => d.date.slice(0, 10))
      .filter((k) => this.conversionSelectedDates.includes(k));

    this.apiService
      .getFunnelBatchDetail(orderedKeys, false, ['webinar'])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const list: BatchDetail[] = response.data.webinar || [];
            this.conversionBars = orderedKeys.map((key) => {
              const b = list.find((x) => x.label === key);
              if (!b) {
                return { key, label: this.conversionLabelFor(key), webinarNames: [], paid: 0, currentCount: 0, pct: null };
              }
              const currentCount = b.breakdown.find((r) => r.source === 'Current Webinar')?.count || 0;
              const pct = b.paid > 0 ? parseFloat(((currentCount / b.paid) * 100).toFixed(1)) : null;
              return { key, label: this.conversionLabelFor(key), webinarNames: b.webinarNames, paid: b.paid, currentCount, pct };
            });
          } else {
            this.conversionError = 'Failed to load conversion data';
          }
          this.conversionLoading = false;
        },
        error: (error) => {
          this.conversionError = 'Failed to load conversion data';
          console.error(error);
          this.conversionLoading = false;
        },
      });
  }

  get conversionCategories(): string[] {
    return this.conversionBars.map((b) => b.label);
  }

  get conversionPercentages(): (number | null)[] {
    return this.conversionBars.map((b) => b.pct);
  }

  get conversionCounts(): number[] {
    return this.conversionBars.map((b) => b.currentCount);
  }

  get conversionTotals(): number[] {
    return this.conversionBars.map((b) => b.paid);
  }

  get conversionNames(): string[] {
    return this.conversionBars.map((b) => b.webinarNames.join(', '));
  }

  // Average of only the bars that actually had paid users — a date with 0 paid has no rate to
  // average in, and letting it count as 0% would understate every other bar's average.
  get conversionAverage(): number | null {
    const vals = this.conversionBars.map((b) => b.pct).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
  }

  // ============ Previous Webinar Conversion % ============
  private initPrevDefaults() {
    if (this.prevDefaultsSet || this.webinarDates.length === 0) return;
    this.prevDefaultsSet = true;
    this.selectLatestPrevDates(6);
  }

  isPrevDateSelected(key: string): boolean {
    return this.prevSelectedDates.includes(key);
  }

  togglePrevDate(key: string) {
    const i = this.prevSelectedDates.indexOf(key);
    if (i >= 0) this.prevSelectedDates.splice(i, 1);
    else this.prevSelectedDates.push(key);
    this.loadPrevData();
  }

  selectAllPrevDates() {
    this.prevSelectedDates = [...this.masterDateKeys];
    this.loadPrevData();
  }

  selectLatestPrevDates(n: number) {
    this.prevSelectedDates = this.masterDateKeys.slice(-n);
    this.loadPrevData();
  }

  clearPrevDates() {
    this.prevSelectedDates = [];
    this.prevBars = [];
    this.prevError = null;
  }

  loadPrevData() {
    if (this.prevSelectedDates.length === 0) {
      this.prevBars = [];
      return;
    }

    this.prevLoading = true;
    this.prevError = null;

    const masterKeys = this.masterDateKeys;
    const orderedKeys = masterKeys.filter((k) => this.prevSelectedDates.includes(k));

    this.apiService
      .getFunnelBatchDetail(orderedKeys, false, ['webinar'])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            const list: BatchDetail[] = response.data.webinar || [];
            this.prevBars = orderedKeys.map((key) => {
              const idx = masterKeys.indexOf(key);
              const prevKey = idx > 0 ? masterKeys[idx - 1] : null;
              const prevLabel = prevKey ? this.conversionLabelFor(prevKey) : null;
              const b = list.find((x) => x.label === key);

              if (!b) {
                return { key, label: this.conversionLabelFor(key), prevKey, prevLabel, paid: 0, prevCount: 0, pct: null };
              }
              const prevCount = prevKey ? b.breakdown.find((r) => r.source === prevKey)?.count || 0 : 0;
              const pct = prevKey && b.paid > 0 ? parseFloat(((prevCount / b.paid) * 100).toFixed(1)) : null;
              return { key, label: this.conversionLabelFor(key), prevKey, prevLabel, paid: b.paid, prevCount, pct };
            });
          } else {
            this.prevError = 'Failed to load conversion data';
          }
          this.prevLoading = false;
        },
        error: (error) => {
          this.prevError = 'Failed to load conversion data';
          console.error(error);
          this.prevLoading = false;
        },
      });
  }

  get prevCategories(): string[] {
    return this.prevBars.map((b) => b.label);
  }

  get prevPercentages(): (number | null)[] {
    return this.prevBars.map((b) => b.pct);
  }

  get prevCounts(): number[] {
    return this.prevBars.map((b) => b.prevCount);
  }

  get prevTotals(): number[] {
    return this.prevBars.map((b) => b.paid);
  }

  // Per-bar context for the tooltip — which exact earlier date this bar is measured against, since
  // that changes from bar to bar (unlike Current Webinar Conversion, where it's always "itself").
  get prevContext(): string[] {
    return this.prevBars.map((b) => (b.prevKey ? `vs ${b.prevLabel}` : 'No earlier webinar in your Manage Dates list'));
  }

  get prevAverage(): number | null {
    const vals = this.prevBars.map((b) => b.pct).filter((v): v is number => v !== null);
    if (vals.length === 0) return null;
    return parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1));
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
            this.loadAllLeadCards();
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
            this.loadAllLeadCards();
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
            this.loadAllLeadCards();
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

  toIST(iso: string | null): string {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }
}
