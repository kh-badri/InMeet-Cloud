export type Role = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  role: Role;
  can_view?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
  storage_quota_bytes?: number;
  storage_used_bytes?: number;
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
  backup_size_bytes: number;
  drive_size_bytes: number;
  drive_files_count: number;
  drive_folders_count: number;
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
  owner_email?: string;
  parent_id: string | null;
  name: string;
  type: DriveItemType;
  size_bytes: number;
  mime_type: string;
  is_trashed?: boolean;
  trashed_at?: string | null;
  created_at: string;
  updated_at: string;
  item_count?: number;
  is_shared?: boolean;
  share_role?: ShareRole;
  comments_count?: number;
}

export type ShareRole = 'viewer' | 'commenter' | 'editor';

export interface DriveShare {
  id: string;
  item_id: string;
  shared_by_user_id: string;
  shared_with_user_id: string;
  shared_with_email: string;
  role: ShareRole;
  created_at: string;
  updated_at: string;
}

export interface DrivePublicLink {
  id: string;
  item_id: string;
  created_by_user_id: string;
  share_token: string;
  role: ShareRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  url?: string;
}

export interface DriveComment {
  id: string;
  item_id: string;
  user_id?: string | null;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ItemShareDetailsResponse {
  item: DriveItem;
  is_owner: boolean;
  can_manage_share: boolean;
  shares: DriveShare[];
  public_link?: DrivePublicLink | null;
}

export interface SharedWithMeItem {
  item: DriveItem;
  role: ShareRole;
  shared_by_email: string;
  shared_at: string;
}

export interface SharedWithMeResponse {
  items: SharedWithMeItem[];
  total_items: number;
  breadcrumbs?: DriveBreadcrumb[];
}

export interface PublicSharedItemResponse {
  item: DriveItem;
  role: ShareRole;
  items?: DriveItem[];
  breadcrumbs?: DriveBreadcrumb[];
  comments_count: number;
  total_items?: number;
  total_bytes?: number;
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
  storage_quota_bytes?: number;
  storage_used_bytes?: number;
}

export interface DriveFolderTreeItem {
  id: string;
  parent_id: string | null;
  name: string;
}

export interface DriveUploadSession {
  id: string;
  user_id: string;
  parent_id: string | null;
  filename: string;
  relative_path: string;
  total_bytes: number;
  uploaded_bytes: number;
  chunk_size: number;
  total_chunks: number;
  last_chunk_index: number;
  uploaded_chunks?: number[];
  mime_type: string;
  status: 'in_progress' | 'completed' | 'aborted';
  created_at: string;
  updated_at: string;
}


