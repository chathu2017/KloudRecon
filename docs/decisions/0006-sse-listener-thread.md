# 0006 — PostgreSQL LISTEN runs in a thread, not an async connection

**Status:** accepted · Phase 1

psycopg's async connections need a selector event loop, but on Windows uvicorn may run the
Proactor loop (it depends on `--reload`/workers). To make SSE work identically on Windows and
Linux, the API holds one sync psycopg connection in `LISTEN org_events` on a daemon thread
(`notify/listener.py`) and forwards notifications to asyncio queues with
`loop.call_soon_threadsafe`. Each gunicorn worker process has its own listener.
