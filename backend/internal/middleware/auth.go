package middleware

import (
	"crypto/subtle"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

const apiKeyHeader = "X-API-Key"

// APIKeyAuth returns middleware that validates the X-API-Key header when API_KEY is set.
// If API_KEY is empty, auth is disabled (with a startup warning).
func APIKeyAuth() gin.HandlerFunc {
	expected := os.Getenv("API_KEY")
	if expected == "" {
		log.Println("warning: API_KEY not set — API authentication is disabled")
		return func(c *gin.Context) { c.Next() }
	}

	return func(c *gin.Context) {
		provided := c.GetHeader(apiKeyHeader)
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or missing API key"})
			return
		}
		c.Next()
	}
}

// AuthRequired reports whether API key authentication is enabled.
func AuthRequired() bool {
	return os.Getenv("API_KEY") != ""
}
