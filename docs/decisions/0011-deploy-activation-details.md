# 0011 — Deployment details not spelled out in the guide

**Status:** accepted · Phase 1

- **Env file loading.** `/etc/kloudrecon/kloudrecon.env` contains values with `;` (the App
  Insights connection string), so shell `source` would break it. systemd reads it natively
  (`EnvironmentFile=`); CLI tasks outside systemd (migrations in `kloudrecon-activate`, manual
  `kloudrecon.cli` commands) set `KLOUDRECON_ENV_FILE=/etc/kloudrecon/kloudrecon.env` and the
  settings loader reads the file itself.
- **Caddyfile drift check** ignores the `email` line, because the owner edits it on the server.
- **Activation** switches `current` atomically (`ln -sfn` + `mv -T`), rolls back to the previous
  release when `/api/v1/health` is not healthy within 60 s, and never prunes the active or the
  previous release.
- **Default plans** are created by migration `0002` (idempotent, `ON CONFLICT DO NOTHING`), so a
  fresh production database has plans to approve customers with. The migration holds its own
  data snapshot instead of importing application code.
- **Backups** (`python -m kloudrecon.ops.backup`) use `DATABASE_MIGRATION_URL` (owner role,
  BYPASSRLS) so the dump includes every tenant, upload with the managed identity, and prune dumps
  older than 30 days (the Blob lifecycle rule is a second safety net).
