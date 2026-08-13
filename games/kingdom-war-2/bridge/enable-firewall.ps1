$ErrorActionPreference = 'Stop'
$ruleName = 'Kingdom War 2 Safari Bridge 8794'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8794 -Profile Private | Out-Null
    Write-Host 'Porta 8794 abilitata sulle reti private.' -ForegroundColor Green
} else {
    Write-Host 'La regola privata per la porta 8794 esiste gia.' -ForegroundColor Green
}
Write-Host 'Premi Invio per chiudere.'
[void](Read-Host)
