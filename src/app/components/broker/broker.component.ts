import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-broker',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="page-container"><h1>Broker Integration</h1><p>Broker analytics coming soon...</p></div>`,
  styles: [`.page-container { padding: 2rem; } h1 { margin-top: 0; color: #1f2937; }`],
})
export class BrokerComponent {}
