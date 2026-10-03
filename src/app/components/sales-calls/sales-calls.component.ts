import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';

type DatePreset = 'today' | 'yesterday' | 'last7days' | 'last15days' | 'last30days' | 'thisMonth' | 'lastMonth' | 'custom';
type SubTab = 'calls' | 'leads';

interface CountPct {
  count: number;
  pct: number;
}

interface AgentCallStats {
  agent: string;
  total: number;
  rnr: number;
  picked: number;
  booked: number;
  notQualified: number;
  pickedPctOfTotal: number;
  bookedPctOfPicked: number;
  bookedPctOfTotal: number;
  totalDurationSec: number;
  avgDurationPerPickedCallSec: number | null;
}

interface CallsOverview {
  kpis: {
    totalCalls: number;
    picked: CountPct;
    rnr: CountPct;
    notQualified: CountPct;
    avgCallDurationSec: number | null;
    maxCallDurationSec: number | null;
    totalCallDurationSec: number;
    avgFollowupsPerIndividual: number | null;
  };
  byAgent: AgentCallStats[];
  team: AgentCallStats;
  outcomeMatrix: { outcome: string; byAgent: Record<string, number> }[];
}

interface AgentLeadStats {
  agent: string;
  total: number;
  rnr: number;
  picked: number;
  booked: number;
  notQualified: number;
  pickedPctOfTotal: number;
  bookedPctOfPicked: number;
  bookedPctOfTotal: number;
  notQualifiedPctOfTotal: number;
}

interface LeadsOverview {
  kpis: {
    totalLeadsCalled: number;
    picked: CountPct;
    rnr: CountPct;
    booked: CountPct;
    notQualified: CountPct;
    avgLeadsPerDay: number | null;
    maxLeadsReachedInADay: number | null;
  };
  byAgent: AgentLeadStats[];
  team: AgentLeadStats;
  outcomeMatrix: { outcome: string; byAgent: Record<string, number> }[];
}

interface CallRecord {
  id: string;
  dateTime: string;
  agent: string;
  leadId: string | null;
  leadName: string | null;
  number: string | null;
  disposition: string | null;
  subDisposition: string | null;
  durationSec: number;
  recordingUrl: string | null;
}

interface LeadRecord {
  leadId: string;
  name: string | null;
  number: string | null;
  agent: string;
  disposition: string | null;
  subDisposition: string | null;
  followUpDateTime: string | null;
  callsInPeriod: number;
  lastCallDateTime: string | null;
}

interface LeadHistoryEntry {
  id: string;
  dateTime: string;
  agent: string;
  disposition: string | null;
  subDisposition: string | null;
  durationSec: number;
  recordingUrl: string | null;
}

interface PagedResult<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

// Zoho CRM "Calls" + "Leads" modules, read live via COQL (see backend ZohoCrmService) — no sync job,
// always current as of whenever the page is loaded/refreshed. Both sub-tabs share one filter bar
// (date range, agents, lead funnel); switching tabs just changes which already-loaded data is shown.
@Component({
  selector: 'app-sales-calls',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sales-calls.component.html',
  styleUrls: ['./sales-calls.component.scss'],
})
export class SalesCallsComponent implements OnInit, OnDestroy {
  permissions = PERMISSIONS;

  activeSubTab: SubTab = 'calls';

  // ============ Shared filters ============
  datePreset: DatePreset = 'thisMonth';
  customStart = '';
  customEnd = '';

  allAgents: string[] = [];
  selectedAgents = new Set<string>(); // every agent in it = "all selected" (no filter sent)
  showAgentPicker = false;

  allLeadSources: string[] = [];
  leadSource = 'all';

  // ============ Data ============
  callsData: CallsOverview | null = null;
  leadsData: LeadsOverview | null = null;
  loading = true;
  error: string | null = null;

  // ============ Call Records / Lead Records (paginated raw activity log) ============
  callRecords: PagedResult<CallRecord> | null = null;
  callRecordsLoading = true;
  callRecordsError: string | null = null;

  leadRecords: PagedResult<LeadRecord> | null = null;
  leadRecordsLoading = true;
  leadRecordsError: string | null = null;

  // ============ Follow-up history popup (shared by both record tables) ============
  showHistoryModal = false;
  historyLeadName: string | null = null;
  historyLoading = false;
  historyError: string | null = null;
  historyEntries: LeadHistoryEntry[] = [];

  private destroy$ = new Subject<void>();

  constructor(private apiService: ApiService, public authService: AuthService) {}

  ngOnInit() {
    this.loadFiltersThenData();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setSubTab(tab: SubTab) {
    this.activeSubTab = tab;
  }

  // ============ Filters ============
  private loadFiltersThenData() {
    this.apiService
      .getSalesCallFilters()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) {
            this.allAgents = response.data.agents || [];
            this.allLeadSources = response.data.leadSources || [];
            this.selectedAgents = new Set(this.allAgents); // start with everyone selected
          }
          this.loadAll();
        },
        error: (err) => {
          console.error(err);
          this.loadAll(); // filters are a nice-to-have; the page still works without them
        },
      });
  }

  onPresetChange(p: DatePreset) {
    this.datePreset = p;
    if (p !== 'custom') this.loadAll();
  }

  onCustomRangeChange() {
    if (this.customStart && this.customEnd) {
      this.datePreset = 'custom';
      this.loadAll();
    }
  }

  toggleAgentPicker() {
    this.showAgentPicker = !this.showAgentPicker;
  }

  isAgentSelected(agent: string): boolean {
    return this.selectedAgents.has(agent);
  }

  toggleAgent(agent: string) {
    if (this.selectedAgents.has(agent)) this.selectedAgents.delete(agent);
    else this.selectedAgents.add(agent);
    this.loadAll();
  }

  selectAllAgents() {
    this.selectedAgents = new Set(this.allAgents);
    this.loadAll();
  }

  clearAgents() {
    this.selectedAgents = new Set();
    this.loadAll();
  }

  get agentFilterLabel(): string {
    if (this.selectedAgents.size === 0) return 'No agents selected';
    if (this.selectedAgents.size === this.allAgents.length) return 'All Agents';
    if (this.selectedAgents.size === 1) return [...this.selectedAgents][0];
    return `${this.selectedAgents.size} agents`;
  }

  onLeadSourceChange(value: string) {
    this.leadSource = value;
    this.loadAll();
  }

  private buildParams(): { period?: string; startDate?: string; endDate?: string; agents?: string; leadSource?: string } {
    const params: any = {};
    if (this.datePreset === 'custom' && this.customStart && this.customEnd) {
      params.startDate = this.customStart;
      params.endDate = this.customEnd;
    } else {
      params.period = this.datePreset;
    }
    // Only send `agents` when it's a genuine subset — sending the full list would silently freeze
    // out any agent added in Zoho after this page loaded.
    if (this.selectedAgents.size > 0 && this.selectedAgents.size < this.allAgents.length) {
      params.agents = [...this.selectedAgents].join(',');
    } else if (this.selectedAgents.size === 0 && this.allAgents.length > 0) {
      params.agents = '__none__'; // deliberately matches nothing — "no agents selected" means show nothing
    }
    if (this.leadSource !== 'all') params.leadSource = this.leadSource;
    return params;
  }

  // ============ Data loading ============
  // Re-fetches every number on the page from Zoho (overview KPIs + both record tables, reset to page
  // 1) without touching the filters themselves — so clicking Refresh never silently resets what the
  // user has selected.
  loadAll() {
    this.loading = true;
    this.error = null;
    const params = this.buildParams();

    forkJoin({
      calls: this.apiService.getSalesCallsOverview(params),
      leads: this.apiService.getSalesLeadsOverview(params),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ calls, leads }) => {
          if (calls.success && calls.data) this.callsData = calls.data;
          else this.error = calls.error || 'Failed to load calls data';

          if (leads.success && leads.data) this.leadsData = leads.data;
          else this.error = this.error || leads.error || 'Failed to load leads data';

          this.loading = false;
        },
        error: (err) => {
          this.error = err?.error?.error || 'Failed to load Zoho CRM data';
          console.error(err);
          this.loading = false;
        },
      });

    this.loadCallRecords(1);
    this.loadLeadRecords(1);
  }

  refreshAll() {
    this.loadAll();
  }

  // ============ Call Records ============
  loadCallRecords(page: number) {
    this.callRecordsLoading = true;
    this.callRecordsError = null;

    this.apiService
      .getSalesCallRecords({ ...this.buildParams(), page })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.callRecords = response.data;
          else this.callRecordsError = response.error || 'Failed to load call records';
          this.callRecordsLoading = false;
        },
        error: (err) => {
          this.callRecordsError = err?.error?.error || 'Failed to load call records';
          console.error(err);
          this.callRecordsLoading = false;
        },
      });
  }

  get callRecordsTotalPages(): number {
    if (!this.callRecords) return 1;
    return Math.max(1, Math.ceil(this.callRecords.total / this.callRecords.pageSize));
  }

  goToCallRecordsPage(page: number) {
    if (page < 1 || page > this.callRecordsTotalPages) return;
    this.loadCallRecords(page);
  }

  // ============ Lead Records ============
  loadLeadRecords(page: number) {
    this.leadRecordsLoading = true;
    this.leadRecordsError = null;

    this.apiService
      .getSalesLeadRecords({ ...this.buildParams(), page })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.leadRecords = response.data;
          else this.leadRecordsError = response.error || 'Failed to load lead records';
          this.leadRecordsLoading = false;
        },
        error: (err) => {
          this.leadRecordsError = err?.error?.error || 'Failed to load lead records';
          console.error(err);
          this.leadRecordsLoading = false;
        },
      });
  }

  get leadRecordsTotalPages(): number {
    if (!this.leadRecords) return 1;
    return Math.max(1, Math.ceil(this.leadRecords.total / this.leadRecords.pageSize));
  }

  goToLeadRecordsPage(page: number) {
    if (page < 1 || page > this.leadRecordsTotalPages) return;
    this.loadLeadRecords(page);
  }

  // ============ Follow-up history popup ============
  // Always the lead's FULL history, never limited to whatever date range the table is showing —
  // that's the whole point: seeing every attempt made, not just the ones in the current filter.
  openHistory(leadId: string | null, leadName: string | null) {
    if (!leadId) return; // this call/row isn't linked to a Lead record — nothing to show
    this.showHistoryModal = true;
    this.historyLeadName = leadName;
    this.historyLoading = true;
    this.historyError = null;
    this.historyEntries = [];

    this.apiService
      .getSalesLeadHistory(leadId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          if (response.success && response.data) this.historyEntries = response.data;
          else this.historyError = response.error || 'Failed to load follow-up history';
          this.historyLoading = false;
        },
        error: (err) => {
          this.historyError = err?.error?.error || 'Failed to load follow-up history';
          console.error(err);
          this.historyLoading = false;
        },
      });
  }

  closeHistory() {
    this.showHistoryModal = false;
  }

  // ============ Display helpers ============
  // Short form for a single call's length (always under a few minutes) — "2m 5s".
  formatDuration(sec: number | null): string {
    if (sec === null || sec === undefined) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
  }

  // Long form for a summed total across many calls, which can run into hours — "16h 33m".
  formatDurationLong(sec: number | null): string {
    if (sec === null || sec === undefined) return '—';
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  get callsOutcomeAgentNames(): string[] {
    return this.callsData?.byAgent.map((a) => a.agent) || [];
  }

  get leadsOutcomeAgentNames(): string[] {
    return this.leadsData?.byAgent.map((a) => a.agent) || [];
  }

  outcomeRowTotal(row: { byAgent: Record<string, number> }): number {
    return Object.values(row.byAgent).reduce((a, b) => a + b, 0);
  }
}
