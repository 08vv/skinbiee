@echo off
echo 🧼 Cleaning up old processes...
taskkill /F /IM python.exe /T 2>nul
timeout /t 2 >nul

echo 🧸 Starting Fresh Skinbiee AI Ecosystem...
echo.

echo 🚀 Launching AI Analysis Backend (Port 5000)...
start "AI_BACKEND" cmd /c "python analysis_server.py"

echo 🌐 Launching Frontend Server (Port 8001)...
start "FRONTEND" cmd /c "python serve_skinbiee.py"

echo ⏳ Waiting for boot (5s)...
timeout /t 5 >nul

echo 🌏 Opening your browser...
start "" "http://127.0.0.1:8001/skinbiee.html"

echo.
echo ✅ System IS RUNNING! 
echo.
echo - AI is in one window.
echo - Frontend is in another.
echo - Browser should be opening now!
echo.
echo Press any key to close this manager window.
pause
