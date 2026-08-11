import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';

interface PermissionDef {
  key: string;
  label: string;
  type: 'tab' | 'card';
  tabKey?: string;
}

interface DashboardUserView {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  effectivePermissions: string[];
  createdAt: string;
  lastLoginAt?: string;
}

@Component({
  selector: 'app-admin-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-management.component.html',
  styleUrls: ['./admin-management.component.scss'],
})
export class AdminManagementComponent implements OnInit {
  loading = true;
  error: string | null = null;

  permissions: PermissionDef[] = [];
  roles: string[] = [];
  roleLabels: Record<string, string> = {};
  rolePermissions: Record<string, string[]> = {};
  users: DashboardUserView[] = [];

  newUser = { name: '', email: '', password: '', role: '' };
  creatingUser = false;
  createError: string | null = null;

  overrideUserId: string | null = null;
  private overrideChecked = new Set<string>();
  private overrideRoleDefaults = new Set<string>();
  savingOverrides = false;

  constructor(private apiService: ApiService) {}

  ngOnInit(): void {
    this.loadAll();
  }

  get tabPermissions(): PermissionDef[] {
    return this.permissions.filter((p) => p.type === 'tab');
  }

  cardsForTab(tabKey: string): PermissionDef[] {
    return this.permissions.filter((p) => p.type === 'card' && p.tabKey === tabKey);
  }

  loadAll(): void {
    this.loading = true;
    this.error = null;

    this.apiService.getPermissionRegistry().subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.permissions = response.data.permissions;
          this.roles = response.data.roles;
          this.roleLabels = response.data.roleLabels;
          if (!this.newUser.role && this.roles.length) this.newUser.role = this.roles[this.roles.length - 1];
        }
      },
      error: () => (this.error = 'Failed to load permission registry'),
    });

    this.apiService.getRolePermissions().subscribe({
      next: (response) => {
        if (response.success && response.data) this.rolePermissions = response.data;
      },
      error: () => (this.error = 'Failed to load role permissions'),
    });

    this.reloadUsers();
  }

  reloadUsers(): void {
    this.apiService.getDashboardUsers().subscribe({
      next: (response) => {
        if (response.success && response.data) this.users = response.data;
        this.loading = false;
      },
      error: () => {
        this.error = 'Failed to load dashboard users';
        this.loading = false;
      },
    });
  }

  // ============ Role permission matrix ============
  isRolePermitted(role: string, key: string): boolean {
    return (this.rolePermissions[role] || []).includes(key);
  }

  toggleRolePermission(role: string, key: string): void {
    const current = new Set(this.rolePermissions[role] || []);
    if (current.has(key)) current.delete(key);
    else current.add(key);
    const updated = Array.from(current);
    this.rolePermissions = { ...this.rolePermissions, [role]: updated };

    this.apiService.setRolePermissions(role, updated).subscribe({
      error: () => (this.error = `Failed to update permissions for ${this.roleLabels[role] || role}`),
    });
  }

  // ============ Create user ============
  createUser(): void {
    if (!this.newUser.name || !this.newUser.email || !this.newUser.password || !this.newUser.role) {
      this.createError = 'All fields are required';
      return;
    }
    if (this.newUser.password.length < 8) {
      this.createError = 'Password must be at least 8 characters';
      return;
    }

    this.creatingUser = true;
    this.createError = null;

    this.apiService.createDashboardUser(this.newUser).subscribe({
      next: (response) => {
        this.creatingUser = false;
        if (response.success) {
          this.newUser = { name: '', email: '', password: '', role: this.roles[this.roles.length - 1] || '' };
          this.reloadUsers();
        } else {
          this.createError = response.error || 'Failed to create user';
        }
      },
      error: (err) => {
        this.creatingUser = false;
        this.createError = err?.error?.error || 'Failed to create user';
      },
    });
  }

  // ============ Edit / delete user ============
  changeRole(user: DashboardUserView, role: string): void {
    this.apiService.updateDashboardUser(user.id, { role }).subscribe({
      next: () => this.reloadUsers(),
      error: () => (this.error = 'Failed to update role'),
    });
  }

  toggleActive(user: DashboardUserView): void {
    this.apiService.updateDashboardUser(user.id, { active: !user.active }).subscribe({
      next: () => this.reloadUsers(),
      error: () => (this.error = 'Failed to update user status'),
    });
  }

  deleteUser(user: DashboardUserView): void {
    if (!confirm(`Remove ${user.name} (${user.email})? This cannot be undone.`)) return;
    this.apiService.deleteDashboardUser(user.id).subscribe({
      next: (response) => {
        if (response.success) this.reloadUsers();
        else this.error = response.error || 'Failed to delete user';
      },
      error: (err) => (this.error = err?.error?.error || 'Failed to delete user'),
    });
  }

  resetPassword(user: DashboardUserView): void {
    const newPassword = prompt(`New password for ${user.email} (min 8 characters):`);
    if (!newPassword) return;
    this.apiService.resetDashboardUserPassword(user.id, newPassword).subscribe({
      next: (response) => {
        if (!response.success) this.error = response.error || 'Failed to reset password';
      },
      error: (err) => (this.error = err?.error?.error || 'Failed to reset password'),
    });
  }

  // ============ Per-user permission overrides ============
  openOverrides(user: DashboardUserView): void {
    this.overrideUserId = user.id;
    this.overrideRoleDefaults = new Set(this.rolePermissions[user.role] || []);
    this.overrideChecked = new Set(user.effectivePermissions);
  }

  closeOverrides(): void {
    this.overrideUserId = null;
  }

  isOverrideChecked(key: string): boolean {
    return this.overrideChecked.has(key);
  }

  isOverrideDeviating(key: string): boolean {
    return this.overrideChecked.has(key) !== this.overrideRoleDefaults.has(key);
  }

  toggleOverride(key: string): void {
    if (this.overrideChecked.has(key)) this.overrideChecked.delete(key);
    else this.overrideChecked.add(key);
  }

  saveOverrides(): void {
    if (!this.overrideUserId) return;
    const grant: string[] = [];
    const revoke: string[] = [];
    for (const p of this.permissions) {
      const checked = this.overrideChecked.has(p.key);
      const isDefault = this.overrideRoleDefaults.has(p.key);
      if (checked && !isDefault) grant.push(p.key);
      if (!checked && isDefault) revoke.push(p.key);
    }

    this.savingOverrides = true;
    this.apiService.updateDashboardUser(this.overrideUserId, { permissionOverrides: { grant, revoke } }).subscribe({
      next: (response) => {
        this.savingOverrides = false;
        if (response.success) {
          this.closeOverrides();
          this.reloadUsers();
        } else {
          this.error = response.error || 'Failed to save permission overrides';
        }
      },
      error: (err) => {
        this.savingOverrides = false;
        this.error = err?.error?.error || 'Failed to save permission overrides';
      },
    });
  }
}
