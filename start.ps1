# Menjalankan AI ARENA (database + server + situs) dengan Docker, lalu membuka browser.
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

function Fail($msg) { Write-Host "`n$msg`n" -ForegroundColor Red; Read-Host 'Tekan Enter untuk menutup'; exit 1 }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker belum terpasang. Pasang Docker Desktop dari https://www.docker.com/products/docker-desktop lalu jalankan skrip ini lagi.'
}

& docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Docker Desktop belum berjalan. Membuka Docker Desktop...' -ForegroundColor Yellow
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) { Start-Process $exe }
  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 3
    & docker info *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host '  menunggu Docker siap...'
  }
  & docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail 'Docker belum siap. Tunggu sampai Docker Desktop selesai menyala, lalu jalankan skrip ini lagi.' }
}

# Buat .env berisi rahasia acak bila belum ada. Rahasia ini hanya untuk komputer ini.
if (-not (Test-Path '.env')) {
  function Rand([int]$bytes) {
    $b = New-Object byte[] $bytes
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
    -join ($b | ForEach-Object { $_.ToString('x2') })
  }
  $lines = @(
    "POSTGRES_PASSWORD=$(Rand 16)",
    "JWT_SECRET=$(Rand 48)",
    "TOKEN_ENC_KEY=$(Rand 32)",
    'YOUTUBE_CLIENT_ID=',
    'YOUTUBE_CLIENT_SECRET=',
    'YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/oauth/callback'
  )
  [System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot '.env'), $lines)
  Write-Host 'Berkas .env dibuat dengan rahasia acak.' -ForegroundColor Green
}

Write-Host 'Menyiapkan dan menjalankan AI ARENA (pertama kali bisa beberapa menit)...' -ForegroundColor Cyan
& docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Fail 'Docker Compose gagal. Lihat pesan di atas.' }

Write-Host 'Menunggu server siap...'
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  try { if ((Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/health -TimeoutSec 3).StatusCode -eq 200) { $ok = $true; break } } catch {}
  Start-Sleep -Seconds 2
}
if (-not $ok) { Write-Host 'Server belum menjawab. Cek log dengan: docker compose logs api' -ForegroundColor Yellow }

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(192\.168|10\.)' } | Select-Object -First 1).IPAddress
Write-Host ''
Write-Host 'AI ARENA berjalan.' -ForegroundColor Green
Write-Host '  Di komputer ini : http://localhost:8080'
if ($ip) { Write-Host "  Dari HP (Wi-Fi sama): http://${ip}:8080" }
Write-Host '  Berhenti        : stop.bat'
Write-Host ''
Start-Process 'http://localhost:8080'
