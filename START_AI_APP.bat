@echo off
echo 🧸 Starting Skinbiee AI Ecosystem...
echo.

echo 🚀 Launching AI Analysis Backend (Port 5000)...
start /B python analysis_server.py

echo 🌐 Launching Frontend Server (Port 8001)...
start /B python serve_skinbiee.py

echo.
echo ✅ System is booting up! 
echo Access the app at: http://localhost:8001/skinbiee.html
echo.
echo Press any key to stop both servers (or just close this window).
pause
taskkill /F /IM python.exe
echo.
echo 👋 Servers stopped.
pause
