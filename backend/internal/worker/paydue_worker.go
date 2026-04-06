package worker

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/abdro/decentrarent/backend/internal/chat"
	"github.com/abdro/decentrarent/backend/internal/order"
)

type PaydueWorker struct {
	jobStore   *order.JobStore
	orderStore *order.Store
	chatSvc    *chat.Service
}

func NewPaydueWorker(jobStore *order.JobStore, orderStore *order.Store, chatSvc *chat.Service) *PaydueWorker {
	return &PaydueWorker{jobStore: jobStore, orderStore: orderStore, chatSvc: chatSvc}
}

func (w *PaydueWorker) Start(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.run()
		}
	}
}

func (w *PaydueWorker) run() {
	jobs, err := w.jobStore.ClaimPaydueJobs(10)
	if err != nil {
		log.Printf("[paydue-worker] failed to claim jobs: %v", err)
		return
	}

	for _, j := range jobs {
		w.process(j)
	}
}

func (w *PaydueWorker) process(j order.PaydueJob) {
	o, err := w.orderStore.GetByID(j.OrderID)
	if err != nil {
		log.Printf("[paydue-worker] order %s not found: %v", j.OrderID, err)
		w.jobStore.CompletePaydueJob(j.ID)
		return
	}

	if o.EscrowStatus != order.StatusActive {
		w.jobStore.CompletePaydueJob(j.ID)
		return
	}

	payments, err := w.orderStore.GetRentPayments(j.OrderID)
	if err != nil {
		log.Printf("[paydue-worker] failed to get payments for order %s: %v", j.OrderID, err)
		w.jobStore.CompletePaydueJob(j.ID)
		return
	}

	duration := o.RentEndDate.Sub(o.RentStartDate).Seconds()
	totalPeriods := int64(duration) / j.Periodicity
	totalOwed := totalPeriods * o.RentAmount

	var totalPaid int64
	for _, p := range payments {
		totalPaid += p.PaidAmount
	}

	debt := totalOwed - totalPaid
	if debt > 0 {
		msg := fmt.Sprintf("Rent overdue. Total owed: %d, Paid: %d, Outstanding: %d", totalOwed, totalPaid, debt)
		if _, err := w.chatSvc.SendSystemMessage(o.ConversationID, msg, "paydue_notification"); err != nil {
			log.Printf("[paydue-worker] failed to send message for order %s: %v", o.ID, err)
		}
	}

	nextTrigger := j.TriggerAt.Add(time.Duration(j.Periodicity) * time.Second)
	if nextTrigger.After(o.RentEndDate) {
		w.jobStore.CompletePaydueJob(j.ID)
	} else {
		if err := w.jobStore.AdvancePaydueJob(j.ID, nextTrigger); err != nil {
			log.Printf("[paydue-worker] failed to advance job %s: %v", j.ID, err)
		}
	}
}
