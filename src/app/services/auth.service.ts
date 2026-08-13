import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

export type DashboardRole = 'owner' | 'super_admin' | 'manager' | 'product_manager' | 'sales_team';

export interface DashboardAuthUser {
  id: string;
  name: string;
  email: string;
  role: DashboardRole;
  active: boolean;
}

const TOKEN_KEY = 'gs_dashboard_token';
const USER_KEY = 'gs_dashboard_user';
const PERMISSIONS_KEY = 'gs_dashboard_permissions';

@Injectable({ providedIn: 'root' })
export class AuthService {
  // private baseUrl = 'http://localhost:5000/api';
  private baseUrl = 'https://greensigma-dashboard-backend.onrender.com/api';

  private userSignal = signal<DashboardAuthUser | null>(this.readUser());
  private permissionsSignal = signal<Set<string>>(new Set(this.readPermissions()));

  readonly user = this.userSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.userSignal() !== null);
  readonly isOwner = computed(() => this.userSignal()?.role === 'owner');

  constructor(private http: HttpClient, private router: Router) {}

  private readUser(): DashboardAuthUser | null {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  private readPermissions(): string[] {
    const raw = localStorage.getItem(PERMISSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  login(email: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/auth/login`, { email, password }).pipe(
      tap((response) => {
        if (response.success && response.data) {
          this.persistSession(response.data.token, response.data.user, response.data.permissions);
        }
      })
    );
  }

  fetchMe(): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/auth/me`).pipe(
      tap((response) => {
        if (response.success && response.data) {
          const token = this.getToken();
          if (token) this.persistSession(token, response.data.user, response.data.permissions);
        }
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/auth/change-password`, { currentPassword, newPassword });
  }

  private persistSession(token: string, user: DashboardAuthUser, permissions: string[]): void {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
    this.userSignal.set(user);
    this.permissionsSignal.set(new Set(permissions));
  }

  clearSession(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(PERMISSIONS_KEY);
    this.userSignal.set(null);
    this.permissionsSignal.set(new Set());
  }

  logout(): void {
    this.clearSession();
    this.router.navigate(['/login']);
  }

  hasPermission(key: string): boolean {
    return this.permissionsSignal().has(key);
  }

  hasAnyPermission(keys: string[]): boolean {
    return keys.some((key) => this.hasPermission(key));
  }

  // Same priority order as the sidebar nav in app.component.html. Used anywhere we need to land a
  // user somewhere valid (post-login, guard rejection) instead of a hardcoded route — hardcoding
  // one route as "the" destination broke for any role missing that specific permission (e.g. Sales
  // Team without Product Metrics access): guard blocks them, redirects back to the same blocked
  // route, forever. Falls back to /no-access if the user has literally zero tab permissions, which
  // is intentionally unguarded so it can never itself trigger another redirect loop.
  private readonly ROUTE_PRIORITY: { permission: string; path: string }[] = [
    { permission: 'tab:product-metrics', path: '/product-metrics' },
    { permission: 'tab:portfolio', path: '/portfolio' },
    { permission: 'tab:unrealized-pnl', path: '/unrealized-pnl' },
    { permission: 'tab:retention', path: '/retention' },
    { permission: 'tab:gs-health', path: '/gs-health' },
    { permission: 'tab:funnel-analysis', path: '/funnel-analysis' },
    { permission: 'tab:usage-analysis', path: '/usage-analysis' },
  ];

  firstAccessibleRoute(): string {
    for (const r of this.ROUTE_PRIORITY) {
      if (this.hasPermission(r.permission)) return r.path;
    }
    return '/no-access';
  }
}
