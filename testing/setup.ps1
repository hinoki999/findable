# DropLink Testing Suite Setup Script
# Run this once to configure your testing environment

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "DROPLINK TESTING SUITE SETUP" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""

# Check Python
Write-Host "Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Python not found! Please install Python 3.x" -ForegroundColor Red
    Write-Host "  Download from: https://www.python.org/downloads/" -ForegroundColor Yellow
}

# Check Node.js
Write-Host "Checking Node.js installation..." -ForegroundColor Yellow
try {
    $nodeVersion = node --version 2>&1
    Write-Host "✓ Node.js found: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "✗ Node.js not found! Please install Node.js" -ForegroundColor Red
    Write-Host "  Download from: https://nodejs.org/" -ForegroundColor Yellow
}

# Install Python dependencies
Write-Host ""
Write-Host "Installing Python dependencies..." -ForegroundColor Yellow
try {
    pip install requests psycopg2-binary
    Write-Host "✓ Python dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not install Python dependencies" -ForegroundColor Yellow
    Write-Host "  Run manually: pip install requests psycopg2-binary" -ForegroundColor Yellow
}

# Create logs directory
Write-Host ""
Write-Host "Creating logs directory..." -ForegroundColor Yellow
if (-not (Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
    Write-Host "✓ Logs directory created" -ForegroundColor Green
} else {
    Write-Host "✓ Logs directory already exists" -ForegroundColor Green
}

# Check environment variables
Write-Host ""
Write-Host "Checking environment variables..." -ForegroundColor Yellow

$missingVars = @()

if (-not $env:GITHUB_TOKEN) {
    $missingVars += "GITHUB_TOKEN"
}

if (-not $env:EXPO_TOKEN) {
    $missingVars += "EXPO_TOKEN"
}

if (-not $env:DATABASE_URL) {
    $missingVars += "DATABASE_URL"
}

if ($missingVars.Count -eq 0) {
    Write-Host "✓ All environment variables set" -ForegroundColor Green
} else {
    Write-Host "⚠️  Missing optional environment variables:" -ForegroundColor Yellow
    foreach ($var in $missingVars) {
        Write-Host "  - $var" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Set them with:" -ForegroundColor Cyan
    Write-Host '  $env:GITHUB_TOKEN = "ghp_..."' -ForegroundColor Cyan
    Write-Host '  $env:EXPO_TOKEN = "..."' -ForegroundColor Cyan
    Write-Host '  $env:DATABASE_URL = "postgresql://..."' -ForegroundColor Cyan
}

# Configuration reminder
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "CONFIGURATION REQUIRED" -ForegroundColor Yellow
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "Before running tests, update these files with your password:" -ForegroundColor Yellow
Write-Host "  1. backend-tester.py (line 11)" -ForegroundColor Cyan
Write-Host "  2. integration-tester.js (line 10)" -ForegroundColor Cyan
Write-Host ""
Write-Host "Change:" -ForegroundColor Yellow
Write-Host '  TEST_PASSWORD = "testpassword123"' -ForegroundColor Red
Write-Host "To:" -ForegroundColor Yellow
Write-Host '  TEST_PASSWORD = "your_actual_password"' -ForegroundColor Green

# Ready message
Write-Host ""
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "SETUP COMPLETE!" -ForegroundColor Green
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Update TEST_PASSWORD in the files above" -ForegroundColor White
Write-Host "  2. Run: .\run-all-tests.ps1" -ForegroundColor White
Write-Host ""
Write-Host "For more information, see README.md" -ForegroundColor Cyan
Write-Host ""

