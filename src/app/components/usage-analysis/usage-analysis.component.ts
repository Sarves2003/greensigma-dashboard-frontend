import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, switchMap, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

type SubTab = 'main' | 'demoCall' | 'assessment';
type UserTypeFilter = 'all' | 'Free' | 'Tribe' | 'Webinar';
type MainDatePreset = 'today' | 'yesterday' | 'last7days' | 'last15days' | 'thisMonth' | 'lastMonth' | 'custom';
type MainSortKey = keyof MainRow | 'daysSinceSignup';
type BookingPeriod = 'today' | 'yesterday' | 'custom';
type BookingTypeFilter = UserTypeFilter | 'unregistered';

interface RepeatBooker {
  phone: string;
  name: string;
  email: string | null;
  count: number;
  bookings: BookingRow[];
}

interface SlotCount {
  slot: string;
  count: number;
  isMax: boolean;
}

// Fixed, confirmed against both democall and assessments — every booking's preferredTime is one
// of exactly these 4 slots, not an open-ended value.
const TIME_SLOTS = ['9 AM - 12 PM', '12 PM - 3 PM', '3 PM - 6 PM', '6 PM - 8 PM'];

interface MainRow {
  id: string;
  name: string;
  mobile: string;
  email: string;
  type: string;
  referalCode: string | null;
  signedUpAt: string | null;
  lastLoginAt: string | null;
  demoCallCount: number;
  assessmentCount: number;
  btCount: number;
  usageScore: number;
}

interface BookingRow {
  id: string;
  name: string;
  mobile: string;
  email: string | null;
  preferredDate: string | null;
  preferredTime: string | null;
  status: string | null;
  createdAt: string | null;
  registered: boolean;
  matchedType: string | null;
  matchedReferalCode: string | null;
}

function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizePhoneClient(raw: string | null | undefined): string {
  return (raw || '').replace(/\D/g, '').slice(-10);
}

@Component({
  selector: 'app-usage-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usage-analysis.component.html',
  styleUrls: ['./usage-analysis.component.scss'],
})
export class UsageAnalysisComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;
  activeSubTab: SubTab = 'main';
  Math = Math;

  // ============ Main tab ============
  mainRows: MainRow[] = [];
  loadingMain = true;
  errorMain: string | null = null;

  mainDatePreset: MainDatePreset = 'thisMonth';
  mainStartDate = '';
  mainEndDate = '';
  mainType: UserTypeFilter = 'all';
  mainReferalCode = '';
  mainSearch = '';

  mainSortBy: MainSortKey = 'signedUpAt';
  mainSortOrder: 'asc' | 'desc' = 'desc';

  mainPageSizeOptions = [10, 25, 50, 100, 200];
  mainPageSize = 25;
  mainCurrentPage = 1;

  // ============ Demo Call tab ============
  demoRows: BookingRow[] = [];
  loadingDemo = true;
  errorDemo: string | null = null;
  demoPeriod: BookingPeriod = 'today';
  demoCustomStart = '';
  demoCustomEnd = '';
  demoType: BookingTypeFilter = 'all';
  demoReferalCode = '';
  demoDedupe = false;
  showDemoRepeatModal = false;
  demoSortBy: keyof BookingRow = 'createdAt';
  demoSortOrder: 'asc' | 'desc' = 'desc';
  demoPageSize = 25;
  demoCurrentPage = 1;

  // ============ Assessment tab ============
  assessRows: BookingRow[] = [];
  loadingAssess = true;
  errorAssess: string | null = null;
  assessPeriod: BookingPeriod = 'today';
  assessCustomStart = '';
  assessCustomEnd = '';
  assessType: BookingTypeFilter = 'all';
  assessReferalCode = '';
  assessDedupe = false;
  showAssessRepeatModal = false;
  assessSortBy: keyof BookingRow = 'createdAt';
  assessSortOrder: 'asc' | 'desc' = 'desc';
  assessPageSize = 25;
  assessCurrentPage = 1;

  pageSizeOptions = [10, 25, 50, 100, 200];

  private destroy$ = new Subject<void>();
  private mainTrigger$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    if (!this.authService.hasPermission(this.permissions.usageAnalysisMain)) {
      if (this.authService.hasPermission(this.permissions.usageAnalysisDemoCall)) {
        this.activeSubTab = 'demoCall';
      } else if (this.authService.hasPermission(this.permissions.usageAnalysisAssessment)) {
        this.activeSubTab = 'assessment';
      }
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    this.mainStartDate = toDateInput(monthStart);
    this.mainEndDate = toDateInput(now);

    // switchMap cancels a still-in-flight Main tab request when filters change again before it
    // resolves, so a slow stale response can never land after a faster one and overwrite it.
    this.mainTrigger$
      .pipe(
        debounceTime(350),
        switchMap(() => {
          this.loadingMain = true;
          this.errorMain = null;
          return this.apiService.getUsageAnalysisMain({
            startDate: this.mainStartDate,
            endDate: this.mainEndDate,
            type: this.mainType,
            referalCode: this.mainReferalCode,
            search: this.mainSearch,
          });
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.mainRows = response.data;
            this.mainCurrentPage = 1;
          } else {
            this.errorMain = 'Failed to load usage data';
          }
          this.loadingMain = false;
        },
        error: (error) => {
          this.errorMain = 'Failed to load usage data';
          console.error(error);
          this.loadingMain = false;
        },
      });

    this.loadMain();
    this.loadDemoCalls();
    this.loadAssessments();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setSubTab(tab: SubTab) {
    this.activeSubTab = tab;
  }

  // ============ Main tab ============
  loadMain() {
    this.mainTrigger$.next();
  }

  onMainDatePreset(preset: Exclude<MainDatePreset, 'custom'>) {
    this.mainDatePreset = preset;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let start: Date;
    let end: Date;

    switch (preset) {
      case 'today':
        start = today;
        end = today;
        break;
      case 'yesterday':
        start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        end = start;
        break;
      case 'last7days':
        start = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);
        end = today;
        break;
      case 'last15days':
        start = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
        end = today;
        break;
      case 'lastMonth':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'thisMonth':
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = today;
        break;
    }

    this.mainStartDate = toDateInput(start);
    this.mainEndDate = toDateInput(end);
    this.loadMain();
  }

  onMainCustomRangeChange() {
    if (this.mainStartDate && this.mainEndDate) {
      this.mainDatePreset = 'custom';
      this.loadMain();
    }
  }

  onMainTypeChange(type: UserTypeFilter) {
    this.mainType = type;
    this.loadMain();
  }

  onMainTextFilterChange() {
    this.loadMain();
  }

  onMainSort(column: MainSortKey) {
    if (this.mainSortBy === column) {
      this.mainSortOrder = this.mainSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.mainSortBy = column;
      this.mainSortOrder = 'desc';
    }
  }

  private static readonly MAIN_DATE_FIELDS = new Set(['signedUpAt', 'lastLoginAt']);

  // Generic string/number branching broke on lastLoginAt: it mixes real ISO strings with `null`
  // ("Never"), and `null - "2026-..."` produces NaN, which corrupts Array.sort's ordering well
  // beyond just the null rows. Date-ish columns are compared as timestamps explicitly instead,
  // with null treated as the oldest possible value so "Never" always sorts to the old end.
  get sortedMainRows(): MainRow[] {
    const rows = [...this.mainRows];
    const sortBy = this.mainSortBy;

    rows.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'daysSinceSignup') {
        comparison = this.daysSinceSignupValue(a.signedUpAt) - this.daysSinceSignupValue(b.signedUpAt);
      } else if (UsageAnalysisComponent.MAIN_DATE_FIELDS.has(sortBy)) {
        const rawA = a[sortBy as 'signedUpAt' | 'lastLoginAt'];
        const rawB = b[sortBy as 'signedUpAt' | 'lastLoginAt'];
        const timeA = rawA ? new Date(rawA).getTime() : -Infinity;
        const timeB = rawB ? new Date(rawB).getTime() : -Infinity;
        comparison = timeA - timeB;
      } else {
        const fieldA = a[sortBy as keyof MainRow];
        const fieldB = b[sortBy as keyof MainRow];
        if (typeof fieldA === 'string' && typeof fieldB === 'string') {
          comparison = fieldA.localeCompare(fieldB);
        } else {
          comparison = ((fieldA as any) || 0) - ((fieldB as any) || 0);
        }
      }

      return this.mainSortOrder === 'asc' ? comparison : -comparison;
    });
    return rows;
  }

  private daysSinceSignupValue(signedUpAt: string | null): number {
    if (!signedUpAt) return -Infinity;
    const end = this.mainEndDate ? new Date(`${this.mainEndDate}T23:59:59.999`) : new Date();
    return Math.floor((end.getTime() - new Date(signedUpAt).getTime()) / (24 * 60 * 60 * 1000));
  }

  daysSinceSignup(signedUpAt: string | null): string {
    if (!signedUpAt) return '-';
    const days = this.daysSinceSignupValue(signedUpAt);
    return days >= 0 ? `${days}` : '-';
  }

  get pagedMainRows(): MainRow[] {
    const start = (this.mainCurrentPage - 1) * this.mainPageSize;
    return this.sortedMainRows.slice(start, start + this.mainPageSize);
  }

  get mainTotalPages(): number {
    return Math.max(1, Math.ceil(this.mainRows.length / this.mainPageSize));
  }

  onMainPageSizeChange() {
    this.mainCurrentPage = 1;
  }

  mainPrevPage() {
    if (this.mainCurrentPage > 1) this.mainCurrentPage--;
  }

  mainNextPage() {
    if (this.mainCurrentPage < this.mainTotalPages) this.mainCurrentPage++;
  }

  // ============ Demo Call tab ============
  loadDemoCalls() {
    this.loadingDemo = true;
    this.errorDemo = null;
    this.apiService
      .getUsageAnalysisDemoCalls()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.demoRows = response.data;
          } else {
            this.errorDemo = 'Failed to load demo call bookings';
          }
          this.loadingDemo = false;
        },
        error: (error) => {
          this.errorDemo = 'Failed to load demo call bookings';
          console.error(error);
          this.loadingDemo = false;
        },
      });
  }

  // ============ Assessment tab ============
  loadAssessments() {
    this.loadingAssess = true;
    this.errorAssess = null;
    this.apiService
      .getUsageAnalysisAssessments()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.assessRows = response.data;
          } else {
            this.errorAssess = 'Failed to load assessment bookings';
          }
          this.loadingAssess = false;
        },
        error: (error) => {
          this.errorAssess = 'Failed to load assessment bookings';
          console.error(error);
          this.loadingAssess = false;
        },
      });
  }

  // ============ Shared booking-tab helpers (Demo Call + Assessment) ============
  private filterBookings(
    rows: BookingRow[],
    period: BookingPeriod,
    customStart: string,
    customEnd: string,
    type: BookingTypeFilter,
    referalCode: string
  ): BookingRow[] {
    let filtered = rows;

    const now = new Date();
    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;

    if (period === 'today') {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);
    } else if (period === 'yesterday') {
      rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      rangeStart = new Date(rangeEnd.getTime() - 24 * 60 * 60 * 1000);
    } else if (period === 'custom' && customStart && customEnd) {
      rangeStart = new Date(customStart);
      rangeEnd = new Date(customEnd);
      rangeEnd.setHours(23, 59, 59, 999);
    }

    if (rangeStart && rangeEnd) {
      filtered = filtered.filter((r) => {
        if (!r.createdAt) return false;
        const t = new Date(r.createdAt).getTime();
        return t >= rangeStart!.getTime() && t <= rangeEnd!.getTime();
      });
    }

    if (type === 'unregistered') {
      filtered = filtered.filter((r) => !r.registered);
    } else if (type !== 'all') {
      filtered = filtered.filter((r) => r.matchedType === type);
    }

    if (referalCode.trim()) {
      const needle = referalCode.trim().toLowerCase();
      filtered = filtered.filter((r) => (r.matchedReferalCode || '').toLowerCase().includes(needle));
    }

    return filtered;
  }

  // Groups by normalized phone; a "duplicate" is the same person (or same unregistered phone
  // number) showing up more than once in the currently filtered set — they reached out more than
  // once, which is a signal worth surfacing, not just noise to hide.
  private groupByPhone(rows: BookingRow[]): Map<string, BookingRow[]> {
    const map = new Map<string, BookingRow[]>();
    for (const r of rows) {
      const key = normalizePhoneClient(r.mobile);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return map;
  }

  // When "exclude duplicates" is checked, collapse to one row per person — the most recent booking,
  // since that's the one sales actually needs to act on.
  private dedupeBookings(rows: BookingRow[]): BookingRow[] {
    const groups = this.groupByPhone(rows);
    const result: BookingRow[] = [];
    groups.forEach((group) => {
      const latest = group.reduce((best, r) => {
        const bestTime = best.createdAt ? new Date(best.createdAt).getTime() : -Infinity;
        const rTime = r.createdAt ? new Date(r.createdAt).getTime() : -Infinity;
        return rTime > bestTime ? r : best;
      });
      result.push(latest);
    });
    return result;
  }

  private repeatBookers(rows: BookingRow[]): RepeatBooker[] {
    const groups = this.groupByPhone(rows);
    const repeats: RepeatBooker[] = [];
    groups.forEach((bookings, phone) => {
      if (bookings.length < 2) return;
      const sorted = [...bookings].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
      repeats.push({ phone, name: sorted[0].name, email: sorted[0].email, count: sorted.length, bookings: sorted });
    });
    return repeats.sort((a, b) => b.count - a.count);
  }

  // Raw booking counts per time slot (not deduped) — this is about call-volume demand per slot for
  // staffing, so a person booking the same slot twice should count twice, unlike the repeat-booker
  // card which is about identifying who those repeat people are.
  private slotCounts(rows: BookingRow[]): SlotCount[] {
    const counts = TIME_SLOTS.map((slot) => ({
      slot,
      count: rows.filter((r) => r.preferredTime === slot).length,
    }));
    const max = Math.max(...counts.map((c) => c.count), 0);
    return counts.map((c) => ({ ...c, isMax: max > 0 && c.count === max }));
  }

  private sortBookings(rows: BookingRow[], sortBy: keyof BookingRow, sortOrder: 'asc' | 'desc'): BookingRow[] {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const fieldA = a[sortBy];
      const fieldB = b[sortBy];
      let comparison = 0;
      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        comparison = fieldA.localeCompare(fieldB);
      } else if (typeof fieldA === 'boolean') {
        comparison = (fieldA === fieldB) ? 0 : fieldA ? 1 : -1;
      } else {
        comparison = ((fieldA as any) || 0) - ((fieldB as any) || 0);
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }

  // Pre-dedupe: what the period/type/referral filters match, before "exclude duplicates" collapses
  // repeat bookers to one row. The repeat-booker card/count is always computed from this, since
  // its whole point is showing who has duplicates — collapsing first would erase what it's counting.
  get demoFilteredRaw(): BookingRow[] {
    return this.filterBookings(this.demoRows, this.demoPeriod, this.demoCustomStart, this.demoCustomEnd, this.demoType, this.demoReferalCode);
  }

  get demoRepeatBookers(): RepeatBooker[] {
    return this.repeatBookers(this.demoFilteredRaw);
  }

  get demoSlotCounts(): SlotCount[] {
    return this.slotCounts(this.demoFilteredRaw);
  }

  get filteredDemoRows(): BookingRow[] {
    const rows = this.demoDedupe ? this.dedupeBookings(this.demoFilteredRaw) : this.demoFilteredRaw;
    return this.sortBookings(rows, this.demoSortBy, this.demoSortOrder);
  }

  get pagedDemoRows(): BookingRow[] {
    const start = (this.demoCurrentPage - 1) * this.demoPageSize;
    return this.filteredDemoRows.slice(start, start + this.demoPageSize);
  }

  get demoTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredDemoRows.length / this.demoPageSize));
  }

  get assessFilteredRaw(): BookingRow[] {
    return this.filterBookings(this.assessRows, this.assessPeriod, this.assessCustomStart, this.assessCustomEnd, this.assessType, this.assessReferalCode);
  }

  get assessRepeatBookers(): RepeatBooker[] {
    return this.repeatBookers(this.assessFilteredRaw);
  }

  get assessSlotCounts(): SlotCount[] {
    return this.slotCounts(this.assessFilteredRaw);
  }

  get filteredAssessRows(): BookingRow[] {
    const rows = this.assessDedupe ? this.dedupeBookings(this.assessFilteredRaw) : this.assessFilteredRaw;
    return this.sortBookings(rows, this.assessSortBy, this.assessSortOrder);
  }

  get pagedAssessRows(): BookingRow[] {
    const start = (this.assessCurrentPage - 1) * this.assessPageSize;
    return this.filteredAssessRows.slice(start, start + this.assessPageSize);
  }

  get assessTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredAssessRows.length / this.assessPageSize));
  }

  onDemoPeriodChange(period: BookingPeriod) {
    this.demoPeriod = period;
    this.demoCurrentPage = 1;
  }

  onDemoTypeChange(type: BookingTypeFilter) {
    this.demoType = type;
    this.demoCurrentPage = 1;
  }

  onDemoCustomChange() {
    if (this.demoCustomStart && this.demoCustomEnd) {
      this.demoPeriod = 'custom';
      this.demoCurrentPage = 1;
    }
  }

  onDemoReferalCodeChange() {
    this.demoCurrentPage = 1;
  }

  onDemoDedupeToggle() {
    this.demoCurrentPage = 1;
  }

  openDemoRepeatModal() {
    this.showDemoRepeatModal = true;
  }

  closeDemoRepeatModal() {
    this.showDemoRepeatModal = false;
  }

  onDemoSort(column: keyof BookingRow) {
    if (this.demoSortBy === column) {
      this.demoSortOrder = this.demoSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.demoSortBy = column;
      this.demoSortOrder = 'desc';
    }
  }

  demoPrevPage() {
    if (this.demoCurrentPage > 1) this.demoCurrentPage--;
  }

  demoNextPage() {
    if (this.demoCurrentPage < this.demoTotalPages) this.demoCurrentPage++;
  }

  onAssessPeriodChange(period: BookingPeriod) {
    this.assessPeriod = period;
    this.assessCurrentPage = 1;
  }

  onAssessTypeChange(type: BookingTypeFilter) {
    this.assessType = type;
    this.assessCurrentPage = 1;
  }

  onAssessCustomChange() {
    if (this.assessCustomStart && this.assessCustomEnd) {
      this.assessPeriod = 'custom';
      this.assessCurrentPage = 1;
    }
  }

  onAssessReferalCodeChange() {
    this.assessCurrentPage = 1;
  }

  onAssessDedupeToggle() {
    this.assessCurrentPage = 1;
  }

  openAssessRepeatModal() {
    this.showAssessRepeatModal = true;
  }

  closeAssessRepeatModal() {
    this.showAssessRepeatModal = false;
  }

  onAssessSort(column: keyof BookingRow) {
    if (this.assessSortBy === column) {
      this.assessSortOrder = this.assessSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.assessSortBy = column;
      this.assessSortOrder = 'desc';
    }
  }

  assessPrevPage() {
    if (this.assessCurrentPage > 1) this.assessCurrentPage--;
  }

  assessNextPage() {
    if (this.assessCurrentPage < this.assessTotalPages) this.assessCurrentPage++;
  }

  // ============ Formatting helpers ============
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

  relativeTime(iso: string | null): string {
    if (!iso) return 'Never';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
}
