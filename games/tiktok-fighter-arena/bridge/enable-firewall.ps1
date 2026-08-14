$ErrorActionPreference = 'Stop'
$ruleName = 'Fighter Arena iPhone Bridge 8795'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8795 -Profile Private | Out-Null
    Write-Host 'Porta 8795 abilitata sulle reti private.' -ForegroundColor Green
} else {
    Write-Host 'La regola privata per la porta 8795 esiste gia.' -ForegroundColor Green
}
Write-Host 'Premi Invio per chiudere.'
[void](Read-Host)
