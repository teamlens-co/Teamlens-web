package analytics

import (
	"context"
	"log/slog"

	"github.com/posthog/posthog-go"
)

// DefaultClient is the package-level analytics client used by helpers.
// It is set during application startup.
var DefaultClient *Client

type Client struct {
	posthogClient posthog.Client
	enabled       bool
}

func New(apiKey, host string) *Client {
	if apiKey == "" {
		return &Client{enabled: false}
	}

	if host == "" {
		host = "https://us.posthog.com"
	}

	client, err := posthog.NewWithConfig(apiKey, posthog.Config{Endpoint: host})
	if err != nil {
		slog.Error("failed to initialize posthog client", "error", err)
		return &Client{enabled: false}
	}

	return &Client{
		posthogClient: client,
		enabled:       true,
	}
}

func (c *Client) Close() error {
	if !c.enabled || c.posthogClient == nil {
		return nil
	}
	return c.posthogClient.Close()
}

func (c *Client) Capture(ctx context.Context, distinctID, event string, properties map[string]any) {
	if !c.enabled || c.posthogClient == nil {
		return
	}

	props := posthog.NewProperties()
	for k, v := range properties {
		props.Set(k, v)
	}

	err := c.posthogClient.Enqueue(posthog.Capture{
		DistinctId: distinctID,
		Event:      event,
		Properties: props,
	})
	if err != nil {
		slog.Warn("failed to enqueue posthog capture", "error", err)
	}
}

func (c *Client) Identify(ctx context.Context, distinctID string, traits map[string]any) {
	if !c.enabled || c.posthogClient == nil {
		return
	}

	props := posthog.NewProperties()
	for k, v := range traits {
		props.Set(k, v)
	}

	err := c.posthogClient.Enqueue(posthog.Identify{
		DistinctId: distinctID,
		Properties: props,
	})
	if err != nil {
		slog.Warn("failed to enqueue posthog identify", "error", err)
	}
}
