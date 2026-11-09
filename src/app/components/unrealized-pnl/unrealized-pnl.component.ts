import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

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

interface SipEvent {
  date: string;
  amount: number;
}

interface PortfolioPnl {
  portfolioId: string;
  userId: string;
  portfolioName: string;
  borkrageType: string;
  createdAt?: string;
  updatedAt?: string;
  fromBacktest: boolean;
  investedValue: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  rebalanceCount: number;
  stocksTraded: number;
  rebalanceDates: string[];
  regimeStatus: 'full_gold' | 'half_gold' | null;
  holdings: HoldingPnl[];
  investmentCapital: number | null;
  freeCash: number;
  lockedFreeCash: number;
  sipEvents: SipEvent[];
  joinedDate: string | null;
  // Computed client-side, refreshed on every filter change — see computeSipAndAum().
  sipCountInPeriod: number;
  sipAmountInPeriod: number;
  aumDeployed: number;
}

interface ContactInfo {
  userId: string;
  name: string;
  email: string;
  whatsappNumber: string | null;
}

interface IdleCashRow {
  userId: string;
  portfolioName: string;
  investmentCapital: number | null;
  idleCash: number;
}

interface SipRow {
  userId: string;
  name: string;
  whatsappNumber: string | null;
  sipAmountInPeriod: number;
  sipCountInPeriod: number;
}

interface BrokerSummaryRow {
  broker: string;
  label: string;
  logo: string;
  portfolioCount: number;
  userCount: number;
}

// Fixed display order (the order these brokers were connected on the platform), not alphabetical or
// count-sorted — keeps the card row from reshuffling position as filters change the counts.
const BROKER_ORDER = ['kite', 'zebu', 'aliceblue', 'dhan', 'enrich'];
const BROKER_META: Record<string, { label: string; logo: string }> = {
  kite: { label: 'Kite (Zerodha)', logo: 'assets/broker-kite.png' },
  zebu: { label: 'Zebu', logo: 'assets/broker-zebu.png' },
  aliceblue: { label: 'AliceBlue', logo: 'assets/broker-aliceblue.png' },
  dhan: { label: 'Dhan', logo: 'assets/broker-dhan.png' },
  enrich: { label: 'Enrich', logo: 'assets/broker-enrich.png' },
};

@Component({
  selector: 'app-unrealized-pnl',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  totals = { invested: 0, current: 0, pnl: 0, aumDeployed: 0, idleCash: 0, sipInPeriod: 0, sipCountInPeriod: 0 };

  // Idle Cash detail modal — one row per portfolio, sortable
  showIdleCashModal = false;
  idleCashRows: IdleCashRow[] = [];
  idleCashSortBy: keyof IdleCashRow = 'idleCash';
  idleCashSortOrder: 'asc' | 'desc' = 'desc';

  // SIP Investment detail modal — one row per client (aggregated across their portfolios), sortable
  showSipModal = false;
  sipRows: SipRow[] = [];
  sipSortBy: keyof SipRow = 'sipAmountInPeriod';
  sipSortOrder: 'asc' | 'desc' = 'desc';
  loadingSipContacts = false;
  positiveCount = 0;
  negativeCount = 0;
  winner: PortfolioPnl | null = null;
  loser: PortfolioPnl | null = null;
  activePortfolioCount = 0;
  activePortfolioPct = 0;
  brokerSummary: BrokerSummaryRow[] = [];
  // Clicking a broker card filters the table below to just that broker, client-side — re-clicking
  // the same card clears it. Kept separate from the other filters so the card row itself always
  // keeps showing every broker's own count (computed from the pre-broker-click list), letting the
  // user click a different broker without the row collapsing to a single card first.
  selectedBroker: string | null = null;

  get selectedBrokerLabel(): string {
    return this.selectedBroker ? BROKER_META[this.selectedBroker]?.label || this.selectedBroker : '';
  }

  // True monthly SIP inflow, irrespective of which portfolio it came from or when that portfolio
  // was created — see computeMonthlySipBreakdown() for why this needs its own, unfiltered pass.
  monthlySipBreakdown: { monthLabel: string; amount: number; count: number }[] = [];
  // Collapsed by default — this table can run to dozens of rows for a book this old.
  monthlySipExpanded = false;

  get totalMonthlySipAmount(): number {
    return this.monthlySipBreakdown.reduce((sum, r) => sum + r.amount, 0);
  }

  get totalMonthlySipCount(): number {
    return this.monthlySipBreakdown.reduce((sum, r) => sum + r.count, 0);
  }

  // ============ First-Time Portfolios (client's ONLY live portfolio, not just "created recently") ============
  // A portfolio counts here only if its client has exactly ONE live real portfolio total — checked
  // against the full unfiltered list (this.portfolios), not the filtered one, so narrowing the page's
  // filters can never make a client with several portfolios look like a first-timer just because the
  // rest got filtered out. The active filters still decide WHICH of these first-timers are counted
  // (e.g. filtering to Automated only counts first-timers whose one portfolio is itself Automated).
  firstPortfolioCount = 0;
  firstPortfolioUserCount = 0;

  // ============ Rebalances Done (period-scoped) ============
  // Sum of each filtered portfolio's rebalanceDates that fall inside the SAME Created At / Updated
  // At window as everything else on this page — mirrors how SIP events are period-scoped.
  rebalancesInPeriod = 0;

  // ============ People Added SIP (period-scoped, unique clients) ============
  peopleAddedSipCount = 0;

  // ============ Regime defense: AUM parked in uncorrelated assets ============
  // The strategy's uncorrelated/defensive universe — not gold alone, since the same mechanism can
  // route into a liquid or silver ETF too. Summed at CURRENT value (mark-to-market), from whatever
  // is actually held right now, same convention as Total Current Value elsewhere on this page.
  private readonly UNCORRELATED_ASSET_SYMBOLS = new Set(['GOLDBEES', 'LIQUIDBEES', 'SILVERBEES']);

  get uncorrelatedAssetValue(): number {
    return this.filteredPortfolios.reduce((sum, p) => {
      const portfolioUncorrelated = p.holdings
        .filter((h) => this.UNCORRELATED_ASSET_SYMBOLS.has(h.tradingsymbol))
        .reduce((s, h) => s + h.currentValue, 0);
      return sum + portfolioUncorrelated;
    }, 0);
  }

  // ============ Regime defense: Gold buckets ============
  // Unlike Went to Cash, these portfolios DO have non-empty holdings, so they're already present in
  // filteredPortfolios — derived the same way Broker-wise Breakdown's counts are, respecting every
  // active page filter.
  get fullGoldCount(): number {
    return this.filteredPortfolios.filter((p) => p.regimeStatus === 'full_gold').length;
  }

  get fullGoldUserCount(): number {
    return new Set(this.filteredPortfolios.filter((p) => p.regimeStatus === 'full_gold').map((p) => p.userId)).size;
  }

  get halfGoldCount(): number {
    return this.filteredPortfolios.filter((p) => p.regimeStatus === 'half_gold').length;
  }

  get halfGoldUserCount(): number {
    return new Set(this.filteredPortfolios.filter((p) => p.regimeStatus === 'half_gold').map((p) => p.userId)).size;
  }

  get totalPortfoliosUserCount(): number {
    return new Set(this.filteredPortfolios.map((p) => p.userId)).size;
  }

  // ============ Name/Phone columns in the table — hidden by default, loaded on demand ============
  showContactColumns = false;
  contactsLoading = false;
  private contactsByUserId = new Map<string, ContactInfo>();

  contactName(userId: string): string {
    return this.contactsByUserId.get(userId)?.name || (this.contactsLoading ? '…' : '-');
  }

  contactPhone(userId: string): string {
    return this.contactsByUserId.get(userId)?.whatsappNumber || (this.contactsLoading ? '…' : '-');
  }

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.load();
  }

  toggleMonthlySipTable() {
    this.monthlySipExpanded = !this.monthlySipExpanded;
  }

  toggleContactColumns() {
    this.showContactColumns = !this.showContactColumns;
    if (this.showContactColumns) this.ensureContactsLoaded();
  }

  // Fetches only userIds not already cached, so toggling on/off repeatedly or changing filters while
  // expanded doesn't re-fetch contacts already in hand.
  private ensureContactsLoaded() {
    const missing = [...new Set(this.filteredPortfolios.map((p) => p.userId))].filter((id) => !this.contactsByUserId.has(id));
    if (missing.length === 0) return;

    this.contactsLoading = true;
    this.apiService
      .getUserContacts(missing)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          (response.data || []).forEach((c: ContactInfo) => this.contactsByUserId.set(c.userId, c));
          this.contactsLoading = false;
        },
        error: (error) => {
          console.error(error);
          this.contactsLoading = false;
        },
      });
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

  onBrokerCardClick(broker: string) {
    this.selectedBroker = this.selectedBroker === broker ? null : broker;
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

    // Broker summary is computed from the list BEFORE the broker-click filter below, so every
    // card keeps showing its own real count instead of zeroing out once one broker is selected.
    this.computeBrokerSummary(filtered);

    if (this.selectedBroker) {
      filtered = filtered.filter((p) => p.borkrageType === this.selectedBroker);
    }

    // Must run before the sort below — sipCountInPeriod/sipAmountInPeriod/aumDeployed are fields
    // the sort can be asked to order by, so they need fresh values (matching the current date
    // filters) before comparisons read them, not after.
    this.computeSipAndAum(filtered);

    filtered.sort((a: any, b: any) => {
      let fieldA = a[this.sortBy];
      let fieldB = b[this.sortBy];

      if (this.sortBy === 'createdAt' || this.sortBy === 'updatedAt' || this.sortBy === 'joinedDate') {
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
    this.computeActivePortfolios();
    this.computeMonthlySipBreakdown();
    this.computeFirstPortfolioClients();
    this.computeRebalancesInPeriod();
    this.computePeopleAddedSip();
    this.currentPage = 1;
    this.updatePagination();
    if (this.showContactColumns) this.ensureContactsLoaded();
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
        acc.aumDeployed += p.aumDeployed;
        acc.idleCash += (p.freeCash || 0) + (p.lockedFreeCash || 0);
        acc.sipInPeriod += p.sipAmountInPeriod;
        acc.sipCountInPeriod += p.sipCountInPeriod;
        return acc;
      },
      { invested: 0, current: 0, pnl: 0, aumDeployed: 0, idleCash: 0, sipInPeriod: 0, sipCountInPeriod: 0 }
    );
  }

  // AUM Deployed = money the client has actually committed to the portfolio (original capital +
  // every SIP top-up), as opposed to "Total Invested" which only counts money currently sitting in
  // stock positions. `investmentCapital` never includes SIP amounts (confirmed against real data —
  // a portfolio can have investmentCapital smaller than a single one of its own SIP events), so SIP
  // is added on top explicitly. For older/manual portfolios with no investmentCapital saved at all,
  // `investedValue` is used as-is instead — it already organically includes any SIP-driven share
  // purchases, so SIP must NOT also be added on top there (that would double-count it).
  //
  // SIP events count toward "in period" using the exact same Created At / Updated At range(s)
  // already active for the portfolio list itself, applied to each SIP event's own date.
  private computeSipAndAum(portfolios: PortfolioPnl[]) {
    for (const p of portfolios) {
      const inPeriodEvents = p.sipEvents.filter((e) => {
        const time = new Date(e.date).getTime();
        return this.isTimeInRange(time, this.createdFrom, this.createdTo) && this.isTimeInRange(time, this.updatedFrom, this.updatedTo);
      });

      p.sipCountInPeriod = inPeriodEvents.length;
      p.sipAmountInPeriod = inPeriodEvents.reduce((sum, e) => sum + e.amount, 0);

      p.aumDeployed = p.investmentCapital !== null ? p.investmentCapital + p.sipAmountInPeriod : p.investedValue;
    }
  }

  // "SIP Investment" above is deliberately scoped to portfolios CREATED in the selected window
  // (per applySortAndFilter's date filter on p.createdAt) — a portfolio created 2-3 months earlier
  // that added a SIP this month is invisible there. This is the other half of the picture: the true
  // total SIP amount added in each calendar month, from every portfolio regardless of when it was
  // created. Search / Portfolio Type / exclude-inactive still apply (legitimate scoping), but the
  // Created At / Updated At range is applied to each SIP EVENT's own date, not to the portfolio.
  private computeMonthlySipBreakdown() {
    this.monthlySipBreakdown = [];

    let scoped = [...this.portfolios];

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      scoped = scoped.filter(
        (p) => p.userId?.toLowerCase().includes(query) || p.portfolioName?.toLowerCase().includes(query)
      );
    }
    if (this.portfolioTypeFilter === 'automated') {
      scoped = scoped.filter((p) => p.fromBacktest);
    } else if (this.portfolioTypeFilter === 'manual') {
      scoped = scoped.filter((p) => !p.fromBacktest);
    }
    if (this.excludeInactive) {
      scoped = scoped.filter((p) => !this.isInactive(p));
    }

    const byMonth = new Map<string, { amount: number; count: number }>();
    for (const p of scoped) {
      for (const e of p.sipEvents) {
        const time = new Date(e.date).getTime();
        if (!this.isTimeInRange(time, this.createdFrom, this.createdTo)) continue;
        if (!this.isTimeInRange(time, this.updatedFrom, this.updatedTo)) continue;

        const d = new Date(e.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bucket = byMonth.get(key) || { amount: 0, count: 0 };
        bucket.amount += e.amount;
        bucket.count += 1;
        byMonth.set(key, bucket);
      }
    }

    if (this.createdFrom && this.createdTo) {
      // Explicit range: enumerate every month it spans, so a month with zero SIP activity still
      // shows as a 0 row instead of silently disappearing from the table.
      const start = new Date(this.createdFrom);
      const end = new Date(this.createdTo);
      const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
      const endCursor = new Date(end.getFullYear(), end.getMonth(), 1);

      const rows: { monthLabel: string; amount: number; count: number }[] = [];
      while (cursor.getTime() <= endCursor.getTime()) {
        const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
        const bucket = byMonth.get(key) || { amount: 0, count: 0 };
        rows.push({
          monthLabel: cursor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
          amount: bucket.amount,
          count: bucket.count,
        });
        cursor.setMonth(cursor.getMonth() + 1);
      }
      this.monthlySipBreakdown = rows;
    } else {
      // No date range set — same "no filter = show everything" convention as every other card on
      // this page (Total AUM Deployed, Total Idle Cash, etc. all show all-time totals by default).
      // There's no bounded window to enumerate zero-SIP months from, so just list every month that
      // actually has activity, oldest first.
      this.monthlySipBreakdown = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, bucket]) => {
          const [year, month] = key.split('-').map(Number);
          const d = new Date(year, month - 1, 1);
          return {
            monthLabel: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
            amount: bucket.amount,
            count: bucket.count,
          };
        });
    }
  }

  // Counts filtered portfolios whose client has exactly one live real portfolio, period — their
  // very first (and so far only) one. The "exactly one" check runs against the FULL unfiltered
  // list, not filteredPortfolios, so it stays a true statement about the client regardless of what
  // the page's own filters happen to be hiding right now.
  private computeFirstPortfolioClients() {
    const totalByUser = new Map<string, number>();
    for (const p of this.portfolios) {
      totalByUser.set(p.userId, (totalByUser.get(p.userId) || 0) + 1);
    }

    const firstTimers = this.filteredPortfolios.filter((p) => totalByUser.get(p.userId) === 1);
    this.firstPortfolioCount = firstTimers.length;
    this.firstPortfolioUserCount = new Set(firstTimers.map((p) => p.userId)).size;
  }

  // Sum of each currently-filtered portfolio's rebalanceDates that fall inside the SAME Created At /
  // Updated At window as everything else on the page — a period-scoped version of the lifetime
  // "Rebalances" column already shown per-portfolio in the table.
  private computeRebalancesInPeriod() {
    this.rebalancesInPeriod = this.filteredPortfolios.reduce((sum, p) => {
      const inPeriod = p.rebalanceDates.filter((d) => {
        const time = new Date(d).getTime();
        return this.isTimeInRange(time, this.createdFrom, this.createdTo) && this.isTimeInRange(time, this.updatedFrom, this.updatedTo);
      });
      return sum + inPeriod.length;
    }, 0);
  }

  // Unique clients (not portfolios) with at least one SIP event in the selected period — must run
  // after computeSipAndAum() has refreshed sipCountInPeriod for the current filters.
  private computePeopleAddedSip() {
    const users = new Set(this.filteredPortfolios.filter((p) => p.sipCountInPeriod > 0).map((p) => p.userId));
    this.peopleAddedSipCount = users.size;
  }

  private isTimeInRange(time: number, from: string, to: string): boolean {
    if (!from && !to) return true;
    if (from && time < new Date(from).getTime()) return false;
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999);
      if (time > toDate.getTime()) return false;
    }
    return true;
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

  // rebalanceCount is a lifetime count (not scoped to the Created At / Updated At filters above)
  // by design — a portfolio created "this month" wouldn't have had time to rebalance within that
  // same narrow window, so "active" always looks at whether it has ever rebalanced at all.
  private computeActivePortfolios() {
    this.activePortfolioCount = this.filteredPortfolios.filter((p) => (p.rebalanceCount || 0) > 0).length;
    this.activePortfolioPct = this.filteredPortfolios.length > 0
      ? parseFloat((this.activePortfolioCount / this.filteredPortfolios.length * 100).toFixed(1))
      : 0;
  }

  // Unique portfolio + client count per broker, scoped to the currently filtered list — same
  // convention as every other summary card on this page (totals, winner/loser, histogram, etc. all
  // reflect the active search/type/date filters, not the full unfiltered dataset). `source` is the
  // list BEFORE the broker-click filter is applied — see applySortAndFilter().
  private computeBrokerSummary(source: PortfolioPnl[]) {
    const byBroker = new Map<string, { portfolios: number; users: Set<string> }>();
    for (const p of source) {
      if (!p.borkrageType) continue;
      if (!byBroker.has(p.borkrageType)) byBroker.set(p.borkrageType, { portfolios: 0, users: new Set() });
      const entry = byBroker.get(p.borkrageType)!;
      entry.portfolios++;
      entry.users.add(p.userId);
    }

    this.brokerSummary = BROKER_ORDER.map((broker) => {
      const meta = BROKER_META[broker];
      const entry = byBroker.get(broker);
      return {
        broker,
        label: meta.label,
        logo: meta.logo,
        portfolioCount: entry?.portfolios || 0,
        userCount: entry?.users.size || 0,
      };
    });
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

    return list.filter((p) => {
      const value = p[field];
      if (!value) return false;
      const time = new Date(value).getTime();
      if (!this.isTimeInRange(time, from, to)) return false;
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

  openIdleCashModal() {
    this.idleCashRows = this.filteredPortfolios.map((p) => ({
      userId: p.userId,
      portfolioName: p.portfolioName,
      investmentCapital: p.investmentCapital,
      idleCash: (p.freeCash || 0) + (p.lockedFreeCash || 0),
    }));
    this.sortIdleCashRows();
    this.showIdleCashModal = true;
  }

  closeIdleCashModal() {
    this.showIdleCashModal = false;
  }

  onIdleCashSort(column: keyof IdleCashRow) {
    if (this.idleCashSortBy === column) {
      this.idleCashSortOrder = this.idleCashSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.idleCashSortBy = column;
      this.idleCashSortOrder = 'desc';
    }
    this.sortIdleCashRows();
  }

  private sortIdleCashRows() {
    const key = this.idleCashSortBy;
    this.idleCashRows = [...this.idleCashRows].sort((a, b) => {
      const fieldA = a[key];
      const fieldB = b[key];
      let comparison = 0;
      if (typeof fieldA === 'string') {
        comparison = fieldA.localeCompare(fieldB as string);
      } else {
        comparison = (fieldA as number ?? 0) - (fieldB as number ?? 0);
      }
      return this.idleCashSortOrder === 'asc' ? comparison : -comparison;
    });
  }

  // Aggregated per client (not per portfolio) since one client can run several portfolios that
  // each received a SIP top-up in the selected period — the popup is meant to answer "which
  // clients added SIP money," not "which portfolio rows."
  openSipModal() {
    const withSip = this.filteredPortfolios.filter((p) => p.sipCountInPeriod > 0);
    this.showSipModal = true;

    if (withSip.length === 0) {
      this.sipRows = [];
      return;
    }

    const byUser = new Map<string, { sipAmountInPeriod: number; sipCountInPeriod: number }>();
    for (const p of withSip) {
      const existing = byUser.get(p.userId) || { sipAmountInPeriod: 0, sipCountInPeriod: 0 };
      existing.sipAmountInPeriod += p.sipAmountInPeriod;
      existing.sipCountInPeriod += p.sipCountInPeriod;
      byUser.set(p.userId, existing);
    }

    this.loadingSipContacts = true;
    this.apiService
      .getUserContacts([...byUser.keys()])
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const contactsByUserId = new Map<string, ContactInfo>();
          (response.data || []).forEach((c: ContactInfo) => contactsByUserId.set(c.userId, c));

          this.sipRows = [...byUser.entries()].map(([userId, agg]) => {
            const contact = contactsByUserId.get(userId);
            return {
              userId,
              name: contact?.name || '-',
              whatsappNumber: contact?.whatsappNumber || null,
              sipAmountInPeriod: agg.sipAmountInPeriod,
              sipCountInPeriod: agg.sipCountInPeriod,
            };
          });
          this.sortSipRows();
          this.loadingSipContacts = false;
        },
        error: (error) => {
          console.error(error);
          // Still show the table, just without name/number — better than nothing on a fetch failure.
          this.sipRows = [...byUser.entries()].map(([userId, agg]) => ({
            userId,
            name: '-',
            whatsappNumber: null,
            sipAmountInPeriod: agg.sipAmountInPeriod,
            sipCountInPeriod: agg.sipCountInPeriod,
          }));
          this.sortSipRows();
          this.loadingSipContacts = false;
        },
      });
  }

  closeSipModal() {
    this.showSipModal = false;
  }

  onSipSort(column: keyof SipRow) {
    if (this.sipSortBy === column) {
      this.sipSortOrder = this.sipSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      this.sipSortBy = column;
      this.sipSortOrder = 'desc';
    }
    this.sortSipRows();
  }

  private sortSipRows() {
    const key = this.sipSortBy;
    this.sipRows = [...this.sipRows].sort((a, b) => {
      const fieldA = a[key];
      const fieldB = b[key];
      let comparison = 0;
      if (typeof fieldA === 'string') {
        comparison = fieldA.localeCompare((fieldB as string) || '');
      } else {
        comparison = (fieldA as number ?? 0) - (fieldB as number ?? 0);
      }
      return this.sipSortOrder === 'asc' ? comparison : -comparison;
    });
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
    const portfolioByUserId = new Map<string, PortfolioPnl>();
    for (const p of this.filteredPortfolios) {
      if (!uniqueUserIds.includes(p.userId)) {
        uniqueUserIds.push(p.userId);
        portfolioByUserId.set(p.userId, p);
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

          const rows: { name: string; phone: string; pnl: number; pnlPercent: number; createdAt: string }[] = [];
          let skipped = 0;

          for (const userId of uniqueUserIds) {
            const contact = contactsByUserId.get(userId);
            if (!contact || !contact.whatsappNumber) {
              skipped++;
              continue;
            }
            const portfolio = portfolioByUserId.get(userId);
            rows.push({
              name: contact.name || 'Unknown',
              phone: contact.whatsappNumber,
              pnl: portfolio?.pnl || 0,
              pnlPercent: portfolio?.pnlPercent || 0,
              createdAt: portfolio?.createdAt ? this.formatDate(portfolio.createdAt) : '',
            });
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

  private generateAndDownloadCsv(rows: { name: string; phone: string; pnl: number; pnlPercent: number; createdAt: string }[]) {
    const escape = (val: string) => {
      const str = String(val ?? '');
      return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };

    let header: string[];
    let lines: string[];

    if (this.exportFormat === 'aisensy') {
      header = ['Name', 'Mobile Number', 'Source', 'Tags', 'P&L (₹)', 'ROI (%)', 'Created At'];
      lines = rows.map((r) =>
        [
          escape(r.name),
          r.phone,
          escape(this.exportSource),
          escape(this.exportTags),
          r.pnl.toFixed(2),
          r.pnlPercent.toFixed(2),
          r.createdAt,
        ].join(',')
      );
    } else {
      // Periskope only ever imports a single chat_id column — adding extra columns would break its
      // parser, so this format is intentionally left as-is.
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
