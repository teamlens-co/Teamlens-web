package api

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/teamlens-co/teamlens-web-server/alert-service/core"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in dev
	},
}

// WSClient represents a single WebSocket connection
type WSClient struct {
	hub    *WSHub
	conn   *websocket.Conn
	send   chan []byte
	topics map[string]bool // subscribed topics
	mu     sync.Mutex
}

// WSHub manages all WebSocket connections
type WSHub struct {
	clients    map[*WSClient]bool
	broadcast  chan []byte
	register   chan *WSClient
	unregister chan *WSClient
	mu         sync.RWMutex
}

// NewWSHub creates a new WebSocket hub
func NewWSHub() *WSHub {
	return &WSHub{
		clients:    make(map[*WSClient]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *WSClient),
		unregister: make(chan *WSClient),
	}
}

// Run starts the hub event loop
func (h *WSHub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			count := len(h.clients)
			h.mu.Unlock()
			log.Printf("[WS Hub] Client connected (total: %d)", count)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			count := len(h.clients)
			h.mu.Unlock()
			log.Printf("[WS Hub] Client disconnected (total: %d)", count)

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// BroadcastAlert sends an alert to all connected clients
func (h *WSHub) BroadcastAlert(event core.AlertEvent) {
	data, err := json.Marshal(map[string]interface{}{
		"type": "alert",
		"data": event,
	})
	if err != nil {
		log.Printf("[WS Hub] Marshal error: %v", err)
		return
	}
	h.broadcast <- data
}

// SubscribeToAlerts creates a bridge between PubSub and WebSocket
func (h *WSHub) SubscribeToAlerts(ps *core.PubSub) {
	ch := ps.Subscribe("all", 256)
	go func() {
		for event := range ch {
			h.BroadcastAlert(event)
		}
	}()
	log.Println("[WS Hub] Subscribed to all alerts via PubSub")
}

// HandleWebSocket handles WebSocket upgrade and connection
func (h *WSHub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] Upgrade error: %v", err)
		return
	}

	client := &WSClient{
		hub:    h,
		conn:   conn,
		send:   make(chan []byte, 256),
		topics: make(map[string]bool),
	}
	h.register <- client

	go client.writePump()
	go client.readPump()
}

func (c *WSClient) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *WSClient) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(4096)
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}

		// Handle client messages (subscriptions, pings)
		var msg map[string]interface{}
		if json.Unmarshal(message, &msg) == nil {
			if msg["type"] == "ping" {
				pong, _ := json.Marshal(map[string]string{"type": "pong"})
				select {
				case c.send <- pong:
				default:
				}
			}
			if msg["type"] == "subscribe" {
				if topic, ok := msg["topic"].(string); ok {
					c.mu.Lock()
					c.topics[topic] = true
					c.mu.Unlock()
				}
			}
		}
	}
}
