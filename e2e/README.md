# Tests E2E — TimeGuard (Playwright)

## Architecture de configuration

```
Variables système PowerShell   ← priorité maximale
         ↓
.env.local                     ← identifiants sensibles (jamais committer)
         ↓
.env.remote  (E2E_ENV=remote)  ← URLs serveur production
.env.local   (E2E_ENV=local)   ← URLs serveur dev
         ↓
.env                           ← valeurs partagées (par défaut)
         ↓
Valeurs par défaut (localhost) ← si rien n'est défini
```

---

## Prérequis

```bash
cd e2e
npm install
npx playwright install chromium
```

---

## Lancer sur le serveur DISTANT (`http://timeguards.net`)

### Option A — Script PowerShell (recommandé)

```powershell
# 1. Créer .env.local avec les identifiants réels
Copy-Item .env.local.example .env.local
# Éditer .env.local : renseigner TEST_ADMIN_USER, TEST_ADMIN_PASS, etc.

# 2. Lancer tous les tests
.\run-remote.ps1

# Avec le navigateur visible (debug)
.\run-remote.ps1 -Headed

# Un seul scénario
.\run-remote.ps1 -Filter "02-pointage"

# Identifiants en ligne de commande (sans .env.local)
.\run-remote.ps1 -AdminUser "monAdmin" -AdminPass "monMDP"
```

### Option B — Variables d'environnement manuelles

```powershell
$env:E2E_ENV          = "remote"
$env:E2E_BASE_URL     = "http://timeguards.net"
$env:E2E_API_URL      = "http://timeguards.net"
$env:TEST_ADMIN_USER  = "votre_admin"
$env:TEST_ADMIN_PASS  = "votre_mot_de_passe"
$env:TEST_EMP_USER    = "votre_employe"
$env:TEST_EMP_PASS    = "emp_mot_de_passe"

npx playwright test --config=playwright.config.ts
```

### Option C — npm script

```bash
npm run test:remote
# (nécessite .env.local avec les identifiants)
```

---

## Lancer en LOCAL (dev)

```bash
# Démarrer l'API et Angular d'abord, puis :
npm test
# OU
npx playwright test --config=playwright.config.ts
```

---

## Variables d'environnement

| Variable | Description | Défaut |
|----------|-------------|--------|
| `E2E_BASE_URL` | URL de l'app Angular | `http://localhost:4200` |
| `E2E_API_URL` | URL directe de l'API | `https://localhost:56537` |
| `E2E_IGNORE_HTTPS` | Ignorer erreurs cert HTTPS | `false` |
| `E2E_TIMEOUT` | Timeout par test (ms) | `30000` |
| `TEST_ADMIN_USER` | Login compte admin | `admin` |
| `TEST_ADMIN_PASS` | Mot de passe admin | _(vide)_ |
| `TEST_EMP_USER` | Login compte employé | `employe1` |
| `TEST_EMP_PASS` | Mot de passe employé | _(vide)_ |
| `E2E_ENV` | Nom du fichier .env à charger | `local` |

---

## Configuration IIS — URL de l'API

Selon la configuration IIS du serveur `timeguards.net` :

**Cas 1 — API sur le même domaine (reverse proxy IIS)**
```
E2E_API_URL=http://timeguards.net
# L'helper ajoute automatiquement /api → http://timeguards.net/api/auth/login
```

**Cas 2 — API sur un port dédié**
```
E2E_API_URL=http://timeguards.net:56537
# L'helper appelle directement http://timeguards.net:56537/api/auth/login
```

**Cas 3 — HTTPS avec certificat auto-signé**
```
E2E_API_URL=https://timeguards.net
E2E_IGNORE_HTTPS=true
```

---

## Rapport de test

```bash
# Après l'exécution
npx playwright show-report playwright-report
# OU
npm run report
```

Le rapport HTML est généré dans `e2e/playwright-report/`.

---

## Structure

```
e2e/
├── playwright.config.ts     Config (baseURL, timeouts, env vars)
├── tsconfig.json
├── .env.example             Template — copier en .env.local
├── .env.local.example       Template identifiants — copier en .env.local
├── .env.remote              URLs production (timeguards.net)
├── .env.local               Identifiants réels (ignoré Git)
├── .gitignore               Exclut node_modules, rapports, .env.local
├── run-remote.ps1           Script PowerShell clé en main
├── helpers/
│   ├── credentials.ts       URLs + identifiants (depuis env vars)
│   ├── auth.helper.ts       loginAs(), logout()
│   └── api.helper.ts        apiGet/Post/Delete (résout /api automatiquement)
└── scenarios/
    ├── 01-login.spec.ts
    ├── 02-pointage.spec.ts
    ├── 03-facturation.spec.ts
    ├── 04-envoi-facture.spec.ts
    ├── 05-employe.spec.ts
    └── 06-gains-cumulatifs.spec.ts
```
