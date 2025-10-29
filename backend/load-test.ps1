# Load Testing Script for Droplin Backend
# Tests service capacity and response times under load

param(
    [int]$TotalRequests = 1000,
    [int]$Concurrent = 50,
    [string]$Url = "https://findable-production.up.railway.app/health"
)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Droplin Backend Load Test" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  URL: $Url" -ForegroundColor Gray
Write-Host "  Total Requests: $TotalRequests" -ForegroundColor Gray
Write-Host "  Concurrent: $Concurrent" -ForegroundColor Gray
Write-Host "  Estimated Duration: $([math]::Ceiling($TotalRequests / $Concurrent * 0.5)) seconds" -ForegroundColor Gray
Write-Host ""

$successCount = 0
$failCount = 0
$totalTime = 0
$responseTimes = @()

$startTime = Get-Date

for ($i = 1; $i -le $TotalRequests; $i += $Concurrent) {
    $batch = @()
    
    # Create batch of concurrent requests
    for ($j = 0; $j -lt $Concurrent -and ($i + $j) -le $TotalRequests; $j++) {
        $batch += Start-Job -ScriptBlock {
            param($url)
            $start = Get-Date
            try {
                $response = Invoke-RestMethod -Uri $url -TimeoutSec 10
                $duration = ((Get-Date) - $start).TotalMilliseconds
                return @{
                    status = "success"
                    duration = $duration
                }
            } catch {
                $duration = ((Get-Date) - $start).TotalMilliseconds
                return @{
                    status = "failed"
                    duration = $duration
                    error = $_.Exception.Message
                }
            }
        } -ArgumentList $Url
    }
    
    # Wait for batch to complete and collect results
    $results = $batch | Wait-Job | Receive-Job
    $batch | Remove-Job
    
    # Process results
    foreach ($result in $results) {
        if ($result.status -eq "success") {
            $successCount++
            $responseTimes += $result.duration
        } else {
            $failCount++
        }
        $totalTime += $result.duration
    }
    
    # Show progress
    $progress = [math]::Min($i + $Concurrent, $TotalRequests)
    $percent = [math]::Round(($progress / $TotalRequests) * 100)
    Write-Host "Progress: $progress/$TotalRequests ($percent%) - Success: $successCount, Failed: $failCount" -ForegroundColor Gray
}

$endTime = Get-Date
$totalDuration = ($endTime - $startTime).TotalSeconds

# Calculate statistics
$avgResponseTime = if ($responseTimes.Count -gt 0) { 
    ($responseTimes | Measure-Object -Average).Average 
} else { 0 }

$minResponseTime = if ($responseTimes.Count -gt 0) {
    ($responseTimes | Measure-Object -Minimum).Minimum
} else { 0 }

$maxResponseTime = if ($responseTimes.Count -gt 0) {
    ($responseTimes | Measure-Object -Maximum).Maximum
} else { 0 }

$requestsPerSecond = $TotalRequests / $totalDuration

# Display results
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Results" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Requests:" -ForegroundColor Yellow
Write-Host "  Total: $TotalRequests" -ForegroundColor Gray
Write-Host "  Successful: $successCount" -ForegroundColor $(if ($successCount -eq $TotalRequests) { "Green" } else { "Yellow" })
Write-Host "  Failed: $failCount" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Red" })
Write-Host "  Success Rate: $([math]::Round(($successCount / $TotalRequests) * 100, 2))%" -ForegroundColor $(if ($failCount -eq 0) { "Green" } else { "Yellow" })
Write-Host ""

Write-Host "Performance:" -ForegroundColor Yellow
Write-Host "  Duration: $([math]::Round($totalDuration, 2)) seconds" -ForegroundColor Gray
Write-Host "  Requests/sec: $([math]::Round($requestsPerSecond, 2))" -ForegroundColor Gray
Write-Host "  Avg Response: $([math]::Round($avgResponseTime, 2))ms" -ForegroundColor Gray
Write-Host "  Min Response: $([math]::Round($minResponseTime, 2))ms" -ForegroundColor Gray
Write-Host "  Max Response: $([math]::Round($maxResponseTime, 2))ms" -ForegroundColor Gray
Write-Host ""

# Verdict
if ($failCount -eq 0 -and $avgResponseTime -lt 1000) {
    Write-Host "✓ EXCELLENT: All requests succeeded with good response times!" -ForegroundColor Green
} elseif ($failCount -eq 0) {
    Write-Host "✓ GOOD: All requests succeeded but response times are high" -ForegroundColor Yellow
} elseif ($failCount -lt ($TotalRequests * 0.05)) {
    Write-Host "⚠ WARNING: Some requests failed (< 5%), service may be overloaded" -ForegroundColor Yellow
} else {
    Write-Host "✗ CRITICAL: Many requests failed (> 5%), service is overloaded!" -ForegroundColor Red
}

Write-Host ""
Write-Host "Recommendations:" -ForegroundColor Cyan

if ($avgResponseTime -gt 1000) {
    Write-Host "  • Response times > 1000ms: Consider adding more replicas" -ForegroundColor Yellow
}

if ($failCount -gt 0) {
    Write-Host "  • Failed requests detected: Check Railway logs for errors" -ForegroundColor Yellow
    Write-Host "  • Consider scaling up replicas or increasing resource limits" -ForegroundColor Yellow
}

if ($requestsPerSecond -gt 100) {
    Write-Host "  • High throughput: Service handling load well!" -ForegroundColor Green
}

Write-Host ""

