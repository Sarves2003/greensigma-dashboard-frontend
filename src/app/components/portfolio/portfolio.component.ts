import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { ChartComponent } from '../shared/chart/chart.component';
import { KPICardComponent } from '../shared/kpi-card/kpi-card.component';
import { FilterBarComponent } from '../shared/filter-bar/filter-bar.component';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [CommonModule, FormsModule, ChartComponent, KPICardComponent, FilterBarComponent],
  templateUrl: './portfolio.component.html',
  styleUrls: ['./portfolio.component.scss'],
})
export class PortfolioComponent implements OnInit, OnDestroy {
  loading = true;
  error: string | null = null;

  // Metrics
  portfolioMetrics = {
    totalCreated: 0,
    draft: 0,
    live: 0,
    manual: 0,
    automated: 0,
    realPortfolio: '0(0)',
    paperPortfolio: '0(0)',
    realCapital: 0,
    paperCapital: 0,
    investmentCapital: 0,
    estimatedAUM: 0,
  };

  // Chart data
  portfolioTrend: any[] = [];
  portfolioBreakdown: any[] = [];
  topInvestorsData: any[] = [];

  // Broker type filter
  brokerTypes = [
    { label: 'kite', value: 'kite' },
    { label: 'zebu', value: 'zebu' },
    { label: 'paper_trade', value: 'paper_trade' },
  ];
  selectedBrokerTypes: string[] = ['kite', 'zebu'];

  // Pagination
  currentPage = 1;
  pageSize = 10;
  totalInvestors = 0;
  totalPages = 0;

  // Sorting & Filtering
  sortBy: string = 'liveAUM';
  sortOrder: 'asc' | 'desc' = 'desc';
  searchQuery: string = '';
  filteredInvestors: any[] = [];

  // Detail view
  selectedInvestor: any = null;
  showDetailModal = false;
  investorPortfolios: any[] = [];
  detailLoading = false;

  currentFilter = {
    period: 'today',
    startDate: '',
    endDate: '',
    userType: '',
    referralCode: '',
    state: '',
    district: '',
  };

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.loadDashboard();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadDashboard() {
    this.loading = true;
    this.error = null;

    const params = {
      period: this.currentFilter.period,
      startDate: this.currentFilter.startDate,
      endDate: this.currentFilter.endDate,
      userType: this.currentFilter.userType,
      referralCode: this.currentFilter.referralCode,
      state: this.currentFilter.state,
      district: this.currentFilter.district,
    };

    // Get metrics
    this.apiService
      .getPortfolioMetrics(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.portfolioMetrics = response.data;
          }
          this.loading = false;
        },
        error: (error) => {
          this.error = 'Failed to load portfolio metrics';
          console.error(error);
          this.loading = false;
        },
      });

    // Get trend
    const trendParams = {
      ...params,
      brokerTypes: this.selectedBrokerTypes.join(','),
    };
    this.apiService
      .getPortfolioTrend(trendParams)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.portfolioTrend = response.data;
          }
        },
        error: (error) => console.error(error),
      });

    // Get breakdown
    this.apiService
      .getPortfolioBreakdown(params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.portfolioBreakdown = response.data;
          }
        },
        error: (error) => console.error(error),
      });

    // Get top investors - first page
    this.loadInvestors();
  }

  loadInvestors() {
    const params = {
      period: this.currentFilter.period,
      startDate: this.currentFilter.startDate,
      endDate: this.currentFilter.endDate,
      userType: this.currentFilter.userType,
      referralCode: this.currentFilter.referralCode,
      state: this.currentFilter.state,
      district: this.currentFilter.district,
      brokerTypes: this.selectedBrokerTypes.join(','),
    };

    const offset = (this.currentPage - 1) * this.pageSize;

    this.apiService
      .getTopInvestors(params, this.pageSize, offset)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.topInvestorsData = response.data.investors || [];
            this.totalInvestors = response.data.total || 0;
            this.totalPages = response.data.totalPages || 0;
            this.applySortAndFilter();
          }
        },
        error: (error) => console.error(error),
      });
  }

  onFilterChange(filters: any) {
    this.currentFilter = filters;
    this.currentPage = 1;
    this.loadDashboard();
  }

  onBrokerTypeChange(brokerType: string) {
    const index = this.selectedBrokerTypes.indexOf(brokerType);
    if (index > -1) {
      this.selectedBrokerTypes.splice(index, 1);
    } else {
      this.selectedBrokerTypes.push(brokerType);
    }
    this.currentPage = 1;
    this.loadDashboard();
  }

  getFilteredTrendData() {
    if (this.portfolioTrend.length === 0) return [];

    return {
      data: this.portfolioTrend,
      brokerTypes: this.selectedBrokerTypes,
    };
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadInvestors();
    }
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadInvestors();
    }
  }

  openDetailView(investor: any) {
    this.selectedInvestor = investor;
    this.detailLoading = true;
    this.showDetailModal = true;

    const params = {
      period: this.currentFilter.period,
      startDate: this.currentFilter.startDate,
      endDate: this.currentFilter.endDate,
    };

    this.apiService
      .getUserPortfolios(investor.userId, params)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.investorPortfolios = response.data;
          }
          this.detailLoading = false;
        },
        error: (error) => {
          console.error(error);
          this.detailLoading = false;
        },
      });
  }

  closeDetailView() {
    this.showDetailModal = false;
    this.selectedInvestor = null;
    this.investorPortfolios = [];
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

  onSearch(query: string) {
    this.searchQuery = query;
    this.applySortAndFilter();
  }

  applySortAndFilter() {
    let filtered = [...this.topInvestorsData];

    // Filter by search query
    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(
        investor =>
          investor.username?.toLowerCase().includes(query) ||
          investor.userId?.toLowerCase().includes(query)
      );
    }

    // Sort
    filtered.sort((a: any, b: any) => {
      const fieldA = a[this.sortBy];
      const fieldB = b[this.sortBy];

      if (fieldA === null || fieldA === undefined) return 1;
      if (fieldB === null || fieldB === undefined) return -1;

      let comparison = 0;
      if (typeof fieldA === 'string') {
        comparison = fieldA.localeCompare(fieldB);
      } else if (fieldA instanceof Date && fieldB instanceof Date) {
        comparison = fieldA.getTime() - fieldB.getTime();
      } else {
        comparison = fieldA - fieldB;
      }

      return this.sortOrder === 'asc' ? comparison : -comparison;
    });

    this.filteredInvestors = filtered;
  }

  formatDate(date: any): string {
    if (!date) return '-';
    const d = new Date(date);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${d.getDate()}-${monthNames[d.getMonth()]}-${d.getFullYear()}`;
  }

  formatMonthYear(date: any): string {
    if (!date) return '-';
    const d = new Date(date);
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${monthNames[d.getMonth()]}-${d.getFullYear()}`;
  }
}
