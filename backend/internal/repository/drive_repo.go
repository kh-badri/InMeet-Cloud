package repository

import (
	"context"
	"errors"
	"time"

	"backupvault/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrDriveItemNotFound = errors.New("drive item not found")
)

type DriveRepository struct {
	pool *pgxpool.Pool
}

func NewDriveRepository(pool *pgxpool.Pool) *DriveRepository {
	return &DriveRepository{pool: pool}
}

func (r *DriveRepository) Create(ctx context.Context, item *model.DriveItem) error {
	if item.ID == uuid.Nil {
		item.ID = uuid.New()
	}
	if item.CreatedAt.IsZero() {
		item.CreatedAt = time.Now()
	}
	if item.UpdatedAt.IsZero() {
		item.UpdatedAt = item.CreatedAt
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO drive_items (id, user_id, parent_id, name, type, size_bytes, mime_type, storage_path, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`, item.ID, item.UserID, item.ParentID, item.Name, item.Type, item.SizeBytes, item.MimeType, item.StoragePath, item.CreatedAt, item.UpdatedAt)
	return err
}

func (r *DriveRepository) GetByID(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*model.DriveItem, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, parent_id, name, type,
		       CASE 
		         WHEN d.type = 'folder' THEN (
		           WITH RECURSIVE folder_tree AS (
		             SELECT id, size_bytes FROM drive_items WHERE parent_id = d.id
		             UNION ALL
		             SELECT child.id, child.size_bytes FROM drive_items child JOIN folder_tree ON child.parent_id = folder_tree.id
		           )
		           SELECT COALESCE(SUM(size_bytes), 0) FROM folder_tree
		         )
		         ELSE d.size_bytes
		       END AS size_bytes,
		       mime_type, storage_path, created_at, updated_at,
		       (SELECT COUNT(*) FROM drive_items c WHERE c.parent_id = d.id) AS item_count
		FROM drive_items d
		WHERE id = $1 AND user_id = $2
	`, id, userID)

	var item model.DriveItem
	var itemCount int
	err := row.Scan(&item.ID, &item.UserID, &item.ParentID, &item.Name, &item.Type, &item.SizeBytes, &item.MimeType, &item.StoragePath, &item.CreatedAt, &item.UpdatedAt, &itemCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDriveItemNotFound
		}
		return nil, err
	}
	if item.Type == model.DriveItemTypeFolder {
		item.ItemCount = &itemCount
	}
	return &item, nil
}

func (r *DriveRepository) List(ctx context.Context, userID uuid.UUID, parentID *uuid.UUID, query string) ([]*model.DriveItem, error) {
	var rows pgx.Rows
	var err error

	const selectColumns = `
		SELECT id, user_id, parent_id, name, type,
		       CASE 
		         WHEN d.type = 'folder' THEN (
		           WITH RECURSIVE folder_tree AS (
		             SELECT id, size_bytes FROM drive_items WHERE parent_id = d.id
		             UNION ALL
		             SELECT child.id, child.size_bytes FROM drive_items child JOIN folder_tree ON child.parent_id = folder_tree.id
		           )
		           SELECT COALESCE(SUM(size_bytes), 0) FROM folder_tree
		         )
		         ELSE d.size_bytes
		       END AS size_bytes,
		       mime_type, storage_path, created_at, updated_at,
		       (SELECT COUNT(*) FROM drive_items c WHERE c.parent_id = d.id) AS item_count
		FROM drive_items d
	`

	if query != "" {
		rows, err = r.pool.Query(ctx, selectColumns+`
			WHERE user_id = $1 AND name ILIKE '%' || $2 || '%'
			ORDER BY type DESC, name ASC
		`, userID, query)
	} else if parentID == nil {
		rows, err = r.pool.Query(ctx, selectColumns+`
			WHERE user_id = $1 AND parent_id IS NULL
			ORDER BY type DESC, name ASC
		`, userID)
	} else {
		rows, err = r.pool.Query(ctx, selectColumns+`
			WHERE user_id = $1 AND parent_id = $2
			ORDER BY type DESC, name ASC
		`, userID, *parentID)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]*model.DriveItem, 0)
	for rows.Next() {
		var item model.DriveItem
		var itemCount int
		err := rows.Scan(&item.ID, &item.UserID, &item.ParentID, &item.Name, &item.Type, &item.SizeBytes, &item.MimeType, &item.StoragePath, &item.CreatedAt, &item.UpdatedAt, &itemCount)
		if err != nil {
			return nil, err
		}
		if item.Type == model.DriveItemTypeFolder {
			item.ItemCount = &itemCount
		}
		items = append(items, &item)
	}
	return items, nil
}

func (r *DriveRepository) GetBreadcrumbs(ctx context.Context, userID uuid.UUID, folderID uuid.UUID) ([]model.DriveBreadcrumb, error) {
	rows, err := r.pool.Query(ctx, `
		WITH RECURSIVE breadcrumb_tree AS (
			SELECT id, name, parent_id, 1 as depth
			FROM drive_items
			WHERE id = $1 AND user_id = $2
			UNION ALL
			SELECT p.id, p.name, p.parent_id, b.depth + 1
			FROM drive_items p
			JOIN breadcrumb_tree b ON p.id = b.parent_id
			WHERE p.user_id = $2
		)
		SELECT id, name FROM breadcrumb_tree ORDER BY depth DESC;
	`, folderID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var breadcrumbs []model.DriveBreadcrumb
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err == nil {
			breadcrumbs = append(breadcrumbs, model.DriveBreadcrumb{
				ID:   &id,
				Name: name,
			})
		}
	}
	return breadcrumbs, nil
}

func (r *DriveRepository) FindFolderByName(ctx context.Context, userID uuid.UUID, parentID *uuid.UUID, name string) (*model.DriveItem, error) {
	var row pgx.Row
	if parentID == nil {
		row = r.pool.QueryRow(ctx, `
			SELECT id, user_id, parent_id, name, type, size_bytes, mime_type, storage_path, created_at, updated_at
			FROM drive_items
			WHERE user_id = $1 AND parent_id IS NULL AND name = $2 AND type = 'folder'
			LIMIT 1
		`, userID, name)
	} else {
		row = r.pool.QueryRow(ctx, `
			SELECT id, user_id, parent_id, name, type, size_bytes, mime_type, storage_path, created_at, updated_at
			FROM drive_items
			WHERE user_id = $1 AND parent_id = $2 AND name = $3 AND type = 'folder'
			LIMIT 1
		`, userID, *parentID, name)
	}

	var item model.DriveItem
	err := row.Scan(&item.ID, &item.UserID, &item.ParentID, &item.Name, &item.Type, &item.SizeBytes, &item.MimeType, &item.StoragePath, &item.CreatedAt, &item.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDriveItemNotFound
		}
		return nil, err
	}
	return &item, nil
}

func (r *DriveRepository) FindDescendants(ctx context.Context, userID uuid.UUID, rootID uuid.UUID) ([]*model.DriveItem, error) {
	rows, err := r.pool.Query(ctx, `
		WITH RECURSIVE item_tree AS (
			SELECT id, user_id, parent_id, name, type, size_bytes, mime_type, storage_path, created_at, updated_at
			FROM drive_items
			WHERE id = $1 AND user_id = $2
			UNION ALL
			SELECT c.id, c.user_id, c.parent_id, c.name, c.type, c.size_bytes, c.mime_type, c.storage_path, c.created_at, c.updated_at
			FROM drive_items c
			JOIN item_tree ON c.parent_id = item_tree.id
			WHERE c.user_id = $2
		)
		SELECT id, user_id, parent_id, name, type, size_bytes, mime_type, storage_path, created_at, updated_at
		FROM item_tree;
	`, rootID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]*model.DriveItem, 0)
	for rows.Next() {
		var item model.DriveItem
		err := rows.Scan(&item.ID, &item.UserID, &item.ParentID, &item.Name, &item.Type, &item.SizeBytes, &item.MimeType, &item.StoragePath, &item.CreatedAt, &item.UpdatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, &item)
	}
	return items, nil
}

func (r *DriveRepository) Delete(ctx context.Context, id uuid.UUID, userID uuid.UUID) error {
	cmd, err := r.pool.Exec(ctx, `
		DELETE FROM drive_items WHERE id = $1 AND user_id = $2
	`, id, userID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrDriveItemNotFound
	}
	return nil
}

func (r *DriveRepository) Rename(ctx context.Context, id uuid.UUID, userID uuid.UUID, newName string) error {
	cmd, err := r.pool.Exec(ctx, `
		UPDATE drive_items SET name = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3
	`, newName, id, userID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrDriveItemNotFound
	}
	return nil
}

func (r *DriveRepository) GetStats(ctx context.Context, userID uuid.UUID) (int, int64, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(size_bytes), 0)
		FROM drive_items
		WHERE user_id = $1
	`, userID)

	var count int
	var totalBytes int64
	err := row.Scan(&count, &totalBytes)
	return count, totalBytes, err
}

func (r *DriveRepository) Move(ctx context.Context, id uuid.UUID, userID uuid.UUID, newParentID *uuid.UUID) error {
	cmd, err := r.pool.Exec(ctx, `
		UPDATE drive_items SET parent_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3
	`, newParentID, id, userID)
	if err != nil {
		return err
	}
	if cmd.RowsAffected() == 0 {
		return ErrDriveItemNotFound
	}
	return nil
}

func (r *DriveRepository) IsDescendant(ctx context.Context, userID uuid.UUID, rootID uuid.UUID, targetID uuid.UUID) (bool, error) {
	row := r.pool.QueryRow(ctx, `
		WITH RECURSIVE item_tree AS (
			SELECT id, parent_id FROM drive_items WHERE id = $1 AND user_id = $2
			UNION ALL
			SELECT c.id, c.parent_id FROM drive_items c JOIN item_tree ON c.parent_id = item_tree.id
			WHERE c.user_id = $2
		)
		SELECT EXISTS(SELECT 1 FROM item_tree WHERE id = $3);
	`, rootID, userID, targetID)

	var isDescendant bool
	err := row.Scan(&isDescendant)
	return isDescendant, err
}

func (r *DriveRepository) ListAllFolders(ctx context.Context, userID uuid.UUID) ([]*model.DriveFolderTreeItem, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, parent_id, name
		FROM drive_items
		WHERE user_id = $1 AND type = 'folder'
		ORDER BY name ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var folders []*model.DriveFolderTreeItem
	for rows.Next() {
		var item model.DriveFolderTreeItem
		if err := rows.Scan(&item.ID, &item.ParentID, &item.Name); err != nil {
			return nil, err
		}
		folders = append(folders, &item)
	}
	return folders, nil
}

func (r *DriveRepository) CreateUploadSession(ctx context.Context, session *model.DriveUploadSession) error {
	if session.ID == uuid.Nil {
		session.ID = uuid.New()
	}
	if session.CreatedAt.IsZero() {
		session.CreatedAt = time.Now()
	}
	if session.UpdatedAt.IsZero() {
		session.UpdatedAt = session.CreatedAt
	}

	if session.UploadedChunks == nil {
		session.UploadedChunks = []int32{}
	}

	_, err := r.pool.Exec(ctx, `
		INSERT INTO drive_upload_sessions (
			id, user_id, parent_id, filename, relative_path, total_bytes, uploaded_bytes,
			chunk_size, total_chunks, last_chunk_index, uploaded_chunks, mime_type, temp_path, status, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
	`, session.ID, session.UserID, session.ParentID, session.Filename, session.RelativePath, session.TotalBytes, session.UploadedBytes,
		session.ChunkSize, session.TotalChunks, session.LastChunkIndex, session.UploadedChunks, session.MimeType, session.TempPath, session.Status, session.CreatedAt, session.UpdatedAt)
	return err
}

func (r *DriveRepository) GetUploadSession(ctx context.Context, id uuid.UUID, userID uuid.UUID) (*model.DriveUploadSession, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, parent_id, filename, relative_path, total_bytes, uploaded_bytes,
		       chunk_size, total_chunks, last_chunk_index, uploaded_chunks, mime_type, temp_path, status, created_at, updated_at
		FROM drive_upload_sessions
		WHERE id = $1 AND user_id = $2
	`, id, userID)

	var s model.DriveUploadSession
	err := row.Scan(&s.ID, &s.UserID, &s.ParentID, &s.Filename, &s.RelativePath, &s.TotalBytes, &s.UploadedBytes,
		&s.ChunkSize, &s.TotalChunks, &s.LastChunkIndex, &s.UploadedChunks, &s.MimeType, &s.TempPath, &s.Status, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDriveItemNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *DriveRepository) RecordChunkSuccess(ctx context.Context, id uuid.UUID, userID uuid.UUID, chunkIndex int, chunkSize int64) (int64, error) {
	var newUploadedBytes int64
	row := r.pool.QueryRow(ctx, `
		UPDATE drive_upload_sessions
		SET uploaded_chunks = CASE 
				WHEN $1 = ANY(uploaded_chunks) THEN uploaded_chunks 
				ELSE array_append(uploaded_chunks, $1) 
			END,
		    uploaded_bytes = CASE 
				WHEN $1 = ANY(uploaded_chunks) THEN uploaded_bytes 
				ELSE uploaded_bytes + $2 
			END,
		    last_chunk_index = GREATEST(last_chunk_index, $1),
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = $3 AND user_id = $4
		RETURNING uploaded_bytes
	`, chunkIndex, chunkSize, id, userID)

	err := row.Scan(&newUploadedBytes)
	if err != nil {
		return 0, err
	}
	return newUploadedBytes, nil
}

func (r *DriveRepository) UpdateUploadSessionProgress(ctx context.Context, id uuid.UUID, userID uuid.UUID, uploadedBytes int64, lastChunkIndex int) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE drive_upload_sessions
		SET uploaded_bytes = $1, last_chunk_index = $2, updated_at = CURRENT_TIMESTAMP
		WHERE id = $3 AND user_id = $4
	`, uploadedBytes, lastChunkIndex, id, userID)
	return err
}

func (r *DriveRepository) SetUploadSessionStatus(ctx context.Context, id uuid.UUID, userID uuid.UUID, status model.DriveUploadSessionStatus) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE drive_upload_sessions
		SET status = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND user_id = $3
	`, status, id, userID)
	return err
}

func (r *DriveRepository) ListActiveUploadSessions(ctx context.Context, userID uuid.UUID) ([]*model.DriveUploadSession, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, user_id, parent_id, filename, relative_path, total_bytes, uploaded_bytes,
		       chunk_size, total_chunks, last_chunk_index, uploaded_chunks, mime_type, temp_path, status, created_at, updated_at
		FROM drive_upload_sessions
		WHERE user_id = $1 AND status = 'in_progress' AND updated_at > NOW() - INTERVAL '24 hours'
		ORDER BY updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []*model.DriveUploadSession
	for rows.Next() {
		var s model.DriveUploadSession
		err := rows.Scan(&s.ID, &s.UserID, &s.ParentID, &s.Filename, &s.RelativePath, &s.TotalBytes, &s.UploadedBytes,
			&s.ChunkSize, &s.TotalChunks, &s.LastChunkIndex, &s.UploadedChunks, &s.MimeType, &s.TempPath, &s.Status, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, &s)
	}
	return sessions, nil
}
