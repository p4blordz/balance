$ErrorActionPreference = "Stop"

$port = 8080
if ($args.Count -gt 0 -and $args[0] -match '^\d+$') {
  $port = [int]$args[0]
}

Write-Host "Iniciando servidor LAN en puerto $port..."
Write-Host "Abrilo local en: http://localhost:$port"
Write-Host "En la red, usa la IP de esta PC: http://TU_IP_LOCAL:$port"
Write-Host ""
Write-Host "Para ver tu IP local, ejecuta en otra terminal: ipconfig"
Write-Host "Corta con Ctrl + C"

python -m http.server $port --bind 0.0.0.0
