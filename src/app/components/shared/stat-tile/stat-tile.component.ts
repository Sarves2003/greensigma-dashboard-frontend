import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatTileColor = 'blue' | 'teal' | 'green' | 'purple' | 'orange' | 'red';

@Component({
  selector: 'app-stat-tile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './stat-tile.component.html',
  styleUrls: ['./stat-tile.component.scss'],
})
export class StatTileComponent {
  @Input() label = '';
  @Input() value: string | number | null = null;
  @Input() color: StatTileColor = 'blue';
  @Input() tooltip = '';
}
