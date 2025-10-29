# rollback.ps1
# Automated rollback script with validation

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("staging", "production")]
    [string]$Environment,
    
    [Parameter(Mandatory=$true)]
    [string]$CommitHash
)

Write-Host "================================" -ForegroundColor Red
Write-Host "  ROLLBACK PROCEDURE" -ForegroundColor Red
Write-Host "================================" -ForegroundColor Red
Write-Host ""
Write-Host "Environment: $Environment" -ForegroundColor Yellow
Write-Host "Target Commit: $CommitHash" -ForegroundColor Yellow
Write-Host "Current Branch: $(git branch --show-current)" -ForegroundColor Gray
Write-Host ""

# Verify commit exists
Write-Host "Verifying commit..." -ForegroundColor Cyan
$commitInfo = git log --oneline -1 $CommitHash 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ ERROR: Commit $CommitHash not found!" -ForegroundColor Red
    Write-Host "Use 'git log --oneline -20' to find valid commit hashes" -ForegroundColor Yellow
    exit 1
}

Write-Host "Found commit: $commitInfo" -ForegroundColor Green
Write-Host ""

# Confirm rollback
Write-Host "⚠️  WARNING: This will force-push and rewrite git history!" -ForegroundColor Red
Write-Host ""
$confirmation = Read-Host "Type 'ROLLBACK' to confirm (case-sensitive)"

if ($confirmation -ne "ROLLBACK") {
    Write-Host "Rollback cancelled" -ForegroundColor Gray
    exit 0
}

Write-Host ""
Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Step 1: Backing up current state" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Create backup branch
$backupBranch = "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Write-Host "Creating backup branch: $backupBranch" -ForegroundColor Gray
git branch $backupBranch

Write-Host "✓ Backup created" -ForegroundColor Green
Write-Host ""

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Step 2: Reverting code" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Checkout correct branch
if ($Environment -eq "production") {
    $branch = "main"
    $url = "https://findable-production.up.railway.app"
} elseif ($Environment -eq "staging") {
    $branch = "develop"
    $url = "https://findable-production-3e01.up.railway.app"
}

Write-Host "Checking out $branch..." -ForegroundColor Gray
git checkout $branch

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ ERROR: Failed to checkout $branch" -ForegroundColor Red
    exit 1
}

Write-Host "Resetting to $CommitHash..." -ForegroundColor Gray
git reset --hard $CommitHash

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ ERROR: Failed to reset to commit" -ForegroundColor Red
    exit 1
}

Write-Host "Pushing to remote..." -ForegroundColor Gray
git push origin $branch --force

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ ERROR: Failed to push to remote" -ForegroundColor Red
    Write-Host "You may need to force push manually: git push origin $branch --force" -ForegroundColor Yellow
    exit 1
}

Write-Host "✓ Code reverted" -ForegroundColor Green
Write-Host ""

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Step 3: Waiting for deployment" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

Write-Host "Railway is deploying the rollback..." -ForegroundColor Gray
Write-Host "Monitor at: https://railway.app" -ForegroundColor Yellow
Write-Host ""

# Show countdown
for ($i = 120; $i -gt 0; $i--) {
    Write-Host "`rWaiting $i seconds for deployment...  " -NoNewline -ForegroundColor Gray
    Start-Sleep -Seconds 1
}
Write-Host ""
Write-Host "✓ Deployment window complete" -ForegroundColor Green
Write-Host ""

Write-Host "================================" -ForegroundColor Cyan
Write-Host "  Step 4: Validating rollback" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Run validation
$validationResult = & "$PSScriptRoot\validate-deployment.ps1" -Url $url -Environment $Environment

Write-Host ""

if ($LASTEXITCODE -eq 0) {
    Write-Host "================================" -ForegroundColor Green
    Write-Host "  ✓ ROLLBACK SUCCESSFUL" -ForegroundColor Green
    Write-Host "================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Service is healthy on commit: $CommitHash" -ForegroundColor Green
    Write-Host "Backup branch created: $backupBranch" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Cyan
    Write-Host "1. Investigate what went wrong in the failed deployment" -ForegroundColor White
    Write-Host "2. Fix the issues" -ForegroundColor White
    Write-Host "3. Test thoroughly in staging" -ForegroundColor White
    Write-Host "4. Deploy again when ready" -ForegroundColor White
    exit 0
} else {
    Write-Host "================================" -ForegroundColor Red
    Write-Host "  ✗ ROLLBACK VALIDATION FAILED" -ForegroundColor Red
    Write-Host "================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "The service is still unhealthy after rollback!" -ForegroundColor Red
    Write-Host "This suggests a deeper issue (possibly database-related)." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Emergency actions:" -ForegroundColor Cyan
    Write-Host "1. Check Railway logs for errors" -ForegroundColor White
    Write-Host "2. Verify environment variables are correct" -ForegroundColor White
    Write-Host "3. Check database connectivity" -ForegroundColor White
    Write-Host "4. Consider manual intervention in Railway dashboard" -ForegroundColor White
    exit 1
}



