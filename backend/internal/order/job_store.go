package order

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
)

// ─── Model types ────────────────────────────────────────────────────

type EscrowJob struct {
	ID        string
	OrderID   string
	JobType   string
	TriggerAt time.Time
	Attempts  int
}

type PaydueJob struct {
	ID          string
	OrderID     string
	TriggerAt   time.Time
	Periodicity int64
}

const (
	JobTypeReleaseDeposit = "release_deposit"
	JobTypeExpireEscrow   = "expire_escrow"

	JobStatusInit      = "init"
	JobStatusRunning   = "running"
	JobStatusCompleted = "completed"
	JobStatusFailed    = "failed"

	maxEscrowJobAttempts = 3
)

// ─── JobStore ───────────────────────────────────────────────────────

type JobStore struct {
	db *sql.DB
}

func NewJobStore(db *sql.DB) *JobStore {
	return &JobStore{db: db}
}

// ─── Escrow jobs ─────────────────────────────────────────────────────

func (s *JobStore) InsertEscrowJob(orderID, jobType string, triggerAt time.Time) error {
	_, err := s.db.Exec(
		`INSERT INTO escrow_jobs (id, order_id, job_type, trigger_at, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		uuid.New().String(), orderID, jobType, triggerAt, JobStatusInit, time.Now(),
	)
	return err
}

func (s *JobStore) ClaimEscrowJobs(jobType string, limit int) ([]EscrowJob, error) {
	rows, err := s.db.Query(
		`UPDATE escrow_jobs SET status = $1, attempts = attempts + 1
		 WHERE id IN (
		     SELECT id FROM escrow_jobs
		     WHERE status = $2 AND job_type = $3 AND trigger_at <= NOW()
		     ORDER BY trigger_at
		     LIMIT $4
		     FOR UPDATE SKIP LOCKED
		 )
		 RETURNING id, order_id, job_type, trigger_at, attempts`,
		JobStatusRunning, JobStatusInit, jobType, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []EscrowJob
	for rows.Next() {
		var j EscrowJob
		if err := rows.Scan(&j.ID, &j.OrderID, &j.JobType, &j.TriggerAt, &j.Attempts); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (s *JobStore) CompleteEscrowJob(id string) error {
	_, err := s.db.Exec(
		`UPDATE escrow_jobs SET status = $1 WHERE id = $2`,
		JobStatusCompleted, id,
	)
	return err
}

func (s *JobStore) FailEscrowJob(id, errMsg string) error {
	_, err := s.db.Exec(
		`UPDATE escrow_jobs
		 SET status = CASE WHEN attempts < $1 THEN $2 ELSE $3 END,
		     last_error = $4
		 WHERE id = $5`,
		maxEscrowJobAttempts, JobStatusInit, JobStatusFailed, errMsg, id,
	)
	return err
}

// ─── Paydue jobs ─────────────────────────────────────────────────────

func (s *JobStore) InsertPaydueJob(orderID string, triggerAt time.Time, periodicity int64) error {
	_, err := s.db.Exec(
		`INSERT INTO paydue_notification_jobs (id, order_id, trigger_at, periodicity, status, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6)`,
		uuid.New().String(), orderID, triggerAt, periodicity, JobStatusInit, time.Now(),
	)
	return err
}

func (s *JobStore) ClaimPaydueJobs(limit int) ([]PaydueJob, error) {
	rows, err := s.db.Query(
		`UPDATE paydue_notification_jobs SET status = $1
		 WHERE id IN (
		     SELECT id FROM paydue_notification_jobs
		     WHERE status = $2 AND trigger_at <= NOW()
		     ORDER BY trigger_at
		     LIMIT $3
		     FOR UPDATE SKIP LOCKED
		 )
		 RETURNING id, order_id, trigger_at, periodicity`,
		JobStatusRunning, JobStatusInit, limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var jobs []PaydueJob
	for rows.Next() {
		var j PaydueJob
		if err := rows.Scan(&j.ID, &j.OrderID, &j.TriggerAt, &j.Periodicity); err != nil {
			return nil, err
		}
		jobs = append(jobs, j)
	}
	return jobs, nil
}

func (s *JobStore) AdvancePaydueJob(id string, nextTrigger time.Time) error {
	_, err := s.db.Exec(
		`UPDATE paydue_notification_jobs
		 SET status = $1, trigger_at = $2, last_notified_at = NOW()
		 WHERE id = $3`,
		JobStatusInit, nextTrigger, id,
	)
	return err
}

func (s *JobStore) CompletePaydueJob(id string) error {
	_, err := s.db.Exec(
		`UPDATE paydue_notification_jobs SET status = $1, last_notified_at = NOW() WHERE id = $2`,
		JobStatusCompleted, id,
	)
	return err
}
