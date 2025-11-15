# validate-deployment.ps1
# Validates deployment health across all critical endpoints

param(
    [string]$Url = "https://findable-production.up.railway.app",
    [string]$Environment = "production"
)

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Deployment Validation" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Gray
Write-Host "URL: $Url" -ForegroundColor Gray
Write-Host ""

$allPassed = $true
$testCount = 0
$passCount = 0

# Test 1: Health Check
$testCount++
Write-Host "Test 1: Health Check" -ForegroundColor Yellow
Write-Host "--------------------" -ForegroundColor Gray
try {
    $health = Invoke-RestMethod "$Url/health" -TimeoutSec 10
    
    if ($health.status -eq "healthy" -and $health.database -eq "connected") {
        Write-Host "  Status: $($health.status)" -ForegroundColor Green
        Write-Host "  Database: $($health.database)" -ForegroundColor Green
        Write-Host "  Version: $($health.version)" -ForegroundColor Gray
        Write-Host "  ✓ PASSED" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  Status: $($health.status)" -ForegroundColor Red
        Write-Host "  Database: $($health.database)" -ForegroundColor Red
        Write-Host "  ✗ FAILED: Unhealthy status" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 2: Readiness Check
$testCount++
Write-Host "Test 2: Readiness Check" -ForegroundColor Yellow
Write-Host "-----------------------" -ForegroundColor Gray
try {
    $ready = Invoke-RestMethod "$Url/ready" -TimeoutSec 10
    
    if ($ready.status -eq "ready") {
        Write-Host "  Status: $($ready.status)" -ForegroundColor Green
        foreach ($check in $ready.checks.PSObject.Properties) {
            $symbol = if ($check.Value) { "✓" } else { "✗" }
            $color = if ($check.Value) { "Green" } else { "Red" }
            Write-Host "    $symbol $($check.Name): $($check.Value)" -ForegroundColor $color
        }
        Write-Host "  ✓ PASSED" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  ✗ FAILED: Not ready" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 3: API Root
$testCount++
Write-Host "Test 3: API Root" -ForegroundColor Yellow
Write-Host "----------------" -ForegroundColor Gray
try {
    $root = Invoke-RestMethod "$Url/" -TimeoutSec 10
    
    if ($root.status -eq "running") {
        Write-Host "  Message: $($root.message)" -ForegroundColor Green
        Write-Host "  Version: $($root.version)" -ForegroundColor Gray
        Write-Host "  Status: $($root.status)" -ForegroundColor Green
        Write-Host "  ✓ PASSED" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  ✗ FAILED: Not running" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 4: Response Time
$testCount++
Write-Host "Test 4: Response Time" -ForegroundColor Yellow
Write-Host "---------------------" -ForegroundColor Gray
try {
    $start = Get-Date
    Invoke-RestMethod "$Url/health" -TimeoutSec 10 | Out-Null
    $duration = ((Get-Date) - $start).TotalMilliseconds
    
    if ($duration -lt 1000) {
        Write-Host "  Response time: $([math]::Round($duration))ms" -ForegroundColor Green
        Write-Host "  ✓ PASSED (< 1000ms)" -ForegroundColor Green
        $passCount++
    } elseif ($duration -lt 2000) {
        Write-Host "  Response time: $([math]::Round($duration))ms" -ForegroundColor Yellow
        Write-Host "  ⚠ WARNING (slow but acceptable)" -ForegroundColor Yellow
        $passCount++
    } else {
        Write-Host "  Response time: $([math]::Round($duration))ms" -ForegroundColor Red
        Write-Host "  ✗ FAILED (too slow)" -ForegroundColor Red
        $allPassed = $false
    }
} catch {
    Write-Host "  ✗ FAILED: Timeout or error" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 5: SSL Certificate
$testCount++
Write-Host "Test 5: SSL Certificate" -ForegroundColor Yellow
Write-Host "-----------------------" -ForegroundColor Gray
try {
    if ($Url -like "https://*") {
        # Try to connect with HTTPS
        $response = Invoke-WebRequest "$Url/health" -UseBasicParsing -TimeoutSec 10
        Write-Host "  Protocol: HTTPS" -ForegroundColor Green
        Write-Host "  ✓ PASSED" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  ⚠ WARNING: Not using HTTPS" -ForegroundColor Yellow
        $passCount++
    }
} catch {
    Write-Host "  ✗ FAILED: SSL error" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Test 6: CORS Headers
$testCount++
Write-Host "Test 6: CORS Headers" -ForegroundColor Yellow
Write-Host "--------------------" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest "$Url/" -UseBasicParsing -TimeoutSec 10
    $corsHeader = $response.Headers["Access-Control-Allow-Origin"]
    
    if ($corsHeader) {
        Write-Host "  CORS enabled: $corsHeader" -ForegroundColor Green
        Write-Host "  ✓ PASSED" -ForegroundColor Green
        $passCount++
    } else {
        Write-Host "  ⚠ WARNING: No CORS headers" -ForegroundColor Yellow
        $passCount++
    }
} catch {
    Write-Host "  ✗ FAILED: Cannot check CORS" -ForegroundColor Red
    $allPassed = $false
}
Write-Host ""

# Summary
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Validation Summary" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "Tests Passed: $passCount / $testCount" -ForegroundColor $(if ($passCount -eq $testCount) { "Green" } else { "Yellow" })
Write-Host ""

if ($allPassed) {
    Write-Host "✓ All critical tests PASSED!" -ForegroundColor Green
    Write-Host "Deployment is healthy and ready!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ Some tests FAILED!" -ForegroundColor Red
    Write-Host "Review the failures and consider rolling back." -ForegroundColor Red
    exit 1
}



