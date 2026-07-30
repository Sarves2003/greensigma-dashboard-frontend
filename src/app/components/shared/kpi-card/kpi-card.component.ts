import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KPIResponse } from '@models/index';

@Component({
  selector: 'app-kpi-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './kpi-card.component.html',
  styleUrls: ['./kpi-card.component.scss'],
})
export class KPICardComponent {
  @Input() kpi: KPIResponse | null = null;
  @Input() label: string = '';
  @Input() value: string | number = 0;
  @Input() icon: string = '';
  @Input() trend: string | number = '';
  @Input() onClick: string = '';
  @Input() tooltip: string = '';

  get displayLabel(): string {
    return this.kpi?.label || this.label;
  }

  get displayValue(): string | number {
    return this.kpi?.value ?? this.value;
  }

  get displayTrend(): string | number {
    return this.kpi?.trend ?? this.trend;
  }
}
