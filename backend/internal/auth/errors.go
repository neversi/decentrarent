package auth

import "strings"

// isUniqueViolation — проверяет, является ли ошибка нарушением уникальности PostgreSQL (код 23505)
func isUniqueViolation(err error) bool {
	return strings.Contains(err.Error(), "23505") ||
		strings.Contains(err.Error(), "unique constraint") ||
		strings.Contains(err.Error(), "UNIQUE constraint failed")
}
