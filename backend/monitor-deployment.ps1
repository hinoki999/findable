# monitor-deployment.ps1
# Real-time monitoring of deployment health

param(
    [string]$Url = "https://findable-production.up.railway.app",
    [int]$DurationMinutes = 10,
    [int]$IntervalSeconds = 5
)

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Deployment Monitor" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host "URL: $Url" -ForegroundColor Gray
Write-Host "Duration: $DurationMinutes minutes" -ForegroundColor Gray
Write-Host "Interval: $IntervalSeconds seconds" -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""
Write-Host "Time     | Status  | Database | Response" -ForegroundColor Cyan
Write-Host "---------|---------|----------|----------" -ForegroundColor Gray

$endTime = (Get-Date).AddMinutes($DurationMinutes)
$errorCount = 0
$successCount = 0
$totalResponseTime = 0

while ((Get-Date) -lt $endTime) {
    try {
        $start = Get-Date
        $health = Invoke-RestMethod "$Url/health" -TimeoutSec 5
        $duration = ((Get-Date) - $start).TotalMilliseconds
        
        $status = $health.status
        $db = $health.database
        $time = Get-Date -Format 'HH:mm:ss'
        
        # Format output
        $statusDisplay = $status.PadRight(7)
        $dbDisplay = $db.PadRight(8)
        $durationDisplay = "$([math]::Round($duration))ms".PadRight(8)
        
        Write-Host "$time | $statusDisplay | $dbDisplay | $durationDisplay" -ForegroundColor Green
        
        $successCount++
        $totalResponseTime += $duration
        $errorCount = 0  # Reset consecutive error count
        
    } catch {
        $time = Get-Date -Format 'HH:mm:ss'
        $errorMsg = $_.Exception.Message
        if ($errorMsg.Length > 30) {
            $errorMsg = $errorMsg.Substring(0, 30) + "..."
        }
        
        Write-Host "$time | ERROR   | $errorMsg" -ForegroundColor Red
        $errorCount++
        
        # Alert on consecutive errors
        if ($errorCount -ge 3) {
            Write-Host "" -ForegroundColor Red
            Write-Host "⚠️  WARNING: 3+ consecutive errors detected!" -ForegroundColor Red
            Write-Host "Service may be down or experiencing issues." -ForegroundColor Yellow
            Write-Host ""
            
            $action = Read-Host "Continue monitoring? (y/n)"
            if ($action -ne "y") {
                Write-Host "Monitoring stopped by user." -ForegroundColor Gray
                break
            }
            Write-Host ""
            $errorCount = 0  # Reset after user decides to continue
        }
    }
    
    Start-Sleep -Seconds $IntervalSeconds
}

# Calculate statistics
Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Monitoring Summary" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$totalRequests = $successCount + $errorCount
$successRate = if ($totalRequests -gt 0) { ($successCount / $totalRequests) * 100 } else { 0 }
$avgResponseTime = if ($successCount -gt 0) { $totalResponseTime / $successCount } else { 0 }

Write-Host "Total Requests: $totalRequests" -ForegroundColor Gray
Write-Host "Successful: $successCount" -ForegroundColor Green
Write-Host "Failed: $errorCount" -ForegroundColor $(if ($errorCount -gt 0) { "Red" } else { "Green" })
Write-Host "Success Rate: $([math]::Round($successRate, 2))%" -ForegroundColor $(if ($successRate -ge 99) { "Green" } elseif ($successRate -ge 95) { "Yellow" } else { "Red" })
Write-Host "Avg Response Time: $([math]::Round($avgResponseTime))ms" -ForegroundColor $(if ($avgResponseTime -lt 500) { "Green" } elseif ($avgResponseTime -lt 1000) { "Yellow" } else { "Red" })
Write-Host ""

# Health assessment
if ($successRate -ge 99 -and $avgResponseTime -lt 1000) {
    Write-Host "✓ Service is HEALTHY" -ForegroundColor Green
    Write-Host "Deployment appears successful!" -ForegroundColor Green
    exit 0
} elseif ($successRate -ge 95 -and $avgResponseTime -lt 2000) {
    Write-Host "⚠ Service is DEGRADED" -ForegroundColor Yellow
    Write-Host "Consider monitoring longer or investigating issues." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "✗ Service is UNHEALTHY" -ForegroundColor Red
    Write-Host "Recommend rolling back the deployment!" -ForegroundColor Red
    exit 1
}



