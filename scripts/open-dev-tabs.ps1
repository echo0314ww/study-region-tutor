[CmdletBinding()]
param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = (Resolve-Path (Join-Path $scriptDir '..')).Path
$terminal = Get-Command wt.exe -ErrorAction SilentlyContinue

if (-not $terminal) {
  throw 'Windows Terminal (wt.exe) was not found. Install Windows Terminal or open three PowerShell tabs manually.'
}

$tabs = @(
  @{ Title = 'proxy:dev'; Directory = $projectRoot },
  @{ Title = 'ngrok:dev'; Directory = $projectRoot },
  @{ Title = 'dev'; Directory = $projectRoot }
)

if ($DryRun) {
  Write-Host 'Windows Terminal tabs to open:'
  foreach ($tab in $tabs) {
    Write-Host ("- {0}: {1}" -f $tab.Title, $tab.Directory)
  }
  return
}

$arguments = @()
$isFirstTab = $true

foreach ($tab in $tabs) {
  if ($isFirstTab) {
    $arguments += 'new-tab'
    $isFirstTab = $false
  } else {
    $arguments += ';'
    $arguments += 'new-tab'
  }

  $arguments += @(
    '--title',
    $tab.Title,
    '--startingDirectory',
    $tab.Directory,
    'powershell.exe',
    '-NoLogo',
    '-NoExit'
  )
}

& $terminal.Source @arguments

if ($LASTEXITCODE -ne 0) {
  throw "Windows Terminal failed with exit code $LASTEXITCODE."
}
