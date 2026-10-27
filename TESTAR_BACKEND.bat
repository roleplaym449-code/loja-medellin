@echo off
chcp 65001 >nul
title Medellin Store - Teste do Backend
color 0A
start "" "http://127.0.0.1:3000/api/health"
