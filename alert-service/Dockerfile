FROM golang:1.22-alpine AS builder

WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o alert-service .

FROM alpine:3.19

WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /app/alert-service .

EXPOSE 5057
CMD ["./alert-service"]
