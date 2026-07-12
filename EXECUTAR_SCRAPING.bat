@echo off
title Scheduler - Scraping Automático
echo.
echo ════════════════════════════════════════════════════════════
echo    ⏰ SCHEDULER DE SCRAPING - BRT AUDIOVISUAL
echo ════════════════════════════════════════════════════════════
echo.
echo 🔄 Executando scraping de eventos...
echo.

node scripts/sync_eventos_equipamentos.js

echo.
echo ════════════════════════════════════════════════════════════
echo    ✅ SCRAPING CONCLUÍDO!
echo ════════════════════════════════════════════════════════════
echo.
echo 💡 Dica: Para scraping automático contínuo, execute:
echo    node scheduler.js
echo.
pause
