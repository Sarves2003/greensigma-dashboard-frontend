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

interface ActivationDayCell {
  completed: boolean;
  response: string | null;
  submittedAt: string | null;
  manual: boolean;
}

interface ActivationRow {
  name: string;
  phone: string;
  email: string;
  status: 'Full Paid' | 'Emandate' | 'None';
  days: ActivationDayCell[];
  score: number;
  remark: string;
}

interface DayStat {
  count: number;
  pct: number;
}

type SortKey = 'name' | 'phone' | 'status' | 'score';

@Component({
  selector: 'app-activation-tracker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './activation-tracker.component.html',
  styleUrls: ['./activation-tracker.component.scss'],
})
export class ActivationTrackerComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;
  dayIndexes = [0, 1, 2, 3, 4, 5, 6, 7];

  webinarDates: WebinarDate[] = [];
  loadingDates = true;
  selectedDate = '';

  showDateManager = false;
  newDateInput = '';
  dateManagerError: string | null = null;

  rows: ActivationRow[] = [];
  loadingTable = false;
  errorTable: string | null = null;

  sortBy: SortKey = 'score';
  sortOrder: 'asc' | 'desc' = 'desc';

  // Fields, not getters/methods — see resortAndPage() below for why. Angular re-evaluates any
  // getter/method used in a template on every change-detection cycle (every keystroke, click, or
  // async event anywhere in the app), so a table with 30-200+ rows and a bound input per row was
  // getting re-sorted and re-filtered many times a second. These are only recomputed explicitly,
  // when the underlying data actually changes.
  sortedRows: ActivationRow[] = [];
  pagedRows: ActivationRow[] = [];
  dayStats: DayStat[] = [];

  pageSizeOptions = [5, 10, 25, 50, 100];
  pageSize = 5;
  currentPage = 1;
  totalPages = 1;

  showResponseModal = false;
  selectedRow: ActivationRow | null = null;
  selectedResponseDay = 0;
  overrideSaving = false;

  remarkSaving = new Set<string>();

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
      .getActivationTable(this.selectedDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.rows = response.data.rows || [];
            this.currentPage = 1;
            this.computeDayStats();
            this.resortAndPage();
          } else {
            this.errorTable = 'Failed to load activation table';
          }
          this.loadingTable = false;
        },
        error: (error) => {
          this.errorTable = 'Failed to load activation table';
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
      this.sortOrder = key === 'score' ? 'desc' : 'asc';
    }
    this.resortAndPage();
  }

  onPageSizeChange() {
    this.currentPage = 1;
    this.resortAndPage();
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.resortAndPage();
    }
  }

  nextPage() {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.resortAndPage();
    }
  }

  private resortAndPage() {
    const rows = [...this.rows];
    rows.sort((a, b) => {
      const fieldA = a[this.sortBy];
      const fieldB = b[this.sortBy];
      let comparison = 0;
      if (typeof fieldA === 'string' && typeof fieldB === 'string') {
        comparison = fieldA.localeCompare(fieldB);
      } else {
        comparison = ((fieldA as any) || 0) - ((fieldB as any) || 0);
      }
      return this.sortOrder === 'asc' ? comparison : -comparison;
    });
    this.sortedRows = rows;

    this.totalPages = Math.max(1, Math.ceil(rows.length / this.pageSize));
    if (this.currentPage > this.totalPages) this.currentPage = this.totalPages;
    const start = (this.currentPage - 1) * this.pageSize;
    this.pagedRows = rows.slice(start, start + this.pageSize);
  }

  private computeDayStats() {
    const total = this.rows.length;
    this.dayStats = this.dayIndexes.map((d) => {
      const count = this.rows.filter((r) => r.days[d]?.completed).length;
      return { count, pct: total > 0 ? parseFloat(((count / total) * 100).toFixed(1)) : 0 };
    });
  }

  get totalUsers(): number {
    return this.rows.length;
  }

  get pageRangeStart(): number {
    return this.rows.length === 0 ? 0 : (this.currentPage - 1) * this.pageSize + 1;
  }

  get pageRangeEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.rows.length);
  }

  // Every day cell opens the same popup, whether it's ticked or blank — a blank Day 0/6/7 is
  // usually not "nobody did it," it's "the tracking sheet doesn't cover this day," so the popup
  // always offers a manual mark/unmark rather than just showing ticked cells.
  openResponseModal(row: ActivationRow, day: number) {
    this.selectedRow = row;
    this.selectedResponseDay = day;
    this.showResponseModal = true;
  }

  closeResponseModal() {
    this.showResponseModal = false;
    this.selectedRow = null;
  }

  get selectedCell(): ActivationDayCell | null {
    return this.selectedRow ? this.selectedRow.days[this.selectedResponseDay] : null;
  }

  setDayOverride(completed: boolean | null) {
    if (!this.selectedRow) return;
    const row = this.selectedRow;
    const day = this.selectedResponseDay;
    this.overrideSaving = true;

    this.apiService
      .saveActivationDayOverride(row.phone, this.selectedDate, day, completed)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (completed === null) {
            // Reverting to the sheet's own truth is only meaningful when nothing else changed —
            // simplest correct thing is to just re-pull this row's day from a fresh table load.
            this.loadTable();
          } else {
            row.days[day] = { ...row.days[day], completed, manual: true };
            row.score = row.days.filter((d) => d.completed).length;
            this.computeDayStats();
            this.resortAndPage();
          }
          this.overrideSaving = false;
          this.closeResponseModal();
        },
        error: (error) => {
          console.error(error);
          this.overrideSaving = false;
        },
      });
  }

  onRemarkChange(row: ActivationRow) {
    this.remarkSaving.add(row.phone);
    this.apiService
      .saveActivationRemark(row.phone, this.selectedDate, row.remark)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.remarkSaving.delete(row.phone),
        error: (error) => {
          console.error(error);
          this.remarkSaving.delete(row.phone);
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
