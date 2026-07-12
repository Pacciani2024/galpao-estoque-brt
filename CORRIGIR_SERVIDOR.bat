@echo off
echo 🔧 Corrigindo servidor travado...
echo.

REM Fazer backup do server.js
copy server.js server.js.backup >nul
echo ✓ Backup criado: server.js.backup

REM Remover linha do scheduler
powershell -Command "(Get-Content server.js) | Where-Object { $_ -notmatch 'scheduler.js' } | Set-Content server_temp.js"
move /Y server_temp.js server.js >nul

echo ✓ Scheduler desabilitado
echo.
echo ✅ Pronto! Agora execute INICIAR.bat
pause
