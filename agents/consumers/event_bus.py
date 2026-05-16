"""Event bus abstraction: Redis Streams locally, Cloud Pub/Sub on GCP.

Set EVENT_BUS=pubsub to use Google Cloud Pub/Sub (requires google-cloud-pubsub).
Default: redis (uses REDIS_URL).
"""
import os

EVENT_BUS = os.getenv("EVENT_BUS", "redis")

if EVENT_BUS == "pubsub":
    from agents.consumers._pubsub import publish_event, consume_events
else:
    from agents.consumers._redis import publish_event, consume_events

__all__ = ["publish_event", "consume_events"]
