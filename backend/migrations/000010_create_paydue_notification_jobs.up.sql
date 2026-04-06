CREATE TABLE IF NOT EXISTS paydue_notification_jobs (
    id               TEXT PRIMARY KEY,
    order_id         TEXT NOT NULL REFERENCES orders(id),
    trigger_at       TIMESTAMP NOT NULL,
    periodicity      BIGINT NOT NULL,
    last_notified_at TIMESTAMP,
    status           TEXT NOT NULL DEFAULT 'init',
    created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paydue_jobs_status_trigger ON paydue_notification_jobs(status, trigger_at);
CREATE INDEX IF NOT EXISTS idx_paydue_jobs_order ON paydue_notification_jobs(order_id);
