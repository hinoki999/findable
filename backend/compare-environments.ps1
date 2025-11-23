# Compare Staging and Production Environments
# Shows health status and key metrics for both environments

param(
    [string]$StagingUrl = "https://droplink-staging.up.railway.app",
    [string]$ProductionUrl = "https://findable-production.up.railway.app"
)

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Environment Comparison" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ""

# Function to get environment info
function Get-EnvironmentInfo {
    param([string]$Url, [string]$Name)
    
    try {
        $health = Invoke-RestMethod -Uri "$Url/health" -TimeoutSec 10
        $ready = Invoke-RestMethod -Uri "$Url/ready" -TimeoutSec 10 -ErrorAction SilentlyContinue
        
        return @{
            Name = $Name
            Url = $Url
            Status = $health.status
            Database = $health.database
            Version = $health.version
            Environment = $health.environment
            Timestamp = $health.timestamp
            Ready = $ready.status
            Checks = $ready.checks
            Available = $true
        }
    } catch {
        return @{
            Name = $Name
            Url = $Url
            Available = $false
            Error = $_.Exception.Message
        }
    }
}

# Get info from both environments
Write-Host "Fetching environment data..." -ForegroundColor Gray
Write-Host ""

$staging = Get-EnvironmentInfo -Url $StagingUrl -Name "Staging"
$production = Get-EnvironmentInfo -Url $ProductionUrl -Name "Production"

# Display Staging
Write-Host "STAGING" -ForegroundColor Yellow
Write-Host "-------" -ForegroundColor Gray
Write-Host "URL: $StagingUrl" -ForegroundColor Gray

if ($staging.Available) {
    Write-Host "Status: $($staging.Status)" -ForegroundColor $(if ($staging.Status -eq "healthy") { "Green" } else { "Red" })
    Write-Host "Database: $($staging.Database)" -ForegroundColor $(if ($staging.Database -eq "connected") { "Green" } else { "Red" })
    Write-Host "Version: $($staging.Version)" -ForegroundColor Gray
    Write-Host "Environment: $($staging.Environment)" -ForegroundColor Gray
    Write-Host "Readiness: $($staging.Ready)" -ForegroundColor $(if ($staging.Ready -eq "ready") { "Green" } else { "Yellow" })
    
    if ($staging.Checks) {
        Write-Host "Checks:" -ForegroundColor Gray
        foreach ($check in $staging.Checks.PSObject.Properties) {
            $symbol = if ($check.Value) { "✓" } else { "✗" }
            $color = if ($check.Value) { "Green" } else { "Red" }
            Write-Host "  $symbol $($check.Name)" -ForegroundColor $color
        }
    }
} else {
    Write-Host "Status: UNAVAILABLE" -ForegroundColor Red
    Write-Host "Error: $($staging.Error)" -ForegroundColor Red
}

Write-Host ""

# Display Production
Write-Host "PRODUCTION" -ForegroundColor Yellow
Write-Host "----------" -ForegroundColor Gray
Write-Host "URL: $ProductionUrl" -ForegroundColor Gray

if ($production.Available) {
    Write-Host "Status: $($production.Status)" -ForegroundColor $(if ($production.Status -eq "healthy") { "Green" } else { "Red" })
    Write-Host "Database: $($production.Database)" -ForegroundColor $(if ($production.Database -eq "connected") { "Green" } else { "Red" })
    Write-Host "Version: $($production.Version)" -ForegroundColor Gray
    Write-Host "Environment: $($production.Environment)" -ForegroundColor Gray
    Write-Host "Readiness: $($production.Ready)" -ForegroundColor $(if ($production.Ready -eq "ready") { "Green" } else { "Yellow" })
    
    if ($production.Checks) {
        Write-Host "Checks:" -ForegroundColor Gray
        foreach ($check in $production.Checks.PSObject.Properties) {
            $symbol = if ($check.Value) { "✓" } else { "✗" }
            $color = if ($check.Value) { "Green" } else { "Red" }
            Write-Host "  $symbol $($check.Name)" -ForegroundColor $color
        }
    }
} else {
    Write-Host "Status: UNAVAILABLE" -ForegroundColor Red
    Write-Host "Error: $($production.Error)" -ForegroundColor Red
}

Write-Host ""

# Comparison Summary
Write-Host "SUMMARY" -ForegroundColor Yellow
Write-Host "-------" -ForegroundColor Gray

$stagingOk = $staging.Available -and $staging.Status -eq "healthy"
$productionOk = $production.Available -and $production.Status -eq "healthy"

if ($stagingOk -and $productionOk) {
    Write-Host "✓ Both environments are healthy" -ForegroundColor Green
} elseif ($productionOk) {
    Write-Host "✓ Production is healthy" -ForegroundColor Green
    Write-Host "⚠ Staging has issues" -ForegroundColor Yellow
} elseif ($stagingOk) {
    Write-Host "⚠ Production has issues" -ForegroundColor Red
    Write-Host "✓ Staging is healthy" -ForegroundColor Green
} else {
    Write-Host "✗ Both environments have issues" -ForegroundColor Red
}

Write-Host ""

# Version comparison
if ($staging.Available -and $production.Available) {
    if ($staging.Version -eq $production.Version) {
        Write-Host "Versions: Both running v$($staging.Version)" -ForegroundColor Green
    } else {
        Write-Host "Version Mismatch:" -ForegroundColor Yellow
        Write-Host "  Staging: v$($staging.Version)" -ForegroundColor Gray
        Write-Host "  Production: v$($production.Version)" -ForegroundColor Gray
    }
}

Write-Host ""



