"""
Supabase client factory for the CV Enhancer backend.

Uses the service_role_key so the backend can write to any table
regardless of RLS policies (the application layer enforces user_id ownership).
"""

from functools import lru_cache

from supabase import Client, create_client

from config import get_settings


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    """Return a cached singleton Supabase client.

    The service_role_key bypasses Row Level Security — all repository
    methods must explicitly filter by user_id to enforce data isolation.
    """
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
