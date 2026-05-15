@echo off
REM Frontend build script
REM NEXT_PUBLIC_API_URL must be provided by the environment.

setlocal enabledelayedexpansion

echo ========================================
echo TeamLens Frontend Build Script
echo ========================================
echo.
echo API Base URL: %NEXT_PUBLIC_API_URL%
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Node.js is not installed or not in PATH
    exit /b 1
)

echo [1/4] Checking Node.js version...
node --version
echo.

REM Check if npm is installed
where npm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: npm is not installed or not in PATH
    exit /b 1
)

echo [2/4] Installing dependencies...
call npm ci
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies
    exit /b 1
)
echo Dependencies installed successfully
echo.

REM Validate environment variables
if "%NEXT_PUBLIC_API_URL%"=="" (
    echo ERROR: NEXT_PUBLIC_API_URL is not set
    echo Example:
    echo   set NEXT_PUBLIC_API_URL=http://localhost:8080
    echo   build.bat
    exit /b 1
)

set NODE_ENV=production
set NEXT_TELEMETRY_DISABLED=1

echo [3/4] Building Next.js application...
echo Build configuration:
echo   - API Base URL: !NEXT_PUBLIC_API_URL!
echo   - Environment: !NODE_ENV!
echo.

call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    exit /b 1
)
echo Build completed successfully
echo.

echo [4/4] Build artifacts ready
echo   - Output directory: ./.next
echo   - Public files: ./public
echo.

echo ========================================
echo Build Complete!
echo ========================================
echo.
echo To start the production server:
echo   npm run start
echo.
echo To run with custom port:
echo   npm run start -- -p 3000 -H 0.0.0.0
echo.

endlocal
exit /b 0
