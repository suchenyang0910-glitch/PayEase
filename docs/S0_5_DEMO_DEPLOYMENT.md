# S0.5 Demo Deployment Checklist (password-protected static VPS only; NO real data / NO AWS / NO IdP / NO bank API)

Boundary (red line until S0.2 is signed):

- Do NOT connect this VPS or these demo domains to broker-prod / lender-prod / employer-prod AWS accounts.
- Do NOT load real PII (national IDs, salary slips, bank account numbers, payroll deduction records of actual PayEase employees / customers).
- Do NOT put `fetch()`, `axios`, `XMLHttpRequest`, `WebSocket`, real HRIS/ERP/bank SDK, or any third-party analytics into `hr-verify-portal/dist` nor `finance-verify-portal/dist`. The build script `scripts/build-demo-portals.cmd` asserts on these patterns BEFORE packing a zip.

## 1. Build locally and obtain upload zips

```cmd
REM (Windows dev box, pnpm 9.12+ via corepack + Node 22.13.1+ required)
cd /d e:\PayEase
scripts\build-demo-portals.cmd
REM expected output:
REM   dist-demo\hr-verify-portal.zip   (static assets only, produced from hr-verify-portal\dist)
REM   dist-demo\finance-verify-portal.zip  (static assets only)
REM plus two assertions passed:
REM   Network-Zero: no fetch/axios/WebSocket/bank-domain markers inside dist/assets/*.js
REM   CI-10 amountMinor: never a JS number; always string minor unit inside dist/assets/*.js
```

If the build machine is Linux/macOS, use the Bash equivalent:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." &>/dev/null && pwd)"
cd "$ROOT"
for pkg in @payease/shared-money @payease/partner-contracts @payease/hr-verify-portal @payease/finance-verify-portal; do
  pnpm --filter "$pkg" run "${pkg#@payease/shared-money}" = "shared-money" ? "build" : "typecheck"
  # ^ replace the inline ternary with actual calls; the exact behaviour mirrors scripts/build-demo-portals.cmd
done
pnpm --filter @payease/hr-verify-portal run build
pnpm --filter @payease/finance-verify-portal run build
# Network-Zero assertion (HR):
if grep -R -E -I -q 'fetch\(|XMLHttpRequest|WebSocket\(|axios|\.ababank\.com|wingmoney\.com|acledabank\.com\.kh|stripe\.com|payway\.com\.kh|sap\.|oracle\.com|quickbooks|xero' hr-verify-portal/dist/assets; then
  echo "FAIL hr-verify-portal network zero"; exit 1
fi
if grep -R -E -I -q 'fetch\(|XMLHttpRequest|WebSocket\(|axios|\.ababank\.com|wingmoney\.com|acledabank\.com\.kh|stripe\.com|payway\.com\.kh|sap\.|oracle\.com|quickbooks|xero' finance-verify-portal/dist/assets; then
  echo "FAIL finance-verify-portal network zero"; exit 1
fi
# CI-10 amountMinor string assertion:
if grep -R -E -I -q 'amountMinor:[0-9]' hr-verify-portal/dist/assets; then echo "FAIL hr amountMinor number"; exit 1; fi
if grep -R -E -I -q 'amountMinor:[0-9]' finance-verify-portal/dist/assets; then echo "FAIL finance amountMinor number"; exit 1; fi
mkdir -p dist-demo
(cd hr-verify-portal/dist && zip -r "$ROOT/dist-demo/hr-verify-portal.zip" .)
(cd finance-verify-portal/dist && zip -r "$ROOT/dist-demo/finance-verify-portal.zip" .)
echo "S0.5 demo build OK"
```

## 2. VPS preconditions (Ubuntu 22.04 LTS example)

- Single VPS, shared shape 2 vCPU + 4GB RAM is enough. No AWS account, no Terraform.
- Distro packages required: `nginx`, `certbot`, `python3-certbot-nginx`, `apache2-utils` (for `htpasswd`), `unzip`, `fail2ban` (optional but recommended).
- Demo domains (replace with your real CNAMEs):
  - `HR_VERIFY_DEMO_HOST` = `hr-demo.payease.example`
  - `FIN_VERIFY_DEMO_HOST` = `fin-demo.payease.example`
- **A-records point to VPS public IPv4 (+ IPv6 if available) BEFORE running certbot.**

## 3. HTTP Basic Auth passwords

Generate SEPARATE htpasswd files per demo domain. Never share one htpasswd file across HR and Finance (separation-of-duties even in demo environments, to match S1.0 RBAC baseline).

```bash
# HR demo users: hr-officer@example.test (demo only, not real IdP)
sudo htpasswd -c /etc/nginx/.htpasswd-hr hr-officer@example.test
# Enter password: S0_5_DEMO_HR_ONLY_XXXXXXXXXXXXXXX (rotate every 30 days, log rotation)

# Finance demo users: finance-officer@example.test
sudo htpasswd -c /etc/nginx/.htpasswd-fin finance-officer@example.test
# Enter password: S0_5_DEMO_FIN_ONLY_XXXXXXXXXXXXXXX (rotate every 30 days)

# Optional customer reviewers: create per-customer accounts (one account per demo session, revoke after 7 days).
sudo htpasswd /etc/nginx/.htpasswd-hr customer-acme-hr@example.test  # then `sudo htpasswd -D` after session
sudo htpasswd /etc/nginx/.htpasswd-fin customer-acme-fin@example.test
```

Ensure permissions:

```bash
sudo chown root:www-data /etc/nginx/.htpasswd-hr /etc/nginx/.htpasswd-fin
sudo chmod 640 /etc/nginx/.htpasswd-hr /etc/nginx/.htpasswd-fin
```

## 4. Upload and unpack demo zips

```bash
# (On your local dev box, scp/sftp the two zips from dist-demo/ up to the VPS)
scp dist-demo/hr-verify-portal.zip     ubuntu@$DEMO_VPS_IP:/tmp/
scp dist-demo/finance-verify-portal.zip ubuntu@$DEMO_VPS_IP:/tmp/

# (On the VPS)
sudo mkdir -p /var/www/hr-demo /var/www/fin-demo
sudo chown ubuntu:ubuntu /var/www/hr-demo /var/www/fin-demo
unzip -q /tmp/hr-verify-portal.zip      -d /var/www/hr-demo
unzip -q /tmp/finance-verify-portal.zip -d /var/www/fin-demo
sudo chown -R www-data:www-data /var/www/hr-demo /var/www/fin-demo
sudo find /var/www/hr-demo /var/www/fin-demo -type f -exec chmod 644 {} \;
sudo find /var/www/hr-demo /var/www/fin-demo -type d -exec chmod 755 {} \;
```

Optional (recommended): **disable directory listing and hidden-file serving** in both docroots (nginx configs below include `autoindex off;`, but also remove any `.git`, `.env`, `.htaccess`, `*.log` files that might have leaked inside the zip).

```bash
sudo find /var/www/hr-demo /var/www/fin-demo \( -name ".git" -o -name ".env*" -o -name "*.log" -o -name "*.bak" \) -delete
```

## 5. Nginx virtual hosts

### /etc/nginx/sites-available/hr-demo

```nginx
server {
  listen 443 ssl http2;
  listen [::]:443 ssl http2;
  server_name HR_VERIFY_DEMO_HOST;

  # Certbot-managed certificate paths (don't edit manually; use certbot --nginx)
  ssl_certificate     /etc/letsencrypt/live/HR_VERIFY_DEMO_HOST/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/HR_VERIFY_DEMO_HOST/privkey.pem;
  include             /etc/letsencrypt/options-ssl-nginx.conf;
  ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

  # HTTP Basic Auth (Password protection - demo only)
  auth_basic           "PayEase HR Demo — Authorized Only (S0.5, no real data)";
  auth_basic_user_file /etc/nginx/.htpasswd-hr;

  # Document root
  root  /var/www/hr-demo;
  index index.html;
  autoindex off;

  # Hardened security headers (matches hr-verify-portal vite.config.ts intent for production VPS)
  add_header X-Frame-Options                   "DENY"                                  always;
  add_header Content-Security-Policy             "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self';" always;
  add_header X-Content-Type-Options              "nosniff"                                always;
  add_header Strict-Transport-Security           "max-age=31536000; includeSubDomains"    always;
  add_header Referrer-Policy                     "no-referrer"                              always;
  add_header Permissions-Policy                  "camera=(), microphone=(), geolocation=(), payment=()" always;

  # Deny access to hidden files and any accidental text/yml/json secrets
  location ~ /\. { deny all; access_log off; log_not_found off; }
  location ~* \.(log|bak|sql|pem|key|crt|p12|pfx|env|swp)$ { deny all; }

  # Vite React SPA fallback (HashRouter works even without this; adding for compatibility with BrowserRouter future migrations)
  location / {
    try_files $uri /index.html;
  }

  # Optional basic rate-limit per IP: 10 req/s burst 20 (to prevent htpasswd brute-force; fail2ban is stronger)
  limit_req_zone $binary_remote_addr zone=hrdemo:10m rate=10r/s;
  location = /login.html { limit_req zone=hrdemo burst=20 nodelay; try_files /index.html =404; }
}

# HTTP -> HTTPS redirect
server {
  listen 80;
  listen [::]:80;
  server_name HR_VERIFY_DEMO_HOST;
  return 301 https://$host$request_uri;
}
```

### /etc/nginx/sites-available/fin-demo

Identical structure with:

- `server_name FIN_VERIFY_DEMO_HOST`
- `ssl_certificate/ssl_certificate_key` point to `FIN_VERIFY_DEMO_HOST` certs
- `auth_basic_user_file /etc/nginx/.htpasswd-fin;`
- `root /var/www/fin-demo;`
- `limit_req_zone $binary_remote_addr zone=findemo:10m rate=10r/s;`

Enable and test:

```bash
sudo ln -s /etc/nginx/sites-available/hr-demo /etc/nginx/sites-enabled/hr-demo
sudo ln -s /etc/nginx/sites-available/fin-demo /etc/nginx/sites-enabled/fin-demo
sudo nginx -t  # must print "syntax is ok / test is successful"
sudo systemctl reload nginx
```

## 6. Issue TLS certificate via Let's Encrypt certbot (zero-touch)

```bash
sudo certbot --nginx -d HR_VERIFY_DEMO_HOST --non-interactive --agree-tos --redirect --email security-owner@payease.example
sudo certbot --nginx -d FIN_VERIFY_DEMO_HOST   --non-interactive --agree-tos --redirect --email security-owner@payease.example
sudo systemctl status certbot.timer  # ensure auto-renewal timer is active
```

## 7. Post-deploy acceptance gates (run from client machine, NOT on the VPS shell to avoid localhost bypass)

Seven checks MUST all pass. Any FAIL -> tear down the VPS server blocks, fix, re-deploy, then re-check.

```bash
export HR_HOST="HR_VERIFY_DEMO_HOST"
export FIN_HOST="FIN_VERIFY_DEMO_HOST"
# 7a — No auth must 401
curl -sS -o /dev/null -w "%{http_code}\n" https://$HR_HOST/            | grep -Fxq 401 || { echo "FAIL HR 401 no-auth"; exit 1; }
curl -sS -o /dev/null -w "%{http_code}\n" https://$FIN_HOST/           | grep -Fxq 401 || { echo "FAIL FIN 401 no-auth"; exit 1; }

# 7b — Wrong password must 401 (three tries; do NOT rely on lockout; rely on fail2ban after 5)
curl -sS -o /dev/null -w "%{http_code}\n" -u hr-officer@example.test:WRONG_PASSWORD https://$HR_HOST/ | grep -Fxq 401 || { echo "FAIL HR 401 wrong"; exit 1; }

# 7c — Correct password gives 200 on /employment/list and /repayment/list (HashRouter fallback)
HR_CODE=$(curl -sS -o /dev/null -w "%{http_code}" -u hr-officer@example.test:CORRECT_PASSWORD "https://$HR_HOST/#/employment/list"; echo "")
# NOTE: hash fragments (#/) stay client-side, so /index.html is what is served, expected 200 regardless.
test "$HR_CODE" = "200" || { echo "FAIL HR 200 after auth"; exit 1; }

# 7d — X-Frame-Options: DENY (back-office class)
curl -sS -D - -o /dev/null -u hr-officer@example.test:CORRECT_PASSWORD https://$HR_HOST/ | grep -i "^x-frame-options: DENY" || { echo "FAIL HR XFO DENY"; exit 1; }
curl -sS -D - -o /dev/null -u finance-officer@example.test:CORRECT_PASSWORD https://$FIN_HOST/ | grep -i "^x-frame-options: DENY" || { echo "FAIL FIN XFO DENY"; exit 1; }

# 7e — CSP frame-ancestors 'none'
curl -sS -D - -o /dev/null -u hr-officer@example.test:CORRECT_PASSWORD https://$HR_HOST/ | grep -iE "^content-security-policy:.*frame-ancestors 'none'" || { echo "FAIL HR CSP frame-ancestors"; exit 1; }

# 7f — HSTS present (only for domains going to HSTS preload; keep for demo as defense-in-depth)
curl -sS -D - -o /dev/null -u finance-officer@example.test:CORRECT_PASSWORD https://$FIN_HOST/ | grep -i "^strict-transport-security:" || { echo "FAIL FIN HSTS"; exit 1; }

# 7g — Web-08 / CI-07: no token/credential/secret/key/jwt keyword in the initial HTML document (CSP protects against injection but still check)
curl -sS -u hr-officer@example.test:CORRECT_PASSWORD https://$HR_HOST/ | grep -E -i -o 'localStorage\.setItem\(.(token|credential|password|secret|key|jwt|id_token|access_token|nonce|initData)' | wc -l | grep -Fxq 0 || { echo "FAIL HR localStorage token set found"; exit 1; }

echo "S0.5 demo deployment acceptance: ALL 7 CHECKS PASSED"
```

## 8. Session / demo lifecycle hygiene (to avoid demo leaking into Prod mindset)

- htpasswd customer accounts auto-expire at T+7d via a cron script that calls `htpasswd -D`; keep the script in `/etc/cron.weekly/expire-demo-htpasswd`.
- Every 30 days re-issue demo passwords for `hr-officer@example.test` / `finance-officer@example.test`.
- Demo domains MUST NOT be added to any SSO / enterprise IdP integration ticket; MUST NOT use a wildcard certificate covering `*.payease.example` if Prod shares that parent (use separate certs per demo host so revocation is surgical).
- If S0.2 is signed off and you plan to promote demo concepts to Staging — build a brand new host. Do NOT re-use the VPS OS image, ssh host keys, htpasswd files, or TLS cert material from the S0.5 demo.
- All demo data (names, national IDs last 4, salaries, lender names) MUST be synthetic. Any mock resembling a real person's record must be removed IMMEDIATELY. See `docs/S0_5_MOCK_DATA_GOVERNANCE.md` for field-level allowlist + forbidden-pattern list.
