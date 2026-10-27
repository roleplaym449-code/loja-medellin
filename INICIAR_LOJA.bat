@echo off
chcp 65001 >nul
title Medellin Store V8 - PC + VERCEL + PIX AUTOMATICO
color 0E
cd /d "%~dp0"
echo.
echo  ==============================================
echo      MEDELLIN STORE V8 - PC + VERCEL + PIX AUTOMATICO
echo  ==============================================
echo.
if not exist .env (
  echo [ERRO] Arquivo .env nao encontrado.
  echo Copie .env.example para .env e configure Mercado Pago + MySQL.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias...
  call npm install
  if errorlevel 1 (
    echo [ERRO] Falha no npm install.
    pause
    exit /b 1
  )
)
echo Iniciando loja...
node server.js
pause
