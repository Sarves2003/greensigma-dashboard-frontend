import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as echarts from 'echarts';

// One bar per selected item, height = a percentage (0-100), each bar labelled with BOTH the % and
// the count/total it came from (e.g. "56.8%" / "(21/37)"), plus a dashed line for the average % across
// whatever is currently shown. Built for "Current Webinar Conversion %", but generic enough for any
// count-based conversion rate.
@Component({
  selector: 'app-echart-conversion-bar',
  standalone: true,
  template: `<div #chartEl class="echart-conversion-bar-container"></div>`,
  styles: [
    `
      .echart-conversion-bar-container {
        width: 100%;
        height: 380px;
        position: relative;
      }
    `,
  ],
})
export class EchartConversionBarComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() categories: string[] = [];
  @Input() values: (number | null)[] = []; // percentages, 0-100; null = no data for that bar
  @Input() counts: number[] = []; // numerator (e.g. paid from the current webinar)
  @Input() totals: number[] = []; // denominator (e.g. total paid for that batch)
  @Input() names: string[] = []; // extra context per bar (e.g. webinar name), shown in the tooltip only
  @Input() average: number | null = null;
  @Input() seriesName = 'Conversion %';
  @Input() color = '#2d7d3d';

  @ViewChild('chartEl', { static: true }) chartEl!: ElementRef<HTMLDivElement>;

  private chart: echarts.ECharts | null = null;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit() {
    this.chart = echarts.init(this.chartEl.nativeElement);
    this.render();

    this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
    this.resizeObserver.observe(this.chartEl.nativeElement);
  }

  ngOnChanges() {
    if (this.chart) this.render();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  private render() {
    const rotate = this.categories.length > 8;

    this.chart?.setOption(
      {
        animationDuration: 300,
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          appendToBody: true,
          confine: true,
          formatter: (params: any) => {
            const p = Array.isArray(params) ? params[0] : params;
            const i: number = p.dataIndex;
            const pct = this.values[i];
            const count = this.counts[i] ?? 0;
            const total = this.totals[i] ?? 0;
            const name = this.names[i];
            let html = `<div style="font-weight:700;margin-bottom:2px">${this.categories[i]}</div>`;
            if (name) html += `<div style="color:#6b7280;margin-bottom:4px">${name}</div>`;
            html +=
              pct === null || pct === undefined
                ? `<div>No paid users on this date</div>`
                : `<div>${this.seriesName}: <b>${pct.toFixed(1)}%</b></div><div style="color:#6b7280">${count} of ${total} paid</div>`;
            return html;
          },
        },
        grid: { left: 8, right: 24, top: 30, bottom: rotate ? 70 : 40, containLabel: true },
        xAxis: {
          type: 'category',
          data: this.categories,
          axisLabel: { rotate: rotate ? 45 : 0, fontSize: 11, color: '#4b5563' },
          axisTick: { alignWithLabel: true },
        },
        yAxis: {
          type: 'value',
          min: 0,
          max: 100,
          axisLabel: { formatter: '{value}%', fontSize: 11, color: '#4b5563' },
          splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } },
        },
        series: [
          {
            name: this.seriesName,
            type: 'bar',
            data: this.values,
            barMaxWidth: 46,
            itemStyle: { color: this.color, borderRadius: [4, 4, 0, 0] },
            label: {
              show: this.categories.length <= 20,
              position: 'top',
              fontSize: 11,
              lineHeight: 14,
              color: '#374151',
              formatter: (p: any) => {
                const i = p.dataIndex;
                const v = p.value;
                if (v === null || v === undefined) return 'n/a';
                return `${v.toFixed(1)}%\n(${this.counts[i] ?? 0}/${this.totals[i] ?? 0})`;
              },
            },
            markLine:
              this.average !== null && this.average !== undefined
                ? {
                    silent: true,
                    symbol: 'none',
                    lineStyle: { type: 'dashed', color: '#9ca3af', width: 1.5 },
                    label: { position: 'insideEndTop', color: '#6b7280', fontSize: 11, formatter: `Avg ${this.average}%` },
                    data: [{ yAxis: this.average }],
                  }
                : undefined,
          },
        ],
      },
      true
    );
  }
}
