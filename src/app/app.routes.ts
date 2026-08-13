import { Routes } from '@angular/router';
import { OverviewComponent } from './components/overview/overview.component';
import { UsersComponent } from './components/users/users.component';
import { LoginComponent } from './components/login/login.component';
import { AuthLoginComponent } from './components/auth-login/auth-login.component';
import { StockComponent } from './components/stock/stock.component';
import { BacktestComponent } from './components/backtest/backtest.component';
import { EtfComponent } from './components/etf/etf.component';
import { PortfolioComponent } from './components/portfolio/portfolio.component';
import { BrokerComponent } from './components/broker/broker.component';
import { IntradayComponent } from './components/intraday/intraday.component';
import { RetentionComponent } from './components/retention/retention.component';
import { GsHealthComponent } from './components/gs-health/gs-health.component';
import { UnrealizedPnlComponent } from './components/unrealized-pnl/unrealized-pnl.component';
import { ProductMetricsComponent } from './components/product-metrics/product-metrics.component';
import { FunnelAnalysisComponent } from './components/funnel-analysis/funnel-analysis.component';
import { UsageAnalysisComponent } from './components/usage-analysis/usage-analysis.component';
import { AdminManagementComponent } from './components/admin-management/admin-management.component';
import { NoAccessComponent } from './components/no-access/no-access.component';
import { authGuard, ownerGuard, permissionGuard } from './guards/auth.guard';
import { PERMISSIONS } from './config/permissions';

export const routes: Routes = [
  { path: '', redirectTo: '/product-metrics', pathMatch: 'full' },
  { path: 'login', component: AuthLoginComponent },
  { path: 'overview', component: OverviewComponent, canActivate: [authGuard] },
  { path: 'users', component: UsersComponent, canActivate: [authGuard] },
  { path: 'login-analytics', component: LoginComponent, canActivate: [authGuard] },
  { path: 'stock', component: StockComponent, canActivate: [authGuard] },
  { path: 'backtest', component: BacktestComponent, canActivate: [authGuard] },
  { path: 'etf', component: EtfComponent, canActivate: [authGuard] },
  { path: 'portfolio', component: PortfolioComponent, canActivate: [authGuard, permissionGuard(PERMISSIONS.portfolio)] },
  { path: 'broker', component: BrokerComponent, canActivate: [authGuard] },
  { path: 'intraday', component: IntradayComponent, canActivate: [authGuard] },
  { path: 'retention', component: RetentionComponent, canActivate: [authGuard, permissionGuard(PERMISSIONS.retention)] },
  { path: 'gs-health', component: GsHealthComponent, canActivate: [authGuard, permissionGuard(PERMISSIONS.gsHealth)] },
  { path: 'unrealized-pnl', component: UnrealizedPnlComponent, canActivate: [authGuard, permissionGuard(PERMISSIONS.unrealizedPnl)] },
  { path: 'product-metrics', component: ProductMetricsComponent, canActivate: [authGuard, permissionGuard(PERMISSIONS.productMetrics)] },
  { path: 'funnel-analysis', component: FunnelAnalysisComponent, canActivate: [authGuard, permissionGuard(PERMISSIONS.funnelAnalysis)] },
  { path: 'usage-analysis', component: UsageAnalysisComponent, canActivate: [authGuard, permissionGuard(PERMISSIONS.usageAnalysis)] },
  { path: 'admin', component: AdminManagementComponent, canActivate: [authGuard, ownerGuard] },
  { path: 'no-access', component: NoAccessComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '/product-metrics' },
];
