@echo off
echo ✨ Fixing environment and starting Streamlit App...
echo.

if exist venv (
    echo [1/4] Deleting old virtual environment...
    rmdir /s /q venv
)

echo [2/4] Creating new virtual environment...
python -m venv venv

echo [3/4] Installing dependencies (this may take a minute)...
call .\venv\Scripts\activate.bat
pip install -r requirements.txt

echo [4/4] Starting the App...
streamlit run app.py

pause
