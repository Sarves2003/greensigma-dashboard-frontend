import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="page-container">
      <h1>Users Analytics</h1>
      <p>User analytics coming soon...</p>
    </div>
  `,
  styles: [`
    .page-container {
      padding: 2rem;
    }
    h1 {
      margin-top: 0;
      color: #1f2937;
    }
  `],
})
export class UsersComponent {}
