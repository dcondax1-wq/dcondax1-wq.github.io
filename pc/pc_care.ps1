<#
PC_CARE (double-click tools\bat\PC_CARE.bat). The owner, 2026-11-04: both PCs cared for in one place. The Surface overheats and has a dark
screen and little memory; the main PC runs the bot and NinjaTrader 8 around the clock. One run shows a plain table (what it is
now, what it will be), asks Y, changes only what is listed, and ends with ONE line: "BOT PC HEALTHY: YES" (or what needs you).
Everything it changes is written to an undo file first (tools\bat\UNDO_PC_TUNE.bat puts it all back). Nothing is closed, downloaded or
deleted. NinjaTrader and the bot are never touched.

Which PC is it (found by itself; -Role main|surface forces it):
  main     the bot folder is here (server.py + engine\ninjatrader.py), or a desktop PC without it: never sleeps, high performance
           on AC, USB suspend off, screen off after 10 minutes
  surface  no bot folder and a Surface / small laptop: balanced + cooler (CPU top speed 75%, active fan), dark-screen fix,
           battery saver does not dim the screen while plugged in

What it changes (each one undone by -Undo):
  1. Power plan "PC Care" (a copy of High performance, or Balanced on the Surface; your old plan stays and comes back on undo)
  2. Startup apps: lists the programs that start at sign-in (your account) with a verdict; asks Y/N for each one it suggests
     (Teams, Spotify, Discord, Steam ...); it only flips the same switch Task Manager > Startup apps uses. Security, OneDrive,
     NinjaTrader, drivers and anything it does not recognise are never offered.
  3. Background apps (Store apps running while you do not use them): off for your account
  4. Visual effects: transparency and window animations off (the rest after you sign out and in)
  5. Windows search indexing paused during market hours (weekdays 01:15-16:05 ET), resumed after: two tasks, nothing deleted
Read-only, always: a health check with what Windows lets a script read. CPU temperature is NOT readable on most PCs without
extra tools (HWiNFO, Core Temp): when Windows does not show it, the line says so and does not guess.
By hand (a script cannot do these, the table says where): the Surface "content adaptive brightness" tick, Windows Update hours.

The state of the last run is logs\pc_care.json (bot folder) or %LOCALAPPDATA%\LiquidityEngine\pc_care.json: the bot's PC health
heartbeat shows it as the "PC care" line (display only).

  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pc_care.ps1             (tools\bat\PC_CARE.bat runs this)
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pc_care.ps1 -DryRun     (the table, changes nothing)
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pc_care.ps1 -CheckOnly  (only the health check)
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\pc_care.ps1 -Undo       (tools\bat\UNDO_PC_TUNE.bat runs this too)
  ... -Yes  (no Y/N questions: every suggested change is made)
#>
param(
    [switch]$DryRun,
    [switch]$Undo,
    [switch]$Yes,
    [switch]$CheckOnly,
    [string]$Role = 'auto',     # auto | main | surface
    [switch]$SystemPart,        # internal: the elevated part (power plan, search pause), started by this script with a UAC prompt
    [switch]$WithIndex,         # internal: (system part) the search-indexing pause was answered Y
    [string]$Log = ''           # internal: the same log file for both parts
)

$ErrorActionPreference = 'Continue'
# any unexpected failure ends with ONE plain sentence of what to do, never a stack trace (the detail goes to the log only)
trap {
    Write-Host ''
    Write-Host '  [FIX] Something unexpected stopped this: take a photo of this window and send it to Claude (what was already done is in the log).' -ForegroundColor Red
    try { $lg = Get-Variable -Name Log -Scope Script -ValueOnly -ErrorAction SilentlyContinue; if ($lg) { Add-Content -LiteralPath $lg -Value ('  UNEXPECTED: ' + $_.Exception.Message + ' | ' + $_.InvocationInfo.PositionMessage) -Encoding UTF8 } } catch { }
    exit 1
}
if ($env:LE_T_BOOM) { throw 'test: unexpected failure' }
$Sep = [System.IO.Path]::DirectorySeparatorChar
function J2([string]$A, [string]$B) { return [System.IO.Path]::Combine($A, $B) }
function Pj([string[]]$Parts) {
    $r = $null
    foreach ($p in $Parts) { if (-not $p) { return $null }; if ($null -eq $r) { $r = $p } else { $r = J2 $r $p } }
    return $r
}
function P($Obj, [string]$Name) {
    if ($null -eq $Obj) { return $null }
    if ($Obj -is [hashtable]) { return $Obj[$Name] }
    $p = $Obj.PSObject.Properties[$Name]; if ($p) { return $p.Value }; return $null
}

# ------------------------------------------------------------------ where things are
function Test-BotFolder([string]$Dir) {
    if (-not $Dir) { return $false }
    return ((Test-Path -LiteralPath (J2 $Dir 'server.py')) -and (Test-Path -LiteralPath (Pj @($Dir, 'engine', 'ninjatrader.py'))))
}
$BotRoot = ''
foreach ($c in @((Split-Path -Parent $PSScriptRoot), $env:LE_BOT_DIR, $(if ($env:USERPROFILE) { J2 $env:USERPROFILE 'nq-liquidity-engine' }))) {
    if ($c -and (Test-BotFolder $c)) { $BotRoot = $c.TrimEnd('\', '/'); break }
}
$LogDir = ''
if ($BotRoot) { $LogDir = J2 $BotRoot 'logs' }
else {
    $lb = $env:LOCALAPPDATA; if (-not $lb) { $lb = [System.IO.Path]::GetTempPath() }
    $LogDir = Pj @($lb, 'LiquidityEngine', 'logs')
}
if (-not (Test-Path -LiteralPath $LogDir)) { try { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null } catch { } }
if (-not $Log) { $Log = J2 $LogDir ("pc_care-" + (Get-Date -Format 'yyyyMMdd-HHmm') + ".txt") }
if ($BotRoot) { $CareJson = J2 $LogDir 'pc_care.json' } else { $CareJson = J2 (Split-Path -Parent $LogDir) 'pc_care.json' }
$UserState = Pj @($(if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { [System.IO.Path]::GetTempPath() }), 'LiquidityEngine', 'pc_care_user.json')
$SysState = Pj @($(if ($env:ProgramData) { $env:ProgramData } else { [System.IO.Path]::GetTempPath() }), 'LiquidityEngine', 'pc_care_state.json')
$StateFile = $UserState; if ($SystemPart) { $StateFile = $SysState }
$StateDir = Split-Path -Parent $StateFile
$PlanGuid = 'a1e5c0de-7a0e-4e51-9000-0000000000c1'
$PlanName = 'PC Care'
$IdxPause = 'LiquidityEngine-IndexPause'
$IdxResume = 'LiquidityEngine-IndexResume'

function Say([string]$K, [string]$Text) {
    $line = "  [$K] $Text"
    $color = 'Gray'
    if ($K -eq 'OK') { $color = 'Green' } elseif ($K -eq 'FIX') { $color = 'Red' } elseif ($K -eq 'SKIP') { $color = 'Yellow' }
    Write-Host $line -ForegroundColor $color
    try { Add-Content -LiteralPath $Log -Value $line -Encoding UTF8 } catch { }
}
function Head([string]$Text) { Write-Host ""; Write-Host $Text -ForegroundColor Cyan; try { Add-Content -LiteralPath $Log -Value ("`r`n" + $Text) -Encoding UTF8 } catch { } }
function Row([string]$A, [string]$B, [string]$C) {
    $line = ("  {0,-38} {1,-18} {2}" -f $A, $B, $C)
    Write-Host $line
    try { Add-Content -LiteralPath $Log -Value $line -Encoding UTF8 } catch { }
}
function Ask-YN([string]$Question) {
    if ($Yes) { return $true }
    if ($env:LE_T_ANSWER) { return ($env:LE_T_ANSWER -match '^(y|yes)$') }
    try { $a = Read-Host $Question; return ($a -match '^\s*(y|yes)\s*$') } catch { return $false }
}
function Test-Admin {
    if ($env:LE_T_ELEVATED) { return ($env:LE_T_ELEVATED -eq '1') }
    try { $isAdmin = [bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); return $isAdmin } catch { return $false }
}
$IsAdmin = Test-Admin

# ------------------------------------------------------------------ the clock (market hours are New York time)
function Get-EtZone {
    try { return [System.TimeZoneInfo]::FindSystemTimeZoneById('Eastern Standard Time') } catch { }
    try { return [System.TimeZoneInfo]::FindSystemTimeZoneById('America/New_York') } catch { }
    return $null
}
function Get-ET {
    if ($env:LE_T_ET) { return [DateTime]::Parse($env:LE_T_ET, [Globalization.CultureInfo]::InvariantCulture) }
    $z = Get-EtZone
    if ($null -eq $z) { return (Get-Date) }
    return [System.TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $z)
}
function Is-TradingWindow([DateTime]$Et) {
    if ($Et.DayOfWeek -eq 'Saturday' -or $Et.DayOfWeek -eq 'Sunday') { return $false }
    $m = $Et.Hour * 60 + $Et.Minute
    return ($m -ge 75 -and $m -lt 965)          # 01:15 - 16:05 ET
}
# 01:15 ET as the clock on THIS PC (the tasks run in local time; ET and US local time share their daylight-saving dates)
function Convert-EtToLocalHm([int]$H, [int]$M) {
    $z = Get-EtZone
    if ($null -eq $z) { return ('{0:00}:{1:00}' -f $H, $M) }
    try {
        $d = [DateTime]::SpecifyKind((Get-Date).Date.AddHours($H).AddMinutes($M), [DateTimeKind]::Unspecified)
        $utc = [System.TimeZoneInfo]::ConvertTimeToUtc($d, $z)
        return ([System.TimeZoneInfo]::ConvertTimeFromUtc($utc, [System.TimeZoneInfo]::Local)).ToString('HH:mm')
    } catch { return ('{0:00}:{1:00}' -f $H, $M) }
}

# ------------------------------------------------------------------ which PC is it
function Get-PcFacts {
    $model = ''; $pst = $null; $ram = 0.0; $bat = $false
    try { $cs = Get-CimInstance Win32_ComputerSystem -ErrorAction Stop; $model = "$(P $cs 'Model')"; $pst = P $cs 'PCSystemType'; $ram = [math]::Round([double](P $cs 'TotalPhysicalMemory') / 1GB, 1) } catch { }
    try { $bat = (@(Get-CimInstance Win32_Battery -ErrorAction Stop).Count -gt 0) } catch { $bat = $false }
    return [pscustomobject]@{ Model = $model; PcSystemType = $pst; RamGB = $ram; Battery = $bat }
}
function Get-RoleKind([string]$Model, $PcSystemType, [double]$RamGB, [bool]$BotHere) {
    if ($BotHere) { return 'main' }
    if ("$Model" -match '(?i)surface') { return 'surface' }
    if (("$PcSystemType" -eq '2') -and $RamGB -gt 0 -and $RamGB -le 8.5) { return 'surface' }     # a small laptop runs hot too
    return 'main'
}
$Facts = Get-PcFacts
$Kind = "$Role".ToLowerInvariant()
if ($Kind -ne 'main' -and $Kind -ne 'surface') { $Kind = Get-RoleKind $Facts.Model $Facts.PcSystemType $Facts.RamGB ([bool]$BotRoot) }
$KindText = 'MAIN PC (runs the bot and NinjaTrader)'; if ($Kind -eq 'surface') { $KindText = 'SURFACE (cooler, brighter, lighter)' }

# ------------------------------------------------------------------ the undo file (written BEFORE every change)
$Changes = New-Object System.Collections.ArrayList
function Load-State {
    $Changes.Clear()
    if (-not (Test-Path -LiteralPath $StateFile)) { return }
    try {
        $o = (Get-Content -LiteralPath $StateFile -Raw -ErrorAction Stop) | ConvertFrom-Json
        foreach ($c in @(P $o 'changes')) { if ($null -ne $c) { [void]$Changes.Add($c) } }
    } catch { Say 'FIX' "The undo file could not be read: $StateFile ($($_.Exception.Message))" }
}
function Save-State {
    if ($DryRun) { return }
    try {
        if (-not (Test-Path -LiteralPath $StateDir)) { New-Item -ItemType Directory -Path $StateDir -Force | Out-Null }
        $o = [pscustomobject]@{ v = 1; computer = "$env:COMPUTERNAME"; saved = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'); changes = @($Changes) }
        Set-Content -LiteralPath $StateFile -Value ($o | ConvertTo-Json -Depth 6) -Encoding UTF8
    } catch { Say 'FIX' "The undo file could not be written: $($_.Exception.Message)" }
}
function Find-Change([string]$Id) { foreach ($c in $Changes) { if ((P $c 'Id') -eq $Id) { return $c } }; return $null }
# keeps the FIRST before-value: running PC_CARE twice never loses what Windows had originally
function Add-Change([string]$Id, [string]$ChangeKind, [hashtable]$F) {
    if ($null -ne (Find-Change $Id)) { return }
    $o = [ordered]@{ Id = $Id; Kind = $ChangeKind; Target = ''; Name = ''; Type = ''; Before = $null; Existed = $false; Note = ''; At = (Get-Date -Format 'yyyy-MM-dd HH:mm') }
    foreach ($k in $F.Keys) { $o[$k] = $F[$k] }
    [void]$Changes.Add([pscustomobject]$o)
    Save-State
}

# ------------------------------------------------------------------ registry helpers (each records, then changes)
function Reg-Text($v) { if ($null -eq $v) { return '' }; if ($v -is [System.Array]) { return (($v | ForEach-Object { "$_" }) -join ',') }; return "$v" }
function Reg-Read([string]$Key, [string]$Name) {
    try {
        $it = Get-ItemProperty -Path $Key -Name $Name -ErrorAction Stop
        $v = P $it $Name
        if ($null -eq $v) { throw 'no value' }
        $t = 'DWord'; try { $t = [string]((Get-Item -Path $Key -ErrorAction Stop).GetValueKind($Name)) } catch { }
        return [pscustomobject]@{ Existed = $true; Value = $v; Text = (Reg-Text $v); Type = $t }
    } catch { return [pscustomobject]@{ Existed = $false; Value = $null; Text = ''; Type = '' } }
}
function Care-Reg([string]$Key, [string]$Name, $Value, [string]$Type, [string]$What) {
    $cur = Reg-Read $Key $Name
    if ($cur.Existed -and ($cur.Text -eq (Reg-Text $Value))) { Say 'OK' "$What (already)"; return 'same' }
    if ($DryRun) { Say '..' "Would: $What"; return 'would' }
    Add-Change "reg|$Key|$Name" 'reg' @{ Target = $Key; Name = $Name; Type = $(if ($cur.Existed) { $cur.Type } else { $Type }); Before = $(if ($cur.Existed) { $cur.Text } else { $null }); Existed = $cur.Existed }
    try {
        if (-not (Test-Path -Path $Key)) { New-Item -Path $Key -Force -ErrorAction Stop | Out-Null }
        New-ItemProperty -Path $Key -Name $Name -Value $Value -PropertyType $Type -Force -ErrorAction Stop | Out-Null
        Say 'OK' $What
        return 'done'
    } catch { Say 'SKIP' "$What : $($_.Exception.Message)"; return 'failed' }
}

# ------------------------------------------------------------------ power plan
function Run-Powercfg([string[]]$A) {
    $global:LASTEXITCODE = 0
    $o = ''; try { $o = (& powercfg @A 2>$null | Out-String) } catch { $o = ''; $global:LASTEXITCODE = 1 }
    return [pscustomobject]@{ Code = $LASTEXITCODE; Out = "$o" }
}
function Get-Guid([string]$Text) { $m = [regex]::Match("$Text", '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'); if ($m.Success) { return $m.Value.ToLowerInvariant() }; return '' }
$BaseBalanced = '381b4222-f694-41f0-9621-a68e2a2b1d4b'
$BaseHigh = '8c5e7fda-e8bf-4a96-9a85-cf8d6e58fbd0'
$SubSleep = '238c9fa8-0aad-41ed-83f4-97be242c8f20'; $SubVideo = '7516b95f-f776-4464-8c53-06167f40cc99'; $SubDisk = '0012ee47-9041-4b5d-9b77-535fba8b1442'
$SubUsb = '2a737441-1930-4402-8d77-b2bebba308a3'; $SubPcie = '501a4d13-42af-4429-9fd1-a8218c268e20'; $SubProc = '54533251-82be-4824-96c1-47b60b740d00'
$SubWifi = '19cab44c-1406-4e15-8d6c-e2e2a6327e25'; $SubSaver = 'e69653ca-cf7f-4f05-aa73-cb833fa90ad4'
# Fmt: min = seconds shown as minutes ('never' at 0), pct, on = 1 on / 0 off, cool = 1 active fan / 0 passive, off = 1 on / 0 off (shown "off" at 0)
# AC / DC = the value to set (-1 = leave that side alone). plugged in = AC; on battery = DC.
$PowerMain = @(
    @{ What = 'Sleep (plugged in)'; Sub = $SubSleep; Set = '29f6c1db-86da-48c5-9fdb-f2b67b1f44da'; AC = 0; DC = -1; Fmt = 'min' }
    @{ What = 'Hibernate (plugged in)'; Sub = $SubSleep; Set = '9d7815a6-7ee4-497e-8888-515a05f02364'; AC = 0; DC = -1; Fmt = 'min' }
    @{ What = 'Screen turns off after'; Sub = $SubVideo; Set = '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e'; AC = 600; DC = -1; Fmt = 'min' }
    @{ What = 'Disk goes to sleep after'; Sub = $SubDisk; Set = '6738e2c4-e8a5-4a42-b16a-e040e769756e'; AC = 0; DC = -1; Fmt = 'min' }
    @{ What = 'USB selective suspend'; Sub = $SubUsb; Set = '48e6b7a6-50f5-4782-a5d4-53bb8f07e226'; AC = 0; DC = -1; Fmt = 'on' }
    @{ What = 'PCI Express link power saving'; Sub = $SubPcie; Set = 'ee12f906-d277-404b-b6da-e5fa1a576df5'; AC = 0; DC = -1; Fmt = 'on' }
    @{ What = 'Wi-Fi power saving'; Sub = $SubWifi; Set = '12bbebe6-58d6-4636-95bb-3217ef867c1a'; AC = 0; DC = -1; Fmt = 'on' }
    @{ What = 'CPU top speed'; Sub = $SubProc; Set = 'bc5038f7-23e0-4960-96da-33abaf5935ec'; AC = 100; DC = -1; Fmt = 'pct' }
)
$PowerSurface = @(
    @{ What = 'CPU top speed (cooler: 75%)'; Sub = $SubProc; Set = 'bc5038f7-23e0-4960-96da-33abaf5935ec'; AC = 75; DC = 75; Fmt = 'pct' }
    @{ What = 'Fan (cooling policy)'; Sub = $SubProc; Set = '94d3a615-a899-4ac5-ae2b-e4d8f634367f'; AC = 1; DC = 1; Fmt = 'cool' }
    @{ What = 'Adaptive brightness (dark screen)'; Sub = $SubVideo; Set = 'fbd9aa66-9553-4097-ba44-ed6e9d65eab8'; AC = 0; DC = 0; Fmt = 'on' }
    @{ What = 'Screen brightness (plugged in)'; Sub = $SubVideo; Set = 'aded5e82-b909-4619-9949-f5d71dac0bcb'; AC = 100; DC = -1; Fmt = 'pct' }
    @{ What = 'Battery saver dims the screen'; Sub = $SubSaver; Set = '13d09884-f74e-474a-a852-b6bde8ad03a8'; AC = 100; DC = 100; Fmt = 'pct' }
    @{ What = 'Battery saver starts by itself at'; Sub = $SubSaver; Set = '5c5bb349-ad29-4ee2-9d0b-2b25270f7a81'; AC = 0; DC = -1; Fmt = 'pct' }
    @{ What = 'Screen turns off after'; Sub = $SubVideo; Set = '3c0bc021-c8a8-4e07-a973-6b14cbcb2b7e'; AC = 600; DC = 300; Fmt = 'min' }
)
function Fmt-Power($V, [string]$F) {
    if ($null -eq $V) { return '?' }
    $n = [int64]$V
    switch ($F) {
        'min' { if ($n -le 0) { return 'never' }; return ("{0} min" -f [math]::Round($n / 60)) }
        'pct' { return ("{0}%" -f $n) }
        'on' { if ($n -eq 0) { return 'off' }; return 'on' }
        'cool' { if ($n -eq 1) { return 'active (fan first)' }; return 'passive (CPU slows first)' }
        default { return "$n" }
    }
}
function Get-PowerNow([string]$Scheme, [string]$Sub, [string]$Set) {
    $r = Run-Powercfg @('/query', $Scheme, $Sub, $Set)
    $ac = $null; $dc = $null
    if ($r.Code -eq 0) {
        $m = [regex]::Match($r.Out, '(?i)Current AC Power Setting Index:\s*0x([0-9a-f]+)'); if ($m.Success) { $ac = [Convert]::ToInt64($m.Groups[1].Value, 16) }
        $m = [regex]::Match($r.Out, '(?i)Current DC Power Setting Index:\s*0x([0-9a-f]+)'); if ($m.Success) { $dc = [Convert]::ToInt64($m.Groups[1].Value, 16) }
    }
    return [pscustomobject]@{ AC = $ac; DC = $dc }
}
function Get-PowerRows { if ($Kind -eq 'surface') { return $PowerSurface }; return $PowerMain }

# the power part (needs Administrator: runs in the system part)
function Invoke-PowerPlan {
    $rows = Get-PowerRows
    $ra = Run-Powercfg @('/getactivescheme'); $active = Get-Guid $ra.Out
    $rl = Run-Powercfg @('/list'); $exists = ($rl.Out -match [regex]::Escape($PlanGuid))
    if ($DryRun) { Say '..' "Would make the power plan '$PlanName' (now active: $active) and switch to it"; return }
    $ok = $true
    if (-not $exists) {
        $bases = @($BaseHigh, $BaseBalanced); if ($Kind -eq 'surface') { $bases = @($BaseBalanced) }
        Add-Change 'power|plan' 'power' @{ Target = $PlanGuid; Before = $active; Existed = $false }
        $made = $false
        foreach ($b in $bases) {
            $r = Run-Powercfg @('/duplicatescheme', $b, $PlanGuid)
            if ($r.Code -eq 0) { $made = $true; Say 'OK' "Power plan '$PlanName' made from $(if ($b -eq $BaseBalanced) { 'Balanced' } else { 'High performance' })"; break }
        }
        if (-not $made) { Say 'SKIP' 'Power plan: Windows did not make a copy (nothing changed)'; $ok = $false }
        else { [void](Run-Powercfg @('/changename', $PlanGuid, $PlanName, "PC Care: $KindText. Undo: tools\bat\UNDO_PC_TUNE.bat")) }
    } else { Add-Change 'power|plan' 'power' @{ Target = $PlanGuid; Before = $active; Existed = $true } }
    if (-not $ok) { return }
    foreach ($s in $rows) {
        $good = $true
        if ($s.AC -ge 0) { $r = Run-Powercfg @('/setacvalueindex', $PlanGuid, $s.Sub, $s.Set, "$($s.AC)"); if ($r.Code -ne 0) { $good = $false } }
        if ($s.DC -ge 0) { $r = Run-Powercfg @('/setdcvalueindex', $PlanGuid, $s.Sub, $s.Set, "$($s.DC)"); if ($r.Code -ne 0) { $good = $false } }
        if ($good) { Say 'OK' "$($s.What): $(Fmt-Power $(if ($s.AC -ge 0) { $s.AC } else { $s.DC }) $s.Fmt)" }
        else { Say 'SKIP' "$($s.What): this PC does not have that setting (left as it is)" }
    }
    $r = Run-Powercfg @('/setactive', $PlanGuid)
    if ($r.Code -eq 0) { Say 'OK' "'$PlanName' is on. Your old plan is kept and comes back on undo." } else { Say 'SKIP' "Power plan made but not switched on (code $($r.Code))" }
}

# ------------------------------------------------------------------ search indexing: paused in market hours (system part)
function Invoke-IndexPause {
    $from = Convert-EtToLocalHm 1 15; $to = Convert-EtToLocalHm 16 5
    if ($DryRun) { Say '..' "Would pause Windows search indexing weekdays $from-$to on this PC's clock (01:15-16:05 ET) with two tasks"; return }
    $ps = 'powershell.exe'; if ($env:WINDIR) { $ps = J2 $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe' }
    $days = @('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday')
    foreach ($t in @(@($IdxPause, $from, 'Stop-Service -Name WSearch -Force -ErrorAction SilentlyContinue'), @($IdxResume, $to, 'Start-Service -Name WSearch -ErrorAction SilentlyContinue'))) {
        try {
            $existed = [bool](Get-ScheduledTask -TaskName $t[0] -ErrorAction SilentlyContinue)
            Add-Change "task|$($t[0])" 'task' @{ Target = $t[0]; Existed = $existed }
            if ($existed) { Unregister-ScheduledTask -TaskName $t[0] -Confirm:$false -ErrorAction SilentlyContinue }
            $act = New-ScheduledTaskAction -Execute $ps -Argument ("-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -Command `"" + $t[2] + "`"")
            $tr = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $days -At $t[1]
            $set = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
            $pr = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
            Register-ScheduledTask -TaskName $t[0] -InputObject (New-ScheduledTask -Action $act -Trigger $tr -Settings $set -Principal $pr -Description 'PC Care: search indexing pauses in market hours. Undo: tools\bat\UNDO_PC_TUNE.bat') -ErrorAction Stop | Out-Null
            Say 'OK' "Task $($t[0]): weekdays $($t[1])"
        } catch { Say 'SKIP' "Task $($t[0]) not added: $($_.Exception.Message)" }
    }
    if (Is-TradingWindow (Get-ET)) {              # market hours now: pause it right away (undo starts it again)
        try {
            $s = Get-Service -Name 'WSearch' -ErrorAction Stop
            if ("$(P $s 'Status')" -eq 'Running') {
                Add-Change 'svcstart|WSearch' 'svcstart' @{ Target = 'WSearch'; Before = 'Running' }
                Stop-Service -Name 'WSearch' -Force -ErrorAction Stop
                Say 'OK' 'Search indexing paused now (it is market time); it starts again after 16:05 ET'
            }
        } catch { Say 'SKIP' "Search indexing was not paused now: $($_.Exception.Message)" }
    }
}

# ------------------------------------------------------------------ startup apps (your account)
$StartupKeepRx = '(?i)security|defender|ninja|onedrive|liquidity|python|obsidian|claude|git|realtek|audio|synaptics|touchpad|elan|trackpad|surface|intel|nvidia|amd|radeon|bluetooth|wacom|logi|vpn|tailscale|teamviewer|anydesk|rustdesk|backup|antivirus|norton|mcafee|kaspersky|avast|bitdefender|malwarebytes|eset|sunshine|parsec'
$StartupOff = @(
    @{ Rx = '(?i)teams'; Why = 'Microsoft Teams chat' }
    @{ Rx = '(?i)spotify'; Why = 'Spotify' }
    @{ Rx = '(?i)discord'; Why = 'Discord' }
    @{ Rx = '(?i)steam'; Why = 'Steam game launcher' }
    @{ Rx = '(?i)epicgames|epic games'; Why = 'Epic Games launcher' }
    @{ Rx = '(?i)skype'; Why = 'Skype' }
    @{ Rx = '(?i)zoom'; Why = 'Zoom' }
    @{ Rx = '(?i)adobe|acrobat|ccx|creative cloud'; Why = 'Adobe helper' }
    @{ Rx = '(?i)itunes|ipod|iphone'; Why = 'Apple iTunes helper' }
    @{ Rx = '(?i)dropbox'; Why = 'Dropbox' }
    @{ Rx = '(?i)slack'; Why = 'Slack' }
    @{ Rx = '(?i)webex'; Why = 'Webex' }
    @{ Rx = '(?i)cortana'; Why = 'Cortana' }
    @{ Rx = '(?i)yourphone|phone ?link'; Why = 'Phone Link' }
    @{ Rx = '(?i)microsoftedgeautolaunch'; Why = 'Edge starting by itself at sign-in' }
    @{ Rx = '(?i)googlechromeautolaunch'; Why = 'Chrome starting by itself at sign-in' }
    @{ Rx = '(?i)battle\.?net|origin|ubisoft|riot|ea ?desktop|eadm'; Why = 'game launcher' }
    @{ Rx = '(?i)onenote'; Why = 'OneNote helper' }
    @{ Rx = '(?i)supportassist|jumpstart|hpsupport|lenovo ?vantage|armoury'; Why = 'PC maker helper' }
)
$RunKeyUser = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$RunKeyMachine = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
$ApprovedUser = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
function Get-RunItems([string]$Key) {
    $out = @()
    try {
        $it = Get-ItemProperty -Path $Key -ErrorAction Stop
        foreach ($pr in $it.PSObject.Properties) { if ($pr.Name -notlike 'PS*') { $out += [pscustomobject]@{ Name = $pr.Name; Command = "$($pr.Value)" } } }
    } catch { }
    return $out
}
function Get-StartupVerdict([string]$Name, [string]$Command) {
    $hay = "$Name $Command"
    if ($Name -match $StartupKeepRx -or $hay -match '(?i)ninjatrader|liquidity|nq-liquidity') { return @('keep', 'needed (security, drivers, OneDrive, NinjaTrader or the bot)') }
    foreach ($o in $StartupOff) { if ($hay -match $o.Rx) { return @('off', $o.Why) } }
    return @('unknown', 'not recognised: left alone (Task Manager > Startup apps shows it)')
}
function Test-StartupEnabled([string]$Name) {
    $cur = Reg-Read $ApprovedUser $Name
    if (-not $cur.Existed) { return $true }
    $first = 2; try { $first = [int](("$($cur.Text)").Split(',')[0]) } catch { $first = 2 }
    return (($first % 2) -eq 0)
}
function Get-StartupPlan {
    Head 'Startup apps (your account)'
    $asks = @()
    $items = @(Get-RunItems $RunKeyUser)
    $machine = @(Get-RunItems $RunKeyMachine)
    if ($items.Count -eq 0 -and $machine.Count -eq 0) { Say '..' 'No startup entries found (Task Manager > Startup apps shows the rest)'; return $asks }
    Row 'Starts at sign-in' 'Now' 'PC_CARE'
    foreach ($i in $items) {
        $v = Get-StartupVerdict $i.Name $i.Command
        $en = Test-StartupEnabled $i.Name
        if ($v[0] -eq 'off' -and $en) { Row $i.Name 'starts' "suggest OFF ($($v[1]))"; $asks += ,@($i.Name, $v[1]) }
        elseif (-not $en) { Row $i.Name 'already off' 'stays off' }
        elseif ($v[0] -eq 'keep') { Row $i.Name 'starts' 'keep (needed)' }
        else { Row $i.Name 'starts' 'keep (not recognised)' }
    }
    foreach ($i in $machine) {
        $v = Get-StartupVerdict $i.Name $i.Command
        Row $i.Name 'all users' "left alone ($(if ($v[0] -eq 'off') { 'switch off in Task Manager > Startup apps' } else { 'needed or not recognised' }))"
    }
    if ($asks.Count -eq 0) { Say 'OK' 'Nothing more to switch off at sign-in' }
    return $asks
}
function Apply-Startup($Asks) {
    foreach ($a in $Asks) {
        if ($DryRun) { Say '..' "Would ask: switch off $($a[0]) at sign-in? ($($a[1]))"; continue }
        if (-not (Ask-YN "Switch off at sign-in: $($a[0]) ($($a[1]))? Y or N")) { Say '..' "$($a[0]) kept"; continue }
        [void](Care-Reg $ApprovedUser $a[0] ([byte[]](3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)) 'Binary' "$($a[0]) no longer starts at sign-in (Task Manager > Startup apps turns it back on)")
    }
}

# ------------------------------------------------------------------ background apps + visual effects (your account)
function Invoke-Background {
    Head 'Background apps (your account)'
    if ($DryRun) { Say '..' 'Would ask: stop Store apps running in the background?'; return }
    if (-not (Ask-YN 'Stop Store apps from running in the background (they still open normally)? Y or N')) { Say '..' 'Background apps left as they are'; return }
    [void](Care-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\BackgroundAccessApplications' 'GlobalUserDisabled' 1 'DWord' 'Store apps no longer run in the background')
    [void](Care-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Search' 'BackgroundAppGlobalToggle' 0 'DWord' 'Background app switch off (Search)')
    Say '..' 'Classic programs (NinjaTrader, python, OneDrive) are not Store apps: they are not affected.'
}
function Invoke-Effects {
    Head 'Visual effects (your account)'
    if ($DryRun) { Say '..' 'Would ask: turn transparency and window animations off?'; return }
    if (-not (Ask-YN 'Turn transparency and window animations off (faster, cooler)? Y or N')) { Say '..' 'Visual effects left as they are'; return }
    [void](Care-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize' 'EnableTransparency' 0 'DWord' 'Transparency effects off')
    [void](Care-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\VisualEffects' 'VisualFXSetting' 2 'DWord' 'Visual effects set to best performance (the rest applies after you sign out and in)')
    [void](Care-Reg 'HKCU:\Control Panel\Desktop\WindowMetrics' 'MinAnimate' '0' 'String' 'Window minimize / maximize animation off')
    [void](Care-Reg 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced' 'TaskbarAnimations' 0 'DWord' 'Taskbar animations off')
}

# ------------------------------------------------------------------ the health check (read only)
function Test-Port([int]$Port) {
    $c = $null
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(400) -and $c.Connected) { $c.EndConnect($iar); return $true }
        return $false
    } catch { return $false } finally { if ($null -ne $c) { try { $c.Close() } catch { } } }
}
# the hottest temperature Windows lets a script read, in C; $null when it is not shown (most PCs without extra tools)
function Read-CpuTemp {
    try {
        $z = @(Get-CimInstance -Namespace 'root/wmi' -ClassName 'MSAcpi_ThermalZoneTemperature' -ErrorAction Stop)
        $c = @($z | ForEach-Object { [double](P $_ 'CurrentTemperature') / 10.0 - 273.15 } | Where-Object { $_ -gt 0 -and $_ -lt 150 })
        if ($c.Count -gt 0) { return [pscustomobject]@{ C = [math]::Round(($c | Measure-Object -Maximum).Maximum); From = 'ACPI thermal zone' } }
    } catch { }
    try {
        $cs = (Get-Counter -Counter '\Thermal Zone Information(*)\Temperature' -ErrorAction Stop).CounterSamples
        $c = @($cs | ForEach-Object { [double]$_.CookedValue - 273.15 } | Where-Object { $_ -gt 0 -and $_ -lt 150 })
        if ($c.Count -gt 0) { return [pscustomobject]@{ C = [math]::Round(($c | Measure-Object -Maximum).Maximum); From = 'Windows thermal counter' } }
    } catch { }
    return $null
}
function Read-CpuPerf {            # % of the CPU's base speed right now (under 100 = slowed down, over 100 = boosting)
    try { return [math]::Round([double]((Get-Counter -Counter '\Processor Information(_Total)\% Processor Performance' -ErrorAction Stop).CounterSamples[0].CookedValue)) } catch { return $null }
}
function Get-Health {
    $rows = New-Object System.Collections.ArrayList
    function Add-H([string]$Name, [string]$Value, [string]$Level, [string]$Note) { [void]$rows.Add([pscustomobject]@{ Name = $Name; Value = $Value; Level = $Level; Note = $Note }) }
    $et = Get-ET; $window = Is-TradingWindow $et
    # uptime
    try {
        $os = Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
        $boot = [DateTime](P $os 'LastBootUpTime')
        $d = [math]::Round(((Get-Date) - $boot).TotalDays, 1)
        $lv = 'ok'; $nt = ''
        if ($d -ge 10) { $lv = 'warn'; $nt = 'restart after 16:05 ET (NinjaTrader and Windows slow down over days)' }
        Add-H 'Time since the last restart' "$d days" $lv $nt
        $tot = [double](P $os 'TotalVisibleMemorySize'); $free = [double](P $os 'FreePhysicalMemory')
        if ($tot -gt 0) {
            $pct = [math]::Round(100 * (1 - $free / $tot)); $lv = 'ok'; $nt = ''
            if ($pct -ge 95) { $lv = 'bad'; $nt = 'almost out of memory: close browser tabs / apps' } elseif ($pct -ge 88) { $lv = 'warn'; $nt = 'memory is tight: close browser tabs / apps' }
            Add-H 'Memory (RAM) in use' ("$pct% of {0:N1} GB" -f ($tot / 1MB)) $lv $nt
        }
    } catch { Add-H 'Time since the last restart' 'not readable' 'info' 'Windows did not answer' }
    # disk
    try {
        $sd = $env:SystemDrive; if (-not $sd) { $sd = 'C:' }
        $fr = [math]::Round(([double](New-Object System.IO.DriveInfo $sd).AvailableFreeSpace) / 1GB, 1)
        if ($env:LE_T_FREE_GB) { $fr = [double]$env:LE_T_FREE_GB }
        $lv = 'ok'; $nt = ''
        if ($fr -lt 2) { $lv = 'bad'; $nt = 'run tools\bat\CLEAN_STORAGE.bat now' } elseif ($fr -lt 15) { $lv = 'warn'; $nt = 'run tools\bat\CLEAN_STORAGE.bat' }
        Add-H "Disk space free ($sd)" "$fr GB" $lv $nt
    } catch { Add-H 'Disk space free' 'not readable' 'info' '' }
    # temperature + speed (honest when not readable)
    $tp = Read-CpuTemp
    if ($null -ne $tp) {
        $lv = 'ok'; $nt = "from the $($tp.From)"
        if ($tp.C -ge 90) { $lv = 'bad'; $nt = "very hot: lift the PC, clean the vents, close heavy apps (from the $($tp.From))" } elseif ($tp.C -ge 80) { $lv = 'warn'; $nt = "hot: give it air (from the $($tp.From))" }
        Add-H 'Temperature' "$($tp.C) C" $lv $nt
    } else { Add-H 'Temperature' 'not shown by Windows' 'info' 'a script cannot read the CPU temperature on this PC; HWiNFO or Core Temp show it' }
    $pf = Read-CpuPerf
    if ($null -ne $pf) { Add-H 'CPU speed vs its base speed' "$pf%" 'info' $(if ($pf -lt 60) { 'running slow: hot, capped or on battery saver' } else { 'normal' }) }
    # power plan: the PC must not sleep (main PC)
    if ($Kind -eq 'main') {
        $ra = Run-Powercfg @('/getactivescheme'); $act = Get-Guid $ra.Out
        if ($act) {
            $now = Get-PowerNow $act $SubSleep '29f6c1db-86da-48c5-9fdb-f2b67b1f44da'
            if ($null -eq $now.AC) { Add-H 'Sleep when plugged in' 'not readable' 'info' '' }
            elseif ([int64]$now.AC -eq 0) { Add-H 'Sleep when plugged in' 'never' 'ok' '' }
            else { Add-H 'Sleep when plugged in' (Fmt-Power $now.AC 'min') 'warn' 'the PC can fall asleep and the bot stops: run tools\bat\PC_CARE.bat' }
        }
    }
    # battery (Surface / laptop)
    try {
        $b = @(Get-CimInstance Win32_Battery -ErrorAction Stop)
        if ($b.Count -gt 0) {
            $pct = [int](P $b[0] 'EstimatedChargeRemaining'); $st = [int](P $b[0] 'BatteryStatus')
            $plugged = ($st -ne 1)
            $lv = 'ok'; $nt = ''
            if (-not $plugged -and $Kind -eq 'main') { $lv = 'warn'; $nt = 'the main PC is on battery: plug it in' }
            Add-H 'Battery' ("$pct% " + $(if ($plugged) { 'plugged in' } else { 'on battery' })) $lv $nt
        }
    } catch { }
    # NinjaTrader and the bot (main PC, in market hours)
    if ($Kind -eq 'main') {
        $ntRun = (@(Get-Process -Name 'NinjaTrader*' -ErrorAction SilentlyContinue).Count -gt 0)
        $lv = 'info'; $nt = ''
        if ($window -and -not $ntRun) { $lv = 'warn'; $nt = 'market hours and NinjaTrader is not running: no orders can go out' }
        Add-H 'NinjaTrader 8' $(if ($ntRun) { 'running' } else { 'not running' }) $lv $nt
        if ($BotRoot) {
            $port = 8766; if ($env:PORT) { try { $port = [int]$env:PORT } catch { } }
            $up = Test-Port $port
            $lv = 'info'; $nt = ''
            if ($window -and -not $up) { $lv = 'warn'; $nt = 'market hours and the bot does not answer: START_BOT.bat' }
            Add-H 'Bot server' $(if ($up) { 'answering' } else { 'not answering' }) $lv $nt
        }
    }
    return ,$rows
}
function Show-Health {
    Head 'Health check (read only)'
    $rows = Get-Health
    Row 'What' 'Now' 'Note'
    $worst = 'ok'; $why = @()
    foreach ($h in $rows) {
        Row $h.Name $h.Value $h.Note
        if ($h.Level -eq 'bad') { $worst = 'bad'; $why += $h.Name } elseif ($h.Level -eq 'warn' -and $worst -ne 'bad') { $worst = 'warn'; $why += $h.Name } elseif ($h.Level -eq 'warn') { $why += $h.Name }
    }
    $label = 'BOT PC HEALTHY'; if ($Kind -eq 'surface') { $label = 'THIS PC (Surface) HEALTHY' }
    if ($worst -eq 'ok') { $text = "${label}: YES"; Say 'OK' $text }
    else {
        $text = "${label}: NO, look at: " + ($why -join ', ')
        if ($worst -eq 'bad') { Say 'FIX' $text } else { Say 'SKIP' $text }
    }
    return [pscustomobject]@{ Level = $worst; Text = $text }
}
function Write-CareJson($H, [string]$Ran, [int]$Applied) {
    if ($DryRun) { return }
    try {
        $o = [ordered]@{ v = 1; t = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()); computer = "$env:COMPUTERNAME"; role = $Kind
                         level = "$($H.Level)"; text = "$($H.Text)"; ran = $Ran; changes = $Applied }
        $d = Split-Path -Parent $CareJson
        if (-not (Test-Path -LiteralPath $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
        Set-Content -LiteralPath $CareJson -Value ($o | ConvertTo-Json) -Encoding UTF8
    } catch { Say 'SKIP' "Could not write $CareJson : $($_.Exception.Message)" }
}

# ------------------------------------------------------------------ the plain table
function Show-Plan {
    Head "PC CARE: $KindText, $($Facts.RamGB) GB$(if ($DryRun) { ' - DRY RUN: the table, nothing changed' })"
    if ($BotRoot) { Say '..' "This PC: $env:COMPUTERNAME. Bot folder found: $BotRoot" } else { Say '..' "This PC: $env:COMPUTERNAME. No bot folder here." }
    Say '..' "Undo: tools\bat\UNDO_PC_TUNE.bat puts back everything below (undo files: $UserState and $SysState)"
    Head 'What changes (plugged in = AC, on battery = DC)'
    Row 'What' 'Now' 'After PC_CARE'
    $ra = Run-Powercfg @('/getactivescheme'); $act = Get-Guid $ra.Out
    foreach ($s in (Get-PowerRows)) {
        $now = '?'
        if ($act) {
            $n = Get-PowerNow $act $s.Sub $s.Set
            $v = $n.AC; if ($s.AC -lt 0) { $v = $n.DC }
            if ($null -ne $v) { $now = Fmt-Power $v $s.Fmt }
        }
        $after = Fmt-Power $(if ($s.AC -ge 0) { $s.AC } else { $s.DC }) $s.Fmt
        if ($s.AC -ge 0 -and $s.DC -ge 0 -and $s.AC -ne $s.DC) { $after = "$(Fmt-Power $s.AC $s.Fmt) AC, $(Fmt-Power $s.DC $s.Fmt) battery" }
        Row $s.What $now $after
    }
    Row 'Power plan' 'your current plan' "'$PlanName' (a copy; the old plan comes back on undo)"
    Row 'Startup apps' 'see the list below' 'asks Y/N for each suggested one'
    Row 'Background apps (Store)' 'allowed' 'off'
    Row 'Visual effects' 'on' 'transparency + animations off'
    Row 'Search indexing' 'always on' "paused weekdays $(Convert-EtToLocalHm 1 15)-$(Convert-EtToLocalHm 16 5) (01:15-16:05 ET)"
    if ($Kind -eq 'surface') {
        Head 'Dark screen: two things a script cannot set, do them once by hand'
        Say '..' '1. Settings > System > Display > Brightness: untick "Change brightness automatically when lighting changes" and untick "Help improve battery by optimizing the content shown and brightness" (content adaptive brightness; it is the driver''s, Windows scripts cannot reach it).'
        Say '..' '2. Settings > System > Power & battery > Battery saver: set "Turn battery saver on automatically at" to Never, and "Lower screen brightness when using battery saver" off. PC_CARE already sets the plugged-in parts.'
    }
}

# ------------------------------------------------------------------ undo
function Undo-One($C) {
    $k = "$(P $C 'Kind')"; $t = "$(P $C 'Target')"; $n = "$(P $C 'Name')"; $b = P $C 'Before'; $ex = [bool](P $C 'Existed')
    switch ($k) {
        'reg' {
            if ($ex) {
                $ty = "$(P $C 'Type')"; if (-not $ty) { $ty = 'DWord' }
                $v = $b
                if ($ty -eq 'DWord') { $v = [int]$b } elseif ($ty -eq 'QWord') { $v = [long]$b }
                elseif ($ty -eq 'Binary') { $v = [byte[]]@(("$b").Split(',') | ForEach-Object { [byte]$_ }) }
                if (-not (Test-Path -Path $t)) { New-Item -Path $t -Force -ErrorAction Stop | Out-Null }
                New-ItemProperty -Path $t -Name $n -Value $v -PropertyType $ty -Force -ErrorAction Stop | Out-Null
                return "$t\$n back to $b"
            }
            Remove-ItemProperty -Path $t -Name $n -ErrorAction Stop
            return "$t\$n removed (it was not set before)"
        }
        'power' {
            $list = (Run-Powercfg @('/list')).Out
            $target = "$b"
            if (-not $target -or $list -notmatch [regex]::Escape($target) -or $target -eq $t) { $target = $BaseBalanced }     # the old plan is gone: Balanced
            $r = Run-Powercfg @('/setactive', $target); if ($r.Code -ne 0) { throw "powercfg /setactive ${target}: code $($r.Code)" }
            if (-not $ex) { [void](Run-Powercfg @('/delete', $t)) }
            return "power plan back to $target$(if (-not $ex) { "; '$PlanName' deleted" })"
        }
        'task' { if (Get-ScheduledTask -TaskName $t -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $t -Confirm:$false -ErrorAction Stop }; return "task $t removed" }
        'svcstart' { Start-Service -Name $t -ErrorAction Stop; return "$t started again" }
        default { throw "unknown change kind '$k'" }
    }
}
$PartText = 'your account'; if ($SystemPart) { $PartText = 'Windows part' }
function Invoke-UndoPart {
    Head "UNDO PC CARE ($PartText)$(if ($DryRun) { ' - DRY RUN: shows what would be put back' })"
    Load-State
    if ($Changes.Count -eq 0) { Say 'OK' "Nothing to undo here (no $StateFile)"; return 0 }
    $left = New-Object System.Collections.ArrayList
    $all = @($Changes); [array]::Reverse($all)
    foreach ($c in $all) {
        if ($DryRun) { Say '..' ("Would undo: {0} {1} {2} (before: {3})" -f (P $c 'Kind'), (P $c 'Target'), (P $c 'Name'), (P $c 'Before')); continue }
        try { Say 'OK' (Undo-One $c) } catch { Say 'SKIP' ("Not undone: {0} {1} {2}: {3}" -f (P $c 'Kind'), (P $c 'Target'), (P $c 'Name'), $_.Exception.Message); [void]$left.Insert(0, $c) }
    }
    if ($DryRun) { return 0 }
    $Changes.Clear(); foreach ($c in $left) { [void]$Changes.Add($c) }
    if ($left.Count -eq 0) {
        try { Move-Item -LiteralPath $StateFile -Destination (J2 $StateDir ((Split-Path -Leaf $StateFile) + '.undone-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))) -Force -ErrorAction Stop } catch { }
        Say 'OK' 'Everything PC Care changed here is back as it was.'
        return 0
    }
    Save-State
    Say 'FIX' "$($left.Count) change(s) could not be undone (above); they stay in $StateFile. Run tools\bat\UNDO_PC_TUNE.bat again, or send this window to Claude."
    return 1
}
function Test-HasSystemState {
    if (-not (Test-Path -LiteralPath $SysState)) { return $false }
    try { $o = (Get-Content -LiteralPath $SysState -Raw) | ConvertFrom-Json; return (@(P $o 'changes').Count -gt 0) } catch { return $true }
}

# ------------------------------------------------------------------ the elevated part
function Start-SystemPart([string[]]$Extra) {
    if ($IsAdmin) { return $false }
    Say '..' 'Windows asks "Do you want to allow this app to make changes?": click Yes. The Windows part runs in a second window; this one waits for it.'
    try {
        $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-SystemPart', '-Yes', '-Log', "`"$Log`"", '-Role', $Kind) + $Extra
        $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -PassThru -Wait
        if ($null -ne $p -and $p.ExitCode -eq 0) { Say 'OK' 'Windows part done (its lines are in the log)' } else { Say 'SKIP' 'Windows part ended early' }
        return $true
    } catch { Say 'SKIP' 'Windows part not run (Administrator was declined). Double-click tools\bat\PC_CARE.bat again and click Yes to do the power plan.'; return $true }
}

# ================================================================== the elevated Windows part
if ($SystemPart) {
    if ($Undo) { exit (Invoke-UndoPart) }
    Head "WINDOWS PART (Administrator)$(if ($DryRun) { ' - dry run' })"
    Load-State
    Invoke-PowerPlan
    if ($WithIndex) { Invoke-IndexPause }
    exit 0
}

# ================================================================== your account part
if ($Undo) {
    $code = Invoke-UndoPart
    if (Test-HasSystemState) {
        if ($IsAdmin) { $StateFile = $SysState; $StateDir = Split-Path -Parent $StateFile; $PartText = 'Windows part'; $c2 = Invoke-UndoPart; if ($c2 -ne 0) { $code = $c2 } }
        elseif (-not $DryRun) { [void](Start-SystemPart @('-Undo')) }
    }
    exit $code
}

Show-Plan
if ($CheckOnly) {
    $h = Show-Health
    Write-CareJson $h 'check' 0
    Say '..' "Log: $Log"
    exit 0
}
$startupAsks = @(Get-StartupPlan)
if ($DryRun) {
    Apply-Startup $startupAsks
    Invoke-Background; Invoke-Effects
    Head 'Windows part'
    Invoke-PowerPlan; Invoke-IndexPause
    $h = Show-Health
    Say 'OK' 'DRY RUN: nothing was changed.'
    Say '..' "Log: $Log"
    exit 0
}
Write-Host ""
if (-not (Ask-YN 'Do this now (power plan first, then a few questions)? Type Y then Enter (anything else stops, nothing is changed)')) {
    Say 'OK' 'Stopped: nothing was changed.'
    $h = Show-Health
    Write-CareJson $h 'check' 0
    exit 0
}
try {      # a copy next to the undo file, so tools\bat\UNDO_PC_TUNE.bat can undo even when tools\bat\PC_CARE.bat was downloaded alone
    $selfCopy = J2 (Split-Path -Parent $UserState) 'pc_care.ps1'
    if ($PSCommandPath -and ($PSCommandPath -ne $selfCopy)) {
        if (-not (Test-Path -LiteralPath (Split-Path -Parent $selfCopy))) { New-Item -ItemType Directory -Path (Split-Path -Parent $selfCopy) -Force | Out-Null }
        Copy-Item -LiteralPath $PSCommandPath -Destination $selfCopy -Force -ErrorAction Stop
    }
} catch { }
Load-State
Apply-Startup $startupAsks
Invoke-Background
Invoke-Effects
$doIdx = Ask-YN "Pause Windows search indexing during market hours (weekdays 01:15-16:05 ET)? Files are found slower then; apps are still found. Y or N"
$userChanges = $Changes.Count

Head 'Windows part (power plan and search indexing)'
$extra = @(); if ($doIdx) { $extra += '-WithIndex' }
if ($IsAdmin) {
    $StateFile = $SysState; $StateDir = Split-Path -Parent $StateFile; $Changes.Clear(); Load-State
    Invoke-PowerPlan
    if ($doIdx) { Invoke-IndexPause }
    $sysChanges = $Changes.Count
} else {
    [void](Start-SystemPart $extra)
    $sysChanges = 0
    if (Test-HasSystemState) { $sysChanges = 1 }
}
$h = Show-Health
Write-CareJson $h 'care' ($userChanges + $sysChanges)
Head 'Result'
Say 'OK' "PC Care done on $env:COMPUTERNAME ($Kind). $($h.Text)"
if ($Kind -eq 'surface') { Say '..' 'Dark screen: do the two tick boxes above by hand once (a script cannot set them).' }
Say '..' "To put everything back: tools\bat\UNDO_PC_TUNE.bat. Log: $Log"
exit 0
