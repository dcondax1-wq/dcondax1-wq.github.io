<#
STATUS (double-click STATUS.bat). The owner, 2026-11-04: "a health card for my PCs". It only LOOKS: nothing is changed, closed,
deleted or downloaded (except the one published file below), and no Administrator is needed. It prints a six line card and ONE
sentence of what to do next:

   1 DISK    free space on C:
   2 RAM     free memory
   3 BOT     is the bot running and armed, from the heartbeat the bot PC publishes (home.json: live.pc, read from the site)
   4 NINJA   is NinjaTrader running on this PC
   5 BARS    how old the last 1-minute bar is (from the same heartbeat)
   6 POWER   the power plan of this PC

Which PC is it: the MAIN PC runs the bot (the heartbeat comes from this PC's name, or the bot folder is here); any other PC (the
retired Surface) only shows its own disk, memory and power plan and where the bot runs.
A line says [OK], [SKIP] (look at it), [FIX] (needs you) or [..] (nothing to judge, or not readable). It never throws: a line that
cannot be read says so and the rest still show.

  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pc_status.ps1        (STATUS.bat runs this)
Tests: LE_STATUS_HOME_FILE=<home.json> replaces the web read; LE_T_FREE_GB / LE_T_TOTAL_GB, LE_T_RAM=<free>,<total> (GB), LE_T_NT=1|0,
LE_T_PLAN=<name>, LE_T_NOW=<unix seconds>, LE_T_ET=<yyyy-MM-dd HH:mm>, LE_T_HOST=<this PC's name>, LE_T_BOT_DIR=1|0, LE_T_BOOM=1.
#>
param([switch]$Quiet)

$ErrorActionPreference = 'Continue'
# any unexpected failure ends with ONE plain sentence, never a stack trace
trap {
    Write-Host ''
    Write-Host '  [FIX] Something unexpected stopped this: take a photo of this window and send it to Claude.' -ForegroundColor Red
    exit 1
}
if ($env:LE_T_BOOM) { throw 'test: unexpected failure' }

$SiteHome = 'https://demetrades2000-coder.github.io/nq-dashboard/home.json'
$Sep = [System.IO.Path]::DirectorySeparatorChar
function J2([string]$A, [string]$B) { return [System.IO.Path]::Combine($A, $B) }
function Line([string]$Kind, [string]$Label, [string]$Text) {
    $c = 'Gray'; if ($Kind -eq 'OK') { $c = 'Green' } elseif ($Kind -eq 'FIX') { $c = 'Red' } elseif ($Kind -eq 'SKIP') { $c = 'Yellow' }
    Write-Host ("  [{0}] {1,-6} {2}" -f $Kind, $Label, $Text) -ForegroundColor $c
}
function Get-MyHost { if ($env:LE_T_HOST) { return $env:LE_T_HOST }; if ($env:COMPUTERNAME) { return $env:COMPUTERNAME }; return [Environment]::MachineName }
function Get-Now { if ($env:LE_T_NOW) { try { return [int64]$env:LE_T_NOW } catch { } }; return [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
function Get-ET {
    if ($env:LE_T_ET) { try { return [DateTime]::Parse($env:LE_T_ET, [Globalization.CultureInfo]::InvariantCulture) } catch { } }
    foreach ($id in @('Eastern Standard Time', 'America/New_York')) {
        try { return [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, $id) } catch { }
    }
    return (Get-Date)
}
function Is-TradingWindow([DateTime]$Et) {
    if ($Et.DayOfWeek -eq 'Saturday' -or $Et.DayOfWeek -eq 'Sunday') { return $false }
    $m = $Et.Hour * 60 + $Et.Minute
    return ($m -ge 75 -and $m -lt 965)          # 01:15 - 16:05 ET, as PC care and the bot's checks
}
function Age-Text([double]$S) {
    if ($S -lt 90) { return 'just now' }
    if ($S -lt 5400) { return ("{0:N0} min ago" -f ($S / 60)) }
    if ($S -lt 172800) { return ("{0:N0} h ago" -f ($S / 3600)) }
    return ("{0:N0} days ago" -f ($S / 86400))
}
function Mins-Text([double]$S) {
    if ($S -lt 90) { return ("{0:N0} s" -f [math]::Max(0, $S)) }
    if ($S -lt 5400) { return ("{0:N0} min" -f ($S / 60)) }
    return ("{0:N1} h" -f ($S / 3600))
}
function P($Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    if ($Obj -is [hashtable]) { return $Obj[$Name] }
    $p = $Obj.PSObject.Properties[$Name]; if ($p) { return $p.Value }; return $null
}

# ------------------------------------------------------------------ what this PC is
$me = Get-MyHost
$botHere = $false
if ($env:LE_T_BOT_DIR) { $botHere = ($env:LE_T_BOT_DIR -eq '1') }
else {
    foreach ($c in @((Split-Path -Parent $PSScriptRoot), $env:LE_BOT_DIR, $(if ($env:USERPROFILE) { J2 $env:USERPROFILE 'nq-liquidity-engine' }))) {
        try { if ($c -and (Test-Path -LiteralPath (J2 $c 'server.py')) -and (Test-Path -LiteralPath (J2 (J2 $c 'engine') 'ninjatrader.py'))) { $botHere = $true; break } } catch { }
    }
}

# ------------------------------------------------------------------ the heartbeat (the bot PC publishes it; the site shows it)
$hb = $null; $hbWhy = ''
try {
    $raw = $null
    $localHb = J2 (J2 (J2 (Split-Path -Parent $PSScriptRoot) 'logs') 'pc_hb') 'heartbeat.json'
    if ($env:LE_STATUS_HOME_FILE) { $raw = Get-Content -LiteralPath $env:LE_STATUS_HOME_FILE -Raw -ErrorAction Stop }
    elseif (Test-Path -LiteralPath $localHb) {
        # GitHub-free bot (PUBLISH_NQ.bat): the bot writes its heartbeat to logs\pc_hb on this PC; no internet needed
        $raw = '{"live":{"pc":' + (Get-Content -LiteralPath $localHb -Raw -ErrorAction Stop) + '}}'
    }
    else { $raw = (Invoke-WebRequest -Uri ($SiteHome + '?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -UseBasicParsing -TimeoutSec 8 -ErrorAction Stop).Content }
    $d = $raw | ConvertFrom-Json -ErrorAction Stop
    $live = P $d 'live'
    $pc = P $live 'pc'
    if ($null -eq $pc -or -not (P $pc 't')) { $hbWhy = 'the published page has no heartbeat yet' }
    else { $hb = @{ Pc = $pc; Verdict = (P $live 'pc_verdict') } }
} catch { $hbWhy = 'could not read it (no internet?)' }
$hbHost = ''; $hbAge = $null
if ($null -ne $hb) {
    try { $hbHost = [string](P $hb.Pc 'host'); $hbAge = (Get-Now) - [int64](P $hb.Pc 't') } catch { $hbAge = $null }
}
$main = $botHere -or ($hbHost -and ($hbHost -ieq $me))
$role = 'not the bot PC'; if ($main) { $role = 'bot PC' }
$et = Get-ET
$trading = Is-TradingWindow $et

Write-Host ''
Write-Host ("STATUS: {0} ({1}), {2}" -f $me, $role, (Get-Date -Format 'ddd yyyy-MM-dd HH:mm')) -ForegroundColor Cyan
$next = @()      # [kind, sentence] in card order: the first FIX, else the first SKIP, is what to do

# 1 DISK
try {
    $free = $null; $total = $null
    if ($env:LE_T_FREE_GB) { $free = [double]$env:LE_T_FREE_GB; $total = $free * 2; if ($env:LE_T_TOTAL_GB) { $total = [double]$env:LE_T_TOTAL_GB } }
    else {
        $sd = $env:SystemDrive; if (-not $sd) { $sd = 'C:' }
        $di = New-Object System.IO.DriveInfo $sd
        $free = $di.AvailableFreeSpace / 1GB; $total = $di.TotalSize / 1GB
    }
    $t = ("{0:N0} GB free of {1:N0} GB" -f $free, $total)
    if ($free -lt 10) { Line 'FIX' 'DISK' ($t + ': almost full'); $next += ,@('FIX', 'Disk is almost full: double-click CLEAN_STORAGE.bat.') }
    elseif ($free -lt 25) { Line 'SKIP' 'DISK' ($t + ': getting low'); $next += ,@('SKIP', 'Disk is getting low: double-click CLEAN_STORAGE.bat.') }
    else { Line 'OK' 'DISK' $t }
} catch { Line '..' 'DISK' 'not readable on this PC' }

# 2 RAM
try {
    $rf = $null; $rt = $null
    if ($env:LE_T_RAM) { $p = $env:LE_T_RAM.Split(','); $rf = [double]$p[0]; $rt = [double]$p[1] }
    else {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
        $rf = [double]$os.FreePhysicalMemory / 1MB; $rt = [double]$os.TotalVisibleMemorySize / 1MB
    }
    $t = ("{0:N1} GB free of {1:N1} GB ({2:N0}% used)" -f $rf, $rt, (100 * (1 - $rf / [math]::Max(0.1, $rt))))
    if ($rf -lt 0.5) { Line 'FIX' 'RAM' ($t + ': nearly out'); $next += ,@('FIX', 'Memory is nearly out: restart this PC when the market is closed, or close browser windows.') }
    elseif ($rf -lt 1.0) { Line 'SKIP' 'RAM' ($t + ': tight'); $next += ,@('SKIP', 'Memory is tight: close browser windows you do not need.') }
    else { Line 'OK' 'RAM' $t }
} catch { Line '..' 'RAM' 'not readable on this PC' }

# 3 BOT (from the published heartbeat)
try {
    if ($null -eq $hb -or $null -eq $hbAge) { Line '..' 'BOT' ("heartbeat: " + $(if ($hbWhy) { $hbWhy } else { 'not readable' })) }
    else {
        $h = P $hb.Pc 'health'; $acct = P $h 'account'
        $running = [bool](P $hb.Pc 'running'); $armed = [bool](P $acct 'armed')
        $label = [string](P $acct 'label'); $name = [string](P $acct 'name')
        $where = ''; if (-not $main) { $where = ", runs on $hbHost, not on this PC" }
        $state = 'STOPPED'
        if ($running) { $state = 'running'; if ($armed) { $state += ', armed' } else { $state += ', NOT armed' } ; if ($label) { $state += " on $label"; if ($name) { $state += " ($name)" } } }
        $t = "$state, heartbeat $(Age-Text $hbAge)$where"
        if ($hbAge -gt 900 -and $trading) { Line 'FIX' 'BOT' ("no heartbeat for $(Mins-Text $hbAge), the bot PC may be off: $state"); $next += ,@('FIX', "No heartbeat for $(Mins-Text $hbAge): check that the bot PC ($hbHost) is on, NinjaTrader is open and the bot is started.") }
        elseif ($hbAge -gt 900) { Line '..' 'BOT' ($t + ' (market closed)') }
        elseif (-not $running -and $trading) { Line 'FIX' 'BOT' $t; $next += ,@('FIX', 'The bot is stopped during market hours: on the bot PC double-click START_BOT.bat.') }
        elseif (-not $running) { Line '..' 'BOT' $t }
        elseif (-not $armed -and $trading) { Line 'SKIP' 'BOT' $t; $next += ,@('SKIP', 'The bot runs but is not armed: arm it in the LE START window on the bot PC (or ignore it if you want it paused).') }
        else { Line 'OK' 'BOT' $t }
    }
} catch { Line '..' 'BOT' 'not readable' }

# 4 NINJA
try {
    $nt = $null
    if ($env:LE_T_NT) { $nt = ($env:LE_T_NT -eq '1') } else { $nt = (@(Get-Process -Name 'NinjaTrader*' -ErrorAction SilentlyContinue).Count -gt 0) }
    if ($nt) { Line 'OK' 'NINJA' 'NinjaTrader is running' }
    elseif (-not $main) { Line '..' 'NINJA' 'not running (not needed on this PC)' }
    elseif ($trading) { Line 'FIX' 'NINJA' 'NinjaTrader is not running'; $next += ,@('FIX', 'Open NinjaTrader 8 on this PC, log in and connect MFFU.') }
    else { Line '..' 'NINJA' 'not running (market closed)' }
} catch { Line '..' 'NINJA' 'not readable' }

# 5 BARS (the heartbeat's own number: the bot's last 1-minute bar)
try {
    $feed = $null; if ($null -ne $hb) { $feed = P (P $hb.Pc 'health') 'feed' }
    $ageBar = P $feed 'age_1m_s'
    $mOpen = P $feed 'market_open'
    if ($null -eq $hb) { Line '..' 'BARS' 'unknown (no heartbeat)' }
    elseif ($null -eq $ageBar -or $hbAge -gt 900) { Line '..' 'BARS' 'unknown (the heartbeat is old or has no bar time)' }
    else {
        $b = [double]$ageBar + [double]$hbAge
        $t = "last 1-minute bar $(Mins-Text $b) old"
        $open = $trading; if ($null -ne $mOpen) { $open = [bool]$mOpen }
        if ($open -and $b -gt 300) { Line 'FIX' 'BARS' ($t + ': the feed is stale, no new trades'); $next += ,@('FIX', 'The bar feed is stale: in NinjaTrader check the data connection is green and AT Interface is on.') }
        elseif ($open -and $b -gt 150) { Line 'SKIP' 'BARS' ($t + ': a little late'); $next += ,@('SKIP', 'Bars are a little late: look at the NinjaTrader data connection.') }
        elseif (-not $open) { Line '..' 'BARS' ($t + ' (market closed)') }
        else { Line 'OK' 'BARS' $t }
    }
} catch { Line '..' 'BARS' 'not readable' }

# 6 POWER
try {
    $plan = ''
    if ($env:LE_T_PLAN) { $plan = $env:LE_T_PLAN }
    else {
        $o = (& powercfg /getactivescheme 2>$null | Out-String)
        $m = [regex]::Match("$o", '\(([^)]+)\)'); if ($m.Success) { $plan = $m.Groups[1].Value }
    }
    if (-not $plan) { Line '..' 'POWER' 'not readable on this PC' }
    elseif ($main -and $plan -notmatch 'PC Care|High performance|Ultimate') { Line 'SKIP' 'POWER' ("plan: $plan (this PC may go to sleep)"); $next += ,@('SKIP', 'The power plan can let this PC sleep: double-click PC_CARE.bat.') }
    else { Line 'OK' 'POWER' "plan: $plan" }
} catch { Line '..' 'POWER' 'not readable on this PC' }

# PUBLISH (extra, not one of the six): when the PC publisher has run (PUBLISH_NQ.bat), when it last sent the site out
try {
    $pubFile = J2 (J2 (J2 (Split-Path -Parent $PSScriptRoot) 'data') 'pc_publish') 'last.json'
    if (Test-Path -LiteralPath $pubFile) {
        $pj = (Get-Content -LiteralPath $pubFile -Raw -ErrorAction Stop) | ConvertFrom-Json -ErrorAction Stop
        $pAge = (Get-Now) - [int64](P $pj 't')
        $pWhat = "last publish $(Age-Text $pAge) to $(P $pj 'provider')"
        if (P $pj 'ok') {
            if ($pAge -gt 3600 -and $trading) { Line 'SKIP' 'PUBLISH' ($pWhat + ': older than an hour'); $next += ,@('SKIP', 'The site was not refreshed for an hour: double-click PUBLISH_NQ.bat.') }
            else { Line 'OK' 'PUBLISH' $pWhat }
        } else { Line 'SKIP' 'PUBLISH' ($pWhat + ' FAILED, the last good site stays up'); $next += ,@('SKIP', 'The last publish failed: double-click PUBLISH_NQ.bat and read its six lines.') }
    }
} catch { }

Write-Host ''
$fix = @($next | Where-Object { $_[0] -eq 'FIX' }); $look = @($next | Where-Object { $_[0] -eq 'SKIP' })
if ($fix.Count -gt 0) { Write-Host ("  NEXT: " + $fix[0][1]) -ForegroundColor Red }
elseif ($look.Count -gt 0) { Write-Host ("  NEXT: " + $look[0][1]) -ForegroundColor Yellow }
else { Write-Host '  NEXT: nothing to do, all six look fine.' -ForegroundColor Green }
exit 0
