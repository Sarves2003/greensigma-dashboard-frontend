import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { ChartComponent } from '../shared/chart/chart.component';

interface HoldingPnl {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  entryPrice: number;
  lastPrice: number;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
}

interface PortfolioPnl {
  portfolioId: string;
  userId: string;
  portfolioName: string;
  createdAt?: string;
  updatedAt?: string;
  fromBacktest: boolean;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  rebalanceCount: number;
  stocksTraded: number;
  holdings: HoldingPnl[];
}

interface ContactInfo {
  userId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
}

interface HistogramBin {
  label: string;
  min: number;
  max: number;
}

const HISTOGRAM_BINS: HistogramBin[] = [
  { label: '< -50%', min: -Infinity, max: -50 },
  { label: '-50% to -25%', min: -50, max: -25 },
  { label: '-25% to 0%', min: -25, max: 0 },
  { label: '0% to 25%', min: 0, max: 25 },
  { label: '25% to 50%', min: 25, max: 50 },
  { label: '50% to 100%', min: 50, max: 100 },
  { label: '> 100%', min: 100, max: Infinity },
];

@Component({
  selector: 'app-unrealized-pnl',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartComponent],
  templateUrl: './unrealized-pnl.component.html',
  styleUrls: ['./unrealized-pnl.component.scss'],
})
export class UnrealizedPnlComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  loading = true;
  error: string | null = null;

  portfolios: PortfolioPnl[] = [];
  filteredPortfolios: PortfolioPnl[] = [];
  pagedPortfolios: PortfolioPnl[] = [];

  pageSizeOptions = [10, 25, 50, 100, 200];
  pageSize = 25;
  currentPage = 1;
  totalPages = 1;

  searchQuery = '';
  sortBy: string = 'pnl';
  sortOrder: 'asc' | 'desc' = 'desc';

  // Date filters — optional, unselected by default
  createdFrom = '';
  createdTo = '';
  updatedFrom = '';
  updatedTo = '';

  // Automated vs manual (fromBacktest)
  portfolioTypeFilter: 'all' | 'automated' | 'manual' = 'all';

  // Inactivity filter — two independent, user-adjustable thresholds
  excludeInactive = false;
  staleUpdateMonths = 2;
  noRebalanceMonths = 2;

  selectedPortfolio: PortfolioPnl | null = null;
  showDetailModal = false;
  filteredHoldings: HoldingPnl[] = [];
  holdingSearchQuery = '';
  holdingSortBy: string = 'pnl';
  holdingSortOrder: 'asc' | 'desc' = 'desc';
  holdingPositiveCount = 0;
  holdingNegativeCount = 0;

  // Client list export
  showExportModal = false;
  exportTopN = 5;
  exportFormat: 'aisensy' | 'periskope' = 'aisensy';
  exportSource = '';
  exportTags = '';
  exportStatus: string | null = null;
  exportLoading = false;

  totals = { invested: 0, current: 0, pnl: 0 };
  positiveCount = 0;
  negativeCount = 0;
  winner: PortfolioPnl | null = null;
  loser: PortfolioPnl | null = null;
  histogramData: { bin: string; count: number }[] = [];

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load() {
    this.loading = true;
    this.error = null;

    this.apiService
      .getUnrealizedPnl()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.portfolios = response.data;
            this.applySortAndFilter();
          }
          this.loading = false;
        },
        error: (error) => {
          this.error = 'Failed to load unrealized P&L data';
          console.error(error);
          this.loading = false;
        },
      });
  }

  isInactive(p: PortfolioPnl): boolean {
    const dayMs = 1000 * 60 * 60 * 24;
    const now = Date.now();

    const updatedAgeDays = p.updatedAt ? (now - new Date(p.updatedAt).getTime()) / dayMs : Infinity;
    const createdAgeDays = p.createdAt ? (now - new Date(p.createdAt).getTime()) / dayMs : 0;

    const staleUpdate = updatedAgeDays > this.staleUpdateMonths * 30;
    const neverRebalanced = createdAgeDays > this.noRebalanceMonths * 30 && (p.rebalanceCount || 0) === 0;

    return staleUpdate || neverRebalanced;
  }

  onSearch(query: string) {
    this.searchQuery = query;
    this.applySortAndFilter();
  }

  onSort(column: string) {
    if (this.sortBy === column) {
      this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortBy = column;
      this.sortOrder = 'desc';
    }
    this.applySortAndFilter();
  }

  onPortfolioTypeChange(type: 'all' | 'automated' | 'manual') {
    this.portfolioTypeFilter = type;
    this.applySortAndFilter();
  }

  onInactiveSettingsChange() {
    this.applySortAndFilter();
  }

  applySortAndFilter() {
    let filtered = [...this.portfolios];

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.userId?.toLowerCase().includes(query) ||
          p.portfolioName?.toLowerCase().includes(query)
      );
    }

    filtered = this.filterByDateRange(filtered, 'createdAt', this.createdFrom, this.createdTo);
    filtered = this.filterByDateRange(filtered, 'updatedAt', this.updatedFrom, this.updatedTo);

    if (this.portfolioTypeFilter === 'automated') {
      filtered = filtered.filter((p) => p.fromBacktest);
    } else if (this.portfolioTypeFilter === 'manual') {
      filtered = filtered.filter((p) => !p.fromBacktest);
    }

    if (this.excludeInactive) {
      filtered = filtered.filter((p) => !this.isInactive(p));
    }

    filtered.sort((a: any, b: any) => {
      let fieldA = a[this.sortBy];
      let fieldB = b[this.sortBy];

      if (this.sortBy === 'createdAt' || this.sortBy === 'updatedAt') {
        fieldA = fieldA ? new Date(fieldA).getTime() : 0;
        fieldB = fieldB ? new Date(fieldB).getTime() : 0;
      }

      let comparison = 0;
      if (typeof fieldA === 'string') {
        comparison = fieldA.localeCompare(fieldB);
      } else {
        comparison = (fieldA || 0) - (fieldB || 0);
      }

      return this.sortOrder === 'asc' ? comparison : -comparison;
    });

    this.filteredPortfolios = filtered;
    this.computeTotals();
    this.computeCounts();
    this.computeWinnerLoser();
    this.computeHistogram();
    this.currentPage = 1;
    this.updatePagination();
  }

  private updatePagination() {
    this.totalPages = Math.max(1, Math.ceil(this.filteredPortfolios.length / this.pageSize));
    if (this.currentPage > this.totalPages) {
      this.currentPage = this.totalPages;
    }
    const start = (this.currentPage - 1) * this.pageSize;
    this.pagedPortfolios = this.filteredPortfolios.slice(start, start + this.pageSize);
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.updatePagination();
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.updatePagination();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.updatePagination();
    }
  }

  get pageRangeStart(): number {
    return this.filteredPortfolios.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageRangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredPortfolios.length);
  }

  private computeTotals() {
    this.totals = this.filteredPortfolios.reduce(
      (acc, p) => {
        acc.invested += p.investedValue;
        acc.current += p.currentValue;
        acc.pnl += p.pnl;
        return acc;
      },
      { invested: 0, current: 0, pnl: 0 }
    );
  }

  private computeCounts() {
    this.positiveCount = this.filteredPortfolios.filter((p) => p.pnl >= 0).length;
    this.negativeCount = this.filteredPortfolios.filter((p) => p.pnl < 0).length;
  }

  private computeWinnerLoser() {
    if (this.filteredPortfolios.length === 0) {
      this.winner = null;
      this.loser = null;
      return;
    }

    this.winner = this.filteredPortfolios.reduce((best, p) =>
      p.pnlPercent > best.pnlPercent ? p : best
    );
    this.loser = this.filteredPortfolios.reduce((worst, p) =>
      p.pnlPercent < worst.pnlPercent ? p : worst
    );
  }

  private computeHistogram() {
    this.histogramData = HISTOGRAM_BINS.map((bin) => ({
      bin: bin.label,
      count: this.filteredPortfolios.filter((p) => p.pnlPercent >= bin.min && p.pnlPercent < bin.max)
        .length,
    }));
  }

  private filterByDateRange(
    list: PortfolioPnl[],
    field: 'createdAt' | 'updatedAt',
    from: string,
    to: string
  ): PortfolioPnl[] {
    if (!from && !to) {
      return list;
    }

    const fromTime = from ? new Date(from).getTime() : null;
    let toTime: number | null = null;
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      toTime = toDate.getTime();
    }

    return list.filter((p) => {
      const value = p[field];
      if (!value) return false;
      const time = new Date(value).getTime();
      if (fromTime !== null && time < fromTime) return false;
      if (toTime !== null && time > toTime) return false;
      return true;
    });
  }

  onDateFilterChange() {
    this.applySortAndFilter();
  }

  clearCreatedFilter() {
    this.createdFrom = '';
    this.createdTo = '';
    this.applySortAndFilter();
  }

  clearUpdatedFilter() {
    this.updatedFrom = '';
    this.updatedTo = '';
    this.applySortAndFilter();
  }

  setThisMonth(field: 'created' | 'updated') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.setDateRange(field, start, end);
  }

  setLastMonth(field: 'created' | 'updated') {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    this.setDateRange(field, start, end);
  }

  private setDateRange(field: 'created' | 'updated', start: Date, end: Date) {
    const toInputValue = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    if (field === 'created') {
      this.createdFrom = toInputValue(start);
      this.createdTo = toInputValue(end);
    } else {
      this.updatedFrom = toInputValue(start);
      this.updatedTo = toInputValue(end);
    }
    this.applySortAndFilter();
  }

  formatDate(value: any): string {
    if (!value) return '-';
    const d = new Date(value);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
  }

  openDetail(portfolio: PortfolioPnl) {
    this.selectedPortfolio = portfolio;
    this.showDetailModal = true;
    this.holdingSearchQuery = '';
    this.holdingSortBy = 'pnl';
    this.holdingSortOrder = 'desc';
    this.holdingPositiveCount = portfolio.holdings.filter((h) => h.pnl >= 0).length;
    this.holdingNegativeCount = portfolio.holdings.filter((h) => h.pnl < 0).length;
    this.applyHoldingSortAndFilter();
  }

  closeDetail() {
    this.showDetailModal = false;
    this.selectedPortfolio = null;
    this.filteredHoldings = [];
  }

  onHoldingSearch(query: string) {
    this.holdingSearchQuery = query;
    this.applyHoldingSortAndFilter();
  }

  onHoldingSort(column: string) {
    if (this.holdingSortBy === column) {
      this.holdingSortOrder = this.holdingSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.holdingSortBy = column;
      this.holdingSortOrder = 'desc';
    }
    this.applyHoldingSortAndFilter();
  }

  private applyHoldingSortAndFilter() {
    if (!this.selectedPortfolio) {
      this.filteredHoldings = [];
      return;
    }

    let filtered = [...this.selectedPortfolio.holdings];

    if (this.holdingSearchQuery.trim()) {
      const query = this.holdingSearchQuery.toLowerCase();
      filtered = filtered.filter((h) => h.tradingsymbol?.toLowerCase().includes(query));
    }

    filtered.sort((a: any, b: any) => {
      const fieldA = a[this.holdingSortBy];
      const fieldB = b[this.holdingSortBy];

      let comparison = 0;
      if (typeof fieldA === 'string') {
        comparison = fieldA.localeCompare(fieldB);
      } else {
        comparison = (fieldA || 0) - (fieldB || 0);
      }

      return this.holdingSortOrder === 'asc' ? comparison : -comparison;
    });

    this.filteredHoldings = filtered;
  }

  openExportModal() {
    this.showExportModal = true;
    this.exportStatus = null;
  }

  closeExportModal() {
    this.showExportModal = false;
  }

  downloadClientList() {
    const topN = Math.max(1, this.exportTopN || 1);
    const uniqueUserIds: string[] = [];
    for (const p of this.filteredPortfolios) {
      if (!uniqueUserIds.includes(p.userId)) {
        uniqueUserIds.push(p.userId);
      }
      if (uniqueUserIds.length >= topN) break;
    }

    if (uniqueUserIds.length === 0) {
      this.exportStatus = 'No portfolios match the current filters.';
      return;
    }

    this.exportLoading = true;
    this.exportStatus = null;

    this.apiService
      .getUserContacts(uniqueUserIds)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const contactsByUserId = new Map<string, ContactInfo>();
          (response.data || []).forEach((c: ContactInfo) => contactsByUserId.set(c.userId, c));

          const rows: { name: string; phone: string }[] = [];
          let skipped = 0;

          for (const userId of uniqueUserIds) {
            const contact = contactsByUserId.get(userId);
            if (!contact || !contact.whatsappNumber) {
              skipped++;
              continue;
            }
            rows.push({ name: contact.name || 'Unknown', phone: contact.whatsappNumber });
          }

          if (rows.length === 0) {
            this.exportStatus = `Nothing to download — all ${uniqueUserIds.length} client(s) are missing a WhatsApp number.`;
            this.exportLoading = false;
            return;
          }

          this.generateAndDownloadCsv(rows);

          this.exportStatus =
            skipped > 0
              ? `Downloaded ${rows.length} of ${uniqueUserIds.length} — ${skipped} skipped, no WhatsApp number on file.`
              : `Downloaded ${rows.length} client(s).`;
          this.exportLoading = false;
        },
        error: (error) => {
          console.error(error);
          this.exportStatus = 'Failed to fetch client contact info.';
          this.exportLoading = false;
        },
      });
  }

  private generateAndDownloadCsv(rows: { name: string; phone: string }[]) {
    const escape = (val: string) => {
      const str = String(val ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    let header: string[];
    let lines: string[];

    if (this.exportFormat === 'aisensy') {
      header = ['Name', 'Mobile Number', 'Source', 'Tags'];
      lines = rows.map((r) =>
        [escape(r.name), r.phone, escape(this.exportSource), escape(this.exportTags)].join(',')
      );
    } else {
      header = ['chat_id'];
      lines = rows.map((r) => `${r.phone}@c.us`);
    }

    const csvContent = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `whatsapp-clients-${this.exportFormat}-${dateStamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
