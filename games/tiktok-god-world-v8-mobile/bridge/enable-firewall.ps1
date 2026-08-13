$ErrorActionPreference = 'Stop'
$ruleName = 'TikTok God World Safari Bridge 8793'
$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if (-not $existing) {
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8793 -Profile Private | Out-Null
    Write-Host 'Porta 8793 abilitata sulle reti private.' -ForegroundColor Green
} else {
    Write-Host 'La regola privata per la porta 8793 esiste gia.' -ForegroundColor Green
}
Write-Host 'Premi Invio per chiudere.'
[void](Read-Host)
