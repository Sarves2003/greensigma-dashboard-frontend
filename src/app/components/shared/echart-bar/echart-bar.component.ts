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
  selector: 'app-echart-bar',
  standalone: true,
  template: `<div #chartEl class="echart-bar-container"></div>`,
  styles: [
    `
      .echart-bar-container {
        width: 100%;
        height: 320px;
        position: relative;
      }
    `,
  ],
})
export class EchartBarComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() categories: string[] = [];
  @Input() values: number[] = [];
  @Input() seriesName = 'Active Users';
  @Input() color = '#0369a1';

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
    if (this.chart && (changes['categories'] || changes['values'] || changes['seriesName'] || changes['color'])) {
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
          axisPointer: { type: 'shadow' },
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
            type: 'bar',
            data: this.values,
            itemStyle: { color: this.color, borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 40,
          },
        ],
      },
      true
    );
  }
}
