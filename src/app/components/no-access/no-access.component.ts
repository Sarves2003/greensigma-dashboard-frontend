import { Component } from '@angular/core';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-no-access',
  standalone: true,
  template: `
    <div class="no-access-page">
      <div class="no-access-card">
        <span class="no-access-icon">🔒</span>
        <h1>No sections assigned yet</h1>
        <p>Your account doesn't have access to any dashboard tab. Ask your Owner to grant permissions from Admin → Permissions.</p>
        <button type="button" (click)="authService.logout()">Sign Out</button>
      </div>
    </div>
  `,
  styles: [`
    .no-access-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f3f4f6;
      padding: 2rem;
    }
    .no-access-card {
      background: white;
      border-radius: 14px;
      padding: 2.5rem;
      max-width: 420px;
      text-align: center;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }
    .no-access-icon {
      font-size: 2.5rem;
    }
    h1 {
      color: #1f2937;
      font-size: 1.25rem;
      margin: 1rem 0 0.5rem 0;
    }
    p {
      color: #6b7280;
      font-size: 0.9rem;
      line-height: 1.5;
      margin: 0 0 1.5rem 0;
    }
    button {
      padding: 0.6rem 1.25rem;
      background-color: #2d7d3d;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
    }
  `],
})
export class NoAccessComponent {
  constructor(public authService: AuthService) {}
}
