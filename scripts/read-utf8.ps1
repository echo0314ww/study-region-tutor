param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string[]]$Path
)

$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

foreach ($item in $Path) {
  Get-Content -LiteralPath $item -Encoding UTF8
}
