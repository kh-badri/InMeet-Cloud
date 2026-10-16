package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/database"
	"backupvault/internal/handler"
	"backupvault/internal/notification"
	"backupvault/internal/repository"
	"backupvault/internal/scheduler"
	"backupvault/internal/security"
	"backupvault/internal/service"
	"backupvault/pkg/storage"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	// Structured logging
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	slog.Info("Starting BackupVault server...")

	// 1. Load configuration
	cfg, err := config.Load(".env")
	if err != nil {
		slog.Error("Failed to load configuration", "error", err)
		os.Exit(1)
	}

	// 2. Connect to database
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := database.Connect(ctx, cfg.DatabaseURL, cfg.DBMaxOpenConns, cfg.DBMaxIdleConns)
	if err != nil {
		slog.Error("Failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	// 3. Run database migrations
	if err := db.Migrate(context.Background()); err != nil {
		slog.Error("Failed to run database migrations", "error", err)
		os.Exit(1)
	}

	// 4. Initialize storage
	localStorage, err := storage.NewLocalStorage(cfg.StorageLocalPath, cfg.StorageEncryptionKey)
	if err != nil {
		slog.Error("Failed to initialize local storage", "error", err)
		os.Exit(1)
	}

	// 5. Initialize repositories
	userRepo := repository.NewUserRepository(db.Pool)
	sessionRepo := repository.NewSessionRepository(db.Pool)
	auditRepo := repository.NewAuditRepository(db.Pool)
	lockoutRepo := repository.NewLockoutRepository(db.Pool)
	appRepo := repository.NewAppRepository(db.Pool)
	apiKeyRepo := repository.NewApiKeyRepository(db.Pool)
	backupRepo := repository.NewBackupRepository(db.Pool)
	uploadRepo := repository.NewUploadRepository(db.Pool)
	tokenRepo := repository.NewDownloadTokenRepository(db.Pool)
	driveRepo := repository.NewDriveRepository(db.Pool)

	// Seed initial admin user if empty
	if err := userRepo.EnsureAdminUser(context.Background(), cfg.InitialAdminEmail, cfg.InitialAdminPassword); err != nil {
		slog.Error("Failed to seed initial admin user", "error", err)
		os.Exit(1)
	}

	// 6. Initialize notification & scheduler
	notifier := notification.NewNotifier(cfg)
	retentionMgr := scheduler.NewRetentionManager(db.Pool, cfg, localStorage, appRepo, backupRepo, auditRepo, notifier)
	scrubber := scheduler.NewIntegrityScrubber(db.Pool, localStorage, backupRepo, notifier)
	cronScheduler := scheduler.NewCronScheduler(cfg, retentionMgr, scrubber, notifier)
	cronScheduler.Start(context.Background())
	defer cronScheduler.Stop()

	// 7. Initialize services
	authService := service.NewAuthService(userRepo, sessionRepo, auditRepo, lockoutRepo)
	appService := service.NewAppService(appRepo, apiKeyRepo, auditRepo)
	uploadService := service.NewUploadService(localStorage, uploadRepo, backupRepo, auditRepo)
	backupService := service.NewBackupService(localStorage, backupRepo, tokenRepo, auditRepo, authService)
	driveService := service.NewDriveService(driveRepo, cfg.DriveStoragePath, auditRepo, userRepo)
	cronScheduler.SetDriveTrashPurger(driveService)

	// 8. Initialize handlers
	authHandler := handler.NewAuthHandler(cfg, authService)
	appHandler := handler.NewAppHandler(appService)
	uploadHandler := handler.NewUploadHandler(appService, uploadService)
	backupHandler := handler.NewBackupHandler(backupService)
	statsHandler := handler.NewStatsHandler(cfg, backupService, auditRepo)
	driveHandler := handler.NewDriveHandler(driveService)

	// 9. Setup router
	r := chi.NewRouter()

	// Core middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(handler.SecurityHeadersMiddleware(cfg.IsProduction()))

	// CORS for SPA client
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000", cfg.AppURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-App-Name", "X-Filename", "X-Checksum-SHA256", "X-2FA-Code", "Upload-Offset", "Upload-Length", "Upload-Filename", "Tus-Resumable", "Range"},
		ExposedHeaders:   []string{"Link", "X-CSRF-Token", "Upload-Offset", "Upload-Length", "Tus-Resumable", "Location", "Content-Range", "Accept-Ranges", "Content-Length"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Rate limiters: general API 3000/min burst 500, auth endpoints 60/min burst 20
	apiLimiter := security.NewIPRateLimiter(3000, 500)
	authLimiter := security.NewIPRateLimiter(60, 20)
	r.Use(security.RateLimitMiddleware(apiLimiter))

	r.Use(handler.AuthMiddleware(authService))
	r.Use(handler.AuditMetaMiddleware())
	r.Use(handler.CSRFMiddleware())

	// Health check
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		handler.WriteJSON(w, http.StatusOK, map[string]interface{}{
			"status":    "healthy",
			"timestamp": time.Now().Format(time.RFC3339),
			"version":   "1.0.0",
		})
	}
	r.Get("/healthz", healthHandler)
	r.Get("/api/v1/health", healthHandler)

	// Public short-lived token download endpoint (supporting HTTP Range requests)
	r.Get("/api/v1/download/{token}", backupHandler.HandleDownload)

	// Auth routes (protected with strict authLimiter)
	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Use(security.RateLimitMiddleware(authLimiter))
		r.Post("/login", authHandler.HandleLogin)
		r.Post("/verify-2fa", authHandler.HandleVerify2FA)

		r.Group(func(r chi.Router) {
			r.Use(handler.RequireAuth)
			r.Get("/me", authHandler.HandleMe)
			r.Post("/logout", authHandler.HandleLogout)
			r.Post("/totp/setup", authHandler.HandleSetupTOTP)
			r.Post("/totp/confirm", authHandler.HandleConfirmTOTP)
			r.Post("/totp/disable", authHandler.HandleDisableTOTP)
			r.Post("/change-password", authHandler.HandleChangePassword)
			r.Post("/profile", authHandler.HandleUpdateProfile)
		})
	})

	// Applications & API keys routes
	r.Route("/api/v1/apps", func(r chi.Router) {
		r.Use(handler.RequireAuth)
		r.With(handler.RequireAdminWithView).Get("/", appHandler.HandleList)
		r.With(handler.RequireAdminWithView).Get("/{id}", appHandler.HandleGet)

		r.Group(func(r chi.Router) {
			r.Use(handler.RequireAdminWithEdit)
			r.Post("/", appHandler.HandleCreate)
			r.Put("/{id}", appHandler.HandleUpdate)
			r.Get("/{id}/keys", appHandler.HandleListKeys)
			r.Post("/{id}/keys", appHandler.HandleCreateKey)
		})
		r.With(handler.RequireAdminWithDelete).Delete("/{id}", appHandler.HandleDelete)
		r.With(handler.RequireAdminWithDelete).Delete("/{id}/keys/{keyId}", appHandler.HandleRevokeKey)
	})

	// Backups routes (Session authenticated; team role 'user' has view-only access, 'admin' with view can download)
	r.Route("/api/v1/backups", func(r chi.Router) {
		r.Use(handler.RequireAuth)
		r.Get("/", backupHandler.HandleList)
		r.Get("/{id}", backupHandler.HandleGet)
		r.With(handler.RequireAdminWithView).Post("/{id}/download-link", backupHandler.HandleCreateDownloadLink)
		r.With(handler.RequireAdminWithView).Post("/batch-download", backupHandler.HandleBatchDownload)
		r.With(handler.RequireAdminWithView).Get("/batch-download", backupHandler.HandleBatchDownload)

		r.Group(func(r chi.Router) {
			r.Use(handler.RequireAdminWithDelete)
			r.Delete("/{id}", backupHandler.HandleDelete) // Manual delete (requires 2FA and Admin with delete permission)
			r.Post("/batch-delete", backupHandler.HandleBatchDelete)
		})
	})

	// Team User management routes (Admin with view can list, Admin with edit can create/modify, Admin with delete can remove)
	r.Route("/api/v1/users", func(r chi.Router) {
		r.Use(handler.RequireAuth)
		r.With(handler.RequireAdminWithView).Get("/", authHandler.HandleListUsers)

		r.Group(func(r chi.Router) {
			r.Use(handler.RequireAdminWithEdit)
			r.Post("/", authHandler.HandleCreateUser)
			r.Put("/{id}/password", authHandler.HandleResetUserPassword)
			r.Put("/{id}/quota", authHandler.HandleUpdateQuota)
			r.Put("/{id}/permissions", authHandler.HandleUpdateUserPermissions)
		})
		r.With(handler.RequireAdminWithDelete).Delete("/{id}", authHandler.HandleDeleteUser)
	})

	// Drive routes (Google Drive-like personal storage, Session authenticated)
	r.Route("/api/v1/drive", func(r chi.Router) {
		r.Use(handler.RequireAuth)
		r.Get("/items", driveHandler.HandleList)
		r.Get("/shared", driveHandler.HandleListSharedWithMe)
		r.Post("/folder", driveHandler.HandleCreateFolder)
		r.Get("/folders", driveHandler.HandleListFolders)
		r.Post("/upload", driveHandler.HandleUpload)
		r.Post("/upload/init", driveHandler.HandleInitUpload)
		r.Post("/upload/chunk", driveHandler.HandleUploadChunk)
		r.Post("/upload/complete", driveHandler.HandleCompleteUpload)
		r.Get("/upload/sessions", driveHandler.HandleGetUploadSessions)
		r.Delete("/upload/sessions/{id}", driveHandler.HandleAbortUpload)
		r.Get("/items/{id}/download", driveHandler.HandleDownload)
		r.Delete("/items/{id}", driveHandler.HandleDelete)
		r.Patch("/items/{id}", driveHandler.HandleRename)
		r.Post("/items/{id}/move", driveHandler.HandleMove)
		r.Get("/items/{id}/share", driveHandler.HandleGetShareDetails)
		r.Post("/items/{id}/share/users", driveHandler.HandleUpdateUserShare)
		r.Delete("/items/{id}/share/users/{userId}", driveHandler.HandleRemoveUserShare)
		r.Put("/items/{id}/share/link", driveHandler.HandleUpdatePublicLink)
		r.Get("/items/{id}/comments", driveHandler.HandleGetComments)
		r.Post("/items/{id}/comments", driveHandler.HandleAddComment)
		r.Get("/trash", driveHandler.HandleListTrash)
		r.Post("/trash/{id}/restore", driveHandler.HandleRestoreTrash)
		r.Delete("/trash/{id}", driveHandler.HandlePermanentDeleteTrash)
		r.Delete("/trash", driveHandler.HandleEmptyTrash)

		// Batch operations (Multi-selection actions)
		r.Get("/batch/download", driveHandler.HandleBatchDownload)
		r.Post("/batch/download", driveHandler.HandleBatchDownload)
		r.Post("/batch/move", driveHandler.HandleBatchMove)
		r.Post("/batch/delete", driveHandler.HandleBatchDelete)
		r.Post("/batch/share/users", driveHandler.HandleBatchShareUsers)
		r.Post("/batch/trash/restore", driveHandler.HandleBatchTrashRestore)
		r.Post("/batch/trash/permanent", driveHandler.HandleBatchTrashPermanentDelete)
	})


	// Public Drive Share routes (Anyone with link, No authentication required)
	r.Route("/api/v1/public/share", func(r chi.Router) {
		r.Get("/{token}", driveHandler.HandleGetPublicSharedItem)
		r.Get("/{token}/download", driveHandler.HandlePublicDownload)
		r.Get("/{token}/comments", driveHandler.HandleGetPublicComments)
		r.Post("/{token}/comments", driveHandler.HandleAddPublicComment)
		r.Post("/{token}/upload", driveHandler.HandlePublicUpload)
		r.Post("/{token}/folder", driveHandler.HandlePublicCreateFolder)
	})

	// Dashboard stats & Audit log
	r.Route("/api/v1/stats", func(r chi.Router) {
		r.Use(handler.RequireAuth)
		r.Get("/", statsHandler.HandleGetStats)
	})

	r.Route("/api/v1/audit", func(r chi.Router) {
		r.Use(handler.RequireAuth)
		r.Use(handler.RequireAdminWithView)
		r.Get("/", statsHandler.HandleGetAudit)
	})

	// Retention manual trigger / dry-run & history (Admin with edit can trigger, Admin with view can see runs)
	r.Route("/api/v1/retention", func(r chi.Router) {
		r.Use(handler.RequireAuth)
		r.Group(func(r chi.Router) {
			r.Use(handler.RequireAdminWithEdit)
			r.Post("/trigger", func(w http.ResponseWriter, r *http.Request) {
				isDryRun := r.URL.Query().Get("dry_run") == "true"
				run, err := retentionMgr.Run(r.Context(), time.Now(), isDryRun)
				if err != nil {
					handler.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
					return
				}
				handler.WriteJSON(w, http.StatusOK, run)
			})
		})
		r.With(handler.RequireAdminWithView).Get("/runs", func(w http.ResponseWriter, r *http.Request) {
			rows, err := db.Pool.Query(r.Context(), `
				SELECT id, triggered_at, completed_at, items_quarantined, items_deleted, bytes_freed, is_dry_run, status, log_details
				FROM retention_runs
				ORDER BY triggered_at DESC
				LIMIT 10
			`)
			if err != nil {
				handler.WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			defer rows.Close()

			type RetentionRunItem struct {
				ID               string                 `json:"id"`
				TriggeredAt      time.Time              `json:"triggered_at"`
				CompletedAt      *time.Time             `json:"completed_at"`
				ItemsQuarantined int                    `json:"items_quarantined"`
				ItemsDeleted     int                    `json:"items_deleted"`
				BytesFreed       int64                  `json:"bytes_freed"`
				IsDryRun         bool                   `json:"is_dry_run"`
				Status           string                 `json:"status"`
				LogDetails       map[string]interface{} `json:"log_details"`
			}
			var runs []RetentionRunItem
			for rows.Next() {
				var item RetentionRunItem
				var detailsJSON []byte
				if err := rows.Scan(&item.ID, &item.TriggeredAt, &item.CompletedAt, &item.ItemsQuarantined, &item.ItemsDeleted, &item.BytesFreed, &item.IsDryRun, &item.Status, &detailsJSON); err == nil {
					_ = json.Unmarshal(detailsJSON, &item.LogDetails)
					runs = append(runs, item)
				}
			}
			if runs == nil {
				runs = []RetentionRunItem{}
			}
			handler.WriteJSON(w, http.StatusOK, runs)
		})
	})

	// Client upload routes (API Key authenticated)
	r.With(uploadHandler.RequireAPIKey).Put("/api/v1/upload", uploadHandler.HandleDirectUpload)

	r.Route("/api/v1/uploads", func(r chi.Router) {
		r.Use(uploadHandler.RequireAPIKey)
		r.Post("/", uploadHandler.HandleInitUpload)
		r.Head("/{id}", uploadHandler.HandleGetUploadOffset)
		r.Patch("/{id}", uploadHandler.HandleUploadChunk)
		r.Post("/{id}/complete", uploadHandler.HandleCompleteUpload)
	})

	// Static frontend assets & SPA HTML5 routing fallback
	if info, err := os.Stat(cfg.FrontendDir); err == nil && info.IsDir() {
		fileServer := http.FileServer(http.Dir(cfg.FrontendDir))
		spaHandler := func(w http.ResponseWriter, r *http.Request) {
			// Don't intercept API or healthz routes
			if strings.HasPrefix(r.URL.Path, "/api") || strings.HasPrefix(r.URL.Path, "/healthz") {
				http.NotFound(w, r)
				return
			}

			cleanPath := filepath.Clean(r.URL.Path)
			filePath := filepath.Join(cfg.FrontendDir, cleanPath)
			if stat, err := os.Stat(filePath); err == nil && !stat.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
			// Fallback to index.html for SPA client-side routes (e.g. /backups, /apps, /settings)
			http.ServeFile(w, r, filepath.Join(cfg.FrontendDir, "index.html"))
		}
		r.Get("/*", spaHandler)
		r.Head("/*", spaHandler)
		slog.Info("Frontend SPA static file serving enabled", "dir", cfg.FrontendDir)
	}

	// Start HTTP server with graceful shutdown
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      r,
		ReadTimeout:  30 * time.Minute, // Support large streaming uploads
		WriteTimeout: 30 * time.Minute,
		IdleTimeout:  120 * time.Second,
	}

	serverErrors := make(chan error, 1)
	go func() {
		slog.Info("Server listening", "port", cfg.Port, "env", cfg.Env)
		serverErrors <- server.ListenAndServe()
	}()

	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	select {
	case err := <-serverErrors:
		slog.Error("Error starting server", "error", err)
	case sig := <-shutdown:
		slog.Info("Shutdown signal received", "signal", sig.String())
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("Graceful shutdown failed, forcing close", "error", err)
			_ = server.Close()
		}
		slog.Info("Server exited cleanly")
	}
}
