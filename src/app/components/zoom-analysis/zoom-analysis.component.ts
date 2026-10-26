import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Observable, Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

type SubTab = 'main' | 'notJoined' | 'notRegistered' | 'keyword' | 'chat';

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

interface SegmentReport {
  totalRegistered: number;
  attended: CountPct;
  totalChats: number;
  avgAttendedDurationMin: number | null;
  avgRejoinsAttended: number | null;
  peakConcurrent: { count: number; atTime: string | null };
  stayedTillMiddle: CountPct;
  stayedTillEnd2hr: CountPct | null;
  stayedTill150Min: CountPct | null;
  stayedTill180Min: CountPct | null;
  conversions: { count: number; avgAttendedMin: number | null };
  reRegisteredToday: CountPct | null;
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
    segments: {
      current: SegmentReport;
      previousNotPaid: SegmentReport;
      alreadyPaid: SegmentReport;
      organic: SegmentReport;
    };
  };
  registrationDataAvailable: boolean;
  funnelPaidTotal: number | null;
}

type SortDir = 'asc' | 'desc';

interface MainRow {
  email: string;
  name: string;
  number: string;
  registeredBatches: string | null;
  paid5k: boolean;
  paidOnBatch: string | null;
  totalMin: number;
  rejoins: number;
  chatCount: number;
  signedUp: boolean;
}

interface NotJoinedRow {
  email: string;
  name: string;
  number: string;
  registeredBatches: string | null;
  paid5k: boolean;
  paidOnBatch: string | null;
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
  msg: string;
}

interface ChatPersonRow {
  email: string;
  name: string;
  number: string;
  signedUp: boolean;
  chatCount: number;
}

interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface SegmentMemberRow {
  email: string;
  name: string;
  number: string;
  signedUp: boolean;
  signupDate: string | null;
  referralCode: string | null;
  attended: boolean;
  totalMin: number;
}

interface AttendeeDetail {
  email: string;
  name: string;
  number: string;
  signedUp: boolean;
  previouslyPaid: boolean;
  previouslyPaidOn: string | null;
  paid5k: boolean;
  paidOnBatch: string | null;
  registeredBatches: string | null;
  totalMin: number;
  sessions: { joinTime: string; leaveTime: string; durationMin: number }[];
  chat: { wallClock: string | null; msg: string }[];
}

// Zoom webinar attendance + chat, uploaded per batch (CSV + chat .txt), scored live against
// userdetail / the Full Paid sheet / the funnel registration sheet — never baked into the stored
// upload, so "already paid" status stays current even if it changes days after the webinar.
@Component({
  selector: 'app-zoom-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './zoom-analysis.component.html',
  styleUrls: ['./zoom-analysis.component.scss'],
})
export class ZoomAnalysisComponent implements OnInit, OnDestroy {
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

  // Batch(es) column filter — shared by Main and Not Joined since both key off the same per-person
  // registeredBatches data. Empty selection means "no filter" (show everyone), not "show nobody".
  allBatchOptions: string[] = [];
  selectedBatches = new Set<string>();
  showBatchFilterPanel = false;

  mainTable: PagedResult<MainRow> | null = null;
  mainLoading = false;
  mainError: string | null = null;
  mainPageSize = 20;
  mainSortBy: string | null = null;
  mainSortDir: SortDir = 'desc';
  mainSearchInput = '';
  private mainSearch$ = new Subject<void>();

  notJoinedTable: PagedResult<NotJoinedRow> | null = null;
  notJoinedLoading = false;
  notJoinedError: string | null = null;
  notJoinedPageSize = 20;
  notJoinedSortBy: string | null = null;
  notJoinedSortDir: SortDir = 'desc';
  notJoinedSearchInput = '';
  private notJoinedSearch$ = new Subject<void>();

  notRegisteredTable: (PagedResult<NotRegisteredRow> & { registrationDataAvailable: boolean }) | null = null;
  notRegisteredLoading = false;
  notRegisteredError: string | null = null;
  notRegisteredPageSize = 20;
  notRegisteredSortBy: string | null = null;
  notRegisteredSortDir: SortDir = 'desc';
  notRegisteredSearchInput = '';
  private notRegisteredSearch$ = new Subject<void>();

  keywordInput = '';
  keywordTable: PagedResult<KeywordRow> | null = null;
  keywordLoading = false;
  keywordError: string | null = null;
  keywordPageSize = 20;
  keywordSortBy: string | null = null;
  keywordSortDir: SortDir = 'desc';
  private keywordSearch$ = new Subject<void>();

  // ============ Chat tab (browse one person's full transcript cleanly) ============
  chatPeople: ChatPersonRow[] = [];
  chatPeopleLoading = false;
  chatPersonSearchInput = ''; // client-side only — the full chatPeople list is small and already loaded
  selectedChatEmail: string | null = null;
  chatDetail: AttendeeDetail | null = null;
  chatDetailLoading = false;
  chatDetailError: string | null = null;
  chatKeywordFilterInput = ''; // narrows the selected person's OWN messages, with the match highlighted

  showUploadPanel = false;
  participantsFile: File | null = null;
  chatFile: File | null = null;
  uploading = false;
  uploadError: string | null = null;

  showDetailModal = false;
  detailLoading = false;
  detailError: string | null = null;
  detailData: AttendeeDetail | null = null;

  // ============ Segment member drill-down (clicking into a segment's KPI cards) ============
  showSegmentModal = false;
  segmentModalKey: string | null = null;
  segmentModalMetric: string = 'total';
  segmentModalTitle = '';
  segmentMembersTable: PagedResult<SegmentMemberRow> | null = null;
  segmentMembersLoading = false;
  segmentMembersError: string | null = null;
  segmentMembersPageSize = 20;
  segmentMembersSortBy: string | null = null;
  segmentMembersSortDir: SortDir = 'desc';
  segmentMembersSearchInput = '';
  private segmentMembersSearch$ = new Subject<void>();

  // ============ Download format picker (shared by every download button on this tab) ============
  showDownloadModal = false;
  downloadKind: 'main' | 'notJoined' | 'notRegistered' | 'keyword' | null = null;
  downloadFormat: 'raw' | 'aisensy' = 'raw';
  downloadTagInput = '';

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.loadWebinarList();
    this.keywordSearch$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => this.loadKeywordTable(1));
    this.mainSearch$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => this.loadMainTable(1));
    this.notJoinedSearch$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => this.loadNotJoinedTable(1));
    this.notRegisteredSearch$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => this.loadNotRegisteredTable(1));
    this.segmentMembersSearch$.pipe(debounceTime(400), takeUntil(this.destroy$)).subscribe(() => this.loadSegmentMembers(1));
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
              this.selectWebinar(this.webinars[0].id);
            }
          } else {
            this.listError = response.error || 'Failed to load uploaded webinars';
          }
          this.listLoading = false;
        },
        error: (err) => {
          this.listError = err?.error?.error || 'Failed to load uploaded webinars';
          this.listLoading = false;
        },
      });
  }

  onWebinarChange(id: string) {
    this.selectWebinar(id);
  }

  // Single entry point for "a webinar is now selected" — used both by the dropdown's change handler
  // AND the initial auto-select on page load, so the latter can never again skip a step (it did, for
  // loadBatchOptions, until this was pulled out: the table showed real batch tags while the filter
  // dropdown claimed "No batch data for this webinar" because only the dropdown path called it).
  private selectWebinar(id: string) {
    this.selectedWebinarId = id;
    this.keywordInput = '';
    this.keywordTable = null;
    this.mainSearchInput = '';
    this.notJoinedSearchInput = '';
    this.notRegisteredSearchInput = '';
    this.selectedBatches = new Set<string>();
    this.allBatchOptions = [];
    this.chatPeople = [];
    this.chatPersonSearchInput = '';
    this.selectedChatEmail = null;
    this.chatDetail = null;
    this.chatKeywordFilterInput = '';
    this.loadBatchOptions();
    this.loadChatPeople();
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

  // ============ Batch(es) filter (shared by Main + Not Joined) ============
  private loadBatchOptions() {
    if (!this.selectedWebinarId) return;
    this.apiService
      .getWebinarBatchOptions(this.selectedWebinarId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.allBatchOptions = response.data;
        },
      });
  }

  toggleBatchFilterPanel() {
    this.showBatchFilterPanel = !this.showBatchFilterPanel;
  }

  isBatchSelected(tag: string): boolean {
    return this.selectedBatches.has(tag);
  }

  toggleBatchOption(tag: string) {
    if (this.selectedBatches.has(tag)) this.selectedBatches.delete(tag);
    else this.selectedBatches.add(tag);
    this.onBatchFilterChange();
  }

  clearBatchFilter() {
    this.selectedBatches = new Set<string>();
    this.onBatchFilterChange();
  }

  get batchFilterLabel(): string {
    if (this.selectedBatches.size === 0) return 'All Batches';
    if (this.selectedBatches.size === 1) return [...this.selectedBatches][0];
    return `${this.selectedBatches.size} batches selected`;
  }

  private batchParam(): string[] | undefined {
    return this.selectedBatches.size > 0 ? Array.from(this.selectedBatches) : undefined;
  }

  // Shared by Main and Not Joined, so a selection made while looking at one tab is already applied
  // when you switch to the other.
  private onBatchFilterChange() {
    this.loadMainTable(1);
    this.loadNotJoinedTable(1);
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
      .getWebinarMainTable(this.selectedWebinarId, this.attendedThresholdMin, page, this.mainPageSize, this.mainSortBy || undefined, this.mainSortDir, this.batchParam(), this.mainSearchInput.trim() || undefined)
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

  onMainSearchInput() {
    this.mainSearch$.next();
  }

  // ============ Not Joined table ============
  loadNotJoinedTable(page: number) {
    if (!this.selectedWebinarId) return;
    this.notJoinedLoading = true;
    this.notJoinedError = null;
    this.apiService
      .getWebinarNotJoinedTable(this.selectedWebinarId, this.attendedThresholdMin, page, this.notJoinedPageSize, this.notJoinedSortBy || undefined, this.notJoinedSortDir, this.batchParam(), this.notJoinedSearchInput.trim() || undefined)
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

  onNotJoinedSearchInput() {
    this.notJoinedSearch$.next();
  }

  // ============ Not Registered table ============
  loadNotRegisteredTable(page: number) {
    if (!this.selectedWebinarId) return;
    this.notRegisteredLoading = true;
    this.notRegisteredError = null;
    this.apiService
      .getWebinarNotRegisteredTable(this.selectedWebinarId, page, this.notRegisteredPageSize, this.notRegisteredSortBy || undefined, this.notRegisteredSortDir, this.notRegisteredSearchInput.trim() || undefined)
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

  onNotRegisteredSearchInput() {
    this.notRegisteredSearch$.next();
  }

  private triggerCsvDownload(blob: Blob, filenamePrefix: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix}-${this.report?.webinar.batchLabel || this.selectedWebinarId}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  // ============ Download format picker ============
  // Every download button on this tab opens the same modal first — "Raw" (all columns, the
  // long-standing behaviour) or "AiSensy" (Name/Mobile Number/Tags only, for bulk WhatsApp import),
  // with a Tag text field that only appears for AiSensy, since AiSensy needs one to know which
  // broadcast list/segment these contacts belong to.
  openDownloadModal(kind: 'main' | 'notJoined' | 'notRegistered' | 'keyword') {
    if (!this.selectedWebinarId) return;
    if (kind === 'keyword' && !this.keywordInput.trim()) return;
    this.downloadKind = kind;
    this.downloadFormat = 'raw';
    this.downloadTagInput = '';
    this.showDownloadModal = true;
  }

  closeDownloadModal() {
    this.showDownloadModal = false;
    this.downloadKind = null;
  }

  confirmDownload() {
    if (!this.selectedWebinarId || !this.downloadKind) return;
    const format = this.downloadFormat;
    const tag = this.downloadTagInput.trim();

    let obs: Observable<Blob>;
    let filenamePrefix: string;

    if (this.downloadKind === 'main') {
      filenamePrefix = 'main';
      obs = this.apiService.downloadWebinarMainCsv(this.selectedWebinarId, this.attendedThresholdMin, this.mainSortBy || undefined, this.mainSortDir, this.batchParam(), this.mainSearchInput.trim() || undefined, format, tag);
    } else if (this.downloadKind === 'notJoined') {
      filenamePrefix = 'not-joined';
      obs = this.apiService.downloadWebinarNotJoinedCsv(this.selectedWebinarId, this.attendedThresholdMin, this.notJoinedSortBy || undefined, this.notJoinedSortDir, this.batchParam(), this.notJoinedSearchInput.trim() || undefined, format, tag);
    } else if (this.downloadKind === 'notRegistered') {
      filenamePrefix = 'not-registered';
      obs = this.apiService.downloadWebinarNotRegisteredCsv(this.selectedWebinarId, this.notRegisteredSortBy || undefined, this.notRegisteredSortDir, this.notRegisteredSearchInput.trim() || undefined, format, tag);
    } else {
      if (!this.keywordInput.trim()) return;
      filenamePrefix = `keyword-${this.keywordInput.trim()}`;
      obs = this.apiService.downloadWebinarKeywordCsv(this.selectedWebinarId, this.keywordInput.trim(), this.keywordSortBy || undefined, this.keywordSortDir, format, tag);
    }

    obs.pipe(takeUntil(this.destroy$)).subscribe((blob) => {
      this.triggerCsvDownload(blob, format === 'aisensy' ? `${filenamePrefix}-aisensy` : filenamePrefix);
    });
    this.closeDownloadModal();
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

  // ============ Segment member drill-down ============
  // Each card in a segment opens the people behind THAT card's own number — "Attended" opens the
  // 32 who attended, "Stayed Till Middle" opens the 27 who did, etc. — not the whole segment, so
  // every click site passes its own metric key alongside the segment key.
  openSegmentMembers(segmentKey: string, segmentTitle: string, metric: string, metricLabel: string) {
    if (!this.selectedWebinarId) return;
    this.segmentModalKey = segmentKey;
    this.segmentModalMetric = metric;
    this.segmentModalTitle = `${segmentTitle} — ${metricLabel}`;
    this.segmentMembersSearchInput = '';
    this.segmentMembersSortBy = null;
    this.segmentMembersSortDir = 'desc';
    this.showSegmentModal = true;
    this.loadSegmentMembers(1);
  }

  closeSegmentModal() {
    this.showSegmentModal = false;
    this.segmentModalKey = null;
    this.segmentMembersTable = null;
  }

  loadSegmentMembers(page: number) {
    if (!this.selectedWebinarId || !this.segmentModalKey) return;
    this.segmentMembersLoading = true;
    this.segmentMembersError = null;
    this.apiService
      .getWebinarSegmentMembers(
        this.selectedWebinarId,
        this.segmentModalKey,
        this.segmentModalMetric,
        this.attendedThresholdMin,
        page,
        this.segmentMembersPageSize,
        this.segmentMembersSortBy || undefined,
        this.segmentMembersSortDir,
        this.segmentMembersSearchInput.trim() || undefined
      )
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.segmentMembersTable = response.data;
          else this.segmentMembersError = response.error || 'Failed to load this segment\'s members';
          this.segmentMembersLoading = false;
        },
        error: (err) => {
          this.segmentMembersError = err?.error?.error || 'Failed to load this segment\'s members';
          this.segmentMembersLoading = false;
        },
      });
  }

  get segmentMembersTotalPages(): number {
    if (!this.segmentMembersTable) return 1;
    return Math.max(1, Math.ceil(this.segmentMembersTable.total / this.segmentMembersTable.pageSize));
  }

  goToSegmentMembersPage(page: number) {
    if (page < 1 || page > this.segmentMembersTotalPages) return;
    this.loadSegmentMembers(page);
  }

  onSegmentMembersPageSizeChange(size: number) {
    this.segmentMembersPageSize = Number(size);
    this.loadSegmentMembers(1);
  }

  toggleSegmentMembersSort(field: string) {
    if (this.segmentMembersSortBy === field) this.segmentMembersSortDir = this.segmentMembersSortDir === 'asc' ? 'desc' : 'asc';
    else {
      this.segmentMembersSortBy = field;
      this.segmentMembersSortDir = 'asc';
    }
    this.loadSegmentMembers(1);
  }

  onSegmentMembersSearchInput() {
    this.segmentMembersSearch$.next();
  }

  // "Zoom (no other record)" etc. are source labels, not real Sigma Scanner referral codes — shown
  // in a muted/italic style in the template based on this, so it reads as provenance rather than a
  // promo code someone could mistake for an actual referral.
  isReferralSourceLabel(code: string | null): boolean {
    return code === 'Webinar Registration Sheet' || code === 'Paid Sheet' || code === 'Zoom (no other record)';
  }

  // ============ Display helpers ============
  formatMin(min: number | null | undefined): string {
    if (min === null || min === undefined) return '—';
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  pctOfTotal(n: number): number {
    const total = this.report?.cards.totalRegistered || 0;
    return total > 0 ? Math.round((n / total) * 1000) / 10 : 0;
  }

  // Every attendee falls into exactly one of these four (see the backend's priority order: already
  // paid first, then an earlier registration, then today's, Organic as the catch-all) — driving the
  // template off this list instead of repeating the same 10-card block four times by hand.
  get segmentSections(): { key: string; title: string; totalTitle: string; data: SegmentReport }[] {
    if (!this.report) return [];
    const s = this.report.cards.segments;
    return [
      { key: 'current', title: 'Current Webinar', totalTitle: 'Registered via the funnel for THIS webinar date with no earlier registration on file, not already paid before it (a live conversion today still counts as Current, not Already Paid)', data: s.current },
      { key: 'previousNotPaid', title: 'From Previous Webinar (Not Paid)', totalTitle: 'Their EARLIEST registration (₹79/₹99) via the funnel was for an EARLIER webinar, not already paid before this one — still counted here even if they also registered again for today', data: s.previousNotPaid },
      { key: 'alreadyPaid', title: 'Already Paid Members', totalTitle: 'Tribe / TribeYearly, or confirmed paid the 5k STRICTLY BEFORE this webinar\'s date — paying live during today\'s session does not count here', data: s.alreadyPaid },
      { key: 'organic', title: 'Organic', totalTitle: 'Everyone left over — no tracked registration source, not already paid before this webinar', data: s.organic },
    ];
  }

  // "Registered Batch(es)" is stored as one comma-joined string ("20th Dec 2025 Momentum, 3rd Oct
  // 2026 Momentum") — split back into a list here so the template can stack them as chips instead of
  // one long line that blows out the column width.
  batchTags(registeredBatches: string | null): string[] {
    return registeredBatches ? registeredBatches.split(', ') : [];
  }

  // ============ Chat tab ============
  private loadChatPeople() {
    if (!this.selectedWebinarId) return;
    this.chatPeopleLoading = true;
    this.apiService
      .getWebinarChatPeople(this.selectedWebinarId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.chatPeople = response.data;
          this.chatPeopleLoading = false;
        },
        error: () => {
          this.chatPeopleLoading = false;
        },
      });
  }

  // Small, already-fully-loaded list — filtered instantly client-side rather than round-tripping
  // the server on every keystroke like the paginated tables have to.
  get filteredChatPeople(): ChatPersonRow[] {
    const q = this.chatPersonSearchInput.trim().toLowerCase();
    if (!q) return this.chatPeople;
    return this.chatPeople.filter(
      (p) => p.name.toLowerCase().includes(q) || p.number.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || (p.signedUp ? 'yes' : 'no').includes(q)
    );
  }

  selectChatPerson(email: string) {
    if (!this.selectedWebinarId) return;
    this.selectedChatEmail = email;
    this.chatKeywordFilterInput = '';
    this.chatDetailLoading = true;
    this.chatDetailError = null;
    this.chatDetail = null;
    this.apiService
      .getWebinarAttendeeDetail(this.selectedWebinarId, email)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.chatDetail = response.data;
          else this.chatDetailError = response.error || 'Failed to load chat';
          this.chatDetailLoading = false;
        },
        error: (err) => {
          this.chatDetailError = err?.error?.error || 'Failed to load chat';
          this.chatDetailLoading = false;
        },
      });
  }

  closeChatPerson() {
    this.selectedChatEmail = null;
    this.chatDetail = null;
  }

  // The whole transcript is already loaded for the selected person, so "search by keyword" just
  // narrows this in-memory list — no extra round trip needed.
  get filteredChatMessages(): { wallClock: string | null; msg: string }[] {
    if (!this.chatDetail) return [];
    const q = this.chatKeywordFilterInput.trim().toLowerCase();
    if (!q) return this.chatDetail.chat;
    return this.chatDetail.chat.filter((c) => c.msg.toLowerCase().includes(q));
  }

  private escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Wraps the active keyword match in <mark> so it's visible at a glance while scanning a long
  // transcript — text is HTML-escaped first so chat content itself can never inject markup. Takes
  // the term explicitly so both the Chat tab (its own within-chat search) and the Keyword tab (the
  // word that was searched) can reuse the same highlighter.
  highlightedMsg(msg: string, term: string): SafeHtml {
    const escaped = this.escapeHtml(msg);
    const q = term.trim();
    if (!q) return this.sanitizer.bypassSecurityTrustHtml(escaped);
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return this.sanitizer.bypassSecurityTrustHtml(escaped.replace(re, '<mark>$1</mark>'));
  }
}
