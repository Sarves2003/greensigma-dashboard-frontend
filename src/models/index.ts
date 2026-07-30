export interface User {
  _id: string;
  name: string;
  email?: string;
  mobile?: string;
  whatsappNumber?: string;
  state?: string;
  district?: string;
  type: 'Webinar' | 'Free' | 'Tribe';
  referalCode?: string;
  referalType?: string;
  createdOn: Date;
}

export interface KPIResponse {
  value: number;
  trend?: number;
  label: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  label?: string;
}

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface FilterOptions {
  period: string;
  startDate?: string;
  endDate?: string;
  userType?: string;
  referralCode?: string;
  state?: string;
  district?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
