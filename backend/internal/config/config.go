package config

import (
	"os"
	"strings"
)

type Config struct {
	DatabaseURL         string
	JWTSecret           string
	CentrifugoKey       string
	CentrifugoURL       string
	ServerPort          string
	MinioEndpoint       string
	MinioPublicEndpoint string
	MinioAccessKey      string
	MinioSecretKey      string
	MinioBucket         string
	MinioUseSSL         bool
	KafkaBrokers        []string
	SolanaWSURL         string
	SolanaProgramID     string
}

func Load() *Config {
	return &Config{
		DatabaseURL:         getEnv("DATABASE_URL", "postgres://decentrarent:decentrarent@localhost:5432/decentrarent?sslmode=disable"),
		JWTSecret:           getEnv("JWT_SECRET", "decentrarent-dev-jwt-secret-change-in-production"),
		CentrifugoKey:       getEnv("CENTRIFUGO_API_KEY", "api-secret"),
		CentrifugoURL:       getEnv("CENTRIFUGO_URL", "http://localhost:8000"),
		ServerPort:          getEnv("SERVER_PORT", "8080"),
		MinioEndpoint:       getEnv("MINIO_ENDPOINT", "localhost:9000"),
		MinioPublicEndpoint: getEnv("MINIO_PUBLIC_ENDPOINT", "localhost:9000"),
		MinioAccessKey:      getEnv("MINIO_ACCESS_KEY", "decentrarent"),
		MinioSecretKey:      getEnv("MINIO_SECRET_KEY", "decentrarent"),
		MinioBucket:         getEnv("MINIO_BUCKET", "decentrarent-media"),
		MinioUseSSL:         getEnv("MINIO_USE_SSL", "false") == "true",
		KafkaBrokers:        parseBrokers(getEnv("KAFKA_BROKERS", "localhost:9092")),
		SolanaWSURL:         getEnv("SOLANA_WS_URL", "wss://api.devnet.solana.com"),
		SolanaProgramID:     getEnv("SOLANA_PROGRAM_ID", "GNAZzNcftcRNMtjETiXupfpUqPmwQyhNCrTJeiZFkpWY"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func parseBrokers(s string) []string {
	brokers := strings.Split(s, ",")
	result := make([]string, 0, len(brokers))
	for _, b := range brokers {
		b = strings.TrimSpace(b)
		if b != "" {
			result = append(result, b)
		}
	}
	return result
}
