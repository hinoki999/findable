# DropLink Master Test Runner
# Runs all tests continuously and logs results

# Configuration
$TestInterval = 60  # Seconds between test runs
$LogDir = "logs"
$ErrorLog = "ERRORS.log"

# Colors
$ColorGreen = "Green"
$ColorRed = "Red"
$ColorYellow = "Yellow"
$ColorCyan = "Cyan"

# Create log directory
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# Clear error log
if (Test-Path $ErrorLog) {
    Clear-Content $ErrorLog
}

function Write-ColorLog {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] $Message" -ForegroundColor $Color
}

function Run-Test {
    param(
        [string]$Name,
        [string]$Command,
        [string]$LogFile
    )
    
    Write-ColorLog "Running $Name..." $ColorYellow
    
    $logPath = Join-Path $LogDir $LogFile
    $output = ""
    $success = $false
    
    try {
        # Run command and capture output
        $output = Invoke-Expression $Command 2>&1 | Out-String
        
        # Write to log file
        $output | Out-File $logPath -Encoding UTF8
        
        # Check for errors
        if ($output -match "❌|FAILED|error") {
            Write-ColorLog "✗ $Name FAILED" $ColorRed
            
            # Append errors to master error log
            "=" * 60 | Out-File $ErrorLog -Append
            "[$Name] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $ErrorLog -Append
            "=" * 60 | Out-File $ErrorLog -Append
            $output | Out-File $ErrorLog -Append
            "`n" | Out-File $ErrorLog -Append
            
            $success = $false
        } else {
            Write-ColorLog "✓ $Name PASSED" $ColorGreen
            $success = $true
        }
    }
    catch {
        Write-ColorLog "✗ $Name ERROR: $_" $ColorRed
        
        # Log exception
        "=" * 60 | Out-File $ErrorLog -Append
        "[$Name] EXCEPTION: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $ErrorLog -Append
        "=" * 60 | Out-File $ErrorLog -Append
        $_.Exception.Message | Out-File $ErrorLog -Append
        "`n" | Out-File $ErrorLog -Append
        
        $success = $false
    }
    
    return $success
}

function Run-AllTests {
    Write-ColorLog ("=" * 60) $ColorCyan
    Write-ColorLog "DROPLINK TEST SUITE - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" $ColorCyan
    Write-ColorLog ("=" * 60) $ColorCyan
    
    $results = @{}
    
    # Test 1: Backend API Tests
    $results['Backend'] = Run-Test `
        -Name "Backend API Tests" `
        -Command "python backend-tester.py" `
        -LogFile "backend-tests.log"
    
    # Test 2: Database Validation
    $results['Database'] = Run-Test `
        -Name "Database Validation" `
        -Command "python database-validator.py" `
        -LogFile "database-validation.log"
    
    # Test 3: OTA Monitor
    $results['OTA'] = Run-Test `
        -Name "OTA Update Monitor" `
        -Command "node ota-monitor.js" `
        -LogFile "ota-monitor.log"
    
    # Test 4: Integration Tests
    $results['Integration'] = Run-Test `
        -Name "Integration Tests" `
        -Command "node integration-tester.js" `
        -LogFile "integration-tests.log"
    
    # Summary
    Write-ColorLog ("=" * 60) $ColorCyan
    Write-ColorLog "TEST SUMMARY" $ColorCyan
    Write-ColorLog ("=" * 60) $ColorCyan
    
    $passed = 0
    $failed = 0
    
    foreach ($test in $results.GetEnumerator()) {
        if ($test.Value) {
            Write-ColorLog "✓ $($test.Key): PASSED" $ColorGreen
            $passed++
        } else {
            Write-ColorLog "✗ $($test.Key): FAILED" $ColorRed
            $failed++
        }
    }
    
    Write-ColorLog ("=" * 60) $ColorCyan
    Write-ColorLog "PASSED: $passed | FAILED: $failed" $(if ($failed -eq 0) { $ColorGreen } else { $ColorRed })
    Write-ColorLog ("=" * 60) $ColorCyan
    
    if ($failed -gt 0) {
        Write-ColorLog "⚠️  Errors logged to: $ErrorLog" $ColorYellow
    }
    
    return $failed -eq 0
}

# Banner
Write-Host ""
Write-ColorLog ("=" * 60) $ColorCyan
Write-ColorLog "DROPLINK PRODUCTION TEST SUITE" $ColorCyan
Write-ColorLog "Continuous monitoring every $TestInterval seconds" $ColorCyan
Write-ColorLog "Press Ctrl+C to stop" $ColorCyan
Write-ColorLog ("=" * 60) $ColorCyan
Write-Host ""

# Main loop
$runCount = 0
while ($true) {
    $runCount++
    
    Write-ColorLog "Test Run #$runCount" $ColorCyan
    
    $allPassed = Run-AllTests
    
    if ($allPassed) {
        Write-ColorLog "🎉 All tests passed!" $ColorGreen
    } else {
        Write-ColorLog "⚠️  Some tests failed - check logs" $ColorRed
    }
    
    Write-Host ""
    Write-ColorLog "Next run in $TestInterval seconds..." $ColorYellow
    Write-Host ""
    
    Start-Sleep -Seconds $TestInterval
}

