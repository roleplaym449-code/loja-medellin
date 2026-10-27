@echo off
chcp 65001 >nul
title Medellin Store - Cloudflare Tunnel
color 0B
cd /d "%~dp0"
echo.
echo  ======================================================
echo       MEDELLIN STORE - TUNNEL HTTPS PARA TESTES
echo  ======================================================
echo.
where cloudflared >nul 2>nul
if errorlevel 1 (
  if exist "%~dp0cloudflared.exe" (
    echo Usando cloudflared.exe desta pasta...
    "%~dp0cloudflared.exe" tunnel --url http://127.0.0.1:3000
    goto :end
  )
  echo [ERRO] cloudflared nao encontrado.
  echo Instale o Cloudflare Tunnel ou coloque cloudflared.exe nesta pasta.
  echo Depois execute este arquivo novamente.
  goto :end
)
cloudflared tunnel --url http://127.0.0.1:3000
:end
echo.
pause
