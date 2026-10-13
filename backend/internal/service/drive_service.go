package service

import (
	"archive/zip"
	"context"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"backupvault/internal/model"
	"backupvault/internal/repository"

	"github.com/google/uuid"
)

var (
	ErrInvalidItemName = errors.New("nama berkas atau folder tidak valid")
	ErrParentNotFound  = errors.New("folder induk tidak ditemukan")
)

type DriveService struct {
	repo    *repository.DriveRepository
	baseDir string
}

func NewDriveService(repo *repository.DriveRepository, baseDir string) *DriveService {
	_ = os.MkdirAll(baseDir, 0750)
	return &DriveService{
		repo:    repo,
		baseDir: filepath.Clean(baseDir),
	}
}

func (s *DriveService) ListItems(ctx context.Context, userID uuid.UUID, parentID *uuid.UUID, query string) (*model.DriveListResponse, error) {
	items, err := s.repo.List(ctx, userID, parentID, query)
	if err != nil {
		return nil, fmt.Errorf("gagal mengambil daftar item: %w", err)
	}

	var currentFolder *model.DriveItem
	var breadcrumbs []model.DriveBreadcrumb

	if parentID != nil {
		currentFolder, err = s.repo.GetByID(ctx, *parentID, userID)
		if err != nil && !errors.Is(err, repository.ErrDriveItemNotFound) {
			return nil, fmt.Errorf("gagal mengambil detail folder: %w", err)
		}

		crumbs, err := s.repo.GetBreadcrumbs(ctx, userID, *parentID)
		if err == nil {
			breadcrumbs = crumbs
		}
	}

	totalItems, totalBytes, err := s.repo.GetStats(ctx, userID)
	if err != nil {
		totalItems = len(items)
		totalBytes = 0
	}

	return &model.DriveListResponse{
		Items:         items,
		CurrentFolder: currentFolder,
		Breadcrumbs:   breadcrumbs,
		TotalItems:    totalItems,
		TotalBytes:    totalBytes,
	}, nil
}

func (s *DriveService) CreateFolder(ctx context.Context, userID uuid.UUID, parentID *uuid.UUID, name string) (*model.DriveItem, error) {
	cleanName := strings.TrimSpace(name)
	if cleanName == "" || strings.Contains(cleanName, "/") || strings.Contains(cleanName, "\\") {
		return nil, ErrInvalidItemName
	}

	if parentID != nil {
		parent, err := s.repo.GetByID(ctx, *parentID, userID)
		if err != nil || parent.Type != model.DriveItemTypeFolder {
			return nil, ErrParentNotFound
		}
	}

	// Check if already exists under this parent
	existing, err := s.repo.FindFolderByName(ctx, userID, parentID, cleanName)
	if err == nil && existing != nil {
		return existing, nil
	}

	item := &model.DriveItem{
		ID:        uuid.New(),
		UserID:    userID,
		ParentID:  parentID,
		Name:      cleanName,
		Type:      model.DriveItemTypeFolder,
		SizeBytes: 0,
		MimeType:  "application/x-directory",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := s.repo.Create(ctx, item); err != nil {
		return nil, fmt.Errorf("gagal membuat folder: %w", err)
	}

	zero := 0
	item.ItemCount = &zero
	return item, nil
}

func (s *DriveService) UploadFile(
	ctx context.Context,
	userID uuid.UUID,
	initialParentID *uuid.UUID,
	relativePath string,
	filename string,
	r io.Reader,
	size int64,
	mimeType string,
) (*model.DriveItem, error) {
	effectiveParentID := initialParentID
	targetFilename := filename

	// If relativePath has directory components (e.g. "MyFolder/SubFolder/file.txt")
	cleanedRel := filepath.ToSlash(filepath.Clean(relativePath))
	if cleanedRel != "" && cleanedRel != "." && !strings.HasPrefix(cleanedRel, "../") {
		parts := strings.Split(cleanedRel, "/")
		if len(parts) > 1 {
			targetFilename = parts[len(parts)-1]
			// Traverse / create intermediate folders
			for i := 0; i < len(parts)-1; i++ {
				folderName := strings.TrimSpace(parts[i])
				if folderName == "" || folderName == "." {
					continue
				}
				folder, err := s.CreateFolder(ctx, userID, effectiveParentID, folderName)
				if err != nil {
					return nil, fmt.Errorf("gagal membuat struktur folder %s: %w", folderName, err)
				}
				folderID := folder.ID
				effectiveParentID = &folderID
			}
		}
	}

	cleanFilename := strings.TrimSpace(targetFilename)
	if cleanFilename == "" {
		cleanFilename = "unnamed_file"
	}

	if mimeType == "" || mimeType == "application/octet-stream" {
		ext := filepath.Ext(cleanFilename)
		if detected := mime.TypeByExtension(ext); detected != "" {
			mimeType = detected
		} else {
			mimeType = "application/octet-stream"
		}
	}

	itemID := uuid.New()
	userDir := filepath.Join(s.baseDir, userID.String())
	if err := os.MkdirAll(userDir, 0750); err != nil {
		return nil, fmt.Errorf("gagal membuat direktori user: %w", err)
	}

	storagePath := filepath.Join(userDir, itemID.String())
	file, err := os.OpenFile(storagePath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0640)
	if err != nil {
		return nil, fmt.Errorf("gagal membuka target berkas: %w", err)
	}

	written, err := io.Copy(file, r)
	_ = file.Close()
	if err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("gagal menulis berkas ke penyimpanan: %w", err)
	}

	if size <= 0 {
		size = written
	}

	item := &model.DriveItem{
		ID:          itemID,
		UserID:      userID,
		ParentID:    effectiveParentID,
		Name:        cleanFilename,
		Type:        model.DriveItemTypeFile,
		SizeBytes:   size,
		MimeType:    mimeType,
		StoragePath: storagePath,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	if err := s.repo.Create(ctx, item); err != nil {
		_ = os.Remove(storagePath)
		return nil, fmt.Errorf("gagal mencatat berkas di basis data: %w", err)
	}

	return item, nil
}

func (s *DriveService) GetItem(ctx context.Context, userID uuid.UUID, id uuid.UUID) (*model.DriveItem, error) {
	return s.repo.GetByID(ctx, id, userID)
}

func (s *DriveService) DeleteItem(ctx context.Context, userID uuid.UUID, id uuid.UUID) error {
	item, err := s.repo.GetByID(ctx, id, userID)
	if err != nil {
		return err
	}

	if item.Type == model.DriveItemTypeFolder {
		// Get all descendants to remove files from storage
		descendants, err := s.repo.FindDescendants(ctx, userID, id)
		if err == nil {
			for _, desc := range descendants {
				if desc.Type == model.DriveItemTypeFile && desc.StoragePath != "" {
					_ = os.Remove(desc.StoragePath)
				}
			}
		}
	} else if item.StoragePath != "" {
		_ = os.Remove(item.StoragePath)
	}

	return s.repo.Delete(ctx, id, userID)
}

func (s *DriveService) RenameItem(ctx context.Context, userID uuid.UUID, id uuid.UUID, newName string) error {
	cleanName := strings.TrimSpace(newName)
	if cleanName == "" || strings.Contains(cleanName, "/") || strings.Contains(cleanName, "\\") {
		return ErrInvalidItemName
	}
	return s.repo.Rename(ctx, id, userID, cleanName)
}

func (s *DriveService) ZipFolder(ctx context.Context, userID uuid.UUID, folderID uuid.UUID, w http.ResponseWriter) error {
	folder, err := s.repo.GetByID(ctx, folderID, userID)
	if err != nil {
		return err
	}
	if folder.Type != model.DriveItemTypeFolder {
		return errors.New("item bukan folder")
	}

	descendants, err := s.repo.FindDescendants(ctx, userID, folderID)
	if err != nil {
		return err
	}

	// Map item ID to item for path construction
	itemMap := make(map[uuid.UUID]*model.DriveItem)
	for _, d := range descendants {
		itemMap[d.ID] = d
	}

	// Helper to build relative path inside zip
	getPath := func(item *model.DriveItem) string {
		var pathParts []string
		curr := item
		for curr != nil && curr.ID != folderID {
			pathParts = append([]string{curr.Name}, pathParts...)
			if curr.ParentID == nil {
				break
			}
			curr = itemMap[*curr.ParentID]
		}
		return filepath.Join(pathParts...)
	}

	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s.zip"`, folder.Name))
	w.Header().Set("Content-Type", "application/zip")

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	for _, d := range descendants {
		if d.ID == folderID {
			continue
		}
		relPath := getPath(d)
		if relPath == "" {
			continue
		}

		if d.Type == model.DriveItemTypeFolder {
			// Create folder entry with trailing slash
			_, _ = zipWriter.Create(filepath.ToSlash(relPath) + "/")
		} else {
			fileEntry, err := zipWriter.Create(filepath.ToSlash(relPath))
			if err != nil {
				continue
			}

			if d.StoragePath != "" {
				diskFile, err := os.Open(d.StoragePath)
				if err == nil {
					_, _ = io.Copy(fileEntry, diskFile)
					_ = diskFile.Close()
				}
			}
		}
	}

	return nil
}
