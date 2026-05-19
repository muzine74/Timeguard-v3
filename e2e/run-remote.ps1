<#
.SYNOPSIS
    Lance les tests E2E Playwright contre le serveur de production timeguards.net

.DESCRIPTION
    Configure les variables d'environnement pour cibler le serveur distant,
    installe les dépendances si nécessaire, puis exécute Playwright.

.PARAMETER Headed
    Ouvrir le navigateur (mode visible) — utile pour déboguer en remote.

.PARAMETER Filter
    Filtrer les scénarios. Ex: -Filter "01-login" ou -Filter "pointage"

.PARAMETER AdminUser
    Identifiant admin (priorité sur .env.local)

.PARAMETER AdminPass
    Mot de passe admin (priorité sur .env.local)

.PARAMETER EmpUser
    Identifiant employé

.PARAMETER EmpPass
    Mot de passe employé

.EXAMPLE
    .\run-remote.ps1
    .\run-remote.ps1 -Headed
    .\run-remote.ps1 -Filter "02-pointage"
    .\run-remote.ps1 -AdminUser "monAdmin" -AdminPass "monMDP"
#>

param(
    [switch] $Headed,
    [string] $Filter    = "",
    [string] $AdminUser = "",
    [string] $AdminPass = "",
    [string] $EmpUser   = "",
    [string] $EmpPass   = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── 1. Vérifier que Node est installé ────────────────────────────────────────
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js introuvable. Installer Node depuis https://nodejs.org"
}

# ── 2. Installer les dépendances si absent ───────────────────────────────────
if (-not (Test-Path "$PSScriptRoot\node_modules")) {
    Write-Host "`n📦 Installation des dépendances..." -ForegroundColor Cyan
    Push-Location $PSScriptRoot
    npm install
    npx playwright install chromium
    Pop-Location
}

# ── 3. Variables d'environnement ─────────────────────────────────────────────
$env:E2E_ENV          = "remote"
$env:E2E_BASE_URL     = "http://timeguards.net"
$env:E2E_API_URL      = "http://timeguards.net"   # Ajuster si API sur port dédié
$env:E2E_IGNORE_HTTPS = "false"
$env:E2E_TIMEOUT      = "45000"

# Identifiants passés en paramètre (priorité haute)
if ($AdminUser) { $env:TEST_ADMIN_USER = $AdminUser }
if ($AdminPass) { $env:TEST_ADMIN_PASS = $AdminPass }
if ($EmpUser)   { $env:TEST_EMP_USER   = $EmpUser }
if ($EmpPass)   { $env:TEST_EMP_PASS   = $EmpPass }

# Lire .env.local si présent (identifiants en fallback)
$envLocal = "$PSScriptRoot\.env.local"
if (Test-Path $envLocal) {
    Get-Content $envLocal | ForEach-Object {
        if ($_ -match "^([^#=]+)=(.*)$") {
            $key = $Matches[1].Trim()
            $val = $Matches[2].Trim()
            # Ne pas écraser les valeurs déjà définies
            if (-not [System.Environment]::GetEnvironmentVariable($key)) {
                [System.Environment]::SetEnvironmentVariable($key, $val)
            }
        }
    }
}

# ── 4. Vérifier que les identifiants sont définis ────────────────────────────
if (-not $env:TEST_ADMIN_USER -or -not $env:TEST_ADMIN_PASS) {
    Write-Warning @"

⚠️  Identifiants manquants.
Créer le fichier .env.local :
    TEST_ADMIN_USER=votre_login
    TEST_ADMIN_PASS=votre_mot_de_passe

Ou passer en paramètre :
    .\run-remote.ps1 -AdminUser "login" -AdminPass "mdp"
"@
}

# ── 5. Construire la commande Playwright ─────────────────────────────────────
$playwrightArgs = @("playwright", "test")
if ($Headed) { $playwrightArgs += "--headed" }
if ($Filter)  { $playwrightArgs += $Filter }
$playwrightArgs += "--config=$PSScriptRoot\playwright.config.ts"

Write-Host "`n🎭 Tests E2E → $($env:E2E_BASE_URL)" -ForegroundColor Green
Write-Host "   Admin : $($env:TEST_ADMIN_USER ?? '(non défini)')" -ForegroundColor Gray
if ($Filter) { Write-Host "   Filtre : $Filter" -ForegroundColor Gray }
Write-Host ""

# ── 6. Exécuter ──────────────────────────────────────────────────────────────
Push-Location $PSScriptRoot
try {
    & npx @playwrightArgs
    $exitCode = $LASTEXITCODE
} finally {
    Pop-Location
}

# ── 7. Rapport ───────────────────────────────────────────────────────────────
if ($exitCode -ne 0) {
    Write-Host "`n📊 Ouvrir le rapport : npx playwright show-report e2e/playwright-report" -ForegroundColor Yellow
}

exit $exitCode
