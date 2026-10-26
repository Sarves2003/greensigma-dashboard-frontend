import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

type AttendanceSource = 'sheet' | 'live' | 'unavailable';
type ViewMode = 'webinar' | 'month' | 'quarter';
type SortDir = 'asc' | 'desc';

interface WebinarWiseRow {
  date: string;
  label: string;
  batch: string;
  registered: number;
  total: number;
  paymentFull: number;
  advance: number;
  preSales: number;
  convByRegistration: number;
  convBySales: number;
  attendance: number | null;
  attendanceSource: AttendanceSource;
  attendanceNumerator: number | null;
  attendanceDenominator: number | null;
  attendanceNote: string;
  productPrice: number;
  webinarType: string;
  remarks: string;
}

interface MonthWiseRow {
  year: number;
  month: number;
  label: string;
  webinarCount: number;
  totalRegistered: number;
  totalPaid: number;
  convByRegistration: number;
  convBySales: number;
  attendance: number | null;
  spansAttendanceCutover: boolean;
}

interface QuarterWiseRow {
  year: number;
  quarter: number;
  label: string;
  monthCount: number;
  totalRegistered: number;
  totalPaid: number;
  convByRegistration: number;
  convBySales: number;
  attendance: number | null;
  spansAttendanceCutover: boolean;
}

interface DataGap {
  date: string;
  label: string;
  reason: string;
}

interface MomentumAnalyticsReport {
  webinarWise: WebinarWiseRow[];
  monthWise: MonthWiseRow[];
  quarterWise: QuarterWiseRow[];
  currentMonth: MonthWiseRow | null;
  currentQuarter: QuarterWiseRow | null;
  previousQuarter: QuarterWiseRow | null;
  dataGaps: DataGap[];
  generatedAt: string;
}

// Momentum webinar conversion & attendance trends — sourced from the Owner's "Webinar user count
// tracker" Google Sheet for Conversion by Registration / Conversion by Sales always, and for
// Attendance up to 2 Oct 2026; from 3 Oct 2026 onward Attendance instead uses this dashboard's own
// live Zoom Analysis "Current Webinar" attended count over the sheet's own Registered count for
// that date (confirmed with the Owner: 17th Oct 2026 = 43 attended / 118 registered = 36.44%).
@Component({
  selector: 'app-webinar-momentum-analytics',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './webinar-momentum-analytics.component.html',
  styleUrls: ['./webinar-momentum-analytics.component.scss'],
})
export class WebinarMomentumAnalyticsComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  report: MomentumAnalyticsReport | null = null;
  loading = true;
  error: string | null = null;

  viewMode: ViewMode = 'webinar';

  webinarSortBy: keyof WebinarWiseRow = 'date';
  webinarSortDir: SortDir = 'desc';
  monthSortBy: keyof MonthWiseRow = 'year';
  monthSortDir: SortDir = 'desc';
  quarterSortBy: keyof QuarterWiseRow = 'year';
  quarterSortDir: SortDir = 'desc';

  // 'all' or a specific year — applies to whichever of the 3 tables is currently shown.
  selectedYear: number | 'all' = 'all';

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load(forceRefresh = false) {
    this.loading = true;
    this.error = null;
    this.apiService
      .getWebinarMomentumAnalytics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) this.report = res.data;
          else this.error = res.error || 'Failed to load analytics';
          this.loading = false;
        },
        error: (err) => {
          this.error = err?.error?.error || 'Failed to load analytics';
          this.loading = false;
        },
      });
  }

  setView(mode: ViewMode) {
    this.viewMode = mode;
  }

  private compareField<T>(a: T, b: T, field: keyof T, dir: number): number {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  }

  // `tiebreakBy` resolves ties on the primary field with a second field in the SAME direction —
  // sorting Month-wise by 'year' alone left same-year rows in whatever order they happened to
  // arrive in (only accidentally chronological, since Array.sort is stable), rather than a real
  // single chronological ordering. Used for 'year' sorts on the Month/Quarter tables, tiebreaking
  // on 'month'/'quarter' respectively.
  private sortRows<T>(rows: T[], sortBy: keyof T, sortDir: SortDir, tiebreakBy?: keyof T): T[] {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const primary = this.compareField(a, b, sortBy, dir);
      if (primary !== 0) return primary;
      return tiebreakBy ? this.compareField(a, b, tiebreakBy, dir) : 0;
    });
  }

  get availableYears(): number[] {
    if (!this.report) return [];
    const years = new Set(this.report.monthWise.map((m) => m.year));
    return Array.from(years).sort((a, b) => b - a);
  }

  setYear(year: string) {
    this.selectedYear = year === 'all' ? 'all' : Number(year);
  }

  get sortedWebinarRows(): WebinarWiseRow[] {
    if (!this.report) return [];
    const rows = this.selectedYear === 'all' ? this.report.webinarWise : this.report.webinarWise.filter((w) => new Date(w.date).getUTCFullYear() === this.selectedYear);
    return this.sortRows(rows, this.webinarSortBy, this.webinarSortDir);
  }

  get sortedMonthRows(): MonthWiseRow[] {
    if (!this.report) return [];
    const rows = this.selectedYear === 'all' ? this.report.monthWise : this.report.monthWise.filter((m) => m.year === this.selectedYear);
    return this.sortRows(rows, this.monthSortBy, this.monthSortDir, this.monthSortBy === 'year' ? 'month' : undefined);
  }

  get sortedQuarterRows(): QuarterWiseRow[] {
    if (!this.report) return [];
    const rows = this.selectedYear === 'all' ? this.report.quarterWise : this.report.quarterWise.filter((q) => q.year === this.selectedYear);
    return this.sortRows(rows, this.quarterSortBy, this.quarterSortDir, this.quarterSortBy === 'year' ? 'quarter' : undefined);
  }

  toggleWebinarSort(field: keyof WebinarWiseRow) {
    if (this.webinarSortBy === field) this.webinarSortDir = this.webinarSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.webinarSortBy = field;
      this.webinarSortDir = 'asc';
    }
  }

  toggleMonthSort(field: keyof MonthWiseRow) {
    if (this.monthSortBy === field) this.monthSortDir = this.monthSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.monthSortBy = field;
      this.monthSortDir = 'asc';
    }
  }

  toggleQuarterSort(field: keyof QuarterWiseRow) {
    if (this.quarterSortBy === field) this.quarterSortDir = this.quarterSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.quarterSortBy = field;
      this.quarterSortDir = 'asc';
    }
  }

  sortArrow(currentField: string, activeField: string, dir: SortDir): string {
    if (currentField !== activeField) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  // ============ Quarter comparison ============
  private quarterHasSource(year: number, quarter: number, source: AttendanceSource): boolean {
    if (!this.report) return false;
    return this.report.webinarWise.some((w) => {
      const d = new Date(w.date);
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      return d.getUTCFullYear() === year && q === quarter && w.attendanceSource === source;
    });
  }

  get attendanceMethodologyChanged(): boolean {
    const cur = this.report?.currentQuarter;
    const prev = this.report?.previousQuarter;
    if (!cur || !prev) return false;
    const curLive = this.quarterHasSource(cur.year, cur.quarter, 'live');
    const prevLive = this.quarterHasSource(prev.year, prev.quarter, 'live');
    return curLive !== prevLive;
  }

  delta(curr: number | null, prev: number | null): number | null {
    if (curr == null || prev == null) return null;
    return Math.round((curr - prev) * 10) / 10;
  }

  formatPct(n: number | null): string {
    return n != null ? `${n}%` : 'N/A';
  }

  sourceLabel(source: AttendanceSource): string {
    if (source === 'live') return 'Live';
    if (source === 'sheet') return 'Sheet';
    return 'N/A';
  }
}
