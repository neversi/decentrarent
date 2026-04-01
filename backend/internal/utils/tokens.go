package utils

import (
	"fmt"
	"strconv"
	"strings"
)

var tokenDecimals = map[string]int{
	"USDC": 6,
	"USDT": 6,
	"SOL":  9,
}

func RenderToken(price int, token string) string {

	decimals, ok := tokenDecimals[token]
	if !ok {
		decimals = 6 // default to 6 decimals if unknown token
	}

	amount := float64(price) / float64(pow10(decimals))
	formatted := strconv.FormatFloat(amount, 'f', decimals, 64)
	formatted = strings.TrimRight(strings.TrimRight(formatted, "0"), ".")
	if formatted == "" {
		formatted = "0"
	}

	return fmt.Sprintf("%s %s", formatted, token)
}

func pow10(n int) int {
	result := 1
	for i := 0; i < n; i++ {
		result *= 10
	}
	return result
}
