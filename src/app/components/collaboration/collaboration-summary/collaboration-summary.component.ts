import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { forkJoin, Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../../services/api.service';
import { CollabFieldDef, CollabFieldType, CollabRecord } from '../collaboration-list/collaboration-list.component';

interface Breakdown {
  label: string;
  count: number;
}

interface DeliverableRow {
  name: string;
  cost: number | null;
  deliverable: string;
}

// Founder-facing rollup. Field names are fully custom (Zoho-style, built by whoever manages
// the Live/Followup lists), so this can't bind to fixed keys — instead it pattern-matches
// field LABELS (e.g. anything named like "Cost"/"Payout", "Type", "Deliverable", "Status")
// against whatever fields currently exist. If a list gets re-labelled or a field is deleted,
// the matching card/column just falls back to a hint instead of breaking.
@Component({
  selector: 'app-collaboration-summary',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './collaboration-summary.component.html',
  styleUrls: ['./collaboration-summary.component.scss'],
})
export class CollaborationSummaryComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  loading = false;
  error = '';

  liveFields: CollabFieldDef[] = [];
  liveRecords: CollabRecord[] = [];
  followupFields: CollabFieldDef[] = [];
  followupRecords: CollabRecord[] = [];

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  load() {
    this.loading = true;
    this.error = '';
    forkJoin({
      liveFields: this.apiService.getCollaborationFields('live'),
      liveRecords: this.apiService.getCollaborationRecords('live'),
      followupFields: this.apiService.getCollaborationFields('followup'),
      followupRecords: this.apiService.getCollaborationRecords('followup'),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.liveFields = res.liveFields.data || [];
          this.liveRecords = res.liveRecords.data || [];
          this.followupFields = res.followupFields.data || [];
          this.followupRecords = res.followupRecords.data || [];
          this.loading = false;
        },
        error: () => {
          this.error = 'Failed to load summary data';
          this.loading = false;
        },
      });
  }

  private findField(fields: CollabFieldDef[], types: CollabFieldType[], labelRegex: RegExp): CollabFieldDef | undefined {
    return fields.find((f) => types.includes(f.type) && labelRegex.test(f.label));
  }

  get liveNameField(): CollabFieldDef | undefined {
    return this.findField(this.liveFields, ['text'], /name/i);
  }

  get liveTypeField(): CollabFieldDef | undefined {
    return this.findField(this.liveFields, ['dropdown'], /type|category/i);
  }

  get liveCostField(): CollabFieldDef | undefined {
    return this.findField(this.liveFields, ['number'], /cost|payout|amount|fee|budget|price|spend/i);
  }

  get liveDeliverableField(): CollabFieldDef | undefined {
    return this.findField(this.liveFields, ['text', 'textarea'], /deliverable/i);
  }

  get followupStatusField(): CollabFieldDef | undefined {
    return this.findField(this.followupFields, ['dropdown'], /status/i);
  }

  get activeCount(): number {
    return this.liveRecords.length;
  }

  get lineupCount(): number {
    return this.followupRecords.length;
  }

  get activeTypeBreakdown(): Breakdown[] {
    const field = this.liveTypeField;
    if (!field) return [];
    return this.countByField(this.liveRecords, field);
  }

  get lineupStatusBreakdown(): Breakdown[] {
    const field = this.followupStatusField;
    if (!field) return [];
    return this.countByField(this.followupRecords, field);
  }

  private countByField(records: CollabRecord[], field: CollabFieldDef): Breakdown[] {
    const counts = new Map<string, number>();
    for (const r of records) {
      const v = r.values ? r.values[field.key] : undefined;
      if (!v) continue;
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
  }

  get totalCost(): number | null {
    const field = this.liveCostField;
    if (!field) return null;
    return this.liveRecords.reduce((sum, r) => sum + (Number(r.values?.[field.key]) || 0), 0);
  }

  get avgCost(): number | null {
    const total = this.totalCost;
    if (total === null || this.activeCount === 0) return null;
    return Math.round(total / this.activeCount);
  }

  get deliverableCount(): number {
    return this.deliverableRows.filter((r) => r.deliverable).length;
  }

  get deliverableRows(): DeliverableRow[] {
    const nameField = this.liveNameField;
    const costField = this.liveCostField;
    const delivField = this.liveDeliverableField;
    return this.liveRecords.map((r) => ({
      name: (nameField && r.values?.[nameField.key]) || '—',
      cost: costField ? Number(r.values?.[costField.key]) || null : null,
      deliverable: (delivField && r.values?.[delivField.key]) || '',
    }));
  }

  get showDeliverablesTable(): boolean {
    return this.liveRecords.length > 0 && (!!this.liveDeliverableField || !!this.liveCostField);
  }
}
