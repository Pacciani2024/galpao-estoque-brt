@echo off
title BRT - Liberar Rede (Cliente)
echo.
echo    🔓 LIBERANDO PORTAS NO FIREWALL (Windows)
echo    Executando como Administrador...
echo.

powershell -Command "New-NetFirewallRule -DisplayName 'BRT Broadcast UDP IN' -Direction Inbound -LocalPort 41234 -Protocol UDP -Action Allow"
powershell -Command "New-NetFirewallRule -DisplayName 'BRT Webhook HTTP IN' -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow"

echo.
echo    ✅ Pronto! Portas 41234 (UDP) e 4000 (TCP) liberadas.
echo    Pode fechar esta janela e testar novamente.
echo.
pause
