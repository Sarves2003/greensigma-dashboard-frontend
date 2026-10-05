import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

type SubTab = 'main' | 'notJoined' | 'notRegistered' | 'keyword';

interface CountPct {
  count: number;
  pct: number;
}

interface WebinarSummary {
  id: string;
  title: string;
  webinarDate: string;
  batchLabel: string;
  uploadedAt: string;
  attendeeCount: number;
}

interface WebinarReport {
  webinar: {
    id: string;
    title: string;
    webinarDate: string;
    batchLabel: string;
    sessionStart: string;
    sessionEnd: string;
    totalDurationMin: number;
  };
  attendedThresholdMin: number;
  cards: {
    totalRegistered: number;
    registeredViaFunnel: CountPct;
    fromPreviousWebinar: CountPct;
    previouslyPaid: CountPct;
    organic: CountPct;
    attended: CountPct;
    totalChats: number;
    avgAttendedDurationMin: number | null;
    avgRejoinsAttended: number | null;
    peakConcurrent: { count: number; atTime: string | null };
    stayedTillMiddle: CountPct;
    stayedTillEnd2hr: CountPct | null;
  };
  registrationDataAvailable: boolean;
}

type SortDir = 'asc' | 'desc';

interface MainRow {
  email: string;
  name: string;
  number: string;
  batchLabel: string;
  paid5k: boolean;
  totalMin: number;
  rejoins: number;
  chatCount: number;
  signedUp: boolean;
}

interface NotJoinedRow {
  email: string;
  name: string;
  number: string;
  batchLabel: string;
  paid5k: boolean;
  signedUp: boolean;
}

interface NotRegisteredRow {
  email: string;
  name: string;
  number: string;
  signedUp: boolean;
  signedUpBeforeSession: boolean;
}

interface KeywordRow {
  email: string;
  name: string;
  number: string;
  timeIso: string;
}

interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface AttendeeDetail {
  email: string;
  name: string;
  number: string;
  signedUp: boolean;
  previouslyPaid: boolean;
  previouslyPaidOn: string | null;
  paid5k: boolean;
  paidEvidence: { msg: string; wallClock: string | null } | null;
  totalMin: number;
  sessions: { joinTime: string; leaveTime: string; durationMin: number }[];
  chat: { wallClock: string | null; msg: string }[];
}

// Zoom webinar attendance + chat, uploaded per batch (CSV + chat .txt), scored live against
// userdetail / the Full Paid sheet / the funnel registration sheet — never baked into the stored
// upload, so "already paid" status stays current even if it changes days after the webinar.
@Component({
  selector: 'app-webinar-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './webinar-analysis.component.html',
  styleUrls: ['./webinar-analysis.component.scss'],
})
export class WebinarAnalysisComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  webinars: WebinarSummary[] = [];
  selectedWebinarId: string | null = null;
  attendedThresholdMin = 10;

  listLoading = true;
  listError: string | null = null;

  report: WebinarReport | null = null;
  reportLoading = false;
  reportError: string | null = null;

  activeSubTab: SubTab = 'main';

  mainTable: PagedResult<MainRow> | null = null;
  mainLoading = false;
  mainError: string | null = null;
  mainPageSize = 20;
  mainSortBy: string | null = null;
  mainSortDir: SortDir = 'desc';

  notJoinedTable: PagedResult<NotJoinedRow> | null = null;
  notJoinedLoading = false;
  notJoinedError: string | null = null;
  notJoinedPageSize = 20;
  notJoinedSortBy: string | null = null;
  notJoinedSortDir: SortDir = 'desc';

  notRegisteredTable: (PagedResult<NotRegisteredRow> & { registrationDataAvailable: boolean }) | null = null;
  notRegisteredLoading = false;
  notRegisteredError: string | null = null;
  notRegisteredPageSize = 20;
  notRegisteredSortBy: string | null = null;
  notRegisteredSortDir: SortDir = 'desc';

  keywordInput = '';
  keywordTable: PagedResult<KeywordRow> | null = null;
  keywordLoading = false;
  keywordError: string | null = null;
  keywordPageSize = 20;
  keywordSortBy: string | null = null;
  keywordSortDir: SortDir = 'desc';
  private keywordSearch$ = new Subject<void>();

  showUploadPanel = false;
  participantsFile: File | null = null;
  chatFile: File | null = null;
  uploading = false;
  uploadError: string | null = null;

  showDetailModal = false;
  detailLoading = false;
  detailError: string | null = null;
  detailData: AttendeeDetail | null = null;

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.loadWebinarList();
    this.keywordSearch$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => this.loadKeywordTable(1));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setSubTab(tab: SubTab) {
    this.activeSubTab = tab;
  }

  // ============ Webinar list / selection ============
  loadWebinarList() {
    this.listLoading = true;
    this.listError = null;
    this.apiService
      .listWebinarAnalysis()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.webinars = response.data;
            if (!this.selectedWebinarId && this.webinars.length > 0) {
              this.selectedWebinarId = this.webinars[0].id;
            }
          } else {
            this.listError = response.error || 'Failed to load uploaded webinars';
          }
          this.listLoading = false;
          if (this.selectedWebinarId) this.loadAll();
        },
        error: (err) => {
          this.listError = err?.error?.error || 'Failed to load uploaded webinars';
          this.listLoading = false;
        },
      });
  }

  onWebinarChange(id: string) {
    this.selectedWebinarId = id;
    this.keywordInput = '';
    this.keywordTable = null;
    this.loadAll();
  }

  // The threshold drives the Attended card AND the Main/Not-Joined split, so changing it has to
  // reload all three — otherwise the cards and the tables disagree on who counts as "attended".
  onThresholdChange() {
    this.loadReport();
    this.loadMainTable(1);
    this.loadNotJoinedTable(1);
  }

  loadAll() {
    this.loadReport();
    this.loadMainTable(1);
    this.loadNotJoinedTable(1);
    this.loadNotRegisteredTable(1);
  }

  // ============ Report ============
  loadReport() {
    if (!this.selectedWebinarId) return;
    this.reportLoading = true;
    this.reportError = null;
    this.apiService
      .getWebinarReport(this.selectedWebinarId, this.attendedThresholdMin)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.report = response.data;
          else this.reportError = response.error || 'Failed to load report';
          this.reportLoading = false;
        },
        error: (err) => {
          this.reportError = err?.error?.error || 'Failed to load report';
          this.reportLoading = false;
        },
      });
  }

  // ============ Main table ============
  loadMainTable(page: number) {
    if (!this.selectedWebinarId) return;
    this.mainLoading = true;
    this.mainError = null;
    this.apiService
      .getWebinarMainTable(this.selectedWebinarId, this.attendedThresholdMin, page, this.mainPageSize, this.mainSortBy || undefined, this.mainSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.mainTable = response.data;
          else this.mainError = response.error || 'Failed to load the table';
          this.mainLoading = false;
        },
        error: (err) => {
          this.mainError = err?.error?.error || 'Failed to load the table';
          this.mainLoading = false;
        },
      });
  }

  get mainTotalPages(): number {
    if (!this.mainTable) return 1;
    return Math.max(1, Math.ceil(this.mainTable.total / this.mainTable.pageSize));
  }

  goToMainPage(page: number) {
    if (page < 1 || page > this.mainTotalPages) return;
    this.loadMainTable(page);
  }

  onMainPageSizeChange(size: number) {
    this.mainPageSize = Number(size);
    this.loadMainTable(1);
  }

  toggleMainSort(field: string) {
    if (this.mainSortBy === field) this.mainSortDir = this.mainSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.mainSortBy = field;
      this.mainSortDir = 'asc';
    }
    this.loadMainTable(1);
  }

  // ============ Not Joined table ============
  loadNotJoinedTable(page: number) {
    if (!this.selectedWebinarId) return;
    this.notJoinedLoading = true;
    this.notJoinedError = null;
    this.apiService
      .getWebinarNotJoinedTable(this.selectedWebinarId, this.attendedThresholdMin, page, this.notJoinedPageSize, this.notJoinedSortBy || undefined, this.notJoinedSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.notJoinedTable = response.data;
          else this.notJoinedError = response.error || 'Failed to load the table';
          this.notJoinedLoading = false;
        },
        error: (err) => {
          this.notJoinedError = err?.error?.error || 'Failed to load the table';
          this.notJoinedLoading = false;
        },
      });
  }

  get notJoinedTotalPages(): number {
    if (!this.notJoinedTable) return 1;
    return Math.max(1, Math.ceil(this.notJoinedTable.total / this.notJoinedTable.pageSize));
  }

  goToNotJoinedPage(page: number) {
    if (page < 1 || page > this.notJoinedTotalPages) return;
    this.loadNotJoinedTable(page);
  }

  onNotJoinedPageSizeChange(size: number) {
    this.notJoinedPageSize = Number(size);
    this.loadNotJoinedTable(1);
  }

  toggleNotJoinedSort(field: string) {
    if (this.notJoinedSortBy === field) this.notJoinedSortDir = this.notJoinedSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.notJoinedSortBy = field;
      this.notJoinedSortDir = 'asc';
    }
    this.loadNotJoinedTable(1);
  }

  // ============ Not Registered table ============
  loadNotRegisteredTable(page: number) {
    if (!this.selectedWebinarId) return;
    this.notRegisteredLoading = true;
    this.notRegisteredError = null;
    this.apiService
      .getWebinarNotRegisteredTable(this.selectedWebinarId, page, this.notRegisteredPageSize, this.notRegisteredSortBy || undefined, this.notRegisteredSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.notRegisteredTable = response.data;
          else this.notRegisteredError = response.error || 'Failed to load the table';
          this.notRegisteredLoading = false;
        },
        error: (err) => {
          this.notRegisteredError = err?.error?.error || 'Failed to load the table';
          this.notRegisteredLoading = false;
        },
      });
  }

  get notRegisteredTotalPages(): number {
    if (!this.notRegisteredTable) return 1;
    return Math.max(1, Math.ceil(this.notRegisteredTable.total / this.notRegisteredTable.pageSize));
  }

  goToNotRegisteredPage(page: number) {
    if (page < 1 || page > this.notRegisteredTotalPages) return;
    this.loadNotRegisteredTable(page);
  }

  onNotRegisteredPageSizeChange(size: number) {
    this.notRegisteredPageSize = Number(size);
    this.loadNotRegisteredTable(1);
  }

  toggleNotRegisteredSort(field: string) {
    if (this.notRegisteredSortBy === field) this.notRegisteredSortDir = this.notRegisteredSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.notRegisteredSortBy = field;
      this.notRegisteredSortDir = 'asc';
    }
    this.loadNotRegisteredTable(1);
  }

  private triggerCsvDownload(blob: Blob, filenamePrefix: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}-${this.report?.webinar.batchLabel || this.selectedWebinarId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  downloadMain() {
    if (!this.selectedWebinarId) return;
    this.apiService
      .downloadWebinarMainCsv(this.selectedWebinarId, this.attendedThresholdMin, this.mainSortBy || undefined, this.mainSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe((blob) => this.triggerCsvDownload(blob, 'main'));
  }

  downloadNotJoined() {
    if (!this.selectedWebinarId) return;
    this.apiService
      .downloadWebinarNotJoinedCsv(this.selectedWebinarId, this.attendedThresholdMin, this.notJoinedSortBy || undefined, this.notJoinedSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe((blob) => this.triggerCsvDownload(blob, 'not-joined'));
  }

  downloadNotRegistered() {
    if (!this.selectedWebinarId) return;
    this.apiService
      .downloadWebinarNotRegisteredCsv(this.selectedWebinarId, this.notRegisteredSortBy || undefined, this.notRegisteredSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe((blob) => this.triggerCsvDownload(blob, 'not-registered'));
  }

  // ============ Keyword search ============
  // Fires on every keystroke but debounced 400ms (see ngOnInit) so it doesn't hit the backend on
  // every character — only once typing pauses.
  onKeywordInput() {
    this.keywordSearch$.next();
  }

  loadKeywordTable(page: number) {
    if (!this.selectedWebinarId) return;
    if (!this.keywordInput.trim()) {
      this.keywordTable = null;
      return;
    }
    this.keywordLoading = true;
    this.keywordError = null;
    this.apiService
      .getWebinarKeywordMatches(this.selectedWebinarId, this.keywordInput.trim(), page, this.keywordPageSize, this.keywordSortBy || undefined, this.keywordSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.keywordTable = response.data;
          else this.keywordError = response.error || 'Failed to search chat messages';
          this.keywordLoading = false;
        },
        error: (err) => {
          this.keywordError = err?.error?.error || 'Failed to search chat messages';
          this.keywordLoading = false;
        },
      });
  }

  get keywordTotalPages(): number {
    if (!this.keywordTable) return 1;
    return Math.max(1, Math.ceil(this.keywordTable.total / this.keywordTable.pageSize));
  }

  goToKeywordPage(page: number) {
    if (page < 1 || page > this.keywordTotalPages) return;
    this.loadKeywordTable(page);
  }

  onKeywordPageSizeChange(size: number) {
    this.keywordPageSize = Number(size);
    this.loadKeywordTable(1);
  }

  toggleKeywordSort(field: string) {
    if (this.keywordSortBy === field) this.keywordSortDir = this.keywordSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.keywordSortBy = field;
      this.keywordSortDir = 'asc';
    }
    this.loadKeywordTable(1);
  }

  downloadKeyword() {
    if (!this.selectedWebinarId || !this.keywordInput.trim()) return;
    this.apiService
      .downloadWebinarKeywordCsv(this.selectedWebinarId, this.keywordInput.trim(), this.keywordSortBy || undefined, this.keywordSortDir)
      .pipe(takeUntil(this.destroy$))
      .subscribe((blob) => this.triggerCsvDownload(blob, `keyword-${this.keywordInput.trim()}`));
  }

  // ============ Upload ============
  toggleUploadPanel() {
    this.showUploadPanel = !this.showUploadPanel;
  }

  onParticipantsFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.participantsFile = input.files?.[0] || null;
  }

  onChatFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.chatFile = input.files?.[0] || null;
  }

  submitUpload() {
    if (!this.participantsFile || !this.chatFile) return;
    this.uploading = true;
    this.uploadError = null;
    this.apiService
      .uploadWebinarAnalysis(this.participantsFile, this.chatFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.uploading = false;
          if (response.success && response.data) {
            this.participantsFile = null;
            this.chatFile = null;
            this.showUploadPanel = false;
            this.selectedWebinarId = response.data.id;
            this.loadWebinarList();
          } else {
            this.uploadError = response.error || 'Upload failed';
          }
        },
        error: (err) => {
          this.uploading = false;
          this.uploadError = err?.error?.error || 'Upload failed — check both files are the right Zoom exports';
        },
      });
  }

  // ============ Attendee detail popup ============
  openAttendeeDetail(email: string) {
    if (!this.selectedWebinarId) return;
    this.showDetailModal = true;
    this.detailLoading = true;
    this.detailError = null;
    this.detailData = null;
    this.apiService
      .getWebinarAttendeeDetail(this.selectedWebinarId, email)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.detailData = response.data;
          else this.detailError = response.error || 'Failed to load attendee detail';
          this.detailLoading = false;
        },
        error: (err) => {
          this.detailError = err?.error?.error || 'Failed to load attendee detail';
          this.detailLoading = false;
        },
      });
  }

  closeDetail() {
    this.showDetailModal = false;
  }

  // ============ Display helpers ============
  formatMin(min: number | null | undefined): string {
    if (min === null || min === undefined) return '—';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
}
