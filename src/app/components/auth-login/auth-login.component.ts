import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-auth-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth-login.component.html',
  styleUrls: ['./auth-login.component.scss'],
})
export class AuthLoginComponent {
  email = '';
  password = '';
  loading = false;
  error: string | null = null;

  constructor(private authService: AuthService, private router: Router) {
    if (this.authService.isLoggedIn()) {
      this.router.navigate([this.authService.firstAccessibleRoute()]);
    }
  }

  submit(): void {
    if (!this.email || !this.password) {
      this.error = 'Enter your email and password';
      return;
    }
    this.loading = true;
    this.error = null;

    this.authService.login(this.email, this.password).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.router.navigate([this.authService.firstAccessibleRoute()]);
        } else {
          this.error = response.error || 'Login failed';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.error || 'Invalid email or password';
      },
    });
  }
}
