import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { ZoomAnalysisComponent } from '../zoom-analysis/zoom-analysis.component';
import { WebinarRegistrationsComponent } from '../webinar-registrations/webinar-registrations.component';

type MainTab = 'zoom' | 'registrations';

// Thin shell: just the two-way switch between the two independent data sources this page covers —
// Zoom Analysis (uploaded Zoom CSV + chat, scored against the old funnel Google Sheets) and Webinar
// Registrations (the live ₹79/₹99 checkout funnel, read straight from Mongo). Each sub-tab is its
// own standalone component with its own permission card, so a role can be granted one without the
// other (e.g. a marketer who needs call/WhatsApp lists but not Zoom attendance analytics).
@Component({
  selector: 'app-webinar-analysis',
  standalone: true,
  imports: [CommonModule, ZoomAnalysisComponent, WebinarRegistrationsComponent],
  templateUrl: './webinar-analysis.component.html',
  styleUrls: ['./webinar-analysis.component.scss'],
})
export class WebinarAnalysisComponent {
  permissions = PERMISSIONS;
  activeMainTab: MainTab = 'zoom';

  constructor(public authService: AuthService) {
    // Land on whichever sub-tab this user actually has access to, rather than defaulting to one
    // they can't see.
    if (!this.authService.hasPermission(this.permissions.webinarAnalysisMain) && this.authService.hasPermission(this.permissions.webinarAnalysisRegistrations)) {
      this.activeMainTab = 'registrations';
    }
  }

  setMainTab(tab: MainTab) {
    this.activeMainTab = tab;
  }
}
