package main

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	_ "github.com/lib/pq"
	httpSwagger "github.com/swaggo/http-swagger/v2"

	_ "github.com/abdro/decentrarent/backend/docs"
	"github.com/abdro/decentrarent/backend/internal/auth"
	"github.com/abdro/decentrarent/backend/internal/chat"
	"github.com/abdro/decentrarent/backend/internal/config"
	"github.com/abdro/decentrarent/backend/internal/egov"
	"github.com/abdro/decentrarent/backend/internal/media"
	"github.com/abdro/decentrarent/backend/internal/property"
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

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}
	log.Println("Connected to database")

	// Stores
	userStore := user.NewStore(db)
	if err := userStore.Migrate(); err != nil {
		log.Fatalf("Failed to run user migrations: %v", err)
	}

	chatStore := chat.NewStore(db)
	if err := chatStore.Migrate(); err != nil {
		log.Fatalf("Failed to run chat migrations: %v", err)
	}

	propertyStore := property.NewStore(db)
	if err := propertyStore.Migrate(); err != nil {
		log.Fatalf("Failed to run property migrations: %v", err)
	}

	mediaStore := media.NewStore(db)
	if err := mediaStore.Migrate(); err != nil {
		log.Fatalf("Failed to run media migrations: %v", err)
	}

	// S3 client
	s3Client, err := media.NewS3Client(cfg.MinioEndpoint, cfg.MinioPublicEndpoint, cfg.MinioAccessKey, cfg.MinioSecretKey, cfg.MinioBucket, cfg.MinioUseSSL)
	if err != nil {
		log.Fatalf("Failed to connect to MinIO: %v", err)
	}
	log.Println("Connected to MinIO")

	// Services
	authService := auth.NewService(cfg.JWTSecret)
	chatService := chat.NewService(chatStore)
	verifier := egov.NewMockVerifier()
	propertyService := property.NewService(propertyStore, verifier)

	// Handlers
	authHandler := auth.NewHandler(authService, userStore)
	userHandler := user.NewHandler(userStore)
	chatHandler := chat.NewHandler(chatStore)
	centrifugoHandler := chat.NewCentrifugoHandler(authService, chatService)
	mediaHandler := media.NewHandler(mediaStore, s3Client, propertyStore)
	propertyHandler := property.NewHandler(propertyStore, propertyService, mediaHandler, mediaHandler)

	// Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
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

		// Chat
		r.Get("/conversations", chatHandler.ListConversations)
		r.Get("/conversations/{id}/messages", chatHandler.GetMessages)
		r.Post("/conversations/messages", chatHandler.SendMessage)
		r.Post("/dev/seed-chat", chatHandler.SeedChat)

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
	})

	log.Printf("Server starting on :%s", cfg.ServerPort)
	log.Fatal(http.ListenAndServe(":"+cfg.ServerPort, r))
}
