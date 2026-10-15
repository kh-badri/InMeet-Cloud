package model

import (
	"time"

	"github.com/google/uuid"
)

type Role string

const (
	RoleAdmin  Role = "admin"
	RoleViewer Role = "viewer"
	RoleUser   Role = "user"
)

type User struct {
	ID                uuid.UUID `json:"id"`
	Email             string    `json:"email"`
	PasswordHash      string    `json:"-"`
	Role              Role      `json:"role"`
	CanView           bool      `json:"can_view"`
	CanEdit           bool      `json:"can_edit"`
	CanDelete         bool      `json:"can_delete"`
	StorageQuotaBytes int64     `json:"storage_quota_bytes"`
	StorageUsedBytes  int64     `json:"storage_used_bytes,omitempty"`
	TOTPSecret        *string   `json:"-"`
	TOTPEnabled       bool      `json:"totp_enabled"`
	RecoveryCodes     []string  `json:"-"`
	CreatedAt         time.Time `json:"created_at"`
	UpdatedAt         time.Time `json:"updated_at"`
}

func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

func (u *User) IsUser() bool {
	return u.Role == RoleUser
}

func (u *User) HasView() bool {
	return u.CanView
}

func (u *User) HasEdit() bool {
	return u.CanEdit
}

func (u *User) HasDelete() bool {
	return u.CanDelete
}

func (u *User) IsReadOnlyAdmin() bool {
	return u.Role == RoleAdmin && !u.CanEdit && !u.CanDelete
}

type Session struct {
	ID           string    `json:"id"`
	UserID       uuid.UUID `json:"user_id"`
	CSRFToken    string    `json:"csrf_token"`
	IPAddress    string    `json:"ip_address"`
	UserAgent    string    `json:"user_agent"`
	ExpiresAt    time.Time `json:"expires_at"`
	CreatedAt    time.Time `json:"created_at"`
	LastActiveAt time.Time `json:"last_active_at"`
}

type Application struct {
	ID            uuid.UUID `json:"id"`
	Name          string    `json:"name"`
	DisplayName   string    `json:"display_name"`
	Description   string    `json:"description"`
	RetentionDays int       `json:"retention_days"`
	MinKeep       int       `json:"min_keep"`
	IsActive      bool      `json:"is_active"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	// Virtual / computed stats
	TotalBackups   int64      `json:"total_backups,omitempty"`
	TotalBytes     int64      `json:"total_bytes,omitempty"`
	HasTodayBackup bool       `json:"has_today_backup,omitempty"`
	LastBackupAt   *time.Time `json:"last_backup_at,omitempty"`
}

type ApiKey struct {
	ID            uuid.UUID  `json:"id"`
	ApplicationID uuid.UUID  `json:"application_id"`
	Name          string     `json:"name"`
	KeyPrefix     string     `json:"key_prefix"`
	KeyHash       string     `json:"-"`
	Scope         string     `json:"scope"`
	IPAllowlist   string     `json:"ip_allowlist"`
	LastUsedAt    *time.Time `json:"last_used_at,omitempty"`
	RevokedAt     *time.Time `json:"revoked_at,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	// Returned only once when created
	RawKey string `json:"raw_key,omitempty"`
}

type BackupStatus string

const (
	BackupStatusUploading   BackupStatus = "uploading"
	BackupStatusVerified    BackupStatus = "verified"
	BackupStatusFailed      BackupStatus = "failed"
	BackupStatusQuarantined BackupStatus = "quarantined"
	BackupStatusDeleted     BackupStatus = "deleted"
)

type Backup struct {
	ID              uuid.UUID              `json:"id"`
	ApplicationID   uuid.UUID              `json:"application_id"`
	ApplicationName string                 `json:"application_name,omitempty"`
	Filename        string                 `json:"filename"`
	StoragePath     string                 `json:"-"`
	SizeBytes       int64                  `json:"size_bytes"`
	SHA256          string                 `json:"sha256"`
	FileType        string                 `json:"file_type"`
	Status          BackupStatus           `json:"status"`
	BackupDate      time.Time              `json:"backup_date"`
	UploadedAt      time.Time              `json:"uploaded_at"`
	QuarantinedAt   *time.Time             `json:"quarantined_at,omitempty"`
	DeletedAt       *time.Time             `json:"deleted_at,omitempty"`
	Tags            []string               `json:"tags"`
	Metadata        map[string]interface{} `json:"metadata"`
}

type UploadSessionStatus string

const (
	UploadSessionActive    UploadSessionStatus = "active"
	UploadSessionCompleted UploadSessionStatus = "completed"
	UploadSessionAborted   UploadSessionStatus = "aborted"
	UploadSessionExpired   UploadSessionStatus = "expired"
)

type UploadSession struct {
	ID             uuid.UUID           `json:"id"`
	ApplicationID  uuid.UUID           `json:"application_id"`
	Filename       string              `json:"filename"`
	FileType       string              `json:"file_type"`
	ExpectedSize   int64               `json:"expected_size"`
	ExpectedSHA256 string              `json:"expected_sha256"`
	CurrentOffset  int64               `json:"current_offset"`
	TempFilePath   string              `json:"-"`
	Status         UploadSessionStatus `json:"status"`
	ExpiresAt      time.Time           `json:"expires_at"`
	CreatedAt      time.Time           `json:"created_at"`
	UpdatedAt      time.Time           `json:"updated_at"`
}

type AuditLog struct {
	ID         int64                  `json:"id"`
	ActorType  string                 `json:"actor_type"` // "user", "api_key", "system"
	ActorID    string                 `json:"actor_id"`
	ActorEmail string                 `json:"actor_email"`
	Action     string                 `json:"action"`
	TargetType string                 `json:"target_type"`
	TargetID   string                 `json:"target_id"`
	IPAddress  string                 `json:"ip_address"`
	UserAgent  string                 `json:"user_agent"`
	Details    map[string]interface{} `json:"details"`
	CreatedAt  time.Time              `json:"created_at"`
}

type RetentionRun struct {
	ID               uuid.UUID              `json:"id"`
	TriggeredAt      time.Time              `json:"triggered_at"`
	CompletedAt      *time.Time             `json:"completed_at,omitempty"`
	ItemsQuarantined int                    `json:"items_quarantined"`
	ItemsDeleted     int                    `json:"items_deleted"`
	BytesFreed       int64                  `json:"bytes_freed"`
	IsDryRun         bool                   `json:"is_dry_run"`
	Status           string                 `json:"status"`
	LogDetails       map[string]interface{} `json:"log_details"`
}

type DownloadToken struct {
	ID        uuid.UUID  `json:"id"`
	BackupID  uuid.UUID  `json:"backup_id"`
	UserID    uuid.UUID  `json:"user_id"`
	TokenHash string     `json:"-"`
	IPAddress string     `json:"ip_address"`
	ExpiresAt time.Time  `json:"expires_at"`
	UsedAt    *time.Time `json:"used_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type StatsSummary struct {
	TotalSizeBytes      int64            `json:"total_size_bytes"`
	BackupSizeBytes     int64            `json:"backup_size_bytes"`
	DriveSizeBytes      int64            `json:"drive_size_bytes"`
	DriveFilesCount     int64            `json:"drive_files_count"`
	DriveFoldersCount   int64            `json:"drive_folders_count"`
	DiskFreeBytes       uint64           `json:"disk_free_bytes"`
	DiskTotalBytes      uint64           `json:"disk_total_bytes"`
	DiskUsedPercent     float64          `json:"disk_used_percent"`
	TotalBackups        int64            `json:"total_backups"`
	TodayBackups        int64            `json:"today_backups"`
	ActiveAppsCount     int              `json:"active_apps_count"`
	AppsWithBackupToday int              `json:"apps_with_backup_today"`
	AppsMissingToday    []string         `json:"apps_missing_today"`
	DailyStats          []DailyStatPoint `json:"daily_stats"`
}

type DailyStatPoint struct {
	Date       string `json:"date"`
	TotalBytes int64  `json:"total_bytes"`
	Count      int    `json:"count"`
}

type DriveItemType string

const (
	DriveItemTypeFile   DriveItemType = "file"
	DriveItemTypeFolder DriveItemType = "folder"
)

type DriveItem struct {
	ID          uuid.UUID     `json:"id"`
	UserID      uuid.UUID     `json:"user_id"`
	OwnerEmail  string        `json:"owner_email,omitempty"`
	ParentID    *uuid.UUID    `json:"parent_id"`
	Name        string        `json:"name"`
	Type        DriveItemType `json:"type"`
	SizeBytes   int64         `json:"size_bytes"`
	MimeType    string        `json:"mime_type"`
	StoragePath string        `json:"-"`
	IsTrashed   bool          `json:"is_trashed"`
	TrashedAt   *time.Time    `json:"trashed_at,omitempty"`
	CreatedAt   time.Time     `json:"created_at"`
	UpdatedAt   time.Time     `json:"updated_at"`
	ItemCount   *int          `json:"item_count,omitempty"`
	IsShared    bool          `json:"is_shared,omitempty"`
	ShareRole   *ShareRole    `json:"share_role,omitempty"`
	CommentsCount int         `json:"comments_count,omitempty"`
}

type DriveBreadcrumb struct {
	ID   *uuid.UUID `json:"id"`
	Name string     `json:"name"`
}

type DriveListResponse struct {
	Items             []*DriveItem      `json:"items"`
	CurrentFolder     *DriveItem        `json:"current_folder,omitempty"`
	Breadcrumbs       []DriveBreadcrumb `json:"breadcrumbs"`
	TotalItems        int               `json:"total_items"`
	TotalBytes        int64             `json:"total_bytes"`
	StorageQuotaBytes int64             `json:"storage_quota_bytes"`
	StorageUsedBytes  int64             `json:"storage_used_bytes"`
}

type MoveDriveItemRequest struct {
	TargetParentID *uuid.UUID `json:"target_parent_id"`
}

type DriveFolderTreeItem struct {
	ID       uuid.UUID  `json:"id"`
	ParentID *uuid.UUID `json:"parent_id"`
	Name     string     `json:"name"`
}

type DriveUploadSessionStatus string

const (
	DriveUploadSessionInProgress DriveUploadSessionStatus = "in_progress"
	DriveUploadSessionCompleted  DriveUploadSessionStatus = "completed"
	DriveUploadSessionAborted    DriveUploadSessionStatus = "aborted"
)

type DriveUploadSession struct {
	ID             uuid.UUID                `json:"id"`
	UserID         uuid.UUID                `json:"user_id"`
	ParentID       *uuid.UUID               `json:"parent_id"`
	Filename       string                   `json:"filename"`
	RelativePath   string                   `json:"relative_path"`
	TotalBytes     int64                    `json:"total_bytes"`
	UploadedBytes  int64                    `json:"uploaded_bytes"`
	ChunkSize      int                      `json:"chunk_size"`
	TotalChunks    int                      `json:"total_chunks"`
	LastChunkIndex int                      `json:"last_chunk_index"`
	UploadedChunks []int32                  `json:"uploaded_chunks"`
	MimeType       string                   `json:"mime_type"`
	TempPath       string                   `json:"-"`
	Status         DriveUploadSessionStatus `json:"status"`
	CreatedAt      time.Time                `json:"created_at"`
	UpdatedAt      time.Time                `json:"updated_at"`
}

type InitUploadRequest struct {
	Filename     string     `json:"filename"`
	RelativePath string     `json:"relative_path"`
	TotalBytes   int64      `json:"total_bytes"`
	ChunkSize    int        `json:"chunk_size"`
	ParentID     *uuid.UUID `json:"parent_id"`
	MimeType     string     `json:"mime_type"`
}

type InitUploadResponse struct {
	UploadID       uuid.UUID `json:"upload_id"`
	TotalChunks    int       `json:"total_chunks"`
	ChunkSize      int       `json:"chunk_size"`
	UploadedBytes  int64     `json:"uploaded_bytes"`
	LastChunkIndex int       `json:"last_chunk_index"`
	UploadedChunks []int32   `json:"uploaded_chunks"`
}

type CompleteUploadRequest struct {
	UploadID uuid.UUID `json:"upload_id"`
}

type ShareRole string

const (
	ShareRoleViewer    ShareRole = "viewer"
	ShareRoleCommenter ShareRole = "commenter"
	ShareRoleEditor    ShareRole = "editor"
)

type DriveShare struct {
	ID               uuid.UUID `json:"id"`
	ItemID           uuid.UUID `json:"item_id"`
	SharedByUserID   uuid.UUID `json:"shared_by_user_id"`
	SharedWithUserID uuid.UUID `json:"shared_with_user_id"`
	SharedWithEmail  string    `json:"shared_with_email,omitempty"`
	Role             ShareRole `json:"role"`
	CreatedAt        time.Time `json:"created_at"`
	UpdatedAt        time.Time `json:"updated_at"`
}

type DrivePublicLink struct {
	ID              uuid.UUID `json:"id"`
	ItemID          uuid.UUID `json:"item_id"`
	CreatedByUserID uuid.UUID `json:"created_by_user_id"`
	ShareToken      string    `json:"share_token"`
	Role            ShareRole `json:"role"`
	IsActive        bool      `json:"is_active"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	URL             string    `json:"url,omitempty"`
}

type DriveComment struct {
	ID         uuid.UUID  `json:"id"`
	ItemID     uuid.UUID  `json:"item_id"`
	UserID     *uuid.UUID `json:"user_id,omitempty"`
	AuthorName string     `json:"author_name"`
	Content    string     `json:"content"`
	CreatedAt  time.Time  `json:"created_at"`
	UpdatedAt  time.Time  `json:"updated_at"`
}

type ItemShareDetailsResponse struct {
	Item           *DriveItem       `json:"item"`
	IsOwner        bool             `json:"is_owner"`
	CanManageShare bool             `json:"can_manage_share"`
	Shares         []*DriveShare    `json:"shares"`
	PublicLink     *DrivePublicLink `json:"public_link"`
}

type UpdateUserShareRequest struct {
	Email string    `json:"email"`
	Role  ShareRole `json:"role"`
}

type UpdatePublicLinkRequest struct {
	IsActive bool      `json:"is_active"`
	Role     ShareRole `json:"role"`
}

type CreateCommentRequest struct {
	AuthorName string `json:"author_name,omitempty"`
	Content    string `json:"content"`
}

type SharedWithMeItem struct {
	Item          *DriveItem `json:"item"`
	Role          ShareRole  `json:"role"`
	SharedByEmail string     `json:"shared_by_email"`
	SharedAt      time.Time  `json:"shared_at"`
}

type SharedWithMeResponse struct {
	Items       []*SharedWithMeItem `json:"items"`
	TotalItems  int                 `json:"total_items"`
	Breadcrumbs []DriveBreadcrumb   `json:"breadcrumbs,omitempty"`
}

type PublicSharedItemResponse struct {
	Item          *DriveItem        `json:"item"`
	Role          ShareRole         `json:"role"`
	Items         []*DriveItem      `json:"items,omitempty"`
	Breadcrumbs   []DriveBreadcrumb `json:"breadcrumbs,omitempty"`
	CommentsCount int               `json:"comments_count"`
	TotalItems    int               `json:"total_items,omitempty"`
	TotalBytes    int64             `json:"total_bytes,omitempty"`
}


