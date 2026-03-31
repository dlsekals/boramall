@echo off
echo Starting Bora Mall for Mobile Access...
echo Connect using your PC's IP address: http://192.168.219.101.nip.io:3000
echo Or directly via IP: http://192.168.219.101:3000
echo.
echo [System Update] Applying database changes automatically...
call .\node_modules\.bin\prisma.cmd db push --accept-data-loss
call .\node_modules\.bin\prisma.cmd generate
echo.
echo If "Ready in ..." appears, the server is running.
echo DO NOT CLOSE THIS WINDOW.
echo.
npm.cmd run dev -- -H 0.0.0.0
pause
