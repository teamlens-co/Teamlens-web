package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type contextKey string

const authContextKey contextKey = "authContext"

// GetAuthContext retrieves the AuthContext from the request context
func GetAuthContext(ctx context.Context) *models.AuthContext {
	if v, ok := ctx.Value(authContextKey).(*models.AuthContext); ok {
		return v
	}
	return nil
}

// AuthMiddleware creates HTTP middleware that validates JWT tokens
func AuthMiddleware(jwtSvc *services.JWTService, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractToken(r)
			if tokenStr == "" {
				writeUnauthorized(w, "Missing auth token")
				return
			}

			claims, err := jwtSvc.VerifyToken(tokenStr)
			if err != nil {
				slog.Warn("Auth verification failed", "error", err)
				writeUnauthorized(w, "Invalid or expired token")
				return
			}

			tokenType, _ := claims["type"].(string)
			userID, _ := claims["sub"].(string)
			orgID, _ := claims["orgId"].(string)
			roleStr, _ := claims["role"].(string)
			role := models.AuthRole(roleStr)

			// For agent tokens, verify they're still active in DB
			if tokenType == "agent" {
				tokenHash := services.SHA256(tokenStr)
				var exists bool
				err := pool.QueryRow(r.Context(),
					`SELECT EXISTS(
					   SELECT 1 FROM agent_tokens
					   WHERE token_hash = $1
					     AND status = 'ACTIVE'
					     AND expires_at > NOW()
					     AND revoked_at IS NULL
					)`, tokenHash,
				).Scan(&exists)
				if err != nil || !exists {
					writeUnauthorized(w, "Agent token is not active")
					return
				}
			}

			auth := &models.AuthContext{
				UserID:         userID,
				OrganizationID: orgID,
				Role:           role,
				TokenType:      models.AuthTokenType(tokenType),
				Token:          tokenStr,
			}

			ctx := context.WithValue(r.Context(), authContextKey, auth)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalAuthMiddleware attaches auth if token is present, but doesn't reject if missing
func OptionalAuthMiddleware(jwtSvc *services.JWTService, pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tokenStr := extractToken(r)
			if tokenStr == "" {
				next.ServeHTTP(w, r)
				return
			}

			claims, err := jwtSvc.VerifyToken(tokenStr)
			if err != nil {
				next.ServeHTTP(w, r)
				return
			}

			tokenType, _ := claims["type"].(string)
			userID, _ := claims["sub"].(string)
			orgID, _ := claims["orgId"].(string)
			roleStr, _ := claims["role"].(string)

			if tokenType == "agent" {
				tokenHash := services.SHA256(tokenStr)
				var exists bool
				err := pool.QueryRow(r.Context(),
					`SELECT EXISTS(
					   SELECT 1 FROM agent_tokens
					   WHERE token_hash = $1
					     AND status = 'ACTIVE'
					     AND expires_at > NOW()
					     AND revoked_at IS NULL
					)`, tokenHash,
				).Scan(&exists)
				if err != nil || !exists {
					next.ServeHTTP(w, r)
					return
				}
			}

			auth := &models.AuthContext{
				UserID:         userID,
				OrganizationID: orgID,
				Role:           models.AuthRole(roleStr),
				TokenType:      models.AuthTokenType(tokenType),
				Token:          tokenStr,
			}

			ctx := context.WithValue(r.Context(), authContextKey, auth)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole returns middleware that checks the user has the specified role
func RequireRole(role models.AuthRole) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			auth := GetAuthContext(r.Context())
			if auth == nil {
				writeUnauthorized(w, "Unauthorized")
				return
			}
			if auth.Role != role {
				writeForbidden(w, "Forbidden")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func extractToken(r *http.Request) string {
	// Check Authorization header (Bearer)
	header := r.Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		return strings.TrimSpace(header[7:])
	}

	// Check cookie
	cookie, err := r.Cookie("teamlens_access_token")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	return ""
}

func writeUnauthorized(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	w.Write([]byte(`{"success":false,"message":"` + msg + `"}`))
}

func writeForbidden(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	w.Write([]byte(`{"success":false,"message":"` + msg + `"}`))
}
