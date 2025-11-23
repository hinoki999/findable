# Navigate to project directory
Set-Location "C:\Users\caiti\Documents\droplin"

# Get current timestamp
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# Check if there are any changes
$status = git status --porcelain

if ($status) {
    # Stage all changes
    git add .
    
    # Commit with timestamp
    git commit -m "Auto-backup: $timestamp"
    
    # Push to backup branch (creates if doesn't exist)
    git push origin develop:backup-branch -f
    
    Write-Host "SUCCESS: Backup completed at $timestamp"
} else {
    Write-Host "INFO: No changes to backup at $timestamp"
}

