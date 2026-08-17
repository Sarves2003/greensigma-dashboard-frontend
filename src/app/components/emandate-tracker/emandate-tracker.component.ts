import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { ChartComponent } from '../shared/chart/chart.component';

interface WebinarDate {
  _id: string;
  date: string;
  label: string;
}

type PaymentStatus = 'Full Paid' | 'Emandate' | 'Refunded' | 'Cancelled' | 'Pending';
type MandateState = 'active' | 'cancelled' | 'halted' | 'not_done' | 'not_applicable';

interface EmandateDayPayment {
  date: string | null;
  status: 'captured' | 'refunded' | null;
}

interface EmandateRow {
  name: string;
  phone: string;
  email: string;
  paymentStatus: PaymentStatus;
  payment2: EmandateDayPayment | null;
  payment3: EmandateDayPayment | null;
  mandateState: MandateState;
  remark: string;
  settled: boolean;
  paymentDoneCount: number;
}

interface EmandateSummary {
  totalInitialPaid: number;
  totalFullPaid: number;
  remaining: number;
  completed: number;
  completedPct: number;
  notDone: number;
  cancelled: number;
  halted: number;
  emandateEraApplies: boolean;
}

interface OverviewBucketUser {
  name: string;
  phone: string;
  batchDate: string;
  paymentDoneCount: number;
  settled: boolean;
}

interface EmandateOverview {
  totalOwesEmandate: number;
  completed: number;
  completedPct: number;
  notDone: number;
  notDonePct: number;
  cancelled: number;
  cancelledPct: number;
  halted: number;
  haltedPct: number;
  emandateEraApplies: boolean;
  buckets: { notDone: OverviewBucketUser[]; cancelled: OverviewBucketUser[]; halted: OverviewBucketUser[] };
  chart: { batchDate: string; initialCompletionPct: number | null; fullPaymentCompletionPct: number | null }[];
}

type SortKey = 'name' | 'phone' | 'paymentStatus';
type OverviewFilterMode = 'this' | 'previous' | 'last2' | 'custom';
type OverviewBucketKey = 'notDone' | 'cancelled' | 'halted';

@Component({
  selector: 'app-emandate-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartComponent],
  templateUrl: './emandate-tracker.component.html',
  styleUrls: ['./emandate-tracker.component.scss'],
})
export class EmandateTrackerComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;
  paymentStatusOptions: PaymentStatus[] = ['Full Paid', 'Emandate', 'Refunded', 'Cancelled', 'Pending'];

  webinarDates: WebinarDate[] = [];
  loadingDates = true;
  selectedDate = '';

  showDateManager = false;
  newDateInput = '';
  dateManagerError: string | null = null;

  rows: EmandateRow[] = [];
  summary: EmandateSummary | null = null;
  loadingTable = false;
  errorTable: string | null = null;

  sortBy: SortKey = 'name';
  sortOrder: 'asc' | 'desc' = 'asc';

  searchQuery = '';
  mandateFilter: MandateState | 'all' = 'all';
  mandateFilterOptions: { value: MandateState | 'all'; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Completed' },
    { value: 'not_done', label: 'Not At All Done' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'halted', label: 'Halted' },
  ];

  filteredRows: EmandateRow[] = [];
  sortedRows: EmandateRow[] = [];
  pagedRows: EmandateRow[] = [];

  pageSizeOptions = [5, 10, 25, 50, 100];
  pageSize = 5;
  currentPage = 1;
  totalPages = 1;

  remarkSaving = new Set<string>();
  statusSaving = new Set<string>();

  showBucketModal = false;
  bucketModalTitle = '';
  bucketModalRows: EmandateRow[] = [];

  overviewFilter: OverviewFilterMode = 'this';
  overviewFilterOptions: { value: OverviewFilterMode; label: string }[] = [
    { value: 'this', label: 'This Batch' },
    { value: 'previous', label: 'Previous Batch' },
    { value: 'last2', label: 'Last 2 Batches' },
    { value: 'custom', label: 'Custom' },
  ];
  customDates: string[] = [];

  overview: EmandateOverview | null = null;
  loadingOverview = false;
  errorOverview: string | null = null;
  initialCompletionChartData: { label: string; value: number }[] = [];
  fullPaymentChartData: { label: string; value: number }[] = [];

  showOverviewBucketModal = false;
  overviewBucketTitle = '';
  overviewBucketUsers: OverviewBucketUser[] = [];

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.loadWebinarDates();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWebinarDates() {
    this.loadingDates = true;
    this.apiService
      .getWebinarBatchDates()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.webinarDates = response.data;
            if (!this.selectedDate && this.webinarDates.length > 0) {
              const latest = [...this.webinarDates].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
              this.selectedDate = latest.date.slice(0, 10);
              this.loadTable();
              this.loadOverview();
            }
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
          }
        },
        error: (error) => {
          this.dateManagerError = 'Failed to remove date';
          console.error(error);
        },
      });
  }

  onDateChange() {
    this.loadTable();
    if (this.overviewFilter !== 'custom') this.loadOverview();
  }

  loadTable() {
    if (!this.selectedDate) return;
    this.loadingTable = true;
    this.errorTable = null;

    this.apiService
      .getEmandateTable(this.selectedDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.rows = response.data.rows || [];
            this.summary = response.data.summary || null;
            this.currentPage = 1;
            this.refresh();
          } else {
            this.errorTable = 'Failed to load emandate table';
          }
          this.loadingTable = false;
        },
        error: (error) => {
          this.errorTable = 'Failed to load emandate table';
          console.error(error);
          this.loadingTable = false;
        },
      });
  }

  // Sorted oldest-to-newest so "Previous"/"Last 2" and the chart both read left-to-right
  // chronologically.
  private get sortedWebinarDates(): WebinarDate[] {
    return [...this.webinarDates].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  private resolveOverviewDateKeys(): string[] {
    const sorted = this.sortedWebinarDates;
    const keys = sorted.map((d) => d.date.slice(0, 10));
    const currentIndex = keys.indexOf(this.selectedDate);

    switch (this.overviewFilter) {
      case 'this':
        return currentIndex >= 0 ? [keys[currentIndex]] : [];
      case 'previous':
        return currentIndex > 0 ? [keys[currentIndex - 1]] : [];
      case 'last2':
        return currentIndex > 0 ? [keys[currentIndex - 1], keys[currentIndex]] : currentIndex === 0 ? [keys[0]] : [];
      case 'custom':
        return [...this.customDates].sort();
      default:
        return [];
    }
  }

  dateLabelFor(dateKey: string): string {
    return this.webinarDates.find((d) => d.date.slice(0, 10) === dateKey)?.label || dateKey;
  }

  onOverviewFilterChange() {
    if (this.overviewFilter !== 'custom') this.loadOverview();
    else if (this.customDates.length > 0) this.loadOverview();
    else {
      this.overview = null;
      this.initialCompletionChartData = [];
      this.fullPaymentChartData = [];
    }
  }

  toggleCustomDate(dateKey: string) {
    const idx = this.customDates.indexOf(dateKey);
    if (idx >= 0) this.customDates.splice(idx, 1);
    else this.customDates.push(dateKey);
    if (this.overviewFilter === 'custom') this.loadOverview();
  }

  loadOverview() {
    const dateKeys = this.resolveOverviewDateKeys();
    if (dateKeys.length === 0) {
      this.overview = null;
      this.initialCompletionChartData = [];
      this.fullPaymentChartData = [];
      this.errorOverview = this.overviewFilter === 'previous' || this.overviewFilter === 'last2'
        ? 'No earlier batch exists before the selected one.'
        : null;
      return;
    }

    this.loadingOverview = true;
    this.errorOverview = null;

    this.apiService
      .getEmandateOverview(dateKeys)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.overview = response.data;
            this.initialCompletionChartData = response.data.chart.map((c: any) => ({
              label: this.dateLabelFor(c.batchDate),
              value: c.initialCompletionPct ?? 0,
            }));
            this.fullPaymentChartData = response.data.chart.map((c: any) => ({
              label: this.dateLabelFor(c.batchDate),
              value: c.fullPaymentCompletionPct ?? 0,
            }));
          } else {
            this.errorOverview = 'Failed to load overview';
          }
          this.loadingOverview = false;
        },
        error: (error) => {
          this.errorOverview = 'Failed to load overview';
          console.error(error);
          this.loadingOverview = false;
        },
      });
  }

  openOverviewBucketModal(bucket: OverviewBucketKey, title: string) {
    if (!this.overview) return;
    this.overviewBucketTitle = title;
    this.overviewBucketUsers = this.overview.buckets[bucket];
    this.showOverviewBucketModal = true;
  }

  closeOverviewBucketModal() {
    this.showOverviewBucketModal = false;
  }

  onSort(key: SortKey) {
    if (this.sortBy === key) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = key;
      this.sortOrder = 'asc';
    }
    this.refresh();
  }

  onSearchChange() {
    this.currentPage = 1;
    this.refresh();
  }

  onMandateFilterChange() {
    this.currentPage = 1;
    this.refresh();
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.refresh();
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.refresh();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.refresh();
    }
  }

  private refresh() {
    let filtered = this.rows;

    if (this.mandateFilter !== 'all') {
      filtered = filtered.filter((r) => r.mandateState === this.mandateFilter);
    }

    const query = this.searchQuery.trim().toLowerCase();
    if (query) {
      filtered = filtered.filter(
        (r) => r.name.toLowerCase().includes(query) || r.phone.includes(query) || r.email.toLowerCase().includes(query)
      );
    }
    this.filteredRows = filtered;

    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const fieldA = a[this.sortBy];
      const fieldB = b[this.sortBy];
      const comparison = String(fieldA).localeCompare(String(fieldB));
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });
    this.sortedRows = sorted;

    this.totalPages = Math.max(1, Math.ceil(sorted.length / this.pageSize));
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    const start = (this.currentPage - 1) * this.pageSize;
    this.pagedRows = sorted.slice(start, start + this.pageSize);
  }

  get pageRangeStart(): number {
    return this.filteredRows.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageRangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredRows.length);
  }

  openBucketModal(bucket: MandateState, title: string) {
    this.bucketModalTitle = title;
    this.bucketModalRows = this.rows.filter((r) => r.mandateState === bucket);
    this.showBucketModal = true;
  }

  closeBucketModal() {
    this.showBucketModal = false;
  }

  onStatusChange(row: EmandateRow) {
    this.statusSaving.add(row.phone);
    this.apiService
      .saveEmandateStatusOverride(row.phone, this.selectedDate, row.paymentStatus)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.statusSaving.delete(row.phone);
          // A status change shifts which summary bucket this row belongs to (e.g. Full Paid vs.
          // still owing an emandate), so the cards need a full reload to stay correct.
          this.loadTable();
        },
        error: (error) => {
          console.error(error);
          this.statusSaving.delete(row.phone);
        },
      });
  }

  onRemarkChange(row: EmandateRow) {
    this.remarkSaving.add(row.phone);
    this.apiService
      .saveEmandateRemark(row.phone, this.selectedDate, row.remark)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.remarkSaving.delete(row.phone),
        error: (error) => {
          console.error(error);
          this.remarkSaving.delete(row.phone);
        },
      });
  }

  mandateStateLabel(state: MandateState): string {
    switch (state) {
      case 'active': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'halted': return 'Halted';
      case 'not_done': return 'Not Done';
      default: return '—';
    }
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
