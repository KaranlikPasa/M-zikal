@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $v = (Invoke-RestMethod -Uri 'http://127.0.0.1:3456/api/version' -TimeoutSec 1).version; if ($v -ne '1.3.3') { Stop-Process -Id (Get-NetTCPConnection -LocalPort 3456 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue; exit 1 } else { exit 0 } } catch { exit 1 }"
if %errorlevel% neq 0 (
    if exist "%~dp0bin\node.exe" (
        powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process '%~dp0bin\node.exe' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
    ) else if exist "C:\Users\Eymen\AppData\Roaming\Antigravity\bin\agy-node.cmd" (
        powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process 'C:\Users\Eymen\AppData\Roaming\Antigravity\bin\agy-node.cmd' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
    ) else (
        powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process 'node' -ArgumentList 'server.js' -WorkingDirectory '%~dp0' -WindowStyle Hidden"
    )
    ping 127.0.0.1 -n 3 >nul
)
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="http://127.0.0.1:3456" --window-size=1280,820
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" --app="http://127.0.0.1:3456" --window-size=1280,820
) else (
    start "" "http://127.0.0.1:3456"
)
exit
