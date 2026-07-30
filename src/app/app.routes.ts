import { Routes } from '@angular/router';
import { OverviewComponent } from './components/overview/overview.component';
import { UsersComponent } from './components/users/users.component';
import { LoginComponent } from './components/login/login.component';
import { StockComponent } from './components/stock/stock.component';
import { BacktestComponent } from './components/backtest/backtest.component';
import { EtfComponent } from './components/etf/etf.component';
import { PortfolioComponent } from './components/portfolio/portfolio.component';
import { BrokerComponent } from './components/broker/broker.component';
import { IntradayComponent } from './components/intraday/intraday.component';
import { RetentionComponent } from './components/retention/retention.component';
import { GsHealthComponent } from './components/gs-health/gs-health.component';

export const routes: Routes = [
  { path: '', redirectTo: '/overview', pathMatch: 'full' },
  { path: 'overview', component: OverviewComponent },
  { path: 'users', component: UsersComponent },
  { path: 'login', component: LoginComponent },
  { path: 'stock', component: StockComponent },
  { path: 'backtest', component: BacktestComponent },
  { path: 'etf', component: EtfComponent },
  { path: 'portfolio', component: PortfolioComponent },
  { path: 'broker', component: BrokerComponent },
  { path: 'intraday', component: IntradayComponent },
  { path: 'retention', component: RetentionComponent },
  { path: 'gs-health', component: GsHealthComponent },
  { path: '**', redirectTo: '/overview' },
];
