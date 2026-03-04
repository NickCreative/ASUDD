export interface Failure {
  id: number;
  equipment_id: string;
  equipment_name: string;
  failure_type: string;
  timestamp: string;
  end_timestamp?: string;
  duration_minutes: number;
  description: string;
  service?: string;
  location?: string;
  linear_object?: string;
  initiator?: string;
  source_file: string;
  data_type?: 'failure' | 'working_hours';
  created_at: string;
}

export interface AvailabilityData {
  date: string;
  hasFailures: number;
  hasWorkingHours: number;
}

export interface Stats {
  totalFailures: number;
  equipmentCount: number;
  recentFailures: Failure[];
  failuresByMonth: { month: string; count: number }[];
}

export interface MonthlyReport {
  failures: Failure[];
  summary: {
    equipment_name: string;
    count: number;
    total_duration: number;
  }[];
  typeSummary: {
    failure_type: string;
    count: number;
  }[];
}

export interface ColumnMapping {
  field_name: string;
  display_name: string;
  mapped_keys: string;
}
