# TeamLens Frontend Build & Deploy Script for Windows PowerShell
# Builds and deploys frontend. NEXT_PUBLIC_API_URL must be provided by the environment.

param(
    [string]$Action = "build",
    [string]$Environment = "production",
    [string]$ApiUrl = $env:NEXT_PUBLIC_API_URL
)

$ErrorActionPreference = "Stop"

function Write-Header {
    param([string]$Message)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $Message -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$Message, [int]$Number, [int]$Total)
    Write-Host "[$Number/$Total] $Message" -ForegroundColor Yellow
}

function Verify-Prerequisites {
    Write-Step "Verifying prerequisites" 1 3
    
    # Check Node.js
    $node = $null
    try {
        $node = node --version 2>$null
        Write-Host "  ✓ Node.js $node" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ Node.js not found" -ForegroundColor Red
        exit 1
    }
    
    # Check npm
    try {
        $npm = npm --version 2>$null
        Write-Host "  ✓ npm $npm" -ForegroundColor Green
    }
    catch {
        Write-Host "  ✗ npm not found" -ForegroundColor Red
        exit 1
    }
}

function Build-Frontend {
    Write-Step "Building Next.js application" 2 3
    
    if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
        Write-Host "  NEXT_PUBLIC_API_URL is required" -ForegroundColor Red
        Write-Host "  Example: .\deploy.ps1 -Action build -ApiUrl http://localhost:8080" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "  Environment configuration:" -ForegroundColor Cyan
    Write-Host "    Backend API: $ApiUrl" -ForegroundColor White
    Write-Host ""
    
    Write-Host "  Installing dependencies..." -ForegroundColor Cyan
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Failed to install dependencies" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Dependencies installed" -ForegroundColor Green
    Write-Host ""
    
    $env:NEXT_PUBLIC_API_URL = $ApiUrl
    $env:NODE_ENV = $Environment
    $env:NEXT_TELEMETRY_DISABLED = "1"
    
    Write-Host "  Building application..." -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Build failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Build completed successfully" -ForegroundColor Green
}

function Deploy-Docker {
    Write-Step "Deploying with Docker Compose" 3 3
    
    Write-Host "  Environment file content:" -ForegroundColor Cyan
    if ([string]::IsNullOrWhiteSpace($ApiUrl)) {
        Write-Host "  NEXT_PUBLIC_API_URL is required" -ForegroundColor Red
        Write-Host "  Example: .\deploy.ps1 -Action docker -ApiUrl http://localhost:8080" -ForegroundColor Yellow
        exit 1
    }

    $envFile = @"
NEXT_PUBLIC_API_URL=$ApiUrl
NODE_ENV=$Environment
FRONTEND_PORT=3000
"@
    
    Write-Host $envFile | ForEach-Object { Write-Host "    $_" } 
    Write-Host ""
    
    Write-Host "  Starting Docker Compose..." -ForegroundColor Cyan
    
    docker-compose up -d
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Docker deployment failed" -ForegroundColor Red
        exit 1
    }
    Write-Host "  ✓ Docker deployment successful" -ForegroundColor Green
    
    Write-Host ""
    Write-Host "  Container status:" -ForegroundColor Cyan
    docker-compose ps
}

function Show-Summary {
    Write-Header "Deployment Complete!"
    Write-Host "Backend API endpoint: $ApiUrl" -ForegroundColor Green
    Write-Host ""
    Write-Host "Useful commands:" -ForegroundColor Yellow
    Write-Host "  Start production server:   npm run start" -ForegroundColor White
    Write-Host "  View logs:                 docker-compose logs -f" -ForegroundColor White
    Write-Host "  Stop containers:           docker-compose down" -ForegroundColor White
    Write-Host ""
}

# Main execution
Write-Header "TeamLens Frontend Build & Deploy"

switch ($Action.ToLower()) {
    "build" {
        Verify-Prerequisites
        Build-Frontend
        Write-Header "Build Complete"
        Write-Host "Next step: Deploy with 'deploy' action or start locally with 'npm run start'"
    }
    "deploy" {
        Verify-Prerequisites
        Build-Frontend
        Deploy-Docker
        Show-Summary
    }
    "docker" {
        Deploy-Docker
        Show-Summary
    }
    default {
        Write-Host "Unknown action: $Action" -ForegroundColor Red
        Write-Host ""
        Write-Host "Usage: .\deploy.ps1 [Action] [Environment]" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Actions:" -ForegroundColor Yellow
        Write-Host "  build   - Build Next.js application (default)" -ForegroundColor White
        Write-Host "  deploy  - Build and deploy with Docker Compose" -ForegroundColor White
        Write-Host "  docker  - Deploy existing build with Docker Compose" -ForegroundColor White
        Write-Host ""
        Write-Host "Environment:" -ForegroundColor Yellow
        Write-Host "  production - Production environment (default)" -ForegroundColor White
        Write-Host "  development- Development environment" -ForegroundColor White
        exit 1
    }
}
