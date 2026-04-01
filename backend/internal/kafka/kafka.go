package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/IBM/sarama"
)

// ─── Topics ─────────────────────────────────────────────────────────

const (
	TopicOrderCreated         = "order.created"
	TopicOrderSigned          = "order.signed"
	TopicOrderActivated       = "order.activated"
	TopicOrderExpired         = "order.expired"
	TopicOrderSettled         = "order.settled"
	TopicOrderDisputeOpened   = "order.dispute.opened"
	TopicOrderDisputeResolved = "order.dispute.resolved"
	TopicRentPaid             = "order.rent.paid"

	// Solana on-chain event topics
	TopicSolanaDepositLocked = "solana.deposit.locked"
	TopicSolanaPartySigned   = "solana.party.signed"
	TopicSolanaEscrowExpired = "solana.escrow.expired"
)

func AllTopics() []string {
	return []string{
		TopicOrderCreated,
		TopicOrderSigned,
		TopicOrderActivated,
		TopicOrderExpired,
		TopicOrderSettled,
		TopicOrderDisputeOpened,
		TopicOrderDisputeResolved,
		TopicRentPaid,
		TopicSolanaDepositLocked,
		TopicSolanaPartySigned,
		TopicSolanaEscrowExpired,
	}
}

// ─── Event payloads ─────────────────────────────────────────────────

type OrderEvent struct {
	EventID        string    `json:"event_id"`
	OrderID        string    `json:"order_id"`
	PropertyID     string    `json:"property_id"`
	TenantWallet   string    `json:"tenant_wallet"`
	LandlordWallet string    `json:"landlord_wallet"`
	DepositAmount  int64     `json:"deposit_amount"`
	TokenMint      string    `json:"token_mint"`
	RentAmount     int64     `json:"rent_amount"`
	EscrowStatus   string    `json:"escrow_status"`
	Timestamp      time.Time `json:"timestamp"`
}

type OrderSignedEvent struct {
	EventID        string    `json:"event_id"`
	OrderID        string    `json:"order_id"`
	PropertyID     string    `json:"property_id"`
	TenantWallet   string    `json:"tenant_wallet"`
	LandlordWallet string    `json:"landlord_wallet"`
	SignedBy       string    `json:"signed_by"`
	Role           string    `json:"role"`
	BothSigned     bool      `json:"both_signed"`
	Timestamp      time.Time `json:"timestamp"`
}

type OrderDisputeEvent struct {
	EventID        string    `json:"event_id"`
	OrderID        string    `json:"order_id"`
	PropertyID     string    `json:"property_id"`
	TenantWallet   string    `json:"tenant_wallet"`
	LandlordWallet string    `json:"landlord_wallet"`
	OpenedBy       string    `json:"opened_by"`
	Reason         string    `json:"reason"`
	Timestamp      time.Time `json:"timestamp"`
}

type DisputeResolvedEvent struct {
	EventID        string    `json:"event_id"`
	OrderID        string    `json:"order_id"`
	PropertyID     string    `json:"property_id"`
	TenantWallet   string    `json:"tenant_wallet"`
	LandlordWallet string    `json:"landlord_wallet"`
	Winner         string    `json:"winner"`
	Reason         string    `json:"reason"`
	Timestamp      time.Time `json:"timestamp"`
}

type RentPaidEvent struct {
	EventID     string    `json:"event_id"`
	OrderID     string    `json:"order_id"`
	PaidBy      string    `json:"paid_by"`
	Amount      int64     `json:"amount"`
	TxHash      string    `json:"tx_hash"`
	PeriodStart time.Time `json:"period_start"`
	PeriodEnd   time.Time `json:"period_end"`
	Timestamp   time.Time `json:"timestamp"`
}

// ─── Solana on-chain event payloads ─────────────────────────────────

type SolanaDepositLockedEvent struct {
	Escrow        string `json:"escrow"`
	Landlord      string `json:"landlord"`
	Tenant        string `json:"tenant"`
	DepositAmount uint64 `json:"deposit_amount"`
	Deadline      int64  `json:"deadline"`
	TxSignature   string `json:"tx_signature"`
}

type SolanaPartySignedEvent struct {
	Escrow      string `json:"escrow"`
	Signer      string `json:"signer"`
	Role        string `json:"role"`
	TxSignature string `json:"tx_signature"`
}

type SolanaEscrowExpiredEvent struct {
	Escrow      string `json:"escrow"`
	RefundedTo  string `json:"refunded_to"`
	Amount      uint64 `json:"amount"`
	TxSignature string `json:"tx_signature"`
}

// ─── Producer ───────────────────────────────────────────────────────

type Producer struct {
	producer sarama.SyncProducer
}

func NewProducer(brokers []string) (*Producer, error) {
	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true
	cfg.Producer.RequiredAcks = sarama.WaitForLocal
	cfg.Producer.Retry.Max = 3

	producer, err := sarama.NewSyncProducer(brokers, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create kafka producer: %w", err)
	}

	return &Producer{producer: producer}, nil
}

func (p *Producer) Publish(ctx context.Context, topic string, key string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	msg := &sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.StringEncoder(key),
		Value: sarama.ByteEncoder(data),
	}

	partition, offset, err := p.producer.SendMessage(msg)
	if err != nil {
		log.Printf("[kafka] failed to publish to %s: %v", topic, err)
		return err
	}

	log.Printf("[kafka] published to %s partition=%d offset=%d key=%s", topic, partition, offset, key)
	return nil
}

func (p *Producer) Close() error {
	return p.producer.Close()
}

// ─── Consumer Group ─────────────────────────────────────────────────

type MessageHandler func(topic string, value []byte) error

type ConsumerGroup struct {
	group    sarama.ConsumerGroup
	topics   []string
	handlers map[string]MessageHandler
	ready    chan struct{}
}

func NewConsumerGroup(brokers []string, groupID string, handlers map[string]MessageHandler) (*ConsumerGroup, error) {
	cfg := sarama.NewConfig()
	cfg.Consumer.Group.Rebalance.GroupStrategies = []sarama.BalanceStrategy{sarama.NewBalanceStrategyRoundRobin()}
	cfg.Consumer.Offsets.Initial = sarama.OffsetNewest

	topics := make([]string, 0, len(handlers))
	for t := range handlers {
		topics = append(topics, t)
	}

	group, err := sarama.NewConsumerGroup(brokers, groupID, cfg)
	if err != nil {
		return nil, fmt.Errorf("failed to create consumer group: %w", err)
	}

	return &ConsumerGroup{
		group:    group,
		topics:   topics,
		handlers: handlers,
		ready:    make(chan struct{}),
	}, nil
}

func (cg *ConsumerGroup) Start(ctx context.Context) {
	go func() {
		for {
			if err := cg.group.Consume(ctx, cg.topics, cg); err != nil {
				log.Printf("[kafka] consumer group error: %v", err)
			}
			if ctx.Err() != nil {
				log.Println("[kafka] consumer group stopping")
				return
			}
			cg.ready = make(chan struct{})
		}
	}()

	<-cg.ready
	log.Printf("[kafka] consumer group started, topics: %v", cg.topics)
}

func (cg *ConsumerGroup) Close() error {
	return cg.group.Close()
}

// Реализация интерфейса sarama.ConsumerGroupHandler

func (cg *ConsumerGroup) Setup(sarama.ConsumerGroupSession) error {
	close(cg.ready)
	return nil
}

func (cg *ConsumerGroup) Cleanup(sarama.ConsumerGroupSession) error {
	return nil
}

func (cg *ConsumerGroup) ConsumeClaim(session sarama.ConsumerGroupSession, claim sarama.ConsumerGroupClaim) error {
	for msg := range claim.Messages() {
		handler, ok := cg.handlers[msg.Topic]
		if !ok {
			log.Printf("[kafka] no handler for topic %s", msg.Topic)
			session.MarkMessage(msg, "")
			continue
		}

		if err := handler(msg.Topic, msg.Value); err != nil {
			log.Printf("[kafka] handler error on %s: %v", msg.Topic, err)
		}

		session.MarkMessage(msg, "")
	}
	return nil
}

// ─── EnsureTopics ───────────────────────────────────────────────────

func EnsureTopics(brokers []string, topics []string) error {
	cfg := sarama.NewConfig()
	admin, err := sarama.NewClusterAdmin(brokers, cfg)
	if err != nil {
		return fmt.Errorf("failed to create cluster admin: %w", err)
	}
	defer admin.Close()

	existing, err := admin.ListTopics()
	if err != nil {
		return fmt.Errorf("failed to list topics: %w", err)
	}

	for _, topic := range topics {
		if _, ok := existing[topic]; ok {
			continue
		}
		err := admin.CreateTopic(topic, &sarama.TopicDetail{
			NumPartitions:     3,
			ReplicationFactor: 1,
		}, false)
		if err != nil {
			log.Printf("[kafka] failed to create topic %s: %v", topic, err)
		}
	}

	return nil
}
