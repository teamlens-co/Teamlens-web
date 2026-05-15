# ─── Build Stage ─────────────────────────────────────────────────────────────
FROM golang:1.22-alpine AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /build

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" \
    -o /build/teamlens-api ./cmd/server/

# ─── Runtime Stage ──────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && adduser -D -h /app appuser

WORKDIR /app

COPY --from=builder /build/teamlens-api /app/teamlens-api

RUN mkdir -p /app/uploads/screenshots /app/uploads/recordings \
    && chown -R appuser:appuser /app/uploads

USER appuser

EXPOSE 8080

ENV PORT=8080
ENV UPLOAD_DIR=/app/uploads

CMD ["/app/teamlens-api"]
