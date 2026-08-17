import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

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

type SortKey = 'name' | 'phone' | 'paymentStatus';

@Component({
  selector: 'app-emandate-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
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
            const rows: EmandateRow[] = response.data.rows || [];
            this.rows = rows.map((r) => ({
              ...r,
              settled: r.paymentStatus === 'Full Paid' || (r.payment2?.status === 'captured' && r.payment3?.status === 'captured'),
            }));
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
