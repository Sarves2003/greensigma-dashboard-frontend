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

@Component({
  selector: 'app-echart-line',
  standalone: true,
  template: `<div #chartEl class="echart-line-container"></div>`,
  styles: [
    `
      .echart-line-container {
        width: 100%;
        height: 320px;
        position: relative;
      }
    `,
  ],
})
export class EchartLineComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() categories: string[] = [];
  @Input() values: number[] = [];
  @Input() seriesName = 'Value';
  @Input() color = '#0369a1';
  @Input() areaFill = true;

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
    if (this.chart && (changes['categories'] || changes['values'] || changes['seriesName'] || changes['color'] || changes['areaFill'])) {
      this.render();
    }
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.chart?.dispose();
  }

  private render() {
    this.chart?.setOption(
      {
        animation: false,
        tooltip: {
          trigger: 'axis',
          appendToBody: true,
          confine: true,
        },
        grid: { left: 48, right: 20, top: 20, bottom: this.categories.length > 10 ? 60 : 40 },
        xAxis: {
          type: 'category',
          data: this.categories,
          axisLabel: {
            rotate: this.categories.length > 10 ? 45 : 0,
            fontSize: 11,
          },
        },
        yAxis: { type: 'value' },
        series: [
          {
            name: this.seriesName,
            type: 'line',
            data: this.values,
            smooth: true,
            showSymbol: this.values.length <= 20,
            lineStyle: { color: this.color, width: 2 },
            itemStyle: { color: this.color },
            areaStyle: this.areaFill ? { color: this.color, opacity: 0.2 } : undefined,
          },
        ],
      },
      true
    );
  }
}
