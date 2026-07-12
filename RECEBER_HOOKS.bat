@echo off
title BRT Client - Receptor de Webhooks
echo.
echo    📡 BRT AUDIOVISUAL - CLIENTE DE RECEBIMENTO
echo    (Webhooks e Broadcast UDP)
echo.
echo    Iniciando receptor...
echo.

cd /d "%~dp0"
node scripts/test_webhook_receiver.js

pause
