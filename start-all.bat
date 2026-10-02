@echo off
REM ---------------------------------------------------------------------------
REM  EmailClean AI - start all three tiers in separate windows.
REM
REM  1. Python FastAPI validator  -> http://127.0.0.1:8000
REM  2. Node/Express API        -> http://127.0.0.1:5000
REM  3. React (Vite) UI         -> http://127.0.0.1:5173
REM
REM  Requires .env files in backend\, frontend\ and validator\ (copy the
REM  matching .env.example). Close a window to stop that service.
REM ---------------------------------------------------------------------------
setlocal
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not on PATH. Install Node 18+ and reopen this window.
  pause
  exit /b 1
)

if not exist "validator\.venv\Scripts\python.exe" (
  echo [ERROR] Python virtualenv missing. Create it with:
  echo         py -3 -m venv validator\.venv
  echo         validator\.venv\Scripts\pip install -r validator\requirements.txt
  pause
  exit /b 1
)

if not exist "backend\.env" (
  echo [ERROR] backend\.env is missing. Copy backend\.env.example to backend\.env
  pause
  exit /b 1
)
if not exist "validator\.env" (
  echo [ERROR] validator\.env is missing. Copy validator\.env.example to validator\.env
  pause
  exit /b 1
)
if not exist "frontend\.env" (
  echo [ERROR] frontend\.env is missing. Copy frontend\.env.example to frontend\.env
  pause
  exit /b 1
)

echo Starting EmailClean AI...

start "EmailClean - Validator (FastAPI :8000)" cmd /k ^
  "cd /d "%~dp0validator" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

start "EmailClean - API (Express :5000)" cmd /k ^
  "cd /d "%~dp0backend" && node src/index.js"

start "EmailClean - UI (Vite :5173)" cmd /k ^
  "cd /d "%~dp0frontend" && npx vite --host 127.0.0.1 --port 5173"

echo.
echo  Validator : http://127.0.0.1:8000/health
echo  API       : http://127.0.0.1:5000/api/health
echo  UI        : http://127.0.0.1:5173
echo.
echo Three windows opened. Close them to stop the services.
