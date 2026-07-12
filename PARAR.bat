@echo off
chcp 65001 >nul
title Parando BRT Server

echo.
echo ⛔ Parando servidor BRT...
echo.

REM Matar todos os processos Node.js
taskkill /F /IM node.exe >nul 2>&1

if %errorlevel% equ 0 (
    echo ✅ Servidor parado com sucesso!
) else (
    echo ℹ️  Nenhum servidor rodando
)

echo.
timeout /t 2 /nobreak >nul
