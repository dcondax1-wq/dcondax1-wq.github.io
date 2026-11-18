# FRESH START launcher (owner 2026-11-04): the one line on the main PC. It shows what it will do, asks, then downloads
# scripts/move_bot.ps1 from this site (pc/move_bot.ps1, published with every build) and runs it with -Fresh.
#   powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://demetrades2000-coder.github.io/nq-dashboard/pc/FRESH_START.ps1 | iex"
# Nothing is saved before you answer Y. Live trading is never armed (the setup defaults to Sim101 practice).
$ErrorActionPreference = 'Stop'
$site = 'https://demetrades2000-coder.github.io/nq-dashboard/pc'
# any unexpected failure ends with ONE plain sentence of what to do, never a stack trace
try {
    Write-Host ""
    Write-Host "ZLARIOR + ATLAS: FRESH START on this PC" -ForegroundColor Cyan
    Write-Host "  This will:"
    Write-Host "   - download the setup script from $site"
    Write-Host "   - check that the old PC (the Surface) is switched off (it refuses if it is still running the bot)"
    Write-Host "   - install Git and Python if missing and get the bot from GitHub (sign in once)"
    Write-Host "   - set your eval numbers from the published board (you compare with MFFU and press Y or N)"
    Write-Host "   - start the one-time setup (asks your eval account name; Enter = practice on Sim101)"
    Write-Host "  Live trading is NOT turned on."
    $a = Read-Host "Type Y then Enter to go on (anything else stops, nothing changes)"
    if ($a -notmatch '^(y|yes)$') { Write-Host "  Stopped: nothing changed."; return }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) 'le_move_bot.ps1'
    try {
        Invoke-WebRequest -Uri "$site/move_bot.ps1" -OutFile $tmp -UseBasicParsing -TimeoutSec 60
    } catch {
        Write-Host "  [FIX] Could not download the setup script: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Check the internet, then paste the line again. Or send Claude a photo of this window."
        return
    }
    # -Yes: the question above was the confirmation; the script still refuses while the old PC is running the bot
    & powershell -NoProfile -ExecutionPolicy Bypass -File $tmp -Fresh -Yes
} catch {
    Write-Host ''
    Write-Host '  [FIX] Something unexpected stopped this: take a photo of this window and send it to Claude.' -ForegroundColor Red
}
