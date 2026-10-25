# Restore runbook

Two independent backups exist (infra guide E3):

| Backup | What | Where | Retention |
|---|---|---|---|
| Nightly database dump | `pg_dump -Fc` of the whole `kloudrecon` database (owner role, bypasses RLS) | Blob `db-backups/kloudrecon-YYYYMMDD-HHMMSS.dump` | 30 days |
| VM backup | Whole VM (OS + PostgreSQL data disk) | Recovery Services vault `rsv-kloudrecon-prod` | 14 days |

Customer client secrets and webhook URLs are **not** in the database (Key Vault, soft delete 90
days + purge protection). Reports, snapshots and diagrams are in Blob (soft delete 14 days,
versioning). A database restore therefore brings back references to secrets and files that still
exist.

Choose:
- **Data mistake or corruption** (bad migration, accidental deletion): restore the **database
  dump** (A).
- **VM lost or broken** (disk failure, bad OS update): restore the **VM** (B).
- **A single Key Vault secret deleted by mistake**: Key Vault → *Manage deleted secrets* →
  Recover (C).

## A. Restore the database from a dump (≈ 15 minutes)

1. Announce maintenance (Owner → Announcements) if customers are active.
2. Pick the dump: portal → `stkloudreconprod` → container `db-backups` → download the file from
   before the problem. Copy it to the VM:
   `scp -i <key.pem> kloudrecon-YYYYMMDD-HHMMSS.dump azureuser@<VM_IP>:/tmp/`
3. On the VM:
   ```bash
   sudo systemctl stop kloudrecon-api kloudrecon-worker
   # keep a copy of the current state, just in case
   sudo -u kloudrecon pg_dump -Fc -d "host=/var/run/postgresql dbname=kloudrecon user=kloudrecon_owner" \
        -f /tmp/kloudrecon-before-restore.dump
   sudo chown kloudrecon /tmp/kloudrecon-YYYYMMDD-HHMMSS.dump
   sudo -u kloudrecon pg_restore --clean --if-exists --no-owner \
        -d "host=/var/run/postgresql dbname=kloudrecon user=kloudrecon_owner" \
        /tmp/kloudrecon-YYYYMMDD-HHMMSS.dump
   ```
4. Re-apply grants and bring the schema to the running release (migrations are idempotent):
   ```bash
   sudo -u postgres psql -d kloudrecon -f /opt/kloudrecon/current/deploy/postgres/init.sql 2>/dev/null || true
   cd /opt/kloudrecon/current/backend
   sudo -u kloudrecon bash -c 'set -a; . /etc/kloudrecon/kloudrecon.env; export DATABASE_URL=$DATABASE_MIGRATION_URL; .venv/bin/alembic upgrade head'
   ```
5. Start and verify:
   ```bash
   sudo systemctl start kloudrecon-api kloudrecon-worker
   curl -s https://api.azurerec.kloudschool.com/api/v1/health/ready
   ```
   Sign in, open Owner → System health (worker healthy, no dead jobs), open a customer via *View
   as organization* and check the latest scan.
6. Delete the copied dumps from `/tmp` (they contain customer metadata).

Data written after the dump (scans, findings workflow, settings) is lost; scans simply run again
at the next schedule, cost data is re-imported by the next scan.

## B. Restore the VM (≈ 1 hour)

1. Portal → Recovery Services vault `rsv-kloudrecon-prod` → Backup items → Azure Virtual Machine →
   `vm-kloudrecon-prod` → **Restore VM**.
2. Choose a restore point. Either **Replace existing** (same VM, same IP, fastest) or **Create new**
   (then move the public IP `pip-kloudrecon-vm` to the new NIC so DNS stays valid).
3. After boot: `systemctl status kloudrecon-api kloudrecon-worker caddy postgresql`.
4. If you created a new VM: enable its **system-assigned managed identity** and repeat the role
   assignments in infra guide A10 (the identity is new), then re-register the GitHub runner
   (infra guide C7) if the runner service does not come back.
5. If the database is older than you want, continue with **A** using a newer dump.

## C. Recover a deleted Key Vault secret

Portal → `kv-kloudrecon-prod` → Secrets → *Manage deleted secrets* → select → **Recover**. The
connection works again at the next scan. If the secret was deleted because the organization was
deleted by its owner, do not recover it.

## Test restores quarterly

Restore the newest dump into a scratch database on the VM and count rows:

```bash
sudo -u postgres createdb -O kloudrecon_owner kloudrecon_restore_test
sudo -u kloudrecon pg_restore --no-owner -d "host=/var/run/postgresql dbname=kloudrecon_restore_test user=kloudrecon_owner" /tmp/<dump>
sudo -u kloudrecon psql "host=/var/run/postgresql dbname=kloudrecon_restore_test user=kloudrecon_owner" \
     -c "select count(*) from organizations; select count(*) from scans;"
sudo -u postgres dropdb kloudrecon_restore_test
```

Record the date and result in the owner notes.
