$ErrorActionPreference = 'Continue'
$root = 'C:\Users\Sai Prasath D P\AppData\Local\Temp\opencode\abidewell-schedule'
Set-Location $root
New-Item -ItemType Directory -Force -Path (Join-Path $root 'logs') | Out-Null
$log = Join-Path $root 'logs\generate-api.log'
$target = 31000

function Get-Runner {
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -match 'generate-api-corpus-to-target' }
}

function Get-SavedCount {
  $json = Get-Content (Join-Path $root 'public\data\devotional-checkpoint.json') -Raw | ConvertFrom-Json
  return ($json.PSObject.Properties.Name).Count
}

$env:STARIMG_API_KEY = 'sk-star-d424dc14893ab6591dff3c9b6ebb7f35356b5aa3105a78cf664c5e6dae5f4115'
$env:STARIMG_API_BASE = 'https://ai.starimg.ru/v1'
$env:STARIMG_MODEL = 'glm-5.3-flash'
$env:STARIMG_REASONING_EFFORT = 'low'
$env:STARIMG_CONCURRENCY = '8'
$env:STARIMG_VERSES_PER_REQUEST = '8'
$env:STARIMG_REQUEST_TIMEOUT_MS = '180000'
$env:DEVOTIONAL_TARGET = "$target"

Add-Content -Path $log -Value "[$(Get-Date -Format o)] chain-launcher start target=$target"

# Wait for any existing runner (e.g. the 15000-target run) to finish first.
while (Get-Runner) {
  Start-Sleep -Seconds 30
}

$attempt = 0
while ($true) {
  $saved = Get-SavedCount
  if ($saved -ge $target) {
    Add-Content -Path $log -Value "[$(Get-Date -Format o)] COMPLETE saved=$saved target=$target"
    break
  }
  $attempt++
  Add-Content -Path $log -Value "[$(Get-Date -Format o)] chain-launcher attempt=$attempt saved=$saved target=$target"
  & node 'scripts\generate-api-corpus-to-target.mjs' *>> $log
  $code = $LASTEXITCODE
  $saved = Get-SavedCount
  Add-Content -Path $log -Value "[$(Get-Date -Format o)] runner exited code=$code saved=$saved"
  if ($saved -ge $target) {
    Add-Content -Path $log -Value "[$(Get-Date -Format o)] COMPLETE saved=$saved target=$target"
    break
  }
  Start-Sleep -Seconds 10
}
