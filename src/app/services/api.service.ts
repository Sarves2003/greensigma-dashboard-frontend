import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { APIResponse, KPIResponse, ChartDataPoint, User, PaginatedResponse } from '@models/index';

@Injectable({
  providedIn: 'root',
})
export class ApiService {
  // private baseUrl = 'http://localhost:5000/api';
  private baseUrl = 'https://greensigma-dashboard-backend-git-322775398411.us-central1.run.app/api';


  constructor(private http: HttpClient) {}

  // Overview V2
  private buildParams(params: any): HttpParams {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return httpParams;
  }

  getKeyMetricsV2(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/key-metrics`, { params: this.buildParams(params) });
  }

  getFeatureUsageV2(params: any): Observable<APIResponse<any[]>> {
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/overview-v2/feature-usage`, { params: this.buildParams(params) });
  }

  getSignupsMonthlyPlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/signups-monthly`, { params: this.buildParams(params) });
  }

  getLedgerCohortPlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/ledger-cohort`, { params: this.buildParams(params) });
  }

  getActivationRatePlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/activation-rate`, { params: this.buildParams(params) });
  }

  getLiveCapitalRatePlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/live-capital-rate`, { params: this.buildParams(params) });
  }

  getActiveUserFlowPlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/active-user-flow`, { params: this.buildParams(params) });
  }

  getActiveUserFlowMonthlyPlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/active-user-flow-monthly`, { params: this.buildParams(params) });
  }

  getActiveUserBreakdownPlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/active-user-breakdown`, { params: this.buildParams(params) });
  }

  getMonthlyActivePaidPlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/monthly-active-paid`, { params: this.buildParams(params) });
  }

  getEngagementDistributionPlot(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/overview-v2/plot/engagement-distribution`, { params: this.buildParams(params) });
  }

  // Usage Analysis
  getUsageAnalysisMain(params: any): Observable<APIResponse<any[]>> {
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/usage-analysis/main`, { params: this.buildParams(params) });
  }

  getUsageAnalysisDemoCalls(): Observable<APIResponse<any[]>> {
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/usage-analysis/demo-calls`);
  }

  getUsageAnalysisAssessments(): Observable<APIResponse<any[]>> {
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/usage-analysis/assessments`);
  }

  // Activation Tracker
  getActivationTable(date: string): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/activation-tracker/table`, { params: this.buildParams({ date }) });
  }

  saveActivationRemark(phone: string, batchDate: string, remark: string): Observable<APIResponse<any>> {
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/activation-tracker/remark`, { phone, batchDate, remark });
  }

  saveActivationDayOverride(phone: string, batchDate: string, day: number, completed: boolean | null): Observable<APIResponse<any>> {
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/activation-tracker/day-override`, { phone, batchDate, day, completed });
  }

  // Emandate Tracker
  getEmandateTable(date: string): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/emandate-tracker/table`, { params: this.buildParams({ date }) });
  }

  getEmandateOverview(dates: string[]): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/emandate-tracker/overview`, { params: this.buildParams({ dates: dates.join(',') }) });
  }

  saveEmandateRemark(phone: string, batchDate: string, remark: string): Observable<APIResponse<any>> {
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/emandate-tracker/remark`, { phone, batchDate, remark });
  }

  saveEmandateStatusOverride(phone: string, batchDate: string, status: string | null): Observable<APIResponse<any>> {
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/emandate-tracker/status-override`, { phone, batchDate, status });
  }

  // Overview (legacy)
  getKPIs(params: any): Observable<APIResponse<KPIResponse[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<APIResponse<KPIResponse[]>>(`${this.baseUrl}/overview/kpis`, {
      params: httpParams,
    });
  }

  getDailyTrend(params: any): Observable<APIResponse<ChartDataPoint[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<APIResponse<ChartDataPoint[]>>(`${this.baseUrl}/overview/daily-trend`, {
      params: httpParams,
    });
  }

  getUserTypeDistribution(params: any): Observable<APIResponse<ChartDataPoint[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<ChartDataPoint[]>>(
      `${this.baseUrl}/overview/user-type-distribution`,
      { params: httpParams }
    );
  }

  getStateDistribution(params: any): Observable<APIResponse<ChartDataPoint[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<ChartDataPoint[]>>(
      `${this.baseUrl}/overview/state-distribution`,
      { params: httpParams }
    );
  }

  getReferralDistribution(params: any): Observable<APIResponse<ChartDataPoint[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<ChartDataPoint[]>>(
      `${this.baseUrl}/overview/referral-distribution`,
      { params: httpParams }
    );
  }

  // Users
  searchUsers(query: string): Observable<APIResponse<User[]>> {
    const params = new HttpParams().set('q', query);
    return this.http.get<APIResponse<User[]>>(`${this.baseUrl}/users/search`, { params });
  }

  getUserById(userId: string): Observable<APIResponse<User>> {
    return this.http.get<APIResponse<User>>(`${this.baseUrl}/users/${userId}`);
  }

  getUsers(page: number = 1, pageSize: number = 50, filters?: any): Observable<APIResponse<PaginatedResponse<User>>> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());

    if (filters) {
      Object.keys(filters).forEach((key) => {
        if (filters[key]) {
          params = params.set(key, filters[key]);
        }
      });
    }

    return this.http.get<APIResponse<PaginatedResponse<User>>>(`${this.baseUrl}/users`, { params });
  }

  // Drill-down endpoints
  getLivePortfolioUsers(params: any): Observable<APIResponse<User[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<APIResponse<User[]>>(`${this.baseUrl}/overview/live-portfolio-users`, {
      params: httpParams,
    });
  }

  getPaperPortfolioUsers(params: any): Observable<APIResponse<User[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<APIResponse<User[]>>(`${this.baseUrl}/overview/paper-portfolio-users`, {
      params: httpParams,
    });
  }

  getStockScoreUsers(params: any): Observable<APIResponse<User[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });

    return this.http.get<APIResponse<User[]>>(`${this.baseUrl}/overview/stock-score-users`, {
      params: httpParams,
    });
  }

  // Portfolio
  getPortfolioMetrics(params: any): Observable<APIResponse<any>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/portfolio/metrics`, {
      params: httpParams,
    });
  }

  getPortfolioTrend(params: any): Observable<APIResponse<any[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/portfolio/trend`, {
      params: httpParams,
    });
  }

  getPortfolioBreakdown(params: any): Observable<APIResponse<any[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/portfolio/breakdown`, {
      params: httpParams,
    });
  }

  getTopInvestors(params: any, limit: number = 10, offset: number = 0): Observable<APIResponse<any>> {
    let httpParams = new HttpParams()
      .set('limit', limit.toString())
      .set('offset', offset.toString());

    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/portfolio/top-investors`, {
      params: httpParams,
    });
  }

  // GS Health
  getGsHealthKeyMetrics(): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/gs-health/key-metrics`);
  }

  getGsHealthSummary(params: any): Observable<APIResponse<any>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/gs-health/summary`, {
      params: httpParams,
    });
  }

  // Retention
  getCohortRetention(params: any): Observable<APIResponse<any>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/retention/cohort`, {
      params: httpParams,
    });
  }

  getKPIComparison(params: any): Observable<APIResponse<any>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/retention/kpi-comparison`, {
      params: httpParams,
    });
  }

  getUserPortfolios(userId: string, params: any): Observable<APIResponse<any[]>> {
    let httpParams = new HttpParams();
    Object.keys(params).forEach((key) => {
      if (params[key]) {
        httpParams = httpParams.set(key, params[key]);
      }
    });
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/portfolio/user/${userId}`, {
      params: httpParams,
    });
  }

  // Unrealized P&L
  getUnrealizedPnl(): Observable<APIResponse<any[]>> {
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/unrealized-pnl`);
  }

  getUserContacts(userIds: string[]): Observable<APIResponse<any[]>> {
    return this.http.post<APIResponse<any[]>>(`${this.baseUrl}/users/contacts`, { userIds });
  }

  // Funnel Analysis
  getFunnelSegment1(params: any): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/funnel-analysis/segment1`, { params: this.buildParams(params) });
  }

  getFunnelSegment2(): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/funnel-analysis/segment2`);
  }

  getFunnelSegment3(): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/funnel-analysis/segment3`);
  }

  getFunnelBatchDetail(dates?: string[], strictChennai?: boolean): Observable<APIResponse<any[]>> {
    const paramObj: any = {};
    if (dates && dates.length > 0) paramObj.dates = dates.join(',');
    if (strictChennai) paramObj.strictChennai = 'true';
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/funnel-analysis/segment3/batch-detail`, { params: this.buildParams(paramObj) });
  }

  getLocationUploadStatus(): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/funnel-analysis/location-upload/status`);
  }

  previewLocationUpload(file: File): Observable<APIResponse<any>> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/funnel-analysis/location-upload/preview`, formData);
  }

  commitLocationUpload(file: File, mapping: { nameCol: number; mobileCol: number; emailCol: number; locationCol: number }): Observable<APIResponse<any>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('nameCol', String(mapping.nameCol));
    formData.append('mobileCol', String(mapping.mobileCol));
    formData.append('emailCol', String(mapping.emailCol));
    formData.append('locationCol', String(mapping.locationCol));
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/funnel-analysis/location-upload/commit`, formData);
  }

  getWebinarBatchDates(): Observable<APIResponse<any[]>> {
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/funnel-analysis/webinar-dates`);
  }

  addWebinarBatchDate(date: string): Observable<APIResponse<any[]>> {
    return this.http.post<APIResponse<any[]>>(`${this.baseUrl}/funnel-analysis/webinar-dates`, { date });
  }

  removeWebinarBatchDate(id: string): Observable<APIResponse<any[]>> {
    return this.http.delete<APIResponse<any[]>>(`${this.baseUrl}/funnel-analysis/webinar-dates/${id}`);
  }

  // Health check
  getHealth(): Observable<any> {
    return this.http.get(`${this.baseUrl}/health`);
  }

  // Admin (Owner-only)
  getPermissionRegistry(): Observable<APIResponse<any>> {
    return this.http.get<APIResponse<any>>(`${this.baseUrl}/admin/permission-registry`);
  }

  getDashboardUsers(): Observable<APIResponse<any[]>> {
    return this.http.get<APIResponse<any[]>>(`${this.baseUrl}/admin/users`);
  }

  createDashboardUser(payload: { name: string; email: string; password: string; role: string }): Observable<APIResponse<any>> {
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/admin/users`, payload);
  }

  updateDashboardUser(id: string, payload: any): Observable<APIResponse<any>> {
    return this.http.put<APIResponse<any>>(`${this.baseUrl}/admin/users/${id}`, payload);
  }

  deleteDashboardUser(id: string): Observable<APIResponse<any>> {
    return this.http.delete<APIResponse<any>>(`${this.baseUrl}/admin/users/${id}`);
  }

  resetDashboardUserPassword(id: string, newPassword: string): Observable<APIResponse<any>> {
    return this.http.post<APIResponse<any>>(`${this.baseUrl}/admin/users/${id}/reset-password`, { newPassword });
  }

  getRolePermissions(): Observable<APIResponse<Record<string, string[]>>> {
    return this.http.get<APIResponse<Record<string, string[]>>>(`${this.baseUrl}/admin/role-permissions`);
  }

  setRolePermissions(role: string, permissions: string[]): Observable<APIResponse<any>> {
    return this.http.put<APIResponse<any>>(`${this.baseUrl}/admin/role-permissions/${role}`, { permissions });
  }
}
