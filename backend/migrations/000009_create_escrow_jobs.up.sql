CREATE TABLE IF NOT EXISTS escrow_jobs (
    id         TEXT PRIMARY KEY,
    order_id   TEXT NOT NULL REFERENCES orders(id),
    job_type   TEXT NOT NULL,
    trigger_at TIMESTAMP NOT NULL,
    status     TEXT NOT NULL DEFAULT 'init',
    attempts   INT  NOT NULL DEFAULT 0,
    last_error TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_escrow_jobs_status_trigger ON escrow_jobs(status, trigger_at);
CREATE INDEX IF NOT EXISTS idx_escrow_jobs_order ON escrow_jobs(order_id);
