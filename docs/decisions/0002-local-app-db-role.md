# 0002 — Local app connects as `kloudrecon_app`, not the Docker superuser

**Status:** accepted · Phase 1

**Context.** Plan Section 20 shows the local `DATABASE_URL` using `kloudrecon:kloudrecon`, which
is the `postgres:16` container superuser. Superusers bypass Row-Level Security, even with
`FORCE ROW LEVEL SECURITY`, so tenant isolation would not be exercised locally or in tests.

**Decision.** `docker-compose.dev.yml` mounts `deploy/postgres/local/00-local-init.sql`, which
creates a normal login role `kloudrecon_app` (password `kloudrecon_app`, local only) and the
`kloudrecon_test` database. Locally:

- `DATABASE_URL` → `kloudrecon_app` (RLS enforced, like production)
- `DATABASE_MIGRATION_URL` → `kloudrecon` (owns tables, like `kloudrecon_owner`)

Migrations grant DML on all tables to `kloudrecon_app` when that role exists, so grants are
correct locally, in CI and in production. Tests create `kloudrecon_app` if it is missing
(the CI service container has no init script).
