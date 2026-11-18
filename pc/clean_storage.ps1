<#
CLEAN_STORAGE (double-click CLEAN_STORAGE.bat). The owner, 2026-11-04: "an easy way to clear storage through both of my
computers". One run: it shows a plain table of what it would free, asks Y, then clears ONLY safe things, and ends with
"Freed X GB. C: now Y GB free."

What it clears (only inside the allow-list below; every delete goes through Remove-SafeFile, which refuses anything else):
  Your account (no Administrator):
    - temp files older than 1 day (3 days while the bot or NinjaTrader is running), empty temp folders
    - browser caches (Edge, Chrome, Brave, Firefox): caches only, never passwords, cookies, history or sign-ins
    - thumbnail and icon caches, crash dumps and error reports of your account, npm and pip caches
    - NinjaTrader: its old log and trace files (14+ days) and its cache folders. NEVER workspaces, templates, bin, the
      database (db), le_feed (the bot's bars), incoming / outgoing (orders)
    - the bot's own: logs older than 14 days, backups\ zips older than 14 days (the 3 newest stay), data\*.corrupt-* older
      than 14 days, reports\tmp, __pycache__. NEVER data\ state files, .env.local.ps1, live_state*, accounts, journals,
      the bar archive data\nt_bars
    - Recycle Bin (asks)
  Windows (Administrator: Windows asks once; only for this part):
    - Windows temp, Windows Update download cache (SoftwareDistribution\Download), Delivery Optimization cache, Windows
      crash dumps and error reports, old Windows logs, Windows.old (asks; it is big)
  OneDrive: a hint for "Free up space" (Files On-Demand); nothing is deleted there.

If the bot or NinjaTrader is RUNNING: everything that could touch them is skipped (NinjaTrader folder, the bot folder,
Windows.old); only temp, caches and Windows are cleaned, and it says so.

  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clean_storage.ps1             (CLEAN_STORAGE.bat runs this)
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\clean_storage.ps1 -DryRun     (the table only, deletes nothing)
  ... -Yes            (no Y question; the Recycle Bin and Windows.old still stay asked unless -Extras)
  ... -KeepDays 30    (bot logs / backups / corrupt files older than 30 days instead of 14)
Log: logs\clean_storage-YYYYMMDD-HHMM.txt (bot folder) or %LOCALAPPDATA%\LiquidityEngine\logs (no bot folder): every removed
file with its size. Works on the Surface (bot folder there or not) and on the main PC.
#>
param(
    [switch]$DryRun,
    [switch]$Yes,           # the Y question is answered
    [switch]$Extras,        # also answer Y to the Recycle Bin and Windows.old questions
    [int]$KeepDays = 14,    # the bot's own logs / backups / corrupt files
    [switch]$SystemPart,    # internal: the elevated Windows part, started by this script with a UAC prompt
    [switch]$WithWinOld,    # internal: (system part) Windows.old was answered Y
    [string]$Log = "",      # internal: the same log file for both parts
    [string]$Result = ""    # internal: where the elevated part writes what it freed
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
$script:Freed = [int64]0
$script:Files = 0
$script:Locked = 0
$script:Refused = 0
$script:LogLines = 0
$script:LogCap = 30000
$script:Allow = New-Object 'System.Collections.Generic.List[string]'      # allowed directory roots
$script:AllowFile = New-Object 'System.Collections.Generic.List[string]'  # allowed single files
$script:TreeRoot = ''                                                    # the one folder that may be removed whole (Windows.old)
$script:Seen = New-Object 'System.Collections.Generic.HashSet[string]'   # a file is counted once
$Sep = [System.IO.Path]::DirectorySeparatorChar

# path joins use .NET (Join-Path is slow in a loop); only a bare drive ('C:') needs Join-Path (Get-WinOldDir)
function J2([string]$A, [string]$B) { return [System.IO.Path]::Combine($A, $B) }
function Pj([string[]]$Parts) {
    $r = $null
    foreach ($p in $Parts) { if (-not $p) { return $null }; if ($null -eq $r) { $r = $p } else { $r = J2 $r $p } }
    return $r
}
function Norm([string]$P) { if (-not $P) { return '' }; return $P.TrimEnd('\', '/') }

# ------------------------------------------------------------------ where things are
function Test-BotFolder([string]$Dir) {
    if (-not $Dir) { return $false }
    return ((Test-Path -LiteralPath (J2 $Dir 'server.py')) -and (Test-Path -LiteralPath (Pj @($Dir, 'engine', 'ninjatrader.py'))))
}
$BotRoot = ''
foreach ($c in @((Split-Path -Parent $PSScriptRoot), $env:LE_BOT_DIR, $(if ($env:USERPROFILE) { J2 $env:USERPROFILE 'nq-liquidity-engine' }))) {
    if ($c -and (Test-BotFolder $c)) { $BotRoot = Norm $c; break }
}
$LogDir = ''
if ($BotRoot) { $LogDir = J2 $BotRoot 'logs' }
else {
    $lb = $env:LOCALAPPDATA; if (-not $lb) { $lb = [System.IO.Path]::GetTempPath() }
    $LogDir = Pj @($lb, 'LiquidityEngine', 'logs')
}
if (-not (Test-Path -LiteralPath $LogDir)) { try { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null } catch { } }
if (-not $Log) { $Log = J2 $LogDir ("clean_storage-" + (Get-Date -Format 'yyyyMMdd-HHmm') + ".txt") }

function Say([string]$Kind, [string]$Text) {
    $line = "  [$Kind] $Text"
    $color = 'Gray'
    if ($Kind -eq 'OK') { $color = 'Green' } elseif ($Kind -eq 'FIX') { $color = 'Red' } elseif ($Kind -eq 'SKIP') { $color = 'Yellow' }
    Write-Host $line -ForegroundColor $color
    Flush-Log
    try { Add-Content -LiteralPath $Log -Value $line -Encoding UTF8 } catch { }
}
function Head([string]$Text) { Flush-Log; Write-Host ""; Write-Host $Text -ForegroundColor Cyan; try { Add-Content -LiteralPath $Log -Value ("`r`n" + $Text) -Encoding UTF8 } catch { } }
$script:LogBuf = New-Object 'System.Collections.Generic.List[string]'
function Flush-Log {
    if ($script:LogBuf.Count -eq 0) { return }
    try { Add-Content -LiteralPath $Log -Value $script:LogBuf.ToArray() -Encoding UTF8 } catch { }
    $script:LogBuf.Clear()
}
function Log-Only([string]$Text) {
    if ($script:LogLines -ge $script:LogCap) { return }
    $script:LogLines++
    if ($script:LogLines -eq $script:LogCap) { $Text = "(more removed files are not listed one by one: the log keeps the first $($script:LogCap) lines)" }
    $script:LogBuf.Add($Text)
    if ($script:LogBuf.Count -ge 500) { Flush-Log }
}
function Fmt([double]$B) {
    if ($B -ge 1GB) { return ("{0:N1} GB" -f ($B / 1GB)) }
    if ($B -ge 1MB) { return ("{0:N0} MB" -f ($B / 1MB)) }
    if ($B -gt 0) { return ("{0:N0} KB" -f [math]::Max(1, $B / 1KB)) }
    return '0'
}

# ------------------------------------------------------------------ is the bot / NinjaTrader running?
function Test-Port([int]$Port) {
    $c = $null
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $iar = $c.BeginConnect('127.0.0.1', $Port, $null, $null)
        if ($iar.AsyncWaitHandle.WaitOne(400) -and $c.Connected) { $c.EndConnect($iar); return $true }
        return $false
    } catch { return $false } finally { if ($null -ne $c) { try { $c.Close() } catch { } } }
}
function Test-NtRunning { return (@(Get-Process -Name 'NinjaTrader*' -ErrorAction SilentlyContinue).Count -gt 0) }
function Test-BotRunning {
    $port = 8766; if ($env:PORT) { try { $port = [int]$env:PORT } catch { } }
    if (Test-Port $port) { return $true }                                   # the bot server answers
    try {                                                                   # python / the supervisor started from a bot folder
        $ps = @(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.Name -match '^(python|pythonw|powershell|pwsh)(\.exe)?$' -and $_.CommandLine -match 'server\.py|run_bot\.ps1|engine[\\/.]live|lit_live' })
        if ($ps.Count -gt 0) { return $true }
    } catch { }
    if ($BotRoot) {
        try {
            $pf = Pj @($BotRoot, 'logs', 'supervisor.pid')
            if (Test-Path -LiteralPath $pf) {
                $pidv = [int](Get-Content -LiteralPath $pf -TotalCount 1)
                if (@(Get-Process -Id $pidv -ErrorAction SilentlyContinue).Count -gt 0) { return $true }
            }
        } catch { }
    }
    return $false
}
function Test-Admin {
    if ($env:LE_T_ELEVATED) { return ($env:LE_T_ELEVATED -eq '1') }
    try { $isAdmin = [bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator); return $isAdmin } catch { return $false }
}
$IsAdmin = Test-Admin
$NtRun = Test-NtRunning
$BotRun = Test-BotRunning
$Busy = ($NtRun -or $BotRun)

# ------------------------------------------------------------------ the allow-list and the never-touch list
$ProtectName = @('^\.env', '^live_state', '^ninjatrader_state\.json$', '^guards_state', '^accounts', 'journal', '^memory\.db', '^alerts\.json$',
                 '^tv(_device)?\.json$', '^autostart\.json$', '^start_bot\.json$', '^live_model', '^lit_learning', '^supervisor\.(pid|stop)$',
                 '^(cookies|login data|web data|history|bookmarks|preferences|local state|key4\.db|logins\.json|places\.sqlite)',
                 '^id_(rsa|dsa|ecdsa|ed25519)', '\.(pem|key|ppk|kdbx|p12|pfx|wallet)$', '^(known_hosts|authorized_keys)$')
# folder names that protect everything inside them, wherever they are in the path / only below the allowed root
$ProtectDirAbs = @('nt_bars', '.git', 'workspaces', 'templates', 'le_feed', 'incoming', 'outgoing', '.ssh', '.aws', '.gnupg')
$ProtectDirRel = @('bin', 'backup', 'sampledata', 'custom')
$ProtectDir = $ProtectDirAbs + $ProtectDirRel
function Get-NtFolders {
    $out = @()
    $cands = @($env:NINJATRADER_FOLDER)
    foreach ($docs in @([Environment]::GetFolderPath('MyDocuments'), $(if ($env:OneDrive) { J2 $env:OneDrive 'Documents' }))) {
        if ($docs) { $cands += (J2 $docs 'NinjaTrader 8') }
    }
    foreach ($nt in $cands) { if ($nt -and (Test-Path -LiteralPath $nt) -and ($out -notcontains (Norm $nt))) { $out += (Norm $nt) } }
    return ,$out
}
$NtFolders = Get-NtFolders

# roots that may never be a root of anything (a wrong environment variable must not widen the allow-list)
function Get-Forbidden {
    $f = @($env:USERPROFILE, $env:WINDIR, $env:SystemDrive, $env:ProgramData, $env:LOCALAPPDATA, $env:APPDATA, $env:OneDrive, $env:HOME,
           $BotRoot, [Environment]::GetFolderPath('MyDocuments'), [Environment]::GetFolderPath('Desktop'))
    $f += $NtFolders
    # a person's own folders are never a root, whatever an environment variable says (Downloads, Pictures, Desktop ...; OneDrive's too)
    foreach ($base in @($env:USERPROFILE, $env:OneDrive, $env:HOME)) {
        if (-not $base) { continue }
        foreach ($pf in @('Downloads', 'Documents', 'Desktop', 'Pictures', 'Videos', 'Music', 'Dropbox', 'Google Drive', 'iCloudDrive', '.ssh', '.aws', '.gnupg')) { $f += (J2 $base $pf) }
    }
    $out = @(); foreach ($x in $f) { if ($x) { $out += (Norm $x).ToLowerInvariant() } }
    return ,$out
}
# a root INSIDE one of those personal folders is refused too (NinjaTrader's folder and the bot folder, wherever they sit, are the exceptions)
function Test-InPersonal([string]$P) {
    $n = (Norm $P).ToLowerInvariant()
    foreach ($nt in (@($NtFolders) + @($BotRoot))) { if (-not $nt) { continue }; $t = (Norm $nt).ToLowerInvariant(); if ($n -eq $t -or $n.StartsWith($t + '\') -or $n.StartsWith($t + '/')) { return $false } }
    foreach ($base in @($env:USERPROFILE, $env:OneDrive, $env:HOME)) {
        if (-not $base) { continue }
        foreach ($pf in @('Downloads', 'Documents', 'Desktop', 'Pictures', 'Videos', 'Music', 'Dropbox', 'Google Drive', 'iCloudDrive', '.ssh', '.aws', '.gnupg')) {
            $r = (Norm (J2 $base $pf)).ToLowerInvariant()
            if ($n -eq $r -or $n.StartsWith($r + '\') -or $n.StartsWith($r + '/')) { return $true }
        }
    }
    return $false
}
$Forbidden = Get-Forbidden
function Test-RootSane([string]$P) {
    if (-not $P) { return $false }
    $n = (Norm $P).ToLowerInvariant()
    if ($Forbidden -contains $n) { return $false }
    if (Test-InPersonal $P) { return $false }
    if ($n.Length -lt 8) { return $false }
    $cnt = 0
    foreach ($sg in $n.Split([char[]]@('\', '/'))) { if ($sg) { $cnt++ } }
    return ($cnt -ge 3)
}
function Add-AllowDir([string]$P) {
    if (-not (Test-RootSane $P)) { return $false }
    $n = Norm $P
    if (-not $script:Allow.Contains($n)) { $script:Allow.Add($n) }
    return $true
}
function Add-AllowFile([string]$P) {
    if (-not $P -or -not (Test-RootSane $P)) { return $false }
    if (-not $script:AllowFile.Contains($P)) { $script:AllowFile.Add($P) }
    return $true
}
function Test-UnderRoot([string]$Full, [string]$Root) {
    $r = Norm $Root
    return $Full.StartsWith($r + $Sep, [System.StringComparison]::OrdinalIgnoreCase) -or $Full.StartsWith($r + '/', [System.StringComparison]::OrdinalIgnoreCase)
}
function Get-AllowRoot([string]$Full) {
    if ($script:AllowFile.Contains($Full)) { return $Full }
    $best = ''
    foreach ($r in $script:Allow) { if ((Test-UnderRoot $Full $r) -and $r.Length -gt $best.Length) { $best = $r } }
    return $best
}
# One compiled expression per list (a delete check runs for every file: caches hold tens of thousands).
$ReIgn = [System.Text.RegularExpressions.RegexOptions]::IgnoreCase
$ProtectNameRx = [regex]::new(($ProtectName -join '|'), $ReIgn)
$AbsDirRx = [regex]::new('(^|[\\/])(' + (($ProtectDirAbs | ForEach-Object { [regex]::Escape($_) }) -join '|') + '|nt_workspaces-[^\\/]*)([\\/]|$)', $ReIgn)
$RelDirRx = [regex]::new('(^|[\\/])(' + (($ProtectDirRel | ForEach-Object { [regex]::Escape($_) }) -join '|') + ')([\\/]|$)', $ReIgn)
$CorruptRx = [regex]::new('\.corrupt-\d+$', $ReIgn)
# anywhere else in the bot folder (logs\, backups\ ...) these file types are the bot's own state, code or settings: never
$BotKeepRx = [regex]::new('\.(json|jsonl|db|csv|xml|pid|stop|ps1|py|cs|bat|md|ya?ml|toml|ini|env|sqlite)$', $ReIgn)
$script:DirCache = New-Object 'System.Collections.Generic.Dictionary[string,string]' ([System.StringComparer]::OrdinalIgnoreCase)
$BotData = ''; if ($BotRoot) { $BotData = Norm (J2 $BotRoot 'data') }
# 'ok' (files in this folder may go), 'data' (the bot's data folder: only *.corrupt-<n> files), 'no' (outside the allow-list
# or in a never-touch place). Cached per folder; a root registered later can only make an earlier 'no' too strict, never too loose.
function Get-DirDecision([string]$Dir) {
    $d = $null
    if ($script:DirCache.TryGetValue($Dir, [ref]$d)) { return $d }
    $res = 'no'
    $probe = $Dir + $Sep + 'x'
    $root = Get-AllowRoot $probe
    if ($root) {
        $res = 'ok'
        if ($AbsDirRx.IsMatch($Dir)) { $res = 'no' }                                   # nt_bars, workspaces, le_feed ... anywhere in the path
        elseif ($Dir.Length -gt $root.Length -and $RelDirRx.IsMatch($Dir.Substring($root.Length))) { $res = 'no' }   # bin, backup ... below the root
        elseif ($BotData -and (Test-UnderRoot $probe $BotData)) {                      # the bot's data folder: only *.corrupt-<n> directly inside it
            if ((Norm $Dir) -ieq $BotData) { $res = 'data' } else { $res = 'no' }
        } elseif ($BotRoot -and (Test-UnderRoot $probe $BotRoot)) {                     # the rest of the bot folder: no state / code / settings files
            if (Test-UnderRoot $probe (Pj @($BotRoot, 'reports', 'tmp'))) { $res = 'ok' } else { $res = 'bot' }
        } else {
            foreach ($nt in $NtFolders) {                                              # NinjaTrader's db is only touched in db\cache
                if ((Test-UnderRoot $probe (J2 $nt 'db')) -and -not (Test-UnderRoot $probe (Pj @($nt, 'db', 'cache')))) { $res = 'no' }
            }
        }
    }
    $script:DirCache[$Dir] = $res
    return $res
}
function Test-Deletable([string]$Full) {
    if (-not $Full) { return $false }
    $name = [System.IO.Path]::GetFileName($Full)
    if (-not $name -or $ProtectNameRx.IsMatch($name)) { return $false }
    if ($script:AllowFile.Contains($Full)) { return $true }
    $dec = Get-DirDecision ([System.IO.Path]::GetDirectoryName($Full))
    if ($dec -eq 'ok') { return $true }
    if ($dec -eq 'data') { return $CorruptRx.IsMatch($name) }
    if ($dec -eq 'bot') { return -not $BotKeepRx.IsMatch($name) }
    return $false
}

# the ONLY places that delete: Remove-SafeFile (one file), Remove-SafeEmptyDir (an empty folder), Remove-SafeTree (Windows.old)
function Remove-SafeFile([string]$Path, [int64]$Len) {
    if (-not (Test-Deletable $Path)) { $script:Refused++; Log-Only "  REFUSED (not on the allow-list) $Path"; return $false }
    if ($DryRun) { return $true }
    try {
        $attr = [System.IO.File]::GetAttributes($Path)
        if (($attr -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { $script:Refused++; return $false }
        [System.IO.File]::SetAttributes($Path, [System.IO.FileAttributes]::Normal)
        [System.IO.File]::Delete($Path)
        return $true
    } catch { $script:Locked++; return $false }
}
function Remove-SafeEmptyDir([string]$Path) {
    if ((Get-DirDecision $Path) -ne 'ok' -or -not (Get-AllowRoot ($Path + $Sep + 'x'))) { return }
    if ($DryRun) { return }
    try { [System.IO.Directory]::Delete($Path, $false) } catch { }          # fails (kept) when the folder is not empty
}
function Remove-SafeTree([string]$Path) {
    if (-not $script:TreeRoot -or -not ((Norm $Path) -ieq $script:TreeRoot) -or (Split-Path -Leaf $Path) -ine 'Windows.old') { $script:Refused++; return $false }
    if ($DryRun) { return $true }
    try { Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop; return $true } catch { return $false }
}

# ------------------------------------------------------------------ the walk (never follows junctions or symlinks)
function Find-Files([string]$Dir, [datetime]$Cut, [string]$Rx, [bool]$Flat) {
    $out = New-Object 'System.Collections.Generic.List[object]'
    if (-not $Dir -or -not [System.IO.Directory]::Exists($Dir)) { return ,$out }
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    $stack.Push($Dir)
    while ($stack.Count -gt 0) {
        $d = $stack.Pop()
        $di = $null
        try { $di = [System.IO.DirectoryInfo]::new($d) } catch { continue }
        $files = @()
        try { $files = $di.GetFiles() } catch { $files = @() }
        foreach ($f in $files) {
            if (($f.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
            if ($f.LastWriteTime -ge $Cut) { continue }
            if ($Rx -and ($f.Name -notmatch $Rx)) { continue }
            $out.Add(@($f.FullName, [int64]$f.Length))
        }
        if (-not $Flat) {
            $subs = @()
            try { $subs = $di.GetDirectories() } catch { $subs = @() }
            foreach ($s in $subs) {
                if (($s.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { continue }
                if ($ProtectDir -contains $s.Name.ToLowerInvariant()) { continue }
                $stack.Push($s.FullName)
            }
        }
    }
    return ,$out
}
function Measure-Tree([string]$Dir) {
    $bytes = [int64]0
    if (-not $Dir -or -not [System.IO.Directory]::Exists($Dir)) { return $bytes }
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    $stack.Push($Dir)
    while ($stack.Count -gt 0) {
        $d = $stack.Pop()
        $di = $null
        try { $di = [System.IO.DirectoryInfo]::new($d) } catch { continue }
        try { foreach ($f in $di.GetFiles()) { $bytes += [int64]$f.Length } } catch { }
        try { foreach ($s in $di.GetDirectories()) { if (($s.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { $stack.Push($s.FullName) } } } catch { }
    }
    return $bytes
}

# ------------------------------------------------------------------ the categories
# item: @{ Dir=; Days=; Rx=; Flat=; Prune= } or @{ File= }. Gate 'trading' = skipped while the bot or NinjaTrader runs.
function New-Cat([string]$Id, [string]$Name, [string]$Scope, [string]$Gate, $Items) {
    return @{ Id = $Id; Name = $Name; Scope = $Scope; Gate = $Gate; Items = @($Items | Where-Object { $_ }) }
}
function Get-BrowserRoots {
    $out = @()
    $la = $env:LOCALAPPDATA
    if (-not $la) { return ,$out }
    $ud = @((Pj @($la, 'Microsoft', 'Edge', 'User Data')), (Pj @($la, 'Google', 'Chrome', 'User Data')), (Pj @($la, 'BraveSoftware', 'Brave-Browser', 'User Data')))
    foreach ($u in $ud) {
        if (-not $u -or -not [System.IO.Directory]::Exists($u)) { continue }
        foreach ($sub in @('ShaderCache', 'GrShaderCache', 'DawnCache')) { $out += @{ Dir = (J2 $u $sub); Days = 0 } }
        $profiles = @()
        try { $profiles = @(([System.IO.DirectoryInfo]::new($u)).GetDirectories() | Where-Object { $_.Name -eq 'Default' -or $_.Name -like 'Profile *' }) } catch { }
        foreach ($p in $profiles) {
            foreach ($c in @('Cache', 'Code Cache', 'GPUCache', 'DawnCache')) { $out += @{ Dir = (J2 $p.FullName $c); Days = 0 } }
            $out += @{ Dir = (Pj @($p.FullName, 'Service Worker', 'CacheStorage')); Days = 0 }
        }
    }
    $ff = Pj @($la, 'Mozilla', 'Firefox', 'Profiles')
    if ($ff -and [System.IO.Directory]::Exists($ff)) {
        try { foreach ($p in ([System.IO.DirectoryInfo]::new($ff)).GetDirectories()) { $out += @{ Dir = (J2 $p.FullName 'cache2'); Days = 0 } } } catch { }
    }
    return ,$out
}
function Get-Categories {
    $la = $env:LOCALAPPDATA; $ap = $env:APPDATA; $wd = $env:WINDIR; $pd = $env:ProgramData
    $tempDays = 1; if ($Busy) { $tempDays = 3 }
    $cats = @()
    # ---- your account
    $cats += (New-Cat 'temp' 'Temporary files (your account)' 'user' '' @(
        $(if ($env:TEMP) { @{ Dir = $env:TEMP; Days = $tempDays; Prune = $true } })))
    $cats += (New-Cat 'browser' 'Browser caches (sign-ins stay)' 'user' '' (Get-BrowserRoots))
    $cats += (New-Cat 'thumbs' 'Thumbnail and icon caches' 'user' '' @(
        $(if ($la) { @{ Dir = (Pj @($la, 'Microsoft', 'Windows', 'Explorer')); Days = 0; Flat = $true; Rx = '^(thumbcache|iconcache)_.*\.db$' } }),
        $(if ($la) { @{ File = (J2 $la 'IconCache.db') } })))
    $cats += (New-Cat 'dumps' 'Crash dumps and error reports (your account)' 'user' '' @(
        $(if ($la) { @{ Dir = (J2 $la 'CrashDumps'); Days = 0 } }),
        $(if ($la) { @{ Dir = (Pj @($la, 'Microsoft', 'Windows', 'WER', 'ReportArchive')); Days = 0 } }),
        $(if ($la) { @{ Dir = (Pj @($la, 'Microsoft', 'Windows', 'WER', 'ReportQueue')); Days = 0 } })))
    $cats += (New-Cat 'devcache' 'npm and pip caches' 'user' '' @(
        $(if ($la) { @{ Dir = (J2 $la 'npm-cache'); Days = 0 } }),
        $(if ($ap) { @{ Dir = (J2 $ap 'npm-cache'); Days = 0 } }),
        $(if ($la) { @{ Dir = (Pj @($la, 'pip', 'Cache')); Days = 0 } })))
    $ntItems = @()
    foreach ($nt in $NtFolders) {
        $ntItems += @{ Dir = (J2 $nt 'log'); Days = 14 }
        $ntItems += @{ Dir = (J2 $nt 'trace'); Days = 14 }
        $ntItems += @{ Dir = (J2 $nt 'cache'); Days = 14 }
        $ntItems += @{ Dir = (Pj @($nt, 'db', 'cache')); Days = 14 }
    }
    $cats += (New-Cat 'nt' 'NinjaTrader old logs and caches' 'user' 'trading' $ntItems)
    $botItems = @()
    if ($BotRoot) {
        $botItems += @{ Dir = (J2 $BotRoot 'logs'); Days = $KeepDays; Rx = '(?i)\.(log|txt|out|err|old)$|\.log\.\d+$' }
        $botItems += @{ Dir = (J2 $BotRoot 'data'); Days = $KeepDays; Flat = $true; Rx = '\.corrupt-\d+$' }
        $botItems += @{ Dir = (Pj @($BotRoot, 'reports', 'tmp')); Days = $KeepDays }
        $botItems += @{ Dir = (J2 $BotRoot 'backups'); Days = $KeepDays; Flat = $true; Rx = '^le-(backup|pre-restore)-.*\.zip$'; KeepNewest = 3 }
        foreach ($sub in @('', 'engine', 'tools', 'tests', 'scripts', 'ninjatrader')) {
            $d = $BotRoot; if ($sub) { $d = J2 $BotRoot $sub }
            $botItems += @{ Dir = $d; Days = 0; Rx = '\.pyc$'; PycOnly = $true }
        }
    }
    $cats += (New-Cat 'bot' 'Bot old logs, backups and __pycache__' 'user' 'trading' $botItems)
    # ---- Windows (Administrator)
    $cats += (New-Cat 'wtemp' 'Windows temp files' 'system' '' @($(if ($wd) { @{ Dir = (J2 $wd 'Temp'); Days = 1; Prune = $true } })))
    $cats += (New-Cat 'wupdate' 'Windows Update downloads' 'system' '' @($(if ($wd) { @{ Dir = (Pj @($wd, 'SoftwareDistribution', 'Download')); Days = 0; Prune = $true } })))
    $cats += (New-Cat 'wdelivery' 'Windows delivery cache' 'system' '' @(
        $(if ($wd) { @{ Dir = (Pj @($wd, 'ServiceProfiles', 'NetworkService', 'AppData', 'Local', 'Microsoft', 'Windows', 'DeliveryOptimization', 'Cache')); Days = 0 } })))
    $cats += (New-Cat 'wdumps' 'Windows crash dumps and error reports' 'system' '' @(
        $(if ($wd) { @{ Dir = (J2 $wd 'Minidump'); Days = 0 } }),
        $(if ($wd) { @{ Dir = (J2 $wd 'LiveKernelReports'); Days = 0; Rx = '(?i)\.dmp$' } }),
        $(if ($wd) { @{ File = (J2 $wd 'MEMORY.DMP') } }),
        $(if ($pd) { @{ Dir = (Pj @($pd, 'Microsoft', 'Windows', 'WER', 'ReportArchive')); Days = 0 } }),
        $(if ($pd) { @{ Dir = (Pj @($pd, 'Microsoft', 'Windows', 'WER', 'ReportQueue')); Days = 0 } })))
    $cats += (New-Cat 'wlogs' 'Old Windows logs' 'system' '' @(
        $(if ($wd) { @{ Dir = (Pj @($wd, 'Logs', 'CBS')); Days = 14; Rx = '(?i)\.(log|cab)$' } }),
        $(if ($wd) { @{ Dir = (Pj @($wd, 'Logs', 'DISM')); Days = 14; Rx = '(?i)\.log$' } }),
        $(if ($wd) { @{ Dir = (Pj @($wd, 'Logs', 'WindowsUpdate')); Days = 14; Rx = '(?i)\.etl$' } })))
    return ,$cats
}

# register every item of every category in the allow-list, then scan
function Get-Candidates($Cat) {
    $list = New-Object 'System.Collections.Generic.List[object]'
    foreach ($it in $Cat.Items) {
        if ($it.ContainsKey('File')) {
            if (-not (Add-AllowFile $it.File)) { continue }
            if (-not [System.IO.File]::Exists($it.File)) { continue }
            if ($script:Seen.Contains($it.File)) { continue }
            $len = 0; try { $len = ([System.IO.FileInfo]::new($it.File)).Length } catch { }
            if (-not (Test-Deletable $it.File)) { continue }
            [void]$script:Seen.Add($it.File)
            $list.Add(@($it.File, [int64]$len))
            continue
        }
        $target = $it.Dir
        if ($it.ContainsKey('PycOnly')) { $target = J2 $it.Dir '__pycache__' }        # python caches: only inside a __pycache__ folder
        if (-not (Add-AllowDir $target)) { continue }
        $flat = $false; if ($it.ContainsKey('Flat')) { $flat = [bool]$it.Flat }
        $rx = ''; if ($it.ContainsKey('Rx')) { $rx = [string]$it.Rx }
        $cut = (Get-Date).AddDays(-1 * [double]$it.Days)
        if ($it.ContainsKey('PycOnly')) { $found = Find-Files $target $cut $rx $true } else { $found = Find-Files $it.Dir $cut $rx $flat }
        if ($it.ContainsKey('KeepNewest')) {                                 # the newest N stay, whatever their age
            $keep = [int]$it.KeepNewest
            $all = Find-Files $it.Dir ((Get-Date).AddYears(10)) $rx $flat
            $sorted = @($all | Sort-Object { (Get-Item -LiteralPath $_[0]).LastWriteTime } -Descending)
            $stay = @(); if ($sorted.Count -gt 0) { $stay = @($sorted | Select-Object -First $keep | ForEach-Object { $_[0] }) }
            $found = @($found | Where-Object { $stay -notcontains $_[0] })
        }
        foreach ($f in $found) {
            if ($script:Seen.Contains($f[0])) { continue }
            if (-not (Test-Deletable $f[0])) { continue }
            [void]$script:Seen.Add($f[0])
            $list.Add($f)
        }
    }
    return ,$list
}
function Get-Prune($Cat) {
    $dirs = @(); foreach ($it in $Cat.Items) { if ($it.ContainsKey('Prune') -and $it.ContainsKey('Dir') -and $it.Dir) { $dirs += ,@($it.Dir, [double]$it.Days) } }
    return ,$dirs
}
function Remove-EmptyFolders([string]$Root, [datetime]$Cut) {
    if (-not $Root -or -not [System.IO.Directory]::Exists($Root)) { return }
    $all = New-Object 'System.Collections.Generic.List[string]'
    $stack = New-Object 'System.Collections.Generic.Stack[string]'
    $stack.Push($Root)
    while ($stack.Count -gt 0) {
        $d = $stack.Pop()
        try { foreach ($s in ([System.IO.DirectoryInfo]::new($d)).GetDirectories()) { if (($s.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { $stack.Push($s.FullName); if ($s.LastWriteTime -lt $Cut) { $all.Add($s.FullName) } } } } catch { }
    }
    $arr = @($all | Sort-Object { $_.Length } -Descending)               # deepest first
    foreach ($d in $arr) { Remove-SafeEmptyDir $d }
}

# ------------------------------------------------------------------ Recycle Bin, Windows.old, free space
function Get-BinBytes {
    if ($env:LE_T_BIN_BYTES) { return [int64]$env:LE_T_BIN_BYTES }
    try {
        $sh = New-Object -ComObject Shell.Application
        $t = [int64]0
        foreach ($i in $sh.Namespace(10).Items()) { $t += [int64]$i.Size }
        return $t
    } catch { return $null }
}
function Get-WinOldDir { $sd = $env:SystemDrive; if (-not $sd) { return '' }; return (Join-Path $sd 'Windows.old') }
function Get-FreeBytes {
    try {
        $sd = $env:SystemDrive; if (-not $sd) { $sd = 'C:' }
        $di = New-Object System.IO.DriveInfo $sd
        return [int64]$di.AvailableFreeSpace
    } catch { return $null }
}
function Get-FreeText { $b = Get-FreeBytes; if ($null -eq $b) { return 'not readable' }; return ("{0:N1} GB free" -f ($b / 1GB)) }

# ------------------------------------------------------------------ run one category
function Invoke-Category($Cat, $Cands) {
    $n = 0; $bytes = [int64]0; $lockedBefore = $script:Locked
    foreach ($f in $Cands) {
        if (Remove-SafeFile $f[0] $f[1]) {
            $n++; $bytes += [int64]$f[1]
            Log-Only ("  removed " + ("{0,14:N0}" -f $f[1]) + "  " + $f[0])
        }
    }
    if (-not $DryRun) { foreach ($d in (Get-Prune $Cat)) { Remove-EmptyFolders $d[0] ((Get-Date).AddDays(-1 * $d[1])) } }
    $script:Freed += $bytes; $script:Files += $n
    $lk = $script:Locked - $lockedBefore
    $txt = "$($Cat.Name): $(Fmt $bytes) ($n files)"
    if ($lk -gt 0) { $txt += ", $lk in use and kept" }
    return @($n, $bytes, $txt)
}
function Write-Result {
    Flush-Log
    if (-not $Result) { return }
    try { Set-Content -LiteralPath $Result -Value @("freed=$($script:Freed)", "files=$($script:Files)", "locked=$($script:Locked)", "refused=$($script:Refused)") -Encoding ASCII } catch { }
}
function Ask-YN([string]$Question) {
    if ($env:LE_T_ANSWER) { return ($env:LE_T_ANSWER -match '^(y|yes)$') }
    try { $a = Read-Host $Question; return ($a -match '^\s*(y|yes)\s*$') } catch { return $false }
}

# ================================================================== the elevated Windows part
if ($SystemPart) {
    Head "WINDOWS PART (Administrator)$(if ($DryRun) { ' - dry run, nothing deleted' })"
    $allCats = Get-Categories
    $cats = @($allCats | Where-Object { $_.Scope -eq 'system' })
    $svc = @()
    foreach ($c in $cats) {
        $cands = Get-Candidates $c
        if ($c.Id -eq 'wupdate' -and $cands.Count -gt 0 -and -not $DryRun) {          # the update service holds some of its own download files
            foreach ($sn in @('wuauserv', 'bits')) {
                try { $s = Get-Service -Name $sn -ErrorAction Stop; if ("$($s.Status)" -eq 'Running') { Stop-Service -Name $sn -Force -ErrorAction Stop; $svc += $sn } } catch { }
            }
        }
        $r = Invoke-Category $c $cands
        Say 'OK' $r[2]
        if ($c.Id -eq 'wupdate') { foreach ($sn in $svc) { try { Start-Service -Name $sn -ErrorAction Stop } catch { } }; $svc = @() }
    }
    $wo = Get-WinOldDir
    if ($WithWinOld -and $wo -and [System.IO.Directory]::Exists($wo)) {
        if ($Busy) { Say 'SKIP' 'Windows.old: skipped while the bot or NinjaTrader is running (it would load the disk heavily)' }
        else {
            $script:TreeRoot = Norm $wo
            $b = Measure-Tree $wo
            if (-not $DryRun) {
                try { & takeown.exe /F $wo /R /A /D Y 2>&1 | Out-Null } catch { }
                try { & icacls.exe $wo /grant '*S-1-5-32-544:F' /T /C /Q 2>&1 | Out-Null } catch { }
            }
            if (Remove-SafeTree $wo) { $script:Freed += $b; Log-Only ("  removed tree " + $wo + "  " + $b); Say 'OK' "Windows.old (old Windows): $(Fmt $b)" }
            else { Say 'SKIP' 'Windows.old: could not be removed completely (Windows may need a restart first)' }
        }
    }
    Write-Result
    exit 0
}

# ================================================================== the plan (your account + Windows)
Head "CLEAN STORAGE: $(Get-Date -Format 'ddd yyyy-MM-dd HH:mm')$(if ($DryRun) { ' - DRY RUN: shows the table, deletes nothing' })"
try { [System.Diagnostics.Process]::GetCurrentProcess().PriorityClass = [System.Diagnostics.ProcessPriorityClass]::BelowNormal } catch { }
$botTxt = 'no bot folder on this PC'; if ($BotRoot) { if ($BotRun) { $botTxt = 'bot RUNNING' } else { $botTxt = 'bot folder here, bot stopped' } }
$ntTxt = 'NinjaTrader not found'; if ($NtRun) { $ntTxt = 'NinjaTrader RUNNING' } elseif ($NtFolders.Count -gt 0) { $ntTxt = 'NinjaTrader closed' }
Say '..' "This PC: $env:COMPUTERNAME. $botTxt; $ntTxt."
$freeBefore = Get-FreeBytes
Say '..' "C: now $(Get-FreeText)."
if ($Busy) { Say 'SKIP' 'The bot or NinjaTrader is running: their folders and Windows.old are skipped. Only temp files, caches and Windows are cleaned.' }
Add-Content -LiteralPath $Log -Value "  (log of what is removed, with sizes, below; -KeepDays $KeepDays)" -Encoding UTF8 -ErrorAction SilentlyContinue

$cats = Get-Categories
$rows = @()
foreach ($c in $cats) {
    if ($c.Gate -eq 'trading' -and $Busy) { $rows += @{ Name = $c.Name; Bytes = [int64]0; Note = 'skipped (bot or NinjaTrader running)'; Cat = $c; Cands = @() }; continue }
    if ($c.Items.Count -eq 0) { continue }
    $cands = Get-Candidates $c
    $b = [int64]0; foreach ($f in $cands) { $b += [int64]$f[1] }
    $note = ''
    if ($c.Scope -eq 'system') { if ($b -eq 0 -and -not $IsAdmin) { $note = 'Windows measures it' } else { $note = 'Windows asks once' } }
    $rows += @{ Name = $c.Name; Bytes = $b; Note = $note; Cat = $c; Cands = $cands }
}
$binBytes = Get-BinBytes
$wo = Get-WinOldDir; $woBytes = $null
if ($wo -and [System.IO.Directory]::Exists($wo) -and -not $Busy) { Write-Host "  (measuring Windows.old, this can take a minute)" -ForegroundColor DarkGray; $woBytes = Measure-Tree $wo }

Head 'What can be freed'
$total = [int64]0
Write-Host ("  {0,-48} {1,10}" -f 'What', 'Size')
Write-Host ("  {0,-48} {1,10}" -f '----', '----')
foreach ($r in $rows) {
    $sz = Fmt $r.Bytes
    if ($r.Note -like 'skipped*') { $sz = '-' }
    $line = ("  {0,-48} {1,10}" -f $r.Name, $sz)
    if ($r.Note) { $line += "   ($($r.Note))" }
    Write-Host $line
    try { Add-Content -LiteralPath $Log -Value $line -Encoding UTF8 } catch { }
    $total += $r.Bytes
}
$line = ("  {0,-48} {1,10}" -f 'TOTAL (without the two below)', (Fmt $total)); Write-Host $line -ForegroundColor Cyan
try { Add-Content -LiteralPath $Log -Value $line -Encoding UTF8 } catch { }
if ($null -ne $binBytes -and $binBytes -gt 0) { Say '..' "Recycle Bin: $(Fmt $binBytes) (asked after the Y)" }
if ($null -ne $woBytes -and $woBytes -gt 0) { Say '..' "Windows.old (the old Windows): $(Fmt $woBytes) (asked after the Y)" }
$odHint = $false
if ($env:OneDrive -and (Test-Path -LiteralPath $env:OneDrive)) {
    $odHint = $true
    Say '..' 'OneDrive: right-click the OneDrive folder > "Free up space" keeps files in the cloud and frees disk space (Files On-Demand).'
    foreach ($nt in $NtFolders) { if ($nt.ToLowerInvariant().StartsWith($env:OneDrive.ToLowerInvariant())) { Say 'SKIP' 'But NOT on the NinjaTrader 8 folder (it is inside OneDrive): keep it "Always keep on this device".' } }
}
Write-Host "  Never touched: the bot's data and state files, .env.local.ps1, accounts, journals, the bar archive, NinjaTrader's workspaces, templates, database and orders." -ForegroundColor DarkGray

if ($DryRun) {
    Head 'Result'
    Say 'OK' "DRY RUN: nothing was deleted. It would free about $(Fmt $total) (plus the Recycle Bin and Windows.old if you say Y)."
    Say '..' "Log: $Log"
    Write-Result
    exit 0
}
if ($IsAdmin -and $total -le 0 -and -not ($binBytes -gt 0) -and -not ($woBytes -gt 0)) {
    Say 'OK' 'Nothing to clean: this PC is already tidy.'
    Say '..' "Log: $Log"
    exit 0
}

Write-Host ""
$go = $Yes
if (-not $go) { $go = Ask-YN "Clean this up now (about $(Fmt $total), plus the Windows part)? Type Y then Enter (anything else stops, nothing is deleted)" }
if (-not $go) { Say 'OK' 'Stopped: nothing was deleted.'; exit 0 }
$doBin = $false
if ($null -ne $binBytes -and $binBytes -gt 0) { $doBin = $Extras; if (-not $doBin) { $doBin = Ask-YN "Also empty the Recycle Bin ($(Fmt $binBytes))? Y or N" } }
$doWinOld = $false
if ($null -ne $woBytes -and $woBytes -gt 0) { $doWinOld = $Extras; if (-not $doWinOld) { $doWinOld = Ask-YN "Also remove Windows.old, the old Windows ($(Fmt $woBytes))? You cannot go back to the old Windows after this. Y or N" } }

# ================================================================== your account part
Head 'Cleaning your account (no Administrator needed)'
foreach ($r in $rows) {
    if ($r.Cat.Scope -ne 'user') { continue }
    if ($r.Note -like 'skipped*') { Say 'SKIP' "$($r.Name): $($r.Note)"; continue }
    $res = Invoke-Category $r.Cat $r.Cands
    Say 'OK' $res[2]
}
if ($doBin) {
    try { Clear-RecycleBin -Force -ErrorAction Stop; $script:Freed += [int64]$binBytes; Say 'OK' "Recycle Bin emptied: $(Fmt $binBytes)"; Log-Only "  Recycle Bin emptied $binBytes" }
    catch { Say 'SKIP' "Recycle Bin: $($_.Exception.Message)" }
}

# ================================================================== the Windows part (Administrator, asked once)
$sysRows = @($rows | Where-Object { $_.Cat.Scope -eq 'system' })
if ($sysRows.Count -gt 0 -or $doWinOld) {
    Head 'Cleaning Windows (needs Administrator)'
    if ($IsAdmin) {
        foreach ($r in $sysRows) { $res = Invoke-Category $r.Cat $r.Cands; Say 'OK' $res[2] }
        if ($doWinOld) {
            if ($Busy) { Say 'SKIP' 'Windows.old: skipped while the bot or NinjaTrader is running' }
            else {
                $script:TreeRoot = Norm $wo
                try { & takeown.exe /F $wo /R /A /D Y 2>&1 | Out-Null } catch { }
                try { & icacls.exe $wo /grant '*S-1-5-32-544:F' /T /C /Q 2>&1 | Out-Null } catch { }
                if (Remove-SafeTree $wo) { $script:Freed += [int64]$woBytes; Log-Only ("  removed tree " + $wo + "  " + $woBytes); Say 'OK' "Windows.old (old Windows): $(Fmt $woBytes)" }
                else { Say 'SKIP' 'Windows.old: could not be removed completely (Windows may need a restart first)' }
            }
        }
    } else {
        Say '..' 'Windows asks "Do you want to allow this app to make changes?": click Yes. The Windows part runs in a second window; this one waits for it.'
        $res = J2 ([System.IO.Path]::GetTempPath()) ("le_clean_storage_" + [Guid]::NewGuid().ToString('N') + ".txt")
        try {
            $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-SystemPart', '-Yes', '-Log', "`"$Log`"", '-Result', "`"$res`"", '-KeepDays', "$KeepDays")
            if ($doWinOld) { $argList += '-WithWinOld' }
            $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $argList -Verb RunAs -PassThru -Wait
            if ($null -ne $p -and $p.ExitCode -eq 0) { Say 'OK' 'Windows part done (its lines are in the log)' } else { Say 'SKIP' 'Windows part ended early' }
            if (Test-Path -LiteralPath $res) {
                foreach ($ln in @(Get-Content -LiteralPath $res)) {
                    if ($ln -match '^freed=(\d+)$') { $script:Freed += [int64]$Matches[1] }
                    elseif ($ln -match '^files=(\d+)$') { $script:Files += [int]$Matches[1] }
                }
                Remove-Item -LiteralPath $res -Force -ErrorAction SilentlyContinue
            }
        } catch { Say 'SKIP' 'Windows part not run (Administrator was declined). Double-click CLEAN_STORAGE.bat again and click Yes to clear it.' }
    }
}

# ================================================================== result
Start-Sleep -Seconds 1
Head 'Result'
$freeAfter = Get-FreeBytes
Say 'OK' ("Freed " + (Fmt $script:Freed) + ", C: now " + (Get-FreeText) + ".")
if ($null -ne $freeBefore -and $null -ne $freeAfter) { Log-Only ("  (free space on C: before " + [math]::Round($freeBefore / 1GB, 1) + " GB, after " + [math]::Round($freeAfter / 1GB, 1) + " GB)") }
if ($script:Locked -gt 0) { Say '..' "$($script:Locked) files were in use and were kept (they go next time)." }
if ($script:Refused -gt 0) { Say 'SKIP' "$($script:Refused) paths were refused by the safety list (listed in the log)." }
if ($Busy) { Say '..' 'The bot or NinjaTrader was running: their folders were not touched.' }
else { Say '..' 'NinjaTrader and the bot were not touched (only their old logs and caches).' }
Say '..' "Log with every removed file: $Log"
exit 0
