package chat

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
)

// ChatConsumers manages Kafka consumer group that posts messages into chat.
type ChatConsumers struct {
	service *Service
	cg      *kafkapkg.ConsumerGroup
}

func NewChatConsumers(brokers []string, service *Service) (*ChatConsumers, error) {
	cc := &ChatConsumers{service: service}

	handlers := map[string]kafkapkg.MessageHandler{
		kafkapkg.TopicOrderCreated:         cc.handleOrderCreated,
		kafkapkg.TopicOrderSigned:          cc.handleOrderSigned,
		kafkapkg.TopicOrderActivated:       cc.handleOrderActivated,
		kafkapkg.TopicOrderExpired:         cc.handleOrderExpired,
		kafkapkg.TopicOrderSettled:         cc.handleOrderSettled,
		kafkapkg.TopicOrderDisputeOpened:   cc.handleDisputeOpened,
		kafkapkg.TopicOrderDisputeResolved: cc.handleDisputeResolved,
		kafkapkg.TopicRentPaid:             cc.handleRentPaid,
	}

	cg, err := kafkapkg.NewConsumerGroup(brokers, "chat-service", handlers)
	if err != nil {
		return nil, err
	}

	cc.cg = cg
	return cc, nil
}

func (cc *ChatConsumers) Start(ctx context.Context) {
	cc.cg.Start(ctx)
	log.Println("[chat-consumers] all Kafka consumers started")
}

func (cc *ChatConsumers) Close() error {
	return cc.cg.Close()
}

// ─── Handlers ───────────────────────────────────────────────────────

func (cc *ChatConsumers) handleOrderCreated(topic string, value []byte) error {
	var evt kafkapkg.OrderEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	conv, err := cc.service.FindConversationForOrder(evt.PropertyID, evt.LandlordWallet, evt.TenantWallet)
	if err != nil {
		log.Printf("[chat-consumer] no conversation for order %s: %v", evt.OrderID, err)
		return nil
	}

	cc.service.SendSystemMessage(conv.ID,
		"Договор был инициализирован",
		kafkapkg.TopicOrderCreated,
	)

	cc.service.SendModalMessage(conv.ID,
		fmt.Sprintf("Создать договор аренды? Депозит: %d, Ежемесячная оплата: %d", evt.DepositAmount, evt.RentAmount),
		ModalActionCreateAgreement,
		evt.OrderID,
	)

	return nil
}

func (cc *ChatConsumers) handleOrderSigned(topic string, value []byte) error {
	var evt kafkapkg.OrderSignedEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	conv, err := cc.service.FindConversationForOrder(evt.PropertyID, evt.LandlordWallet, evt.TenantWallet)
	if err != nil {
		log.Printf("[chat-consumer] no conversation for order %s: %v", evt.OrderID, err)
		return nil
	}

	roleName := "Арендатор"
	if evt.Role == "landlord" {
		roleName = "Арендодатель"
	}

	cc.service.SendSystemMessage(conv.ID,
		fmt.Sprintf("%s подписал договор", roleName),
		kafkapkg.TopicOrderSigned,
	)

	if !evt.BothSigned {
		cc.service.SendModalMessage(conv.ID,
			"Подписываем договор?",
			ModalActionSignAgreement,
			evt.OrderID,
		)
	}

	return nil
}

func (cc *ChatConsumers) handleOrderActivated(topic string, value []byte) error {
	var evt kafkapkg.OrderEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	conv, err := cc.service.FindConversationForOrder(evt.PropertyID, evt.LandlordWallet, evt.TenantWallet)
	if err != nil {
		return nil
	}

	cc.service.SendSystemMessage(conv.ID,
		"Договор подписан обеими сторонами",
		kafkapkg.TopicOrderActivated,
	)

	cc.service.SendModalMessage(conv.ID,
		fmt.Sprintf("Подтвердить списание депозита %d?", evt.DepositAmount),
		ModalActionDepositConfirm,
		evt.OrderID,
	)

	return nil
}

func (cc *ChatConsumers) handleOrderExpired(topic string, value []byte) error {
	var evt kafkapkg.OrderEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	conv, err := cc.service.FindConversationForOrder(evt.PropertyID, evt.LandlordWallet, evt.TenantWallet)
	if err != nil {
		return nil
	}

	cc.service.SendSystemMessage(conv.ID,
		"Срок подписания договора истёк. Договор отменён.",
		kafkapkg.TopicOrderExpired,
	)

	return nil
}

func (cc *ChatConsumers) handleOrderSettled(topic string, value []byte) error {
	var evt kafkapkg.OrderEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	conv, err := cc.service.FindConversationForOrder(evt.PropertyID, evt.LandlordWallet, evt.TenantWallet)
	if err != nil {
		return nil
	}

	cc.service.SendSystemMessage(conv.ID,
		"Договор завершён. Депозит возвращён.",
		kafkapkg.TopicOrderSettled,
	)

	cc.service.SendDocumentMessage(conv.ID,
		"Вам направлен договор PDF",
		fmt.Sprintf("/orders/%s/agreement", evt.OrderID),
		"Договор аренды.pdf",
		evt.OrderID,
	)

	return nil
}

func (cc *ChatConsumers) handleDisputeOpened(topic string, value []byte) error {
	var evt kafkapkg.OrderDisputeEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	conv, err := cc.service.FindConversationForOrder(evt.PropertyID, evt.LandlordWallet, evt.TenantWallet)
	if err != nil {
		log.Printf("[chat-consumer] no conversation for dispute order %s: %v", evt.OrderID, err)
		return nil
	}

	cc.service.SendSystemMessage(conv.ID,
		fmt.Sprintf("Открыт спор. Причина: %s", evt.Reason),
		kafkapkg.TopicOrderDisputeOpened,
	)

	return nil
}

func (cc *ChatConsumers) handleDisputeResolved(topic string, value []byte) error {
	var evt kafkapkg.DisputeResolvedEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	conv, err := cc.service.FindConversationForOrder(evt.PropertyID, evt.LandlordWallet, evt.TenantWallet)
	if err != nil {
		log.Printf("[chat-consumer] no conversation for dispute order %s: %v", evt.OrderID, err)
		return nil
	}

	winnerName := "арендатора"
	if evt.Winner == "landlord" {
		winnerName = "арендодателя"
	}

	cc.service.SendSystemMessage(conv.ID,
		fmt.Sprintf("Спор решён в пользу %s. %s", winnerName, evt.Reason),
		kafkapkg.TopicOrderDisputeResolved,
	)

	return nil
}

func (cc *ChatConsumers) handleRentPaid(topic string, value []byte) error {
	var evt kafkapkg.RentPaidEvent
	if err := json.Unmarshal(value, &evt); err != nil {
		return err
	}

	log.Printf("[chat-consumer] rent paid on order %s by %s, amount: %d", evt.OrderID, evt.PaidBy, evt.Amount)
	return nil
}
