import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from './services/auth.service';
import { PERMISSIONS } from './config/permissions';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent implements OnInit {
  title = 'Sigma Scanner Dashboard';
  permissions = PERMISSIONS;

  constructor(public authService: AuthService, private router: Router) {}

  ngOnInit(): void {
    // Refreshes the permission set on load so a stale localStorage copy (e.g. after
    // the Owner changes a role's access) never outlives the current session.
    if (this.authService.isLoggedIn()) {
      this.authService.fetchMe().subscribe({ error: () => {} });
    }
  }

  get showChrome(): boolean {
    return this.router.url !== '/login' && this.authService.isLoggedIn();
  }

  logout(): void {
    this.authService.logout();
  }
}
