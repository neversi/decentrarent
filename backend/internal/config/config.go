package config

import "os"

type Config struct {
	DatabaseURL    string
	JWTSecret      string
	CentrifugoKey  string
	CentrifugoURL  string
	ServerPort     string
}

func Load() *Config {
	return &Config{
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://decentrarent:decentrarent@localhost:5432/decentrarent?sslmode=disable"),
		JWTSecret:      getEnv("JWT_SECRET", "decentrarent-dev-jwt-secret-change-in-production"),
		CentrifugoKey:  getEnv("CENTRIFUGO_API_KEY", "api-secret"),
		CentrifugoURL:  getEnv("CENTRIFUGO_URL", "http://localhost:8000"),
		ServerPort:     getEnv("SERVER_PORT", "8080"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
