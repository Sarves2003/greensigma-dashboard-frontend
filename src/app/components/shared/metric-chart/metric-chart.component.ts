import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as echarts from 'echarts';

export type ChartFormat = 'currency' | 'number' | 'ratio';

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const trim = (n: number, digits: number) => parseFloat(n.toFixed(digits)).toString();

// Full figure, as you would read it in a table: ₹18,64,466 / 1,180 / 4.50x
export function formatFull(v: number | null | undefined, format: ChartFormat): string {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (format === 'ratio') return `${v.toFixed(2)}x`;
  return (format === 'currency' ? '₹' : '') + INR.format(v);
}

// Short figure for axis ticks and bar labels: lakhs / crores for big money, full figures otherwise.
export function formatCompact(v: number | null | undefined, format: ChartFormat): string {
  if (v === null || v === undefined || isNaN(v)) return '—';
  if (format === 'ratio') return `${trim(v, 2)}x`;
  const abs = Math.abs(v);
  const prefix = format === 'currency' ? '₹' : '';
  if (abs >= 1e7) return `${prefix}${trim(v / 1e7, 2)} Cr`;
  if (abs >= 1e5) return `${prefix}${trim(v / 1e5, 2)} L`;
  return prefix + INR.format(v);
}

// One-series chart for the Chart Report popup: bars for a month-by-month amount, a line for ratios and
// per-unit costs, and an area line for a running (cumulative) total. The tooltip spells out the exact
// value and how it moved against the previous month, so the picture can be read without a table.
@Component({
  selector: 'app-metric-chart',
  standalone: true,
  template: `<div #chartEl class="metric-chart-container"></div>`,
  styles: [
    `
      .metric-chart-container {
        width: 100%;
        height: 360px;
        position: relative;
      }
    `,
  ],
})
export class MetricChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() categories: string[] = [];
  @Input() values: (number | null)[] = [];
  // Set for a cumulative chart: the plain month-by-month amounts behind the running total.
  @Input() monthlyValues: (number | null)[] | null = null;
  @Input() format: ChartFormat = 'number';
  @Input() seriesName = '';
  @Input() color = '#15803d';
  @Input() kind: 'bar' | 'line' | 'area' = 'bar';
  @Input() lowerIsBetter = false;

  @ViewChild('chartEl', { static: true }) chartEl!: ElementRef<HTMLDivElement>;

  private chart: echarts.ECharts | null = null;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    this.chart = echarts.init(this.chartEl.nativeElement);
    this.render();

    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.chartEl.nativeElement);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (this.chart) this.render();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  private tooltip(params: any): string {
    const p = Array.isArray(params) ? params[0] : params;
    const i: number = p.dataIndex;
    const cur = this.values[i];
    const cats = this.categories;

    let html = `<div style="font-weight:700;margin-bottom:4px">${cats[i]}</div>`;
    html += `<div>${this.seriesName}: <b>${formatFull(cur, this.format)}</b></div>`;

    if (this.monthlyValues) {
      const m = this.monthlyValues[i];
      if (m !== null && m !== undefined) {
        html += `<div style="color:#6b7280">This month: ${m >= 0 ? '+' : '−'}${formatFull(Math.abs(m), this.format)}</div>`;
      }
    } else if (i > 0) {
      const prev = this.values[i - 1];
      if (cur !== null && cur !== undefined && prev !== null && prev !== undefined && prev !== 0) {
        const pct = ((cur - prev) / Math.abs(prev)) * 100;
        const up = pct >= 0;
        const good = up !== this.lowerIsBetter;
        const color = Math.abs(pct) < 0.05 ? '#6b7280' : good ? '#15803d' : '#dc2626';
        html += `<div style="color:${color};font-weight:600">${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}% vs ${cats[i - 1]}</div>`;
      }
    }
    return html;
  }

  private render() {
    const cats = this.categories;
    const showLabels = cats.length <= 12;
    const nums = this.values.filter((v): v is number => v !== null && v !== undefined);
    const average = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    const lastIndex = this.values.length - 1;
    const isBar = this.kind === 'bar';

    const series: any = {
      name: this.seriesName,
      type: isBar ? 'bar' : 'line',
      data: this.values.map((v, i) => ({
        value: v,
        // The latest month stands out; earlier bars are a shade lighter.
        itemStyle: isBar ? { color: this.color, opacity: i === lastIndex ? 1 : 0.62, borderRadius: [4, 4, 0, 0] } : undefined,
      })),
      barMaxWidth: 42,
      smooth: false,
      symbolSize: 8,
      showSymbol: cats.length <= 24,
      connectNulls: false,
      lineStyle: { color: this.color, width: 3 },
      itemStyle: { color: this.color },
      areaStyle: this.kind === 'area' ? { color: this.color, opacity: 0.16 } : undefined,
      label: {
        show: showLabels,
        position: 'top',
        fontSize: 11,
        color: '#374151',
        formatter: (p: any) => (p.value === null || p.value === undefined ? '' : formatCompact(p.value, this.format)),
      },
      emphasis: { focus: 'series' },
      // Dashed average line on month-by-month views (not on a running total, where it means nothing).
      markLine:
        average !== null && this.kind !== 'area'
          ? {
              silent: true,
              symbol: 'none',
              lineStyle: { type: 'dashed', color: '#9ca3af', width: 1.5 },
              label: { position: 'insideEndTop', color: '#6b7280', fontSize: 11, formatter: `Avg ${formatCompact(average, this.format)}` },
              data: [{ yAxis: average }],
            }
          : undefined,
    };

    this.chart?.setOption(
      {
        animationDuration: 300,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: isBar ? 'shadow' : 'line' },
          appendToBody: true,
          confine: true,
          formatter: (params: any) => this.tooltip(params),
        },
        grid: { left: 8, right: 24, top: 40, bottom: 8, containLabel: true },
        xAxis: {
          type: 'category',
          data: cats,
          axisLabel: { rotate: cats.length > 9 ? 40 : 0, fontSize: 11, color: '#4b5563' },
          axisTick: { alignWithLabel: true },
        },
        yAxis: {
          type: 'value',
          // A line of ratios / unit costs is easier to read when it isn't squashed against zero.
          scale: this.kind === 'line',
          axisLabel: { fontSize: 11, color: '#4b5563', formatter: (v: number) => formatCompact(v, this.format) },
          splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } },
        },
        series: [series],
      },
      true
    );
  }
}
