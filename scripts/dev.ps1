# Starts the full local stack on Windows: support services (Docker), then the API, worker and
# web app, each in its own PowerShell window. Run from the repository root: .\scripts\dev.ps1
[CmdletBinding()]
param(
    [switch]$SkipDocker
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$web = Join-Path $root 'apps\web'
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

if (-not $SkipDocker) {
    Write-Host 'Starting PostgreSQL, Azurite and Mailpit...' -ForegroundColor Cyan
    docker compose -f (Join-Path $root 'docker-compose.dev.yml') up -d --wait
}

if (-not (Test-Path (Join-Path $backend '.venv'))) {
    Write-Host 'Creating backend virtual environment (first run)...' -ForegroundColor Cyan
    Push-Location $backend
    py -3.12 -m venv .venv
    & .\.venv\Scripts\python.exe -m pip install --upgrade pip
    & .\.venv\Scripts\python.exe -m pip install -e '.[dev]'
    # Chromium for PDF reports (rendered by the worker)
    & .\.venv\Scripts\playwright.exe install chromium
    Pop-Location
}
if (-not (Test-Path (Join-Path $backend '.env'))) {
    Copy-Item (Join-Path $backend '.env.example') (Join-Path $backend '.env')
}
if (-not (Test-Path (Join-Path $web '.env.local'))) {
    Copy-Item (Join-Path $web '.env.example') (Join-Path $web '.env.local')
}

Write-Host 'Applying migrations and seeding dev data...' -ForegroundColor Cyan
Push-Location $backend
& .\.venv\Scripts\alembic.exe upgrade head
& .\.venv\Scripts\python.exe -m kloudrecon.cli seed-dev
# Demo organization and made-up accounts only with the dev login (AUTH_MODE=dev). With the real
# sign-in (AUTH_MODE=local) the database holds only what real people create.
$authMode = (Select-String -Path (Join-Path $backend '.env') -Pattern '^AUTH_MODE=(.*)$' | Select-Object -First 1).Matches.Groups[1].Value
if ($authMode -eq 'dev') { & .\.venv\Scripts\python.exe -m kloudrecon.cli seed-demo }
Pop-Location

if (-not (Test-Path (Join-Path $web 'node_modules'))) {
    Push-Location $web; npm install; Pop-Location
}

$api = "Set-Location '$backend'; .\.venv\Scripts\Activate.ps1; uvicorn kloudrecon.api.main:app --reload --timeout-graceful-shutdown 3 --port 8000"
$worker = "Set-Location '$backend'; .\.venv\Scripts\Activate.ps1; python -m kloudrecon.worker.main"
$webCmd = "Set-Location '$web'; npm run dev"

Start-Process $shell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='KloudRecon API'; $api"
Start-Process $shell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='KloudRecon Worker'; $worker"
Start-Process $shell -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle='KloudRecon Web'; $webCmd"

Write-Host ''
Write-Host 'KloudRecon is starting:' -ForegroundColor Green
Write-Host '  Web app   http://localhost:5173'
Write-Host '  API docs  http://localhost:8000/api/docs'
Write-Host '  Mailpit   http://localhost:8025'
if ($authMode -eq 'dev') {
    Write-Host '  Dev users demo@contoso.test (Demo Mode), owner@local.test, admin@acme.test, pending@new.test'
} else {
    Write-Host '  Sign-in   one-time codes by email (codes arrive in Mailpit until ACS is configured)'
}
