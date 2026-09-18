@echo off
cd /d "%~dp0"
title Feldman Warehouse - IIS & SQLEXPRESS Server

echo ===================================================
echo   Feldman Warehouse Server (SQL Server Express)
echo ===================================================
echo.

echo 1. Checking dependencies...
if not exist "node_modules" (
    echo Installing npm dependencies...
    call npm install
)

echo.
echo 2. Starting Node.js Server on port 3000...
echo Opening browser: http://localhost:3000
start http://localhost:3000

node server.js

pause
