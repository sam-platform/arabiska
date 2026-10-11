# Renders every book in .\src\*.html to a print-ready PDF in .\pdf\
# Uses headless Chrome, which shapes Arabic script correctly and embeds the font.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $root "src"
$out  = Join-Path $root "pdf"

$chrome = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) { throw "Could not find Chrome or Edge." }

if (-not (Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

Get-ChildItem -Path $src -Filter "*.html" | Sort-Object Name | ForEach-Object {
    $pdf = Join-Path $out ($_.BaseName + ".pdf")
    Write-Host "  ->" $_.Name

    & $chrome --headless --disable-gpu --no-sandbox `
              --no-pdf-header-footer `
              --virtual-time-budget=4000 `
              "--print-to-pdf=$pdf" `
              $_.FullName | Out-Null

    if (Test-Path $pdf) {
        $kb = [math]::Round((Get-Item $pdf).Length / 1KB)
        Write-Host "     ok, $kb KB -> pdf\$($_.BaseName).pdf" -ForegroundColor Green
    } else {
        Write-Host "     FAILED" -ForegroundColor Red
    }
}

Write-Host "`nDone."
