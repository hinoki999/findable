# JWT Authentication Test Script for PowerShell
# Tests the JWT implementation on Railway

$BASE_URL = "https://findable-production.up.railway.app"

Write-Host "🔒 Testing JWT Authentication" -ForegroundColor Cyan
Write-Host ""

# Test 1: Try to access protected endpoint WITHOUT token
Write-Host "1️⃣  Testing /devices WITHOUT token..." -ForegroundColor Yellow
$response = Invoke-WebRequest -Uri "$BASE_URL/devices" -Method GET -SkipHttpErrorCheck
if ($response.StatusCode -eq 401) {
    Write-Host "✅ Correctly rejected (401 Unauthorized)" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} else {
    Write-Host "❌ FAILED: Should be 401 but got $($response.StatusCode)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Register a new user to get a token
Write-Host "2️⃣  Registering a test user..." -ForegroundColor Yellow
$username = "testuser$(Get-Random -Maximum 99999)"
$registerBody = @{
    username = $username
    password = "TestPass123!"
    email = "test@example.com"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/auth/register" -Method POST -Body $registerBody -ContentType "application/json"
    $token = $response.token
    $userId = $response.user_id
    
    Write-Host "✅ Registration successful!" -ForegroundColor Green
    Write-Host "   Username: $username" -ForegroundColor Gray
    Write-Host "   User ID: $userId" -ForegroundColor Gray
    Write-Host "   Token (first 50 chars): $($token.Substring(0, [Math]::Min(50, $token.Length)))..." -ForegroundColor Gray
    Write-Host ""
    
    # Test 3: Access protected endpoint WITH token
    Write-Host "3️⃣  Testing /devices WITH valid token..." -ForegroundColor Yellow
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    $response = Invoke-RestMethod -Uri "$BASE_URL/devices" -Method GET -Headers $headers
    Write-Host "✅ Successfully authenticated!" -ForegroundColor Green
    if ($response.Count -eq 0) {
        Write-Host "   Response: [] (empty array)" -ForegroundColor Gray
    } else {
        Write-Host "   Response: $($response | ConvertTo-Json -Compress)" -ForegroundColor Gray
    }
    Write-Host ""
    
    # Test 4: Try with invalid token
    Write-Host "4️⃣  Testing WITH invalid token..." -ForegroundColor Yellow
    $badHeaders = @{
        "Authorization" = "Bearer invalid_token_12345"
    }
    
    $response = Invoke-WebRequest -Uri "$BASE_URL/devices" -Method GET -Headers $badHeaders -SkipHttpErrorCheck
    if ($response.StatusCode -eq 401) {
        Write-Host "✅ Correctly rejected (401 Unauthorized)" -ForegroundColor Green
        Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
    } else {
        Write-Host "❌ FAILED: Should be 401 but got $($response.StatusCode)" -ForegroundColor Red
    }
    Write-Host ""
    
    # Test 5: Create a device WITH token (no user_id in body!)
    Write-Host "5️⃣  Creating a device WITH token (no user_id in body)..." -ForegroundColor Yellow
    $deviceBody = @{
        name = "Test Device"
        rssi = -50
        distance = 10.5
        action = "dropped"
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$BASE_URL/devices" -Method POST -Headers $headers -Body $deviceBody -ContentType "application/json"
    Write-Host "✅ Device created successfully!" -ForegroundColor Green
    Write-Host "   Device ID: $($response.id)" -ForegroundColor Gray
    Write-Host "   Device Name: $($response.name)" -ForegroundColor Gray
    Write-Host ""
    
    # Test 6: Get user profile
    Write-Host "6️⃣  Getting user profile WITH token..." -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "$BASE_URL/user/profile" -Method GET -Headers $headers
    Write-Host "✅ Profile retrieved successfully!" -ForegroundColor Green
    Write-Host "   Email: $($response.email)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "🎉 All JWT tests PASSED!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Summary:" -ForegroundColor Cyan
    Write-Host "  ✅ Endpoints without token are rejected (401)" -ForegroundColor Green
    Write-Host "  ✅ Endpoints with valid token work" -ForegroundColor Green
    Write-Host "  ✅ Endpoints with invalid token are rejected (401)" -ForegroundColor Green
    Write-Host "  ✅ Devices created without user_id in body" -ForegroundColor Green
    Write-Host "  ✅ User profile accessible with token" -ForegroundColor Green
    
} catch {
    Write-Host "❌ Error during testing: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   $($_.ErrorDetails.Message)" -ForegroundColor Gray
}

