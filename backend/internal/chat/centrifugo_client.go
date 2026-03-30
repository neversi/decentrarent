package chat

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
)

// CentrifugoClient отправляет сообщения в Centrifugo через HTTP API.
// Нужен чтобы системные сообщения (от Kafka) приходили в реалтайме через WebSocket.
type CentrifugoClient struct {
	apiURL string
	apiKey string
	client *http.Client
}

func NewCentrifugoClient(apiURL, apiKey string) *CentrifugoClient {
	return &CentrifugoClient{
		apiURL: apiURL,
		apiKey: apiKey,
		client: &http.Client{},
	}
}

// centrifugoPublishRequest — формат Centrifugo HTTP API v1.
type centrifugoPublishRequest struct {
	Channel string      `json:"channel"`
	Data    interface{} `json:"data"`
}

type centrifugoAPIRequest struct {
	Method string      `json:"method"`
	Params interface{} `json:"params"`
}

// PublishToChannel отправляет сообщение в Centrifugo канал.
// Все подписчики получат его через WebSocket мгновенно.
func (c *CentrifugoClient) PublishToChannel(channel string, msg *Message) error {
	payload := centrifugoAPIRequest{
		Method: "publish",
		Params: centrifugoPublishRequest{
			Channel: channel,
			Data:    msg,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.apiURL+"/api", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "apikey "+c.apiKey)

	resp, err := c.client.Do(req)
	if err != nil {
		return fmt.Errorf("centrifugo publish failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("centrifugo returned status %d", resp.StatusCode)
	}

	return nil
}

// PublishToConversation формирует channel name из conversation и шлёт в Centrifugo.
func (c *CentrifugoClient) PublishToConversation(conv *Conversation, msg *Message) {
	channel := fmt.Sprintf("property:%s:chat:%s", conv.PropertyID, conv.LoanerID)

	if err := c.PublishToChannel(channel, msg); err != nil {
		log.Printf("[centrifugo] failed to publish to %s: %v", channel, err)
	}
}
