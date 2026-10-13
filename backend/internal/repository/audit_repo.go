package repository

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"backupvault/internal/model"

	"github.com/jackc/pgx/v5/pgxpool"
)

type AuditRepository struct {
	pool *pgxpool.Pool
}

func NewAuditRepository(pool *pgxpool.Pool) *AuditRepository {
	return &AuditRepository{pool: pool}
}

// Log records an append-only audit event. No updates or deletes allowed on this table.
func (r *AuditRepository) Log(ctx context.Context, actorType, actorID, actorEmail, action, targetType, targetID, ip, userAgent string, details map[string]interface{}) error {
	var detailsJSON []byte
	var err error
	if details != nil {
		detailsJSON, err = json.Marshal(details)
		if err != nil {
			detailsJSON = []byte("{}")
		}
	} else {
		detailsJSON = []byte("{}")
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO audit_logs (actor_type, actor_id, actor_email, action, target_type, target_id, ip_address, user_agent, details, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
	`, actorType, actorID, actorEmail, action, targetType, targetID, ip, userAgent, detailsJSON)
	return err
}

type AuditFilter struct {
	Action   string
	ActorID  string
	DateFrom *time.Time
	DateTo   *time.Time
	Limit    int
	Offset   int
}

func (r *AuditRepository) List(ctx context.Context, f AuditFilter) ([]model.AuditLog, int64, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	query := `FROM audit_logs WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if f.Action != "" {
		query += fmt.Sprintf(" AND action = $%d", argIdx)
		args = append(args, f.Action)
		argIdx++
	}
	if f.ActorID != "" {
		query += fmt.Sprintf(" AND actor_id = $%d", argIdx)
		args = append(args, f.ActorID)
		argIdx++
	}
	if f.DateFrom != nil {
		query += fmt.Sprintf(" AND created_at >= $%d", argIdx)
		args = append(args, *f.DateFrom)
		argIdx++
	}
	if f.DateTo != nil {
		query += fmt.Sprintf(" AND created_at <= $%d", argIdx)
		args = append(args, *f.DateTo)
		argIdx++
	}

	var total int64
	countQuery := "SELECT COUNT(*) " + query
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	selectQuery := fmt.Sprintf(`
		SELECT id, actor_type, actor_id, actor_email, action, target_type, target_id, ip_address, user_agent, details, created_at
		%s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d
	`, query, argIdx, argIdx+1)

	args = append(args, f.Limit, f.Offset)

	rows, err := r.pool.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []model.AuditLog
	for rows.Next() {
		var l model.AuditLog
		var rawDetails []byte
		err := rows.Scan(&l.ID, &l.ActorType, &l.ActorID, &l.ActorEmail, &l.Action, &l.TargetType, &l.TargetID, &l.IPAddress, &l.UserAgent, &rawDetails, &l.CreatedAt)
		if err != nil {
			return nil, 0, err
		}
		if len(rawDetails) > 0 {
			_ = json.Unmarshal(rawDetails, &l.Details)
		}
		logs = append(logs, l)
	}

	return logs, total, nil
}
