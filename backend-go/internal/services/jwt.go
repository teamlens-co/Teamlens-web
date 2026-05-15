package services

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/teamlens/backend-go/internal/config"
	"github.com/teamlens/backend-go/internal/models"
)

type JWTService struct {
	cfg *config.Config
}

func NewJWTService(cfg *config.Config) *JWTService {
	return &JWTService{cfg: cfg}
}

func (s *JWTService) SignAccessToken(userID, orgID string, role models.AuthRole) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   userID,
		"orgId": orgID,
		"role":  string(role),
		"type":  "access",
		"iat":   now.Unix(),
		"exp":   now.Add(s.cfg.JWTAccessTTL).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *JWTService) SignAgentToken(userID, orgID string, role models.AuthRole, tokenID string) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":   userID,
		"orgId": orgID,
		"role":  string(role),
		"type":  "agent",
		"jti":   tokenID,
		"iat":   now.Unix(),
		"exp":   now.Add(s.cfg.JWTOAgentTTL).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.cfg.JWTSecret))
}

func (s *JWTService) VerifyToken(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.cfg.JWTSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("parse token: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}
