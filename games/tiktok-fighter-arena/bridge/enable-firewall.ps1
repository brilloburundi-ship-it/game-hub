$ErrorActionPreference = 'Stop'
$ruleName = 'Fighter Arena Safari Bridge 8766'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8766 -Profile Private | Out-Null
    Write-Host 'Porta 8766 abilitata sulle reti private per Fighter Arena.' -ForegroundColor Green
} else {
    Write-Host 'La regola privata per Fighter Arena sulla porta 8766 esiste gia.' -ForegroundColor Green
}
Write-Host 'Premi Invio per chiudere.'
[void](Read-Host)
