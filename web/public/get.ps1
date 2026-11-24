# SheroFetch on your own Windows PC.
#
#   powershell -ExecutionPolicy Bypass -c "& ([scriptblock]::Create((irm https://sherofetch.vercel.app/get.ps1))) device-xxxxx-xxxxx"
#
# Installs Python, Git, ffmpeg and cloudflared with winget, the Soulseek client (sockseek),
# links this PC to your SheroFetch account with the one-time code from the app, and starts it
# at every sign-in. Your Soulseek password, if you give one, is written only to this PC.
param([string]$Code = "")
$ErrorActionPreference = "Stop"
$Dir = if ($env:SHEROFETCH_DIR) { $env:SHEROFETCH_DIR } else { Join-Path $HOME "sherofetch" }
$Repo = "https://github.com/meet-the-1337/SheroFetch.git"
$Site = "https://sherofetch.vercel.app"
$Sockseek = "3.1.0"
function Say($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Have($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }

if (-not $Code) { $Code = Read-Host "Device code from the SheroFetch app (device-xxxxx-xxxxx)" }

Say "Tools (winget)"
foreach ($p in @(@{c="git"; id="Git.Git"}, @{c="ffmpeg"; id="Gyan.FFmpeg"}, @{c="cloudflared"; id="Cloudflare.cloudflared"}, @{c="uv"; id="astral-sh.uv"})) {
  if (-not (Have $p.c)) { winget install --id $p.id -e --accept-source-agreements --accept-package-agreements --silent }
}
$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

Say "Soulseek client (sockseek $Sockseek)"
$opt = Join-Path $env:LOCALAPPDATA "sockseek"
if (-not (Test-Path (Join-Path $opt "sockseek.exe"))) {
  $zip = Join-Path $env:TEMP "sockseek.zip"
  Invoke-WebRequest "https://github.com/fiso64/sockseek/releases/download/v$Sockseek/sockseek_${Sockseek}_win-x64.zip" -OutFile $zip
  Expand-Archive $zip -DestinationPath $opt -Force
  Remove-Item $zip
}
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$opt*") { [Environment]::SetEnvironmentVariable("Path", "$userPath;$opt", "User") }
$env:Path += ";$opt"

Say "SheroFetch"
if (Test-Path (Join-Path $Dir ".git")) { git -C $Dir pull -q } else { git clone -q --depth 1 $Repo $Dir }
Set-Location $Dir
uv venv -q .venv --python 3.12
uv pip install -q --python .venv\Scripts\python.exe -r requirements.txt

Say "Linking this PC to your account"
& .venv\Scripts\python.exe worker\sherofetch_worker.py --setup --code $Code --site $Site

Say "Starting"
$py = Join-Path $Dir ".venv\Scripts\pythonw.exe"
$action = New-ScheduledTaskAction -Execute $py -Argument "-u worker\sherofetch_worker.py" -WorkingDirectory $Dir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName "SheroFetch worker" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "SheroFetch worker"
Write-Host "Running now, and at every sign-in. Open SheroFetch: your PC shows as online within a minute."
