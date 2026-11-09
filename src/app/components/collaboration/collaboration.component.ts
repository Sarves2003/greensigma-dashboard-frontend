import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { CollaborationListComponent } from './collaboration-list/collaboration-list.component';
import { CollaborationSummaryComponent } from './collaboration-summary/collaboration-summary.component';

type SubTab = 'followup' | 'live' | 'summary';

// Influencer/affiliate CRM. A record is created in Followup (outreach/negotiation) and
// gets "promoted" into Live once the collaboration is actually on — see CollaborationService
// on the backend for the stage transition. Both sub-tabs render through the same generic,
// field-schema-driven table (CollaborationListComponent); Followup and Live differ only in
// which field set and which record stage they're pointed at, not in code.
@Component({
  selector: 'app-collaboration',
  standalone: true,
  imports: [CommonModule, CollaborationListComponent, CollaborationSummaryComponent],
  templateUrl: './collaboration.component.html',
  styleUrls: ['./collaboration.component.scss'],
})
export class CollaborationComponent {
  permissions = PERMISSIONS;
  activeSubTab: SubTab = 'followup';

  constructor(public authService: AuthService) {
    if (!this.authService.hasPermission(this.permissions.collaborationFollowup)) {
      if (this.authService.hasPermission(this.permissions.collaborationLive)) {
        this.activeSubTab = 'live';
      } else if (this.authService.hasPermission(this.permissions.collaborationSummary)) {
        this.activeSubTab = 'summary';
      }
    }
  }

  setSubTab(tab: SubTab) {
    this.activeSubTab = tab;
  }

  get showSwitcher(): boolean {
    const grants = [this.permissions.collaborationFollowup, this.permissions.collaborationLive, this.permissions.collaborationSummary];
    return grants.filter((p) => this.authService.hasPermission(p)).length > 1;
  }
}
