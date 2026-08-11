import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};

export const ownerGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  if (authService.isLoggedIn() && authService.isOwner()) return true;
  router.navigate(['/product-metrics']);
  return false;
};

export function permissionGuard(key: string): CanActivateFn {
  return () => {
    const authService = inject(AuthService);
    const router = inject(Router);
    if (authService.isLoggedIn() && authService.hasPermission(key)) return true;
    router.navigate(['/product-metrics']);
    return false;
  };
}
