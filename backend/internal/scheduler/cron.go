package scheduler

import (
	"context"
	"log/slog"
	"syscall"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/notification"
)

type CronScheduler struct {
	cfg       *config.Config
	retention *RetentionManager
	scrubber  *IntegrityScrubber
	notifier  *notification.Notifier
	stopChan  chan struct{}
}

func NewCronScheduler(
	cfg *config.Config,
	retention *RetentionManager,
	scrubber *IntegrityScrubber,
	notifier *notification.Notifier,
) *CronScheduler {
	return &CronScheduler{
		cfg:       cfg,
		retention: retention,
		scrubber:  scrubber,
		notifier:  notifier,
		stopChan:  make(chan struct{}),
	}
}

func (s *CronScheduler) Start(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Minute)
	slog.Info("Cron scheduler started", "timezone", s.cfg.Timezone)

	go func() {
		for {
			select {
			case <-ticker.C:
				s.tick(ctx)
			case <-s.stopChan:
				ticker.Stop()
				slog.Info("Cron scheduler stopped")
				return
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

func (s *CronScheduler) Stop() {
	close(s.stopChan)
}

func (s *CronScheduler) tick(ctx context.Context) {
	loc := s.cfg.Location()
	now := time.Now().In(loc)

	hour := now.Hour()
	min := now.Minute()

	// 1. Retention job: Runs daily at 23:30 Asia/Jakarta to evaluate custom retention days per application
	if hour == 23 && min == 30 {
		slog.Info("Triggering daily scheduled retention execution", "date", now.Format("2006-01-02"))
		_, err := s.retention.Run(ctx, now, false)
		if err != nil {
			slog.Error("Scheduled retention run failed", "error", err)
		}
	}

	// 2. Weekly integrity scrub: Sunday at 02:00
	if now.Weekday() == time.Sunday && hour == 2 && min == 0 {
		slog.Info("Triggering weekly integrity scrub")
		_, _, err := s.scrubber.Scrub(ctx, 100)
		if err != nil {
			slog.Error("Weekly scrub failed", "error", err)
		}
	}

	// 3. Disk space alert check: Daily at 09:00
	if hour == 9 && min == 0 {
		var stat syscall.Statfs_t
		if err := syscall.Statfs(s.cfg.StorageLocalPath, &stat); err == nil {
			total := stat.Blocks * uint64(stat.Bsize)
			free := stat.Bavail * uint64(stat.Bsize)
			if total > 0 {
				usedPercent := (float64(total-free) / float64(total)) * 100
				if usedPercent > 80.0 {
					s.notifier.Send(ctx, "Peringatan Kapasitas Disk (>80%)!",
						"Kapasitas disk penyimpanan telah melampaui 80%. Mohon segera perluas kapasitas atau bersihkan data lama.", true)
				}
			}
		}
	}
}
