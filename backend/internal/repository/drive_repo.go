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
