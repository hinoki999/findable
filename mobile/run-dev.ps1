# --- Findable quick runner: starts AVD, fixes ADB, opens Expo Go on Android ---
$ErrorActionPreference = "Stop"

# 0) Env for this session
$env:ANDROID_SDK_ROOT = "C:\Android\Sdk"
$env:Path += ";C:\Android\Sdk\platform-tools;C:\Android\Sdk\emulator;C:\Android\Sdk\cmdline-tools\latest\bin"

# 1) Start/verify emulator
$avd = "Pixel_7_API_35"   # change if your AVD name differs
try {
  $running = & adb devices 2>$null
} catch {
  # Ensure adb exists by absolute path if PATH isn’t set yet
  & "C:\Android\Sdk\platform-tools\adb.exe" start-server | Out-Null
}

$emulators = (& adb devices) -join "`n"
if ($emulators -notmatch "emulator-\d+\s+device") {
  # Launch emulator (cold boot avoids bad snapshot/offline state)
  & emulator -avd $avd -no-snapshot-load | Out-Null
  Write-Host "Starting emulator $avd ..."
}

# 2) Make sure ADB is clean and device is attached
& adb kill-server | Out-Null
Start-Sleep -Seconds 1
& adb start-server  | Out-Null

# Try the common console ports (5554/5555, alt 5556/5557)
$null = & adb connect localhost:5555 2>$null
$null = & adb connect localhost:5557 2>$null

# Wait until device is ready (max ~60s)
$max = 60
for ($i=0; $i -lt $max; $i++) {
  $list = (& adb devices) -join "`n"
  if ($list -match "emulator-\d+\s+device") { break }
  if ($list -match "offline") {
    & adb reconnect offline | Out-Null
  }
  Start-Sleep -Seconds 2
}
$list = (& adb devices) -join "`n"
if ($list -notmatch "emulator-\d+\s+device") {
  Write-Error "ADB didn’t attach to the emulator. Try closing the AVD and rerun this script."
  exit 1
}

# 3) Start Expo (LAN) and open on Android (Expo Go)
# Tip: If Metro shows “Using development build”, press 's' in that window to switch to Expo Go.
npx expo start --lan --android
