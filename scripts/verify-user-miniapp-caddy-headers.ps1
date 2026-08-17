# =============================================================================
# PayEase User Mini App  Caddy Header Acceptance Probe (PowerShell 5+)
# Usage on VPS operator's Windows workstation:
#   powershell.exe -NoProfile -File .\scripts\verify-user-miniapp-caddy-headers.ps1 -Hostname app.payease-example.kh
#
# All 8 checks MUST pass.  Any FAIL = do NOT flip production DNS.
# COMPAT: PowerShell 5 (Windows Inbox).  Do NOT use PS7-only syntax.
# =============================================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$Hostname,

    [string]$UserAgent = "PayEase-Caddy-Acceptance/1.0 (+https://payease-example.kh/security.txt)"
)

$ErrorActionPreference = "Stop"
$baseUrl = "https://$Hostname/"
$failCount = 0

function Write-CheckResult {
    param(
        [string]$Name,
        [bool]$Pass,
        [string]$Detail = ""
    )
    if ($Pass) { $color = "Green" } else { $color = "Red" }
    if ($Pass) { $tag = "PASS" } else { $tag = "FAIL" }
    Write-Host "[$tag] $Name" -ForegroundColor $color
    if ($Detail) { Write-Host "       $Detail" -ForegroundColor Gray }
    if (-not $Pass) { $script:failCount++ }
}

Write-Host "== PayEase User Mini App Caddy Header Acceptance =="
Write-Host "   Target  : $baseUrl"
Write-Host "   UA      : $UserAgent"
Write-Host ""

# Fetch headers once via HEAD (or fallback to GET with -Method Head)
$headers = @{}
$statusCode = 0
try {
    $response = Invoke-WebRequest -Uri $baseUrl -Method Head -UserAgent $UserAgent -UseBasicParsing -TimeoutSec 15
    foreach ($key in $response.Headers.Keys) {
        $headers[$key.ToLowerInvariant()] = $response.Headers[$key] -join ", "
    }
    $statusCode = [int]$response.StatusCode
} catch {
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
        foreach ($key in $_.Exception.Response.Headers.Keys) {
            $val = $_.Exception.Response.Headers[$key]
            $headers[$key.ToString().ToLowerInvariant()] = ($val -join ", ")
        }
    } else {
        Write-Host "[CRIT] HEAD request failed: $($_.Exception.Message)" -ForegroundColor Red
        exit 2
    }
}

Write-CheckResult -Name "01. HTTP status is 200 OK on / (SPA fallback serves index.html)" `
    -Pass ($statusCode -eq 200) `
    -Detail "Got $statusCode"

# -----------------------------------------------------------------------------
# 02. X-Frame-Options ABSENT
# -----------------------------------------------------------------------------
$xfoAbsent = -not $headers.ContainsKey("x-frame-options")
if ($xfoAbsent) {
    $xfoDetail = "Correctly absent"
} else {
    $xfoDetail = "Unexpectedly present: $($headers['x-frame-options'])"
}
Write-CheckResult -Name "02. X-Frame-Options header is NOT present (removed; CSP frame-ancestors governs)" `
    -Pass $xfoAbsent `
    -Detail $xfoDetail

# -----------------------------------------------------------------------------
# 03. CSP PRESENT + frame-ancestors HAS NO 'self'
# -----------------------------------------------------------------------------
$csp = $headers["content-security-policy"]
$hasCsp = [string]::IsNullOrWhiteSpace($csp) -eq $false
if ($hasCsp) {
    $cspDetail = "Found (length $($csp.Length) chars)"
} else {
    $cspDetail = "MISSING  CSP not delivered as HTTP response header"
}
Write-CheckResult -Name "03a. Content-Security-Policy header is PRESENT (not meta-tag only)" `
    -Pass $hasCsp `
    -Detail $cspDetail

if ($hasCsp) {
    # Normalize for tokenization: split on ';' and trim
    $directives = @{}
    foreach ($chunk in ($csp -split ";")) {
        $t = $chunk.Trim()
        if ($t -match "^(?<name>[a-z-]+)\s+(?<val>.*)$") {
            $directives[$Matches.name.ToLowerInvariant()] = $Matches.val
        }
    }

    $frameAncestors = $directives["frame-ancestors"]
    $faPresent = [string]::IsNullOrWhiteSpace($frameAncestors) -eq $false
    $faNoSelf = $false
    if ($faPresent) {
        $noSelfMatch = ($frameAncestors -match "'self'") -eq $false
        $noNoneMatch = ($frameAncestors -match "'none'") -eq $false
        $faNoSelf = $noSelfMatch -and $noNoneMatch
    }
    if ($faPresent) {
        $faDetail = "frame-ancestors = $frameAncestors"
    } else {
        $faDetail = "frame-ancestors = (missing directive)"
    }
    Write-CheckResult -Name "03b. CSP frame-ancestors does NOT contain 'self' or 'none'" `
        -Pass $faNoSelf `
        -Detail $faDetail

    # 03c. img-src MUST contain ALL of {'self', data:, https://t.me, https://www.t.me}
    #      AND MUST NOT contain any other tokens.  Failure on either side.
    $imgSrc = $directives["img-src"]
    $requiredImg = @("'self'", "data:", "https://t.me", "https://www.t.me")
    $imgMissing = @()
    $imgBad = @()
    if ($imgSrc) {
        $imgTokens = @()
        foreach ($t in ($imgSrc -split "\s+")) { if ($t) { $imgTokens += $t } }
        foreach ($req in $requiredImg) {
            if ($imgTokens -notcontains $req) { $imgMissing += $req }
        }
        foreach ($tok in $imgTokens) {
            if ($requiredImg -notcontains $tok) { $imgBad += $tok }
        }
        $imgLocked = ($imgMissing.Count -eq 0) -and ($imgBad.Count -eq 0)
        $imgDetail = "img-src = $imgSrc"
    } else {
        $imgTokens = @()
        $imgMissing = @($requiredImg)
        $imgLocked = $false
        $imgDetail = "img-src = (missing directive)"
    }
    if ($imgMissing.Count -gt 0) { $imgDetail = $imgDetail + "  MISSING TOKENS: $($imgMissing -join ', ')" }
    if ($imgBad.Count -gt 0) { $imgDetail = $imgDetail + "  UNEXPECTED TOKENS: $($imgBad -join ', ')" }
    Write-CheckResult -Name "03c. CSP img-src contains EXACTLY ('self' data: https://t.me https://www.t.me) — all four, no extras" `
        -Pass $imgLocked `
        -Detail $imgDetail

    # 03d. frame-ancestors list contains ONLY origins (no paths, no trailing slashes)
    if ($frameAncestors) {
        $faTokens = ($frameAncestors -split "\s+") | Where-Object { $_ }
        $faBadShape = @()
        foreach ($o in $faTokens) {
            if ($o -match "^https?://") {
                $u = New-Object System.Uri($o)
                if ($u.AbsolutePath -ne "/" -or $u.Query -ne "" -or $o.EndsWith("/")) { $faBadShape += $o }
            }
        }
        $faOriginsOnly = $faBadShape.Count -eq 0
        if ($faBadShape.Count -gt 0) {
            $fsDetail = "Bad entries: $($faBadShape -join ', ')"
        } else {
            $count = ($faTokens | Measure-Object).Count
            $fsDetail = "All OK (count=$count)"
        }
        Write-CheckResult -Name "03d. frame-ancestors values are bare origins (no paths, no trailing slashes, no query)" `
            -Pass $faOriginsOnly `
            -Detail $fsDetail
    }
}

# -----------------------------------------------------------------------------
# 04. HSTS PRESENT
# -----------------------------------------------------------------------------
$hsts = $headers["strict-transport-security"]
$hstsOk = [string]::IsNullOrWhiteSpace($hsts) -eq $false
if ($hstsOk) {
    $hstsOk = ($hsts -match "max-age=\d{5,}") -and ($hsts -match "includeSubDomains")
}
if ([string]::IsNullOrWhiteSpace($hsts)) {
    $hstsDetail = "MISSING"
} else {
    $hstsDetail = $hsts
}
Write-CheckResult -Name "04. Strict-Transport-Security present (>= 1 year, includeSubDomains)" `
    -Pass $hstsOk `
    -Detail $hstsDetail

# -----------------------------------------------------------------------------
# 05. nosniff
# -----------------------------------------------------------------------------
$xcto = $headers["x-content-type-options"]
$xctoOk = $xcto -ieq "nosniff"
if ([string]::IsNullOrWhiteSpace($xcto)) {
    $xctoDetail = "MISSING"
} else {
    $xctoDetail = $xcto
}
Write-CheckResult -Name "05. X-Content-Type-Options = nosniff" `
    -Pass $xctoOk `
    -Detail $xctoDetail

# -----------------------------------------------------------------------------
# 06. Permissions-Policy disables high-risk defaults
# -----------------------------------------------------------------------------
$pp = $headers["permissions-policy"]
$ppOk = [string]::IsNullOrWhiteSpace($pp) -eq $false
if ($ppOk) {
    $ppOk = ($pp -match "geolocation=\(\)") -and ($pp -match "payment=\(\)")
}
if ([string]::IsNullOrWhiteSpace($pp)) {
    $ppDetail = "MISSING"
} else {
    $ppDetail = $pp
}
Write-CheckResult -Name "06. Permissions-Policy present and blocks geolocation=() payment=()" `
    -Pass $ppOk `
    -Detail $ppDetail

# -----------------------------------------------------------------------------
# 07. Referrer-Policy strict or no-referrer
# -----------------------------------------------------------------------------
$rp = $headers["referrer-policy"]
$rpOk = ($rp -ieq "no-referrer") -or ($rp -ieq "strict-origin-when-cross-origin") -or ($rp -ieq "strict-origin")
if ([string]::IsNullOrWhiteSpace($rp)) {
    $rpDetail = "MISSING"
} else {
    $rpDetail = $rp
}
Write-CheckResult -Name "07. Referrer-Policy is a strict value (no-referrer / strict-origin / strict-origin-when-cross-origin)" `
    -Pass $rpOk `
    -Detail $rpDetail

# -----------------------------------------------------------------------------
# 08. Hidden-file probe: /.env must be 403 or 404 (no SPA fallback to index.html 200).
#     Network errors (0 / timeout / connection refused) do NOT count as a pass.
# -----------------------------------------------------------------------------
$envStatus = -1
try {
    $envProbe = Invoke-WebRequest -Uri "https://$Hostname/.env" -Method Head -UserAgent $UserAgent -UseBasicParsing -TimeoutSec 10
    $envStatus = [int]$envProbe.StatusCode
} catch {
    if ($_.Exception.Response) {
        $envStatus = [int]$_.Exception.Response.StatusCode
    } else {
        $envStatus = -1
    }
}
$envOk = ($envStatus -eq 403) -or ($envStatus -eq 404)
if ($envStatus -lt 0) {
    $envDetail = "NETWORK ERROR (timeout / connection refused / DNS) — does NOT count as secure"
} else {
    $envDetail = "Got HTTP $envStatus  (expect 403 or 404 only)"
}
Write-CheckResult -Name "08. Hidden-file probe /.env returns HTTP 403 or 404 (no 200 fallback to SPA index.html)" `
    -Pass $envOk `
    -Detail $envDetail

# -----------------------------------------------------------------------------
# Summary
# -----------------------------------------------------------------------------
Write-Host ""
if ($failCount -eq 0) {
    Write-Host "ALL 8 CHECKS PASSED  Mini App Caddy header boundary is production-ready." -ForegroundColor Green
    Write-Host "(Manual follow-up still required: Telegram Android/iOS/Web iframe probe of frame-ancestors list)" -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "$failCount CHECK(S) FAILED  DO NOT deploy this Caddy config to production." -ForegroundColor Red
    exit 1
}
