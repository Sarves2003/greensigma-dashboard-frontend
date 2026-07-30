import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration } from 'chart.js';

@Component({
  selector: 'app-chart',
  standalone: true,
  imports: [CommonModule, NgChartsModule],
  templateUrl: './chart.component.html',
  styleUrls: ['./chart.component.scss'],
})
export class ChartComponent implements OnInit, OnChanges {
  @Input() data: any = [];
  @Input() type: 'line' | 'pie' | 'bar' = 'line';
  @Input() title: string = '';

  chartConfig: ChartConfiguration | null = null;

  ngOnInit() {
    if (this.hasData()) {
      this.buildChart();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['data'] && this.hasData()) {
      this.buildChart();
    }
  }

  private hasData(): boolean {
    if (!this.data) return false;
    if (Array.isArray(this.data)) return this.data.length > 0;
    if (typeof this.data === 'object' && 'data' in this.data) return true;
    return false;
  }

  buildChart() {
    // Check if this is multi-series data (broker types)
    const isMultiSeries = this.data && typeof this.data === 'object' && 'brokerTypes' in this.data && 'data' in this.data;
    const chartData = isMultiSeries ? this.data.data : this.data;

    if (this.type === 'pie') {
      const labels = chartData.map((d: any) => d.date || d.label || d.name || d.bin);
      const values = chartData.map((d: any) => d.cumulativeAUM || d.value || d.count);
      const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
      this.chartConfig = {
        type: 'pie',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors.slice(0, values.length),
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom' },
          },
        },
      } as ChartConfiguration;
    } else if (this.type === 'bar') {
      const labels = chartData.map((d: any) => d.date || d.label || d.name || d.bin);
      const values = chartData.map((d: any) => d.cumulativeAUM || d.value || d.count);
      this.chartConfig = {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: this.title,
            data: values,
            backgroundColor: '#3b82f6',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            y: {
              beginAtZero: true,
            },
          },
        },
      } as ChartConfiguration;
    } else {
      // Line chart with multi-series support
      if (isMultiSeries) {
        this.buildMultiSeriesLineChart();
      } else {
        this.buildSingleLineChart();
      }
    }
  }

  private buildSingleLineChart() {
    const labels = this.data.map((d: any) => d.date || d.label || d.name || d.bin);
    const values = this.data.map((d: any) => d.cumulativeAUM || d.value || d.count);

    this.chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: this.title,
          data: values,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.3)',
          tension: 0.4,
          fill: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
          },
        },
      },
    } as ChartConfiguration;
  }

  private buildMultiSeriesLineChart() {
    const rawData = (this.data as any).data || [];
    const brokerTypes = (this.data as any).brokerTypes || [];

    if (rawData.length === 0) return;

    // Extract labels (dates)
    const labels = rawData.map((item: any) => item.date);

    // Color mapping for broker types
    const colorMap: any = {
      kite: { border: '#3b82f6', bg: 'rgba(59, 130, 246, 0.3)' },
      zebu: { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.3)' },
      paper_trade: { border: '#10b981', bg: 'rgba(16, 185, 129, 0.3)' },
    };

    // Build datasets for each broker type
    const datasets: any[] = [];
    brokerTypes.forEach((brokerType: string) => {
      const fieldName = brokerType === 'kite' ? 'kiteAUM' :
                       brokerType === 'zebu' ? 'zebuAUM' : 'paperTradeAUM';

      const values = rawData.map((item: any) => item[fieldName] || 0);
      const colors = colorMap[brokerType] || { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.3)' };

      datasets.push({
        label: brokerType.charAt(0).toUpperCase() + brokerType.slice(1),
        data: values,
        borderColor: colors.border,
        backgroundColor: colors.bg,
        tension: 0.4,
        fill: true,
      });
    });

    this.chartConfig = {
      type: 'line',
      data: {
        labels,
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
          },
        },
      },
    } as ChartConfiguration;
  }
}
