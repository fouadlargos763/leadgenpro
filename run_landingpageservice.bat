@echo off
title Landing Page Service Dashboard

echo ======================================
echo   Starting Lead Generation Platform
echo ======================================

cd /d "C:\Users\fouad\Documents\LANDING PAGE SERVICE"

echo Starting server...
start cmd /k npm start

timeout /t 5 /nobreak >nul

echo Opening Dashboard...
start http://localhost:3000

echo ======================================
echo Dashboard is running.
echo ======================================

exit