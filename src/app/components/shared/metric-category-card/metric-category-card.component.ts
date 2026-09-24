import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface MetricSlice {
  label: string | null;
  value: number | null;
}

export interface MetricBreakdown {
  currentMonth: MetricSlice;
  lastMonth: MetricSlice;
  currentQuarter: MetricSlice;
  lastQuarter: MetricSlice;
  currentYearAvgPerMonth: MetricSlice;
  previousYearAvgPerMonth: MetricSlice;
  currentYearTotal: MetricSlice;
  previousYearTotal: MetricSlice;
  currentYearBest: MetricSlice;
  previousYearBest: MetricSlice;
}

export interface MetricCategoryConfig {
  key: string;
  label: string;
  icon: string;
  prefix: string;
  decimals: string;
  isAvg: boolean;
  lowerIsBetter: boolean;
  accent: string;
  accentBg: string;
  // Optional one-line explainer shown under the title (e.g. what a spend figure is made of).
  description?: string;
}

interface Delta {
  pct: number;
  direction: 'up' | 'down' | 'flat';
  sentiment: 'good' | 'bad' | 'flat';
}

// One "hero stat + secondary chips + by-year comparison" card for a single metric category
// (Revenue, CAC, Leads, ...). Used identically by the Key Metrics overview and the Webinar / Lead
// Form channel tabs — only the config and data fed in differ, so the layout logic lives here once.
@Component({
  selector: 'app-metric-category-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './metric-category-card.component.html',
  styleUrls: ['./metric-category-card.component.scss'],
})
export class MetricCategoryCardComponent {
  @Input() config!: MetricCategoryConfig;
  @Input() data: MetricBreakdown | undefined;

  getDelta(current: number | null | undefined, previous: number | null | undefined, lowerIsBetter: boolean): Delta | null {
    if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) {
      return null;
    }

    const pct = ((current - previous) / Math.abs(previous)) * 100;
    const direction: Delta['direction'] = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';

    let sentiment: Delta['sentiment'] = 'flat';
    if (direction !== 'flat') {
      const isIncrease = direction === 'up';
      sentiment = isIncrease === !lowerIsBetter ? 'good' : 'bad';
    }

    return { pct: Math.abs(parseFloat(pct.toFixed(1))), direction, sentiment };
  }
}
