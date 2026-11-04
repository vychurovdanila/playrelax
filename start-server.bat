@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  playrelax — локальный сервер для тестирования.
REM  Запускает статический сервер над папкой src/.
REM  Порт по умолчанию: 8000 (можно переопределить аргументом).
REM  Приоритет: Python (http.server) -> fallback: npx serve.
REM
REM  Пример со своим портом:  start-server.bat 8080
REM ============================================================

REM --- Порт: первый аргумент или 8000 по умолчанию ---
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

REM --- Локальный IP (для доступа с телефона) ---
for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } | Sort-Object -Property InterfaceAlias | Select-Object -First 1 -ExpandProperty IPAddress)"`) do set "LANIP=%%i"
if "%LANIP%"=="" set "LANIP=<IP-адрес>"

cd /d "%~dp0src"

echo.
echo ============================================================
echo   playrelax — локальный сервер (папка src/)
echo ============================================================
echo.
echo   Открой на ПК:      http://localhost:%PORT%
echo   Открой на телефоне: http://%LANIP%:%PORT%
echo                      (телефон и ПК — в одной Wi-Fi сети;
echo                       свой IP можно узнать командой: ipconfig)
echo.
echo   Если порт занят — запусти со своим: start-server.bat 8080
echo   Остановить сервер: Ctrl + C
echo ============================================================
echo.

REM --- Выбираем сервер: Python, иначе Node (npx serve) ---
where python >nul 2>nul
if %errorlevel%==0 (
  echo [playrelax] Запускаю Python: python -m http.server %PORT%
  echo.
  python -m http.server %PORT%
  goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
  echo [playrelax] Запускаю Python (py): py -m http.server %PORT%
  echo.
  py -m http.server %PORT%
  goto :end
)

where node >nul 2>nul
if %errorlevel%==0 (
  echo [playrelax] Python не найден. Запускаю Node: npx --yes serve -l %PORT%
  echo.
  npx --yes serve -l %PORT%
  goto :end
)

echo [playrelax] ОШИБКА: не найдены ни Python, ни Node.js.
echo            Установи один из них, чтобы запустить сервер.
echo.

:end
REM Окно остаётся открытым (без exit), чтобы сервер продолжал работать.

