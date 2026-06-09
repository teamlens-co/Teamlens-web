package core

import (
	"log"
	"sync"
)

// PubSub is an in-memory publish-subscribe system using Go channels
type PubSub struct {
	mu          sync.RWMutex
	subscribers map[string][]chan AlertEvent
}

// NewPubSub creates a new PubSub instance
func NewPubSub() *PubSub {
	return &PubSub{
		subscribers: make(map[string][]chan AlertEvent),
	}
}

// Subscribe returns a channel that receives all alerts on the given topic
// Topics: "all" (everything), "employee:{id}", "team:{id}", "rule:{type}"
func (ps *PubSub) Subscribe(topic string, bufferSize int) chan AlertEvent {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	ch := make(chan AlertEvent, bufferSize)
	ps.subscribers[topic] = append(ps.subscribers[topic], ch)
	log.Printf("[PubSub] New subscriber for topic=%q (total=%d)", topic, len(ps.subscribers[topic]))
	return ch
}

// Unsubscribe removes a channel from a topic
func (ps *PubSub) Unsubscribe(topic string, ch chan AlertEvent) {
	ps.mu.Lock()
	defer ps.mu.Unlock()

	subs := ps.subscribers[topic]
	for i, sub := range subs {
		if sub == ch {
			ps.subscribers[topic] = append(subs[:i], subs[i+1:]...)
			close(ch)
			log.Printf("[PubSub] Unsubscribed from topic=%q", topic)
			return
		}
	}
}

// Publish sends an event to all subscribers of matching topics
func (ps *PubSub) Publish(event AlertEvent) {
	ps.mu.RLock()
	defer ps.mu.RUnlock()

	topics := []string{
		"all",
		"rule:" + event.RuleType,
	}
	if event.EmployeeID != "" {
		topics = append(topics, "employee:"+event.EmployeeID)
	}

	sent := 0
	for _, topic := range topics {
		for _, ch := range ps.subscribers[topic] {
			select {
			case ch <- event:
				sent++
			default:
				// Channel full — drop event for slow consumer
				log.Printf("[PubSub] Dropping event for slow subscriber on topic=%q", topic)
			}
		}
	}
	log.Printf("[PubSub] Published alert id=%s type=%s sent_to=%d subscribers", event.ID[:8], event.RuleType, sent)
}
