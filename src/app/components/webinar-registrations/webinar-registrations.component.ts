import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

type PersonStatus = 'success' | 'failed' | 'notpaid';
type RegCategory = PersonStatus | 'all';
type SortDir = 'asc' | 'desc';

interface WebinarRegSummaryRow {
  id: string;
  webinarType: string;
  webinarDate: string;
  webinarDateISO: string;
  webinarTime: string;
  label: string;
  totalDocs: number;
}

interface RegistrationPersonRow {
  key: string;
  name: string;
  phone: string;
  email: string | null;
  source: string | null;
  attempts: number;
  amount: number | null;
  paymentMethod: string | null;
  welcomeMessageSent: boolean;
  status: PersonStatus;
  firstAttemptAt: string;
  paidAt: string | null;
}

interface WebinarRegSummary {
  totalRegistered: number;
  failed: number;
  notPaid: number;
  amountCollected: number;
  welcomeMessageSent: number;
  totalAttempts: number;
  totalDistinctPeople: number;
}

interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Live ₹79/₹99 webinar checkout funnel, sourced directly from the `webinar_registrations` Mongo
// collection (a real-time payment transaction log — Razorpay order-per-attempt, not one row per
// person). Built for marketing to pull call/WhatsApp lists of people who started checkout but never
// finished paying, per webinar date. Entirely independent of the Zoom Analysis sub-tab's data (that
// one is driven by uploaded Zoom CSVs + the older funnel Google Sheets).
@Component({
  selector: 'app-webinar-registrations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './webinar-registrations.component.html',
  styleUrls: ['./webinar-registrations.component.scss'],
})
export class WebinarRegistrationsComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  webinars: WebinarRegSummaryRow[] = [];
  listLoading = true;
  listError: string | null = null;
  selectedWebinarId: string | null = null;

  summary: WebinarRegSummary | null = null;
  summaryLoading = false;
  summaryError: string | null = null;

  activeCategory: RegCategory = 'success';
  table: PagedResult<RegistrationPersonRow> | null = null;
  tableLoading = false;
  tableError: string | null = null;
  page = 1;
  pageSize = 20;
  sortBy: string | null = null;
  sortDir: SortDir = 'desc';
  searchInput = '';
  private search$ = new Subject<void>();

  showDownloadModal = false;
  downloadFormat: 'raw' | 'aisensy' = 'raw';
  downloadTagInput = '';

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.search$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => {
      this.page = 1;
      this.loadTable();
    });
    this.loadWebinarList();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadWebinarList() {
    this.listLoading = true;
    this.listError = null;
    this.apiService
      .getWebinarRegistrationsList()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) {
            this.webinars = res.data;
            if (this.webinars.length > 0) this.selectWebinar(this.webinars[0].id);
          } else {
            this.listError = res.error || 'Failed to load webinars';
          }
          this.listLoading = false;
        },
        error: (err) => {
          this.listError = err?.error?.error || 'Failed to load webinars';
          this.listLoading = false;
        },
      });
  }

  onWebinarChange(id: string) {
    this.selectWebinar(id);
  }

  private selectWebinar(id: string) {
    this.selectedWebinarId = id;
    this.activeCategory = 'success';
    this.page = 1;
    this.sortBy = null;
    this.sortDir = 'desc';
    this.searchInput = '';
    this.loadSummary();
    this.loadTable();
  }

  get selectedWebinar(): WebinarRegSummaryRow | undefined {
    return this.webinars.find((w) => w.id === this.selectedWebinarId);
  }

  get selectedWebinarLabel(): string {
    const w = this.selectedWebinar;
    return w ? `${w.label} · ${w.webinarTime}` : '';
  }

  loadSummary() {
    if (!this.selectedWebinarId) return;
    this.summaryLoading = true;
    this.summaryError = null;
    this.apiService
      .getWebinarRegistrationsSummary(this.selectedWebinarId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) this.summary = res.data;
          else this.summaryError = res.error || 'Failed to load summary';
          this.summaryLoading = false;
        },
        error: (err) => {
          this.summaryError = err?.error?.error || 'Failed to load summary';
          this.summaryLoading = false;
        },
      });
  }

  setCategory(cat: RegCategory) {
    this.activeCategory = cat;
    this.page = 1;
    this.sortBy = null;
    this.sortDir = 'desc';
    this.loadTable();
  }

  loadTable() {
    if (!this.selectedWebinarId) return;
    this.tableLoading = true;
    this.tableError = null;
    this.apiService
      .getWebinarRegistrationsTable(this.selectedWebinarId, this.activeCategory, this.page, this.pageSize, this.sortBy || undefined, this.sortDir, this.searchInput.trim() || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.success && res.data) this.table = res.data;
          else this.tableError = res.error || 'Failed to load table';
          this.tableLoading = false;
        },
        error: (err) => {
          this.tableError = err?.error?.error || 'Failed to load table';
          this.tableLoading = false;
        },
      });
  }

  // Re-fetches the summary cards + current table for the selected webinar only — this is a live
  // payment collection, so counts genuinely change minute to minute while someone's looking at it.
  // Deliberately doesn't touch the webinar list/dropdown, so the current selection, filters, sort
  // and page all stay exactly where they were.
  get isRefreshing(): boolean {
    return this.summaryLoading || this.tableLoading;
  }

  refresh() {
    if (!this.selectedWebinarId) return;
    this.loadSummary();
    this.loadTable();
  }

  get totalPages(): number {
    if (!this.table) return 1;
    return Math.max(1, Math.ceil(this.table.total / this.table.pageSize));
  }

  goToPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.page = page;
    this.loadTable();
  }

  onPageSizeChange(size: number) {
    this.pageSize = Number(size);
    this.page = 1;
    this.loadTable();
  }

  toggleSort(field: string) {
    if (this.sortBy === field) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.sortBy = field;
      this.sortDir = 'asc';
    }
    this.loadTable();
  }

  onSearchInput() {
    this.search$.next();
  }

  get categoryTitle(): string {
    if (this.activeCategory === 'success') return 'Total Registered (Paid)';
    if (this.activeCategory === 'failed') return 'Failed';
    if (this.activeCategory === 'all') return 'All Checkout Attempts';
    return 'Not Paid';
  }

  get categoryNote(): string {
    if (this.activeCategory === 'success') return 'Everyone with at least one successful payment for this webinar.';
    if (this.activeCategory === 'failed')
      return 'Never paid, and at least one attempt was explicitly declined — ignoring anyone who went on to pay on a later attempt.';
    if (this.activeCategory === 'all')
      return 'Every distinct person tracked for this webinar, regardless of outcome — Paid, Failed and Not Paid together. Still one row per person with their own attempt count, not one row per transaction.';
    return 'Started checkout but never completed it — no success, no explicit decline either, just abandoned. This is this collection\'s transaction log, so someone can show up here and still be a live prospect: re-check before writing them off.';
  }

  statusLabel(status: PersonStatus): string {
    if (status === 'success') return 'Paid';
    if (status === 'failed') return 'Failed';
    return 'Not Paid';
  }

  formatINR(n: number): string {
    return '₹' + Math.round(n).toLocaleString('en-IN');
  }

  get welcomeMessagePct(): number {
    if (!this.summary || this.summary.totalRegistered === 0) return 0;
    return Math.round((this.summary.welcomeMessageSent / this.summary.totalRegistered) * 1000) / 10;
  }

  // ============ Download format picker ============
  openDownloadModal() {
    this.downloadFormat = 'raw';
    this.downloadTagInput = '';
    this.showDownloadModal = true;
  }

  closeDownloadModal() {
    this.showDownloadModal = false;
  }

  confirmDownload() {
    if (!this.selectedWebinarId) return;
    const format = this.downloadFormat;
    const tag = this.downloadTagInput.trim();
    const webinarSlug = this.selectedWebinar?.webinarDateISO || this.selectedWebinarId;
    this.apiService
      .downloadWebinarRegistrationsCsv(this.selectedWebinarId, this.activeCategory, this.sortBy || undefined, this.sortDir, this.searchInput.trim() || undefined, format, tag)
      .pipe(takeUntil(this.destroy$))
      .subscribe((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const suffix = format === 'aisensy' ? '-aisensy' : '';
        a.download = `webinar-registrations-${this.activeCategory}${suffix}-${webinarSlug}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      });
    this.closeDownloadModal();
  }
}
