@echo off
chcp 65001 >nul
title BRT Audiovisual - Sistema de Controle

echo.
echo ════════════════════════════════════════════════════════════
echo    🤖 BRT AUDIOVISUAL - SISTEMA DE CONTROLE
echo ════════════════════════════════════════════════════════════
echo.

REM Parar processos anteriores (Node e Python)
echo 🛑 Parando processos anteriores...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 1 /nobreak >nul

echo 🚀 Iniciando servidor...
echo.

REM Iniciar servidor Node.js em background
start "BRT Server" cmd /k "npm start"

REM Iniciar KIRA Voice em background
echo 🎤 Iniciando KIRA Voice...
start "BRT KIRA Voice" /MIN cmd /k "python mark_ears.py"

REM Aguardar 5 segundos para servidor iniciar
timeout /t 5 /nobreak >nul

echo ✅ Servidor iniciado!
echo 🔄 Sincronizando inventário via API...
echo.

REM Executar sincronização de inventário via API
start "BRT API Sync" /MIN cmd /c "node scripts/sync_inventory_api.js"

REM Aguardar 3 segundos para API sync completar
timeout /t 3 /nobreak >nul

echo 🔄 Executando scraping de eventos...
echo.

REM Executar scraping de eventos em background
start "BRT Scraping" /MIN cmd /c "node scripts/sync_eventos_equipamentos.js"

REM Aguardar 2 segundos
timeout /t 2 /nobreak >nul

echo 🌐 Abrindo navegador...
echo.

REM Abrir navegador
start http://localhost:3000

echo.
echo ════════════════════════════════════════════════════════════
echo    ✅ SISTEMA RODANDO
echo ════════════════════════════════════════════════════════════
echo.
echo    Dashboard: http://localhost:3000
echo    Kira Voice: Ativo (Janela minimizada) 👂
echo.
echo    💡 Scraping automático em execução!
echo    💡 Para parar: Feche a janela "BRT Server"
echo.
echo ════════════════════════════════════════════════════════════
echo.

pause
