@echo off
cd /d "%~dp0"

:: 1. Check if server is already running on port 3456
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $res = Invoke-RestMethod -Uri 'http://localhost:3456/api/version' -TimeoutSec 1; exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
    :: 2. Locate node.exe engine
    set "NODE_EXE="
    if exist "%~dp0bin\node.exe" (
        set "NODE_EXE=%~dp0bin\node.exe"
    ) else if exist "%ProgramFiles%\nodejs\node.exe" (
        set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
    ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
        set "NODE_EXE=%ProgramFiles(x86)%\nodejs\node.exe"
    ) else if exist "%LocalAppData%\Programs\nodejs\node.exe" (
        set "NODE_EXE=%LocalAppData%\Programs\nodejs\node.exe"
    ) else (
        where node >nul 2>nul
        if %errorlevel% equ 0 set "NODE_EXE=node"
    )

    if defined NODE_EXE (
        powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process '%NODE_EXE%' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
        :: Wait until server is listening (up to 8 seconds) so browser never gets connection refused
        powershell -NoProfile -ExecutionPolicy Bypass -Command "for ($i=0; $i -lt 25; $i++) { try { $r = Invoke-RestMethod -Uri 'http://localhost:3456/api/version' -TimeoutSec 1; exit 0 } catch { Start-Sleep -Milliseconds 300 } }"
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('Müzikal motoru (node.exe) bulunamadı. Lütfen kurulum dosyasını (Muzikal-Setup.exe) tekrar çalıştırın veya nodejs.org adresinden Node.js yükleyin.', 'Müzikal Başlatma Hatası', 'OK', 'Error')"
        exit /b 1
    )
)

:: 3. Launch application UI (Chrome App Mode -> Edge App Mode -> Default Browser)
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app="http://localhost:3456" --window-size=1280,820
) else if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" (
    start "" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" --app="http://localhost:3456" --window-size=1280,820
) else if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" (
    start "" "%LocalAppData%\Google\Chrome\Application\chrome.exe" --app="http://localhost:3456" --window-size=1280,820
) else if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3456" --window-size=1280,820
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
    start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app="http://localhost:3456" --window-size=1280,820
) else (
    start "" "http://localhost:3456"
)
exit
