import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
})
export class FilterBarComponent implements OnInit {
  @Output() filterChange = new EventEmitter<any>();

  period: string = 'today';
  startDate: string = '';
  endDate: string = '';
  userType: string = '';
  referralCode: string = '';
  state: string = '';
  district: string = '';

  userTypes = ['Tribe', 'Webinar', 'Free'];
  states = ['Maharashtra', 'Karnataka', 'Tamil Nadu', 'Telangana', 'Gujarat', 'Delhi'];

  ngOnInit() {
    this.emitFilters();
  }

  onPeriodChange() {
    if (this.period !== 'custom') {
      this.startDate = '';
      this.endDate = '';
    }
    this.emitFilters();
  }

  emitFilters() {
    const filters = {
      period: this.period,
      startDate: this.startDate,
      endDate: this.endDate,
      userType: this.userType,
      referralCode: this.referralCode,
      state: this.state,
      district: this.district,
    };
    this.filterChange.emit(filters);
  }
}
