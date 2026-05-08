"""
SupabaseRealtimeNotifier — broadcasts job status events via the Supabase
Realtime REST broadcast endpoint.

Instead of a long-lived WebSocket connection (impractical in Lambda), this
adapter makes a single HTTP POST to Supabase's server-side broadcast API:

    POST <SUPABASE_URL>/realtime/v1/api/broadcast

The frontend subscribes to the channel ``job:<job_id>`` and receives the
``status`` event immediately when the worker Lambda completes or fails.
No polling required.
"""

import logging

import httpx

from core.ports.job_notifier_port import IJobNotifier

logger = logging.getLogger(__name__)

_BROADCAST_PATH = "/realtime/v1/api/broadcast"


class SupabaseRealtimeNotifier(IJobNotifier):
    """Broadcasts job-status events via the Supabase Realtime REST API.

    Uses a shared ``httpx.AsyncClient`` so the underlying TCP connection can
    be reused across multiple jobs within the same Lambda warm invocation.
    """

    def __init__(self, supabase_url: str, service_role_key: str) -> None:
        self._url = supabase_url.rstrip("/") + _BROADCAST_PATH
        self._headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Content-Type": "application/json",
        }

    async def notify(self, job_id: str, status: str) -> None:
        """POST a broadcast message to the ``job:<job_id>`` Realtime channel."""
        payload = {
            "messages": [
                {
                    "topic": f"job:{job_id}",
                    "event": "status",
                    "payload": {"status": status, "job_id": job_id},
                }
            ]
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    self._url, headers=self._headers, json=payload
                )
                response.raise_for_status()
            logger.info(
                "Realtime broadcast sent for job '%s' (status: %s).", job_id, status
            )
        except Exception as exc:
            # Notification failures are non-critical — log but never propagate.
            logger.warning(
                "Failed to broadcast Realtime status for job '%s': %s",
                job_id,
                exc,
            )
