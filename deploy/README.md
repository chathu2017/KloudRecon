# deploy/ — server files the owner installs by hand

These are **not** Infrastructure-as-Code. They are config files for the single Ubuntu 24.04 VM,
installed once (and re-installed when they change) as described in
`docs/02_KLOUDRECON_INFRA_AND_DEPLOYMENT.md` Part C.

| File | Installed to | Guide step |
|---|---|---|
| `postgres/init.sql` | run with `sudo -u postgres psql -f` | C4 |
| `postgres/pg_hba.snippet`, `postgres/pg_ident.snippet` | `/etc/postgresql/16/main/` | C4 |
| `postgres/tuning.conf` | `/etc/postgresql/16/main/conf.d/kloudrecon.conf` | C4 |
| `env/kloudrecon.env.example` | `/etc/kloudrecon/kloudrecon.env` (root:kloudrecon 640) | C5 |
| `caddy/Caddyfile` | `/etc/caddy/Caddyfile` (set the ACME email) | C8 |
| `bin/kloudrecon-activate` | `/usr/local/bin/kloudrecon-activate` (root, 755) | C8 |
| `sudoers/kloudrecon-deploy` | `/etc/sudoers.d/kloudrecon-deploy` (root, 440) | C8 |
| `systemd/*.service`, `systemd/*.timer` | `/etc/systemd/system/` | C8 |
| `postgres/local/00-local-init.sql` | local Docker only (never production) | — |

After the first successful Deploy run (see C8):

```bash
REL=$(ls -td /opt/kloudrecon/releases/*/ | head -1)
sudo install -o root -g root -m 755 $REL/deploy/bin/kloudrecon-activate /usr/local/bin/kloudrecon-activate
sudo install -o root -g root -m 440 $REL/deploy/sudoers/kloudrecon-deploy /etc/sudoers.d/kloudrecon-deploy
sudo visudo -c
sudo cp $REL/deploy/systemd/*.service $REL/deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable kloudrecon-api kloudrecon-worker kloudrecon-backup.timer
sudo cp $REL/deploy/caddy/Caddyfile /etc/caddy/Caddyfile   # then edit the email line
sudo systemctl reload caddy
```

The activation script warns on every deploy when an installed file differs from the release, so
you know when to repeat these commands.

Useful manual tasks (as the service user, reading the production env file):

```bash
cd /opt/kloudrecon/current/backend
sudo -u kloudrecon KLOUDRECON_ENV_FILE=/etc/kloudrecon/kloudrecon.env .venv/bin/python -m kloudrecon.cli seed-plans
sudo -u kloudrecon KLOUDRECON_ENV_FILE=/etc/kloudrecon/kloudrecon.env .venv/bin/python -m kloudrecon.cli create-owner you@example.com
sudo systemctl start kloudrecon-backup   # run a backup now
```
