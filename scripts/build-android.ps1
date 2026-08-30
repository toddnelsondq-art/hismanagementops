$ErrorActionPreference = 'Stop'

$portableJdks = Get-ChildItem "$env:LOCALAPPDATA\HISOps\jdk21" -Directory -ErrorAction SilentlyContinue |
  Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
  Sort-Object Name -Descending

if ($portableJdks) {
  $env:JAVA_HOME = $portableJdks[0].FullName
} elseif (-not $env:JAVA_HOME) {
  throw 'Java 21 was not found. Install Microsoft OpenJDK 21 or set JAVA_HOME before building.'
}

if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
}

Push-Location (Join-Path $PSScriptRoot '..\android')
try {
  & .\gradlew.bat assembleDebug
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  Pop-Location
}
