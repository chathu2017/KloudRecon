# Drops and recreates the LOCAL database, re-runs migrations and seeds dev data.
# Stop the API and worker first. Run from the repository root: .\scripts\reset-db.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$compose = Join-Path $root 'docker-compose.dev.yml'

Write-Host 'Recreating database kloudrecon...' -ForegroundColor Yellow
docker compose -f $compose exec -T postgres psql -U kloudrecon -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'kloudrecon' AND pid <> pg_backend_pid();"
docker compose -f $compose exec -T postgres psql -U kloudrecon -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS kloudrecon;"
docker compose -f $compose exec -T postgres psql -U kloudrecon -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE kloudrecon OWNER kloudrecon;"
docker compose -f $compose exec -T postgres psql -U kloudrecon -d kloudrecon -v ON_ERROR_STOP=1 -c "GRANT CONNECT ON DATABASE kloudrecon TO kloudrecon_app; GRANT USAGE ON SCHEMA public TO kloudrecon_app; ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kloudrecon_app; ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO kloudrecon_app;"

Push-Location $backend
& .\.venv\Scripts\alembic.exe upgrade head
& .\.venv\Scripts\python.exe -m kloudrecon.cli seed-dev
# Demo organization and made-up accounts only with the dev login (AUTH_MODE=dev). With the real
# sign-in (AUTH_MODE=local) the database holds only what real people create.
$authMode = (Select-String -Path (Join-Path $backend '.env') -Pattern '^AUTH_MODE=(.*)$' | Select-Object -First 1).Matches.Groups[1].Value
if ($authMode -eq 'dev') { & .\.venv\Scripts\python.exe -m kloudrecon.cli seed-demo }
Pop-Location
Write-Host 'Done.' -ForegroundColor Green
