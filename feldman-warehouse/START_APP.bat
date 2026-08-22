@echo off
cd /d "%~dp0"
title מערכת ניהול מחסן ומלאי - פלדמן

echo ===================================================
echo מפעיל שרת ניהול מחסן ומלאי...
echo ===================================================
echo.

echo פותח את הדפדפן בכתובת http://localhost:3000 ...
start http://localhost:3000

echo מפעיל שרת Node.js...
node server.js

pause
