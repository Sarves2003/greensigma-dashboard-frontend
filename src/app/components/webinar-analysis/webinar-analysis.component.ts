import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { PERMISSIONS } from '../../config/permissions';
import { ZoomAnalysisComponent } from '../zoom-analysis/zoom-analysis.component';
import { WebinarRegistrationsComponent } from '../webinar-registrations/webinar-registrations.component';
import { WebinarMomentumAnalyticsComponent } from '../webinar-momentum-analytics/webinar-momentum-analytics.component';

type MainTab = 'zoom' | 'registrations' | 'analytics';

// Thin shell: just the three-way switch between the independent data sources this page covers —
// Zoom Analysis (uploaded Zoom CSV + chat, scored against the old funnel Google Sheets), Webinar
// Registrations (the live ₹79/₹99 checkout funnel, read straight from Mongo), and Analytics
// (conversion & attendance trends, blending the Owner's Google Sheet with live Zoom Analysis data).
// Each sub-tab is its own standalone component with its own permission card, so a role can be
// granted one without the others (e.g. a marketer who needs call/WhatsApp lists but not attendance
// analytics).
@Component({
  selector: 'app-webinar-analysis',
  standalone: true,
  imports: [CommonModule, ZoomAnalysisComponent, WebinarRegistrationsComponent, WebinarMomentumAnalyticsComponent],
  templateUrl: './webinar-analysis.component.html',
  styleUrls: ['./webinar-analysis.component.scss'],
})
export class WebinarAnalysisComponent {
  permissions = PERMISSIONS;
  activeMainTab: MainTab = 'zoom';

  constructor(public authService: AuthService) {
    // Land on whichever sub-tab this user actually has access to, rather than defaulting to one
    // they can't see.
    if (!this.authService.hasPermission(this.permissions.webinarAnalysisMain)) {
      if (this.authService.hasPermission(this.permissions.webinarAnalysisRegistrations)) {
        this.activeMainTab = 'registrations';
      } else if (this.authService.hasPermission(this.permissions.webinarAnalysisAnalytics)) {
        this.activeMainTab = 'analytics';
      }
    }
  }

  setMainTab(tab: MainTab) {
    this.activeMainTab = tab;
  }

  // Only worth showing a switcher if there's more than one sub-tab this user can actually see.
  get showSwitcher(): boolean {
    const grants = [this.permissions.webinarAnalysisMain, this.permissions.webinarAnalysisRegistrations, this.permissions.webinarAnalysisAnalytics];
    return grants.filter((p) => this.authService.hasPermission(p)).length > 1;
  }
}
