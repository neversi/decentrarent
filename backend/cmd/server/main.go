package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"os/signal"
	"syscall"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	_ "github.com/lib/pq"
	httpSwagger "github.com/swaggo/http-swagger/v2"

	_ "github.com/abdro/decentrarent/backend/docs"
	"github.com/abdro/decentrarent/backend/internal/auth"
	"github.com/abdro/decentrarent/backend/internal/chat"
	"github.com/abdro/decentrarent/backend/internal/config"
	"github.com/abdro/decentrarent/backend/internal/dbmigrate"
	"github.com/abdro/decentrarent/backend/internal/egov"
	kafkapkg "github.com/abdro/decentrarent/backend/internal/kafka"
	"github.com/abdro/decentrarent/backend/internal/media"
	"github.com/abdro/decentrarent/backend/internal/order"
	"github.com/abdro/decentrarent/backend/internal/property"
	solanapkg "github.com/abdro/decentrarent/backend/internal/solana"
	"github.com/abdro/decentrarent/backend/internal/user"
)

// @title DecentraRent API
// @version 1.0
// @description API for DecentraRent - Solana dApp for asset renting
// @host localhost:8080
// @BasePath /
// @securityDefinitions.apikey BearerAuth
// @in header
// @name Authorization
// @description Enter "Bearer {token}"
func main() {
	cfg := config.Load()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Connected to database")
	if err := dbmigrate.Up(cfg.DatabaseURL, cfg.MigrationsPath); err != nil {
		log.Fatalf("Failed to run database migrations: %v", err)
	}
	log.Println("Database migrations applied")

	// ─── Kafka producer ─────────────────────────────────────────────
	kafkaProducer, err := kafkapkg.NewProducer(cfg.KafkaBrokers)
	if err != nil {
		log.Printf("Warning: Kafka producer not available: %v", err)
	} else {
		defer kafkaProducer.Close()
		log.Println("Kafka producer connected")
	}

	if err := kafkapkg.EnsureTopics(cfg.KafkaBrokers, kafkapkg.AllTopics()); err != nil {
		log.Printf("Warning: failed to ensure Kafka topics: %v", err)
	} else {
		log.Println("Kafka topics ensured")
	}

	// ─── Stores ─────────────────────────────────────────────────────
	userStore := user.NewStore(db)
	chatStore := chat.NewStore(db)
	propertyStore := property.NewStore(db)
	mediaStore := media.NewStore(db)
	orderStore := order.NewStore(db)

	// S3 client
	s3Client, err := media.NewS3Client(cfg.MinioEndpoint, cfg.MinioPublicEndpoint, cfg.MinioAccessKey, cfg.MinioSecretKey, cfg.MinioBucket, cfg.MinioUseSSL)
	if err != nil {
		log.Fatalf("Failed to connect to MinIO: %v", err)
	}
	log.Println("Connected to MinIO")

	// ─── Services ───────────────────────────────────────────────────
	authService := auth.NewService(cfg.JWTSecret)
	centrifugoClient := chat.NewCentrifugoClient(cfg.CentrifugoURL, cfg.CentrifugoKey)
	chatService := chat.NewService(chatStore, centrifugoClient)
	verifier := egov.NewMockVerifier()
	propertyService := property.NewService(propertyStore, verifier)
	orderCentrifugo := &orderCentrifugoAdapter{apiURL: cfg.CentrifugoURL, apiKey: cfg.CentrifugoKey}
	orderService := order.NewService(orderStore, chatStore, kafkaProducer, orderCentrifugo)

	// ─── Kafka consumers ────────────────────────────────────────────
	chatConsumers, err := chat.NewChatConsumers(cfg.KafkaBrokers, chatService)
	if err != nil {
		log.Printf("Warning: Kafka consumers not available: %v", err)
	} else {
		defer chatConsumers.Close()
		chatConsumers.Start(ctx)
	}

	// ─── Order Kafka consumers (Solana events) ─────────────────────
	orderConsumers, err := order.NewOrderConsumers(cfg.KafkaBrokers, orderService)
	if err != nil {
		log.Printf("Warning: Order Kafka consumers not available: %v", err)
	} else {
		defer orderConsumers.Close()
		orderConsumers.Start(ctx)
	}

	// ─── Solana event listener ──────────────────────────────────────
	if kafkaProducer != nil {
		solanaListener := solanapkg.NewListener(cfg.SolanaWSURL, cfg.SolanaProgramID, kafkaProducer)
		go solanaListener.Start(ctx)
		log.Println("Solana event listener started")
	}

	// ─── Handlers ───────────────────────────────────────────────────
	authHandler := auth.NewHandler(authService, userStore)
	userHandler := user.NewHandler(userStore)
	chatHandler := chat.NewHandler(chatStore, chatService)
	centrifugoHandler := chat.NewCentrifugoHandler(authService, chatService)
	mediaHandler := media.NewHandler(mediaStore, s3Client, propertyStore)
	propertyHandler := property.NewHandler(propertyStore, propertyService, mediaHandler, mediaHandler)
	orderHandler := order.NewHandler(orderStore, orderService)

	// ─── Router ─────────────────────────────────────────────────────
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	r.Get("/swagger/*", httpSwagger.Handler(
		httpSwagger.URL("http://localhost:8080/swagger/doc.json"),
	))

	// Auth routes (public)
	r.Get("/auth/nonce", authHandler.GetNonce)
	r.Post("/auth/verify", authHandler.Verify)
	r.Post("/auth/login", authHandler.Login)
	r.Post("/auth/signup", authHandler.Signup)

	// Centrifugo proxy endpoints
	r.Post("/centrifugo/connect", centrifugoHandler.Connect)
	r.Post("/centrifugo/subscribe", centrifugoHandler.Subscribe)
	r.Post("/centrifugo/publish", centrifugoHandler.Publish)

	// Public property routes
	r.Get("/properties", propertyHandler.List)
	r.Get("/properties/{id}", propertyHandler.Get)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authService.AuthMiddleware)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Get("/user/me", userHandler.GetMe)
		r.Get("/users/{id}", userHandler.GetPublicProfile)

		// Chat
		r.Get("/conversations", chatHandler.ListConversations)
		r.Post("/conversations", chatHandler.CreateConversation)
		r.Delete("/conversations/{id}", chatHandler.DeleteConversation)
		r.Get("/conversations/{id}/messages", chatHandler.GetMessages)
		r.Post("/conversations/documents", chatHandler.SendDocument)

		// Properties (owner actions)
		r.Post("/properties", propertyHandler.Create)
		r.Put("/properties/{id}", propertyHandler.Update)
		r.Delete("/properties/{id}", propertyHandler.Delete)
		r.Patch("/properties/{id}/status", propertyHandler.UpdateStatus)

		// Media
		r.Post("/properties/{id}/media/upload-url", mediaHandler.GetUploadURL)
		r.Post("/properties/{id}/media", mediaHandler.Register)
		r.Delete("/properties/{id}/media/{mediaId}", mediaHandler.Delete)
		r.Put("/properties/{id}/media/order", mediaHandler.Reorder)

		// Orders (escrow)
		r.Post("/orders", orderHandler.Create)
		r.Get("/orders", orderHandler.List)
		r.Get("/orders/{id}", orderHandler.Get)
		r.Post("/orders/{id}/accept", orderHandler.Accept)
		r.Post("/orders/{id}/reject", orderHandler.Reject)
		r.Get("/orders/{id}/payments", orderHandler.GetPayments)
		r.Get("/orders/{id}/history", orderHandler.GetHistory)
	})

	log.Printf("Server starting on :%s", cfg.ServerPort)
	log.Fatal(http.ListenAndServe(":"+cfg.ServerPort, r))
}

// orderCentrifugoAdapter implements order.CentrifugoPublisher using the Centrifugo HTTP API.
type orderCentrifugoAdapter struct {
	apiURL string
	apiKey string
}

func (a *orderCentrifugoAdapter) PublishJSON(channel string, data interface{}) error {
	innerData, err := json.Marshal(data)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(map[string]interface{}{
		"method": "publish",
		"params": map[string]interface{}{
			"channel": channel,
			"data":    json.RawMessage(innerData),
		},
	})
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", a.apiURL+"/api", bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "apikey "+a.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
