import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ApiService } from '../../../services/api.service';

export type CollabListType = 'followup' | 'live';
export type CollabFieldType = 'text' | 'number' | 'date' | 'dropdown' | 'checkbox' | 'textarea' | 'phone';

export interface CollabFieldDef {
  _id: string;
  listType: CollabListType;
  key: string;
  label: string;
  type: CollabFieldType;
  options?: string[];
  required?: boolean;
  order: number;
}

export interface CollabRecord {
  _id: string;
  stage: CollabListType;
  values: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

const FIELD_TYPE_LABELS: Record<CollabFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  dropdown: 'Dropdown',
  checkbox: 'Checkbox',
  textarea: 'Long Text',
  phone: 'Phone',
};

// Generic schema-driven table: both the Live List and Followup List render through this
// one component, each pointed at its own `stage`/field set via @Input(). Adding a field
// type here (the ngSwitch in the template) makes it available to both lists at once —
// there is no separate "Live table" vs "Followup table" implementation.
@Component({
  selector: 'app-collaboration-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collaboration-list.component.html',
  styleUrls: ['./collaboration-list.component.scss'],
})
export class CollaborationListComponent implements OnInit, OnDestroy {
  @Input() stage: CollabListType = 'followup';

  private destroy$ = new Subject<void>();

  fieldTypeLabels = FIELD_TYPE_LABELS;
  fieldTypes: CollabFieldType[] = ['text', 'number', 'date', 'dropdown', 'checkbox', 'textarea', 'phone'];

  fields: CollabFieldDef[] = [];
  records: CollabRecord[] = [];
  loading = false;
  error = '';

  showManageFields = false;
  newFieldLabel = '';
  newFieldType: CollabFieldType = 'text';
  newFieldOptionsText = '';
  newFieldRequired = false;
  savingField = false;
  fieldError = '';

  editingFieldId: string | null = null;
  editFieldLabel = '';
  editFieldOptionsText = '';
  editFieldRequired = false;

  expandedRecordId: string | null = null;
  savingCellKey: string | null = null;

  constructor(private apiService: ApiService) {}

  ngOnInit() {
    this.load();
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get listTypeLabel(): string {
    return this.stage === 'followup' ? 'Followup' : 'Live';
  }

  get expandedRecord(): CollabRecord | undefined {
    return this.records.find((r) => r._id === this.expandedRecordId);
  }

  get newFieldNeedsOptions(): boolean {
    return this.newFieldType === 'dropdown';
  }

  load() {
    this.loading = true;
    this.error = '';
    this.apiService
      .getCollaborationFields(this.stage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.fields = (res.data || []).slice().sort((a: CollabFieldDef, b: CollabFieldDef) => a.order - b.order);
          this.loadRecords();
        },
        error: () => {
          this.error = 'Failed to load fields';
          this.loading = false;
        },
      });
  }

  private loadRecords() {
    this.apiService
      .getCollaborationRecords(this.stage)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.records = res.data || [];
          this.loading = false;
        },
        error: () => {
          this.error = 'Failed to load records';
          this.loading = false;
        },
      });
  }

  // ---------- Records ----------

  addRow() {
    this.apiService
      .createCollaborationRecord(this.stage, {})
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          if (res.data) this.records.push(res.data);
        },
      });
  }

  deleteRow(record: CollabRecord) {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    this.apiService
      .deleteCollaborationRecord(record._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.records = this.records.filter((r) => r._id !== record._id);
          if (this.expandedRecordId === record._id) this.expandedRecordId = null;
        },
      });
  }

  saveCell(record: CollabRecord, field: CollabFieldDef, value: any) {
    const cellKey = `${record._id}:${field.key}`;
    record.values[field.key] = value;
    this.savingCellKey = cellKey;
    this.apiService
      .updateCollaborationRecord(record._id, { [field.key]: value })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          if (this.savingCellKey === cellKey) this.savingCellKey = null;
        },
        error: () => {
          if (this.savingCellKey === cellKey) this.savingCellKey = null;
        },
      });
  }

  toggleExpand(record: CollabRecord) {
    this.expandedRecordId = this.expandedRecordId === record._id ? null : record._id;
  }

  closeDrawer() {
    this.expandedRecordId = null;
  }

  promote(record: CollabRecord) {
    this.apiService
      .promoteCollaborationRecord(record._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.records = this.records.filter((r) => r._id !== record._id);
          if (this.expandedRecordId === record._id) this.expandedRecordId = null;
        },
      });
  }

  demote(record: CollabRecord) {
    this.apiService
      .demoteCollaborationRecord(record._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.records = this.records.filter((r) => r._id !== record._id);
          if (this.expandedRecordId === record._id) this.expandedRecordId = null;
        },
      });
  }

  // ---------- Fields (Manage Fields modal) ----------

  openManageFields() {
    this.showManageFields = true;
    this.resetNewFieldForm();
  }

  closeManageFields() {
    this.showManageFields = false;
    this.editingFieldId = null;
  }

  resetNewFieldForm() {
    this.newFieldLabel = '';
    this.newFieldType = 'text';
    this.newFieldOptionsText = '';
    this.newFieldRequired = false;
    this.fieldError = '';
  }

  addField() {
    const label = this.newFieldLabel.trim();
    if (!label) {
      this.fieldError = 'Field name is required';
      return;
    }
    let options: string[] | undefined;
    if (this.newFieldType === 'dropdown') {
      options = this.newFieldOptionsText.split(',').map((o) => o.trim()).filter(Boolean);
      if (options.length === 0) {
        this.fieldError = 'Add at least one option, separated by commas';
        return;
      }
    }
    this.savingField = true;
    this.fieldError = '';
    this.apiService
      .createCollaborationField(this.stage, { label, type: this.newFieldType, options, required: this.newFieldRequired })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (res) => {
          this.savingField = false;
          if (res.data) {
            this.fields.push(res.data);
            this.resetNewFieldForm();
          }
        },
        error: () => {
          this.savingField = false;
          this.fieldError = 'Failed to add field';
        },
      });
  }

  startEditField(field: CollabFieldDef) {
    this.editingFieldId = field._id;
    this.editFieldLabel = field.label;
    this.editFieldOptionsText = (field.options || []).join(', ');
    this.editFieldRequired = !!field.required;
  }

  cancelEditField() {
    this.editingFieldId = null;
  }

  saveEditField(field: CollabFieldDef) {
    const label = this.editFieldLabel.trim();
    if (!label) return;
    const options = field.type === 'dropdown' ? this.editFieldOptionsText.split(',').map((o) => o.trim()).filter(Boolean) : undefined;
    this.apiService
      .updateCollaborationField(this.stage, field._id, { label, options, required: this.editFieldRequired })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          field.label = label;
          if (options) field.options = options;
          field.required = this.editFieldRequired;
          this.editingFieldId = null;
        },
      });
  }

  deleteField(field: CollabFieldDef) {
    if (!confirm(`Delete field "${field.label}"? Existing data in this column will no longer be shown.`)) return;
    this.apiService
      .deleteCollaborationField(this.stage, field._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.fields = this.fields.filter((f) => f._id !== field._id);
        },
      });
  }

  moveFieldUp(field: CollabFieldDef) {
    const idx = this.fields.findIndex((f) => f._id === field._id);
    if (idx <= 0) return;
    [this.fields[idx - 1], this.fields[idx]] = [this.fields[idx], this.fields[idx - 1]];
    this.persistFieldOrder();
  }

  moveFieldDown(field: CollabFieldDef) {
    const idx = this.fields.findIndex((f) => f._id === field._id);
    if (idx === -1 || idx >= this.fields.length - 1) return;
    [this.fields[idx + 1], this.fields[idx]] = [this.fields[idx], this.fields[idx + 1]];
    this.persistFieldOrder();
  }

  private persistFieldOrder() {
    const orderedIds = this.fields.map((f) => f._id);
    this.apiService.reorderCollaborationFields(this.stage, orderedIds).pipe(takeUntil(this.destroy$)).subscribe();
  }
}
