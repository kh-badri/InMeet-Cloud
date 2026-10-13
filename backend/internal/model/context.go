package model

import "context"

type auditMetaKey struct{}

// AuditMeta stores request-scoped actor metadata for audit logging
type AuditMeta struct {
	UserEmail string
	IP        string
	UserAgent string
}

// WithAuditMeta attaches user email, client IP, and user-agent to the context
func WithAuditMeta(ctx context.Context, email, ip, ua string) context.Context {
	return context.WithValue(ctx, auditMetaKey{}, AuditMeta{
		UserEmail: email,
		IP:        ip,
		UserAgent: ua,
	})
}

// GetAuditMeta retrieves AuditMeta from context, returning an empty struct if not present
func GetAuditMeta(ctx context.Context) AuditMeta {
	if v, ok := ctx.Value(auditMetaKey{}).(AuditMeta); ok {
		return v
	}
	return AuditMeta{}
}
