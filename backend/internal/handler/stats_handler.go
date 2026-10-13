package handler

import (
	"net/http"
	"strconv"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/repository"
	"backupvault/internal/service"
)

type StatsHandler struct {
	cfg           *config.Config
	backupService *service.BackupService
	auditRepo     *repository.AuditRepository
}

func NewStatsHandler(cfg *config.Config, backupService *service.BackupService, auditRepo *repository.AuditRepository) *StatsHandler {
	return &StatsHandler{
		cfg:           cfg,
		backupService: backupService,
		auditRepo:     auditRepo,
	}
}

func (h *StatsHandler) HandleGetStats(w http.ResponseWriter, r *http.Request) {
	stats, err := h.backupService.GetStats(r.Context(), h.cfg.StorageLocalPath)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, stats)
}

func (h *StatsHandler) HandleGetAudit(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	filter := repository.AuditFilter{
		Action:  q.Get("action"),
		ActorID: q.Get("actor_id"),
	}

	if fromStr := q.Get("date_from"); fromStr != "" {
		if t, err := time.Parse("2006-01-02", fromStr); err == nil {
			filter.DateFrom = &t
		}
	}
	if toStr := q.Get("date_to"); toStr != "" {
		if t, err := time.Parse("2006-01-02", toStr); err == nil {
			t = t.Add(24*time.Hour - time.Nanosecond)
			filter.DateTo = &t
		}
	}
	if limitStr := q.Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			filter.Limit = l
		}
	}
	if offsetStr := q.Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil {
			filter.Offset = o
		}
	}

	logs, total, err := h.auditRepo.List(r.Context(), filter)
	if err != nil {
		WriteJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"logs":   logs,
		"total":  total,
		"limit":  filter.Limit,
		"offset": filter.Offset,
	})
}
