@echo off
setlocal
echo 🧸 Skinbiee One-Click Runner Starting...
echo.

:: Clear Port 5000 (AI Server)
echo 🛑 Clearing Port 5000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :5000') do (
    if not "%%a"=="" (
        echo Killing process %%a...
        taskkill /F /PID %%a 2>nul
    )
)

:: Clear Port 8001 (Frontend Server)
echo 🛑 Clearing Port 8001...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8001') do (
    if not "%%a"=="" (
        echo Killing process %%a...
        taskkill /F /PID %%a 2>nul
    )
)

:: Wait for processes to clear
timeout /t 2 /nobreak >nul

:: Start AI Backend
echo 🚀 Starting AI Backend (Port 5000)...
start "Skinbiee AI Backend" cmd /c "python analysis_server.py"

:: Start Frontend Viewer
echo 🧸 Starting Frontend Server (Port 8001)...
start "Skinbiee Frontend" cmd /c "python serve_skinbiee.py"

:: Give them a second to warm up
timeout /t 4 /nobreak >nul

:: Launch Browser
echo 🌐 Opening Skinbiee in your browser...
start http://localhost:8001/skinbiee.html

echo.
echo ✨ Done! Both servers are running in separate windows.
echo ✨ Keep those windows open while using the app.
pause
