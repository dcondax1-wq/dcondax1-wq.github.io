<#
MOVE THE BOT to another PC (owner 2026-11-01: run the bots on the main PC instead of the Surface). Two PCs must never run
the bot on the same accounts (double orders), so the old PC is retired in the same step that packs its state.

OLD PC (the Surface), double-click tools\bat\MOVE_BOT.bat, choose 1 = "pack and retire this PC":
  - refuses on weekdays 01:15-16:05 ET (the bot may be trading); do it after the close
  - stops the bot (scripts\stop_bot.ps1: the server, the supervisor, auto-start cleared)
  - turns auto-resume off (python -m engine.ninjatrader --disable-auto-resume)
  - removes the start-at-logon tasks (LiquidityEngine, LiquidityEngineOps) and the LE START Startup shortcut
  - packs the bot's own state: data\ (accounts, eval anchor, ledgers, journal, bar archive, auto-resume record) and
    .env.local.ps1 (the live switch) into OneDrive\BOT_MOVE\le-bot-state-<date>.zip (Desktop when there is no OneDrive),
    plus this script and tools\bat\MOVE_BOT.bat so the new PC has them (the repo is private)
NEW PC (the main PC), double-click MOVE_BOT.bat from OneDrive\BOT_MOVE, choose 2 = "set this PC up":
  - installs Git and Python 3.12 with winget when missing
  - clones the bot into %USERPROFILE%\nq-liquidity-engine (GitHub asks you to sign in once)
  - restores the packed state into it, installs the Python packages and starts tools\bat\ONE_TIME_SETUP.bat (power, logon tasks,
    icons, auto-update, the bot)
Still by hand on the new PC: NinjaTrader 8 installed and logged in, the MFFU connection, AT Interface on, then
tools\bat\NO_CHART_MODE.bat and F5 in NinjaTrader's NinjaScript Editor (the LE_Feed add-on feeds the bars with no chart:
ninjatrader\SETUP.md "No-chart mode").

FRESH START (choice 3, owner 2026-11-04: the old PC is overheating, there is no state pack): -Fresh needs no zip.
  - REFUSES when another PC is still running the bot: reads the cloud heartbeat (the published home.json: live.pc t + host)
    and stops if a different host beat in the last 6 minutes (-Force overrides). Two PCs on the same accounts = double orders.
  - shows the plan and asks Y, installs Git / Python when missing, clones the bot, installs the packages, sets the eval
    anchors from the published board after a Y/N (python -m engine.eval_life --anchor-from-site), copies the NinjaTrader
    add-ons (NO_CHART_MODE) and starts tools\bat\ONE_TIME_SETUP.bat (asks the eval account and the phrase; Enter = Sim101).
  - writes nothing secret and never arms live trading: the mode is whatever ONE_TIME_SETUP sets (Sim / disarmed by default).
  - the one-line start on the new PC lives on the site: <site>/pc/FRESH_START.ps1 (tools/web_public/pc/).
  Tests: LE_HEARTBEAT_FILE=<json file> replaces the web read, LE_FAKE_HOST=<name> replaces this PC's name.

  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\move_bot.ps1 -Pack [-DryRun]
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\move_bot.ps1 -NewPC [-Zip <path>] [-DryRun]
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\move_bot.ps1 -Fresh [-Force] [-Yes] [-DryRun]
#>
param([switch]$Pack, [switch]$NewPC, [switch]$Fresh, [string]$Zip = "", [switch]$DryRun, [switch]$Force, [switch]$Yes)

$ErrorActionPreference = 'Continue'
# any unexpected failure ends with ONE plain sentence of what to do, never a stack trace (the detail goes to the log only)
trap {
    Write-Host ''
    Write-Host '  [FIX] Something unexpected stopped this: take a photo of this window and send it to Claude (what was already done is in the log).' -ForegroundColor Red
    try { $lg = Get-Variable -Name Log -Scope Script -ValueOnly -ErrorAction SilentlyContinue; if ($lg) { Add-Content -LiteralPath $lg -Value ('  UNEXPECTED: ' + $_.Exception.Message + ' | ' + $_.InvocationInfo.PositionMessage) -Encoding UTF8 } } catch { }
    exit 1
}
if ($env:LE_T_BOOM) { throw 'test: unexpected failure' }
$Repo = 'https://github.com/demetrades2000-coder/nq-liquidity-engine.git'
$SiteHome = 'https://dcondax1-wq.github.io/home.json'
$BeatFreshS = 360       # a heartbeat from ANOTHER PC newer than 6 minutes = that PC is still running the bot
$SiteLagS = 1200        # the site is rebuilt every ~15 minutes: a copy this young can hide a PC that stopped a moment ago
function Say([string]$Kind, [string]$Text) {
    $c = 'Gray'; if ($Kind -eq 'OK') { $c = 'Green' } elseif ($Kind -eq 'FIX') { $c = 'Red' } elseif ($Kind -eq 'SKIP') { $c = 'Yellow' }
    Write-Host "  [$Kind] $Text" -ForegroundColor $c
}
function Get-ET { try { return [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'Eastern Standard Time') } catch { return [System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'America/New_York') } }
function Is-TradingWindow([DateTime]$Et) {
    if ($Et.DayOfWeek -eq 'Saturday' -or $Et.DayOfWeek -eq 'Sunday') { return $false }
    $m = $Et.Hour * 60 + $Et.Minute
    return ($m -ge 75 -and $m -lt 965)
}
function Get-MoveDir {
    if ($env:OneDrive -and (Test-Path -LiteralPath $env:OneDrive)) { return (Join-Path $env:OneDrive 'BOT_MOVE') }
    $dt = [Environment]::GetFolderPath('Desktop'); if (-not $dt) { $dt = $HOME }
    return (Join-Path $dt 'BOT_MOVE')
}
function Is-BotFolder([string]$Dir) { return ($Dir -and (Test-Path -LiteralPath (Join-Path $Dir 'server.py')) -and (Test-Path -LiteralPath (Join-Path $Dir 'engine\ninjatrader.py'))) }
function Find-Python([string]$BotDir) {
    $c = @((Join-Path $BotDir '.venv\Scripts\python.exe'), (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'))
    foreach ($p in $c) { if ($p -and (Test-Path -LiteralPath $p)) { return $p } }
    $g = Get-Command python -ErrorAction SilentlyContinue; if ($g) { return $g.Source }
    $g = Get-Command py -ErrorAction SilentlyContinue; if ($g) { return $g.Source }
    return $null
}
function Get-MyHost { if ($env:LE_FAKE_HOST) { return $env:LE_FAKE_HOST }; if ($env:COMPUTERNAME) { return $env:COMPUTERNAME }; return [Environment]::MachineName }
function Get-UnixNow { return [int64][DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
# The last heartbeat the bot PC pushed, from the published home.json (live.pc.t / live.pc.host, else board.data_t / board.host)
# or a plain heartbeat.json (t, host). -> object: Ok, T, Host, Built (unix seconds, 0 when unknown). Ok false when it cannot be read.
function Read-Beat([string]$Source) {
    $r = [pscustomobject]@{ Ok = $false; T = 0; Host = ''; Built = 0; Why = '' }
    try {
        if ($env:LE_HEARTBEAT_FILE) { $raw = Get-Content -LiteralPath $env:LE_HEARTBEAT_FILE -Raw -ErrorAction Stop }
        else { $raw = (Invoke-WebRequest -Uri $Source -UseBasicParsing -TimeoutSec 30 -ErrorAction Stop).Content }
        $d = $raw | ConvertFrom-Json
        $t = 0; $h = ''
        if ($d.live -and $d.live.pc -and $d.live.pc.t) { $t = [int64]$d.live.pc.t; $h = [string]$d.live.pc.host }
        elseif ($d.board -and $d.board.data_t) { $t = [int64]$d.board.data_t; $h = [string]$d.board.host }
        elseif ($d.t) { $t = [int64]$d.t; $h = [string]$d.host }
        if ($t -le 0) { $r.Why = 'no heartbeat time in it'; return $r }
        $r.T = $t; $r.Host = $h; $r.Ok = $true
        if ($d.built) { try { $r.Built = [int64][DateTimeOffset]::Parse([string]$d.built).ToUnixTimeSeconds() } catch { } }
    } catch { $r.Why = $_.Exception.Message }
    return $r
}
# 'self' (the beats are from this PC), 'running' (another PC beat < 6 min ago), 'maybe' (the site copy is young and showed
# another PC alive: it may have stopped since), 'quiet' (no other PC beat recently), 'unknown' (could not be read).
function Get-BeatVerdict($Beat, [string]$Me, [int64]$Now) {
    if (-not $Beat.Ok) { return 'unknown' }
    if ($Beat.Host -and ($Beat.Host -ieq $Me)) { return 'self' }
    if (($Now - $Beat.T) -lt $BeatFreshS) { return 'running' }
    if ($Beat.Built -gt 0 -and ($Now - $Beat.Built) -lt $SiteLagS -and ($Beat.Built - $Beat.T) -lt $BeatFreshS) { return 'maybe' }
    return 'quiet'
}
# what the pack holds: the bot's own state only, i.e. data\ files git does not track (accounts, eval anchor, ledgers,
# journal, bar archive, auto-resume record) and the live switch .env.local.ps1. Never the code or the tracked price history:
# the new PC clones those.
function Pack-Items([string]$BotDir) {
    $rel = @()
    Push-Location $BotDir
    try {
        $rel += @(& git ls-files --others --exclude-standard -- data 2>$null)
        $rel += @(& git ls-files --others --ignored --exclude-standard -- data 2>$null)
    } finally { Pop-Location }
    if (Test-Path -LiteralPath (Join-Path $BotDir '.env.local.ps1')) { $rel += '.env.local.ps1' }
    return ,@($rel | Where-Object { $_ -and $_ -notmatch '__pycache__|\.pyc$' } | Sort-Object -Unique)
}
function Stage-Pack([string]$BotDir, [string[]]$Rel, [string]$Stage) {
    foreach ($r in $Rel) {
        $src = Join-Path $BotDir $r; $dst = Join-Path $Stage $r
        $pd = Split-Path -Parent $dst; if (-not (Test-Path -LiteralPath $pd)) { New-Item -ItemType Directory -Path $pd -Force | Out-Null }
        Copy-Item -LiteralPath $src -Destination $dst -Force
    }
}

if (-not $Pack -and -not $NewPC -and -not $Fresh) {
    Write-Host ""
    Write-Host "MOVE THE BOT" -ForegroundColor Cyan
    Write-Host "  1 = pack and retire THIS PC (the old one: the Surface)"
    Write-Host "  2 = set THIS PC up (the new one: the main PC), from the pack of choice 1"
    Write-Host "  3 = No old PC: start fresh here (no pack needed)"
    $a = Read-Host "Type 1, 2 or 3 and press Enter"
    if ($a -eq '1') { $Pack = $true } elseif ($a -eq '2') { $NewPC = $true } elseif ($a -eq '3') { $Fresh = $true } else { Say 'SKIP' 'Nothing chosen: nothing changed.'; exit 0 }
}

function Install-Tools {
    foreach ($w in @(@('git', 'Git.Git'), @('python', 'Python.Python.3.12'))) {
        if (Get-Command $w[0] -ErrorAction SilentlyContinue) { Say 'OK' "$($w[0]) is installed"; continue }
        if ($DryRun) { Say '..' "Would install $($w[1]) with winget"; continue }
        & winget install -e --id $w[1] --accept-package-agreements --accept-source-agreements
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
        if (Get-Command $w[0] -ErrorAction SilentlyContinue) { Say 'OK' "$($w[1]) installed" } else { Say 'FIX' "$($w[1]) not found after installing: close this window, open a new one and run tools\bat\MOVE_BOT.bat again" ; exit 1 }
    }
}

# ================================================================== old PC: pack and retire
if ($Pack) {
    $Bot = Split-Path -Parent $PSScriptRoot
    if (-not (Is-BotFolder $Bot)) { Say 'FIX' "Run this from the bot folder (no server.py in $Bot)."; exit 1 }
    if ((Is-TradingWindow (Get-ET)) -and -not $Force) { Say 'FIX' 'Weekdays 01:15-16:05 ET the bot may be trading: nothing changed. Run it again after 4:05 PM ET.'; exit 1 }
    $dir = Get-MoveDir
    Say '..' "Retiring this PC as the trading PC and packing its state into $dir"
    if (-not $DryRun) {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Bot 'scripts\stop_bot.ps1')
        Say 'OK' 'Bot stopped (auto-start cleared)'
        $py = Find-Python $Bot
        if ($py) { Push-Location $Bot; & $py -m engine.ninjatrader --disable-auto-resume; Pop-Location; Say 'OK' 'Auto-resume off' } else { Say 'FIX' 'Python not found: auto-resume could not be turned off' }
        foreach ($t in @('LiquidityEngine', 'LiquidityEngineOps')) {
            try { Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction Stop; Say 'OK' "Start-at-logon task $t removed" } catch { Say 'SKIP' "Task $t not there (or needs Administrator)" }
        }
        $su = [Environment]::GetFolderPath('Startup')
        if ($su) { Get-ChildItem -LiteralPath $su -Filter '*LE START*' -ErrorAction SilentlyContinue | ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force; Say 'OK' "Startup shortcut $($_.Name) removed" } }
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        $zipPath = Join-Path $dir ("le-bot-state-" + (Get-Date -Format 'yyyyMMdd-HHmm') + ".zip")
        $rel = Pack-Items $Bot
        $stage = Join-Path ([IO.Path]::GetTempPath()) ('le-move-' + [guid]::NewGuid())
        Stage-Pack $Bot $rel $stage
        Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zipPath -Force
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        Say 'OK' "$($rel.Count) state files packed"
        Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $dir 'move_bot.ps1') -Force
        Copy-Item -LiteralPath (Join-Path $Bot 'tools\bat\MOVE_BOT.bat') -Destination (Join-Path $dir 'MOVE_BOT.bat') -Force
        Say 'OK' "Packed: $zipPath ($([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB)"
    } else { $rel = Pack-Items $Bot; Say '..' ("Dry run: would stop the bot, turn auto-resume off, remove the logon tasks and pack $($rel.Count) state files: " + (($rel | Select-Object -First 12) -join ', ')) }
    Say 'OK' 'This PC no longer starts or resumes the bot. On the main PC: open the BOT_MOVE folder, double-click MOVE_BOT.bat, choose 2.'
    exit 0
}

# ================================================================== no old PC: fresh start
if ($Fresh) {
    $bot = Join-Path $env:USERPROFILE 'nq-liquidity-engine'
    Write-Host ""
    Write-Host "FRESH START on this PC (no old PC state needed)" -ForegroundColor Cyan
    Write-Host "  1. Checks that no other PC is running the bot (it must be shut down first)"
    Write-Host "  2. Installs Git and Python if missing, gets the bot from GitHub into $bot"
    Write-Host "  3. Sets your eval numbers (balance + floor) from the published board: you check them and press Y"
    Write-Host "  4. Copies the NinjaTrader add-ons and starts ONE_TIME_SETUP (asks your eval account name and phrase)"
    Write-Host "  Nothing secret is saved and live trading is NOT armed: Enter at the account question = practice on Sim101."
    if (-not $Yes -and -not $DryRun) {
        $go = Read-Host "Type Y then Enter to start (anything else stops here, nothing changes)"
        if ($go -notmatch '^(y|yes)$') { Say 'SKIP' 'Stopped: nothing changed.'; exit 0 }
    }
    # ---- safety first: no other PC may be running the bot
    $me = Get-MyHost
    $beat = Read-Beat $SiteHome
    $verdict = Get-BeatVerdict $beat $me (Get-UnixNow)
    if ($verdict -eq 'running' -or $verdict -eq 'maybe') {
        $age = [math]::Round(((Get-UnixNow) - $beat.T) / 60.0, 1)
        if ($Force) { Say 'SKIP' "Another PC ($($beat.Host)) is running the bot (last beat $age min ago): -Force, carrying on." }
        else {
            Say 'FIX' "STOP: the old PC ($($beat.Host)) is still running the bot (last heartbeat $age minutes ago)."
            Say 'FIX' 'The old PC is still running the bot: shut the Surface down first, wait 3 minutes, run this again. (Two PCs on the same accounts would double every order.)'
            if ($verdict -eq 'maybe') { Say 'FIX' 'The website copy can be 15 minutes behind: if you shut the Surface down just now, wait 15 minutes.' }
            exit 1
        }
    } elseif ($verdict -eq 'unknown') {
        Say 'SKIP' "Could not read the cloud heartbeat ($($beat.Why))."
        if ($Force -or $DryRun) { Say 'SKIP' 'Carrying on (-Force or dry run).' }
        else {
            $ok = Read-Host 'Type SHUT DOWN to confirm the old PC is switched off (anything else stops here)'
            if ($ok -ne 'SHUT DOWN') { Say 'FIX' 'Stopped: nothing changed. Shut the old PC down, then run this again.'; exit 1 }
        }
    } elseif ($verdict -eq 'self') { Say 'OK' "The last heartbeat is from this PC ($me): no other PC is running the bot." }
    else { Say 'OK' "No other PC has sent a heartbeat in the last 6 minutes (last: $($beat.Host))." }
    Install-Tools
    if (Is-BotFolder $bot) { Say 'OK' "Bot folder already here: $bot" }
    elseif ($DryRun) { Say '..' "Would clone $Repo into $bot" }
    else {
        Say '..' 'Getting the bot from GitHub (a GitHub sign-in window may open: sign in)'
        & git clone $Repo $bot
        if (-not (Is-BotFolder $bot)) { Say 'FIX' 'The clone did not work (sign-in?). Send Claude a photo of this window.'; exit 1 }
        Say 'OK' "Bot cloned into $bot"
    }
    if ($DryRun) {
        Say '..' "Would pip install -r requirements.txt, run python -m engine.eval_life --anchor-from-site, NO_CHART_MODE and start tools\bat\ONE_TIME_SETUP.bat in $bot"
        Say '..' 'Dry run: nothing was installed, cloned or started.'
        exit 0
    }
    $py = Find-Python $bot
    if (-not $py) { Say 'FIX' 'Python not found: close this window, open a new one and run this again'; exit 1 }
    Push-Location $bot
    & $py -m pip install -r requirements.txt
    Say 'OK' 'Packages installed'
    Say '..' 'Your eval numbers: compare them with the MFFU dashboard, then answer Y or N.'
    & $py -m engine.eval_life --anchor-from-site
    if ($LASTEXITCODE -ne 0) { Say 'SKIP' 'Eval numbers not set. You can set them later: python -m engine.eval_life --anchor-from-site' } else { Say 'OK' 'Eval numbers set' }
    Pop-Location
    try { & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $bot 'scripts\no_chart_mode.ps1') } catch { Say 'SKIP' 'NinjaTrader add-ons not copied (is NinjaTrader installed and opened once?): run tools\bat\NO_CHART_MODE.bat later' }
    Say '..' 'Starting ONE_TIME_SETUP: it asks your eval account name and phrase (just Enter = practice on Sim101). Live trading stays off.'
    Start-Process -FilePath (Join-Path $bot 'tools\bat\ONE_TIME_SETUP.bat') -WorkingDirectory $bot
    Say 'OK' 'Last step, in NinjaTrader 8: Control Center > New > NinjaScript Editor > press F5. Then LE START > Start trading.'
    exit 0
}

# ================================================================== new PC: set up
if ($NewPC) {
    $here = $PSScriptRoot
    if (-not $Zip) { $z = Get-ChildItem -LiteralPath $here -Filter 'le-bot-state-*.zip' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1; if ($z) { $Zip = $z.FullName } }
    if (-not $Zip -or -not (Test-Path -LiteralPath $Zip)) { Say 'FIX' "No le-bot-state-*.zip next to this script ($here): pack the old PC first (choose 1 there)."; exit 1 }
    Say 'OK' "State pack: $Zip"
    Install-Tools
    $bot = Join-Path $env:USERPROFILE 'nq-liquidity-engine'
    if (Is-BotFolder $bot) { Say 'OK' "Bot folder already here: $bot" }
    elseif ($DryRun) { Say '..' "Would clone $Repo into $bot" }
    else {
        Say '..' 'Getting the bot from GitHub (a GitHub sign-in window may open: sign in)'
        & git clone $Repo $bot
        if (-not (Is-BotFolder $bot)) { Say 'FIX' 'The clone did not work (sign-in?). Send Claude a photo of this window.'; exit 1 }
        Say 'OK' "Bot cloned into $bot"
    }
    if ($DryRun) { Say '..' "Would restore $Zip into $bot, pip install, start tools\bat\ONE_TIME_SETUP.bat"; exit 0 }
    Expand-Archive -LiteralPath $Zip -DestinationPath $bot -Force
    Say 'OK' 'State restored (data\ and the live switch)'
    $py = Find-Python $bot
    if (-not $py) { Say 'FIX' 'Python not found: close this window, open a new one and run tools\bat\MOVE_BOT.bat again'; exit 1 }
    Push-Location $bot; & $py -m pip install -r requirements.txt; Pop-Location
    Say 'OK' 'Packages installed'
    Say '..' 'Next: NinjaTrader on this PC must be logged in with the MFFU connection and AT Interface on. Then run tools\bat\NO_CHART_MODE.bat and press F5 in NinjaTrader (no chart needed). The setup starts the bot.'
    Start-Process -FilePath (Join-Path $bot 'tools\bat\ONE_TIME_SETUP.bat') -WorkingDirectory $bot
    exit 0
}
