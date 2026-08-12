@echo off
REM S0.5 Demo build & pack script for HR + Finance verification portals (Windows cmd, works on bare VPS/Windows dev box)
REM Boundary (S0.2 not signed yet): NO Terraform, NO AWS calls, NO real IdP, NO real bank/HRIS/ERP APIs.
REM Output: e:\PayEase\dist-demo\hr-verify-portal.zip + finance-verify-portal.zip (static dist only)
setlocal enabledelayedexpansion
set ROOT=%~dp0..
cd /d "%ROOT%" || exit /b 2

where pnpm.cmd >nul 2>nul
if errorlevel 1 ( echo [ERROR] pnpm not found in PATH. S0.5 build requires pnpm >= 9.12.0 via corepack. & exit /b 2 )

echo [STEP 1/6] typecheck shared-money + shared-security + partner-contracts + both portals
call pnpm.cmd --filter @payease/shared-money run build || exit /b 1
call pnpm.cmd --filter @payease/partner-contracts run typecheck || exit /b 1
call pnpm.cmd --filter @payease/hr-verify-portal run typecheck || exit /b 1
call pnpm.cmd --filter @payease/finance-verify-portal run typecheck || exit /b 1

echo [STEP 2/6] build HR dist
call pnpm.cmd --filter @payease/hr-verify-portal run build || exit /b 1

echo [STEP 3/6] build Finance dist
call pnpm.cmd --filter @payease/finance-verify-portal run build || exit /b 1

echo [STEP 4/6] NETWORK ZERO ASSERTION: application source must not call fetch/axios/WebSocket/real-bank-SDK identifiers
REM Vite emits a harmless fetch() module-preload helper in every production bundle; scan authored app sources instead.
set NETWORK_FAIL=0
echo    scanning authored HR application source for real-network tokens...
findstr /S /R /I /C:"fetch(" /C:"XMLHttpRequest" /C:"WebSocket(" /C:"axios" /C:"\.ababank\.com" /C:"wingmoney\.com" /C:"acledabank\.com\.kh" /C:"stripe\.com" /C:"payway\.com\.kh" /C:"sap\." /C:"oracle\.com" /C:"quickbooks" /C:"xero" "hr-verify-portal\src\App.tsx" "hr-verify-portal\src\pages\*.ts" "hr-verify-portal\src\pages\*.tsx" "hr-verify-portal\src\mocks\*.ts" >nul 2>nul
if not errorlevel 1 ( echo [FAIL] HR application source contains network call markers. Network zero assertion FAILED. & set NETWORK_FAIL=1 ) else ( echo    hr network zero: OK )
echo    scanning authored Finance application source for real-network tokens...
findstr /S /R /I /C:"fetch(" /C:"XMLHttpRequest" /C:"WebSocket(" /C:"axios" /C:"\.ababank\.com" /C:"wingmoney\.com" /C:"acledabank\.com\.kh" /C:"stripe\.com" /C:"payway\.com\.kh" /C:"sap\." /C:"oracle\.com" /C:"quickbooks" /C:"xero" "finance-verify-portal\src\App.tsx" "finance-verify-portal\src\pages\*.ts" "finance-verify-portal\src\pages\*.tsx" "finance-verify-portal\src\mocks\*.ts" >nul 2>nul
if not errorlevel 1 ( echo [FAIL] Finance application source contains network call markers. Network zero assertion FAILED. & set NETWORK_FAIL=1 ) else ( echo    finance network zero: OK )
if %NETWORK_FAIL% neq 0 exit /b 1

echo [STEP 5/6] AMOUNT STRING MINOR UNIT ASSERTION: dist must not contain JS number for amountMinor
set AMOUNT_FAIL=0
echo    scanning hr dist for amountMinor:<numeric_literal> pattern...
findstr /R /C:"amountMinor:[0-9]" "hr-verify-portal\dist\assets\*.js" >nul 2>nul
if not errorlevel 1 ( echo [FAIL] hr-verify-portal dist has JS number for amountMinor. CI-10 FAILED. & set AMOUNT_FAIL=1 ) else ( echo    hr amountMinor string: OK )
echo    scanning finance dist for amountMinor:<numeric_literal> pattern...
findstr /R /C:"amountMinor:[0-9]" "finance-verify-portal\dist\assets\*.js" >nul 2>nul
if not errorlevel 1 ( echo [FAIL] finance-verify-portal dist has JS number for amountMinor. CI-10 FAILED. & set AMOUNT_FAIL=1 ) else ( echo    finance amountMinor string: OK )
if %AMOUNT_FAIL% neq 0 exit /b 1

echo [STEP 6/6] pack zips to dist-demo for VPS upload (HTTP Basic Auth + nginx/static only)
if not exist "dist-demo" mkdir dist-demo
where tar >nul 2>nul
if errorlevel 1 ( echo [WARN] tar not found; skip zip packing. Copy hr-verify-portal/dist and finance-verify-portal/dist to VPS manually. ) else (
  tar.exe -a -c -f "dist-demo\hr-verify-portal.zip" -C "hr-verify-portal\dist" . || exit /b 1
  tar.exe -a -c -f "dist-demo\finance-verify-portal.zip" -C "finance-verify-portal\dist" . || exit /b 1
  echo    packed: dist-demo\hr-verify-portal.zip
  echo    packed: dist-demo\finance-verify-portal.zip
)

echo [DONE] S0.5 demo build + network-zero + amount-string assertions ALL PASSED.
echo        Deploy zips to password-protected VPS static hosting (nginx/Caddy + HTTP Basic Auth + HTTPS) only.
echo        Do NOT connect demo domains to AWS broker-prod / lender-prod / employer-prod accounts (S0.2 red line).
exit /b 0
