package worker

import (
	"context"
	"log"
	"time"

	"github.com/gagliardetto/solana-go"
	"github.com/google/uuid"

	escrowpkg "github.com/abdro/decentrarent/backend/internal/escrow"
	"github.com/abdro/decentrarent/backend/internal/order"
)

type EscrowWorker struct {
	jobStore   *order.JobStore
	orderStore *order.Store
	escrowSvc  *escrowpkg.Service
}

func NewEscrowWorker(jobStore *order.JobStore, orderStore *order.Store, escrowSvc *escrowpkg.Service) *EscrowWorker {
	return &EscrowWorker{jobStore: jobStore, orderStore: orderStore, escrowSvc: escrowSvc}
}

func (w *EscrowWorker) Start(ctx context.Context) {
	go w.runLoop(ctx, order.JobTypeReleaseDeposit, 30*time.Second, w.processRelease)
	go w.runLoop(ctx, order.JobTypeExpireEscrow, 60*time.Second, w.processExpire)
	<-ctx.Done()
}

func (w *EscrowWorker) runLoop(ctx context.Context, jobType string, interval time.Duration, process func(context.Context, order.EscrowJob)) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			jobs, err := w.jobStore.ClaimEscrowJobs(jobType, 10)
			if err != nil {
				log.Printf("[escrow-worker] failed to claim %s jobs: %v", jobType, err)
				continue
			}
			for _, j := range jobs {
				process(ctx, j)
			}
		}
	}
}

func (w *EscrowWorker) processRelease(ctx context.Context, j order.EscrowJob) {
	o, err := w.orderStore.GetByID(j.OrderID)
	if err != nil {
		log.Printf("[escrow-worker] release: order %s not found: %v", j.OrderID, err)
		w.jobStore.FailEscrowJob(j.ID, err.Error())
		return
	}

	if o.EscrowStatus != order.StatusActive {
		log.Printf("[escrow-worker] release: order %s not active (status=%s), skipping", o.ID, o.EscrowStatus)
		w.jobStore.CompleteEscrowJob(j.ID)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(o.LandlordPK)
	tenant := solana.MustPublicKeyFromBase58(o.TenantPK)
	orderID := [16]byte(uuid.MustParse(o.ID))

	sig, err := w.escrowSvc.ReleaseToTenant(ctx, landlord, tenant, orderID)
	if err != nil {
		log.Printf("[escrow-worker] release: failed for order %s: %v", o.ID, err)
		w.jobStore.FailEscrowJob(j.ID, err.Error())
		return
	}

	log.Printf("[escrow-worker] release: deposit released for order %s (tx: %s)", o.ID, sig)
	w.jobStore.CompleteEscrowJob(j.ID)
}

func (w *EscrowWorker) processExpire(ctx context.Context, j order.EscrowJob) {
	o, err := w.orderStore.GetByID(j.OrderID)
	if err != nil {
		log.Printf("[escrow-worker] expire: order %s not found: %v", j.OrderID, err)
		w.jobStore.FailEscrowJob(j.ID, err.Error())
		return
	}

	if o.EscrowStatus != order.StatusAwaitingSignatures {
		log.Printf("[escrow-worker] expire: order %s not in awaiting_signatures (status=%s), skipping", o.ID, o.EscrowStatus)
		w.jobStore.CompleteEscrowJob(j.ID)
		return
	}

	landlord := solana.MustPublicKeyFromBase58(o.LandlordPK)
	tenant := solana.MustPublicKeyFromBase58(o.TenantPK)
	orderID := [16]byte(uuid.MustParse(o.ID))

	sig, err := w.escrowSvc.ExpireEscrow(ctx, landlord, tenant, orderID)
	if err != nil {
		log.Printf("[escrow-worker] expire: failed for order %s: %v", o.ID, err)
		w.jobStore.FailEscrowJob(j.ID, err.Error())
		return
	}

	log.Printf("[escrow-worker] expire: escrow expired for order %s (tx: %s)", o.ID, sig)
	w.jobStore.CompleteEscrowJob(j.ID)
}
