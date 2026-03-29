package main

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	_ "github.com/lib/pq"

	"github.com/abdro/decentrarent/backend/internal/auth"
	"github.com/abdro/decentrarent/backend/internal/chat"
	"github.com/abdro/decentrarent/backend/internal/config"
	"github.com/abdro/decentrarent/backend/internal/user"
)

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

	// Services
	authService := auth.NewService(cfg.JWTSecret)
	chatService := chat.NewService(chatStore)

	// Handlers
	authHandler := auth.NewHandler(authService, userStore)
	userHandler := user.NewHandler(userStore)
	chatHandler := chat.NewHandler(chatStore)
	centrifugoHandler := chat.NewCentrifugoHandler(authService, chatService)

	// Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	// Auth routes (public)
	r.Get("/auth/nonce", authHandler.GetNonce)
	r.Post("/auth/verify", authHandler.Verify)

	// Centrifugo proxy endpoints (called by Centrifugo, not frontend)
	r.Post("/centrifugo/connect", centrifugoHandler.Connect)
	r.Post("/centrifugo/subscribe", centrifugoHandler.Subscribe)
	r.Post("/centrifugo/publish", centrifugoHandler.Publish)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(authService.AuthMiddleware)
		r.Post("/auth/refresh", authHandler.Refresh)
		r.Get("/user/me", userHandler.GetMe)
		r.Get("/conversations", chatHandler.ListConversations)
		r.Get("/conversations/{id}/messages", chatHandler.GetMessages)
		r.Post("/conversations/messages", chatHandler.SendMessage)

		// Dev: seed a mock conversation for testing
		r.Post("/dev/seed-chat", chatHandler.SeedChat)
	})

	log.Printf("Server starting on :%s", cfg.ServerPort)
	log.Fatal(http.ListenAndServe(":"+cfg.ServerPort, r))
}
