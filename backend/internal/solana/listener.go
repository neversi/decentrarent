package solana

import (
	"context"
	"log"
	"time"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc/ws"

	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
)

const reconnectDelay = 5 * time.Second

type Listener struct {
	wsURL     string
	programID solanago.PublicKey
	producer  *kafkapkg.Producer
}

func NewListener(wsURL, programID string, producer *kafkapkg.Producer) *Listener {
	return &Listener{
		wsURL:     wsURL,
		programID: solanago.MustPublicKeyFromBase58(programID),
		producer:  producer,
	}
}

func (l *Listener) Start(ctx context.Context) {
	for {
		if ctx.Err() != nil {
			log.Println("[solana] listener stopped: context cancelled")
			return
		}

		err := l.subscribe(ctx)
		if err != nil {
			log.Printf("[solana] subscription error: %v", err)
		}

		log.Printf("[solana] reconnecting in %s...", reconnectDelay)
		select {
		case <-ctx.Done():
			log.Println("[solana] listener stopped: context cancelled")
			return
		case <-time.After(reconnectDelay):
		}
	}
}

func (l *Listener) subscribe(ctx context.Context) error {
	client, err := ws.Connect(ctx, l.wsURL)
	if err != nil {
		return err
	}
	defer client.Close()

	log.Printf("[solana] connected to %s, subscribing to program %s", l.wsURL, l.programID)

	sub, err := client.LogsSubscribeMentions(l.programID, "confirmed")
	if err != nil {
		return err
	}
	defer sub.Unsubscribe()

	log.Println("[solana] subscription active, listening for events...")

	for {
		result, err := sub.Recv(ctx)
		if err != nil {
			return err
		}

		if result.Value.Err != nil {
			continue
		}

		txSig := result.Value.Signature.String()
		events := DecodeEvents(result.Value.Logs, txSig)

		for _, evt := range events {
			if err := l.producer.Publish(ctx, evt.Topic, evt.Key, evt.Payload); err != nil {
				log.Printf("[solana] failed to publish %s: %v", evt.Topic, err)
			}
		}
	}
}
