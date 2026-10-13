export type Role = 'admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: Role;
  totp_enabled: boolean;
  created_at: string;
}

export interface Application {
  id: string;
  name: string;
  display_name: string;
  description: string;
  retention_days: number;
  min_keep: number;
  is_active: boolean;
  total_backups?: number;
  total_bytes?: number;
  has_today_backup?: boolean;
  last_backup_at?: string | null;
  created_at: string;
}

export interface ApiKey {
  id: string;
  application_id: string;
  name: string;
  key_prefix: string;
  scope: string;
  ip_allowlist: string;
  last_used_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
  raw_key?: string;
}

export type BackupStatus = 'uploading' | 'verified' | 'failed' | 'quarantined' | 'deleted';

export interface Backup {
  id: string;
  application_id: string;
  application_name: string;
  filename: string;
  size_bytes: number;
  sha256: string;
  file_type: string;
  status: BackupStatus;
  backup_date: string;
  uploaded_at: string;
  quarantined_at?: string | null;
  deleted_at?: string | null;
  tags: string[];
  metadata: Record<string, any>;
}

export interface DailyStatPoint {
  date: string;
  total_bytes: number;
  count: number;
}

export interface StatsSummary {
  total_size_bytes: number;
  disk_free_bytes: number;
  disk_total_bytes: number;
  disk_used_percent: number;
  total_backups: number;
  today_backups: number;
  active_apps_count: number;
  apps_with_backup_today: number;
  apps_missing_today: string[];
  daily_stats: DailyStatPoint[];
}

export interface AuditLog {
  id: number;
  actor_type: string;
  actor_id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string;
  ip_address: string;
  user_agent: string;
  details: Record<string, any>;
  created_at: string;
}

export type DriveItemType = 'file' | 'folder';

export interface DriveItem {
  id: string;
  user_id: string;
  parent_id: string | null;
  name: string;
  type: DriveItemType;
  size_bytes: number;
  mime_type: string;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export interface DriveBreadcrumb {
  id: string | null;
  name: string;
}

export interface DriveListResponse {
  items: DriveItem[];
  current_folder?: DriveItem;
  breadcrumbs: DriveBreadcrumb[];
  total_items: number;
  total_bytes: number;
}

