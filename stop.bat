@echo off
chcp 65001 >nul
cd /d "%~dp0"
docker compose down
echo.
echo AI ARENA dihentikan. Data tetap tersimpan. Untuk menghapus semua data: docker compose down -v
pause
