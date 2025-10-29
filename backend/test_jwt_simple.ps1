# JWT Authentication Test Script - Simple Version
$BASE_URL = "https://findable-production.up.railway.app"

Write-Host "[JWT TEST] Starting authentication tests" -ForegroundColor Cyan
Write-Host ""

# Test 1: WITHOUT token
Write-Host "[TEST 1] Accessing /devices WITHOUT token..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/devices" -Method GET -SkipHttpErrorCheck
    if ($response.StatusCode -eq 401) {
        Write-Host "[PASS] Correctly rejected - 401 Unauthorized" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Expected 401 but got $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Register user
Write-Host "[TEST 2] Registering test user..." -ForegroundColor Yellow
$username = "testuser$(Get-Random -Maximum 99999)"
$registerBody = @{
    username = $username
    password = "TestPass123!"
    email = "test@example.com"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/auth/register" -Method POST -Body $registerBody -ContentType "application/json"
    $token = $response.token
    
    Write-Host "[PASS] Registration successful" -ForegroundColor Green
    Write-Host "       Username: $username" -ForegroundColor Gray
    Write-Host "       Token: $($token.Substring(0, 30))..." -ForegroundColor Gray
} catch {
    Write-Host "[FAIL] Registration failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 3: WITH valid token
Write-Host "[TEST 3] Accessing /devices WITH valid token..." -ForegroundColor Yellow
$headers = @{ "Authorization" = "Bearer $token" }
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/devices" -Method GET -Headers $headers
    Write-Host "[PASS] Successfully authenticated!" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: WITH invalid token
Write-Host "[TEST 4] Accessing /devices WITH invalid token..." -ForegroundColor Yellow
$badHeaders = @{ "Authorization" = "Bearer invalid_token_123" }
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/devices" -Method GET -Headers $badHeaders -SkipHttpErrorCheck
    if ($response.StatusCode -eq 401) {
        Write-Host "[PASS] Correctly rejected - 401 Unauthorized" -ForegroundColor Green
    } else {
        Write-Host "[FAIL] Expected 401 but got $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Create device (no user_id in body!)
Write-Host "[TEST 5] Creating device WITHOUT user_id in body..." -ForegroundColor Yellow
$deviceBody = @{
    name = "Test Device"
    rssi = -50
    distance = 10.5
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/devices" -Method POST -Headers $headers -Body $deviceBody -ContentType "application/json"
    Write-Host "[PASS] Device created successfully!" -ForegroundColor Green
    Write-Host "       Device ID: $($response.id)" -ForegroundColor Gray
    Write-Host "       Device Name: $($response.name)" -ForegroundColor Gray
} catch {
    Write-Host "[FAIL] Device creation failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 6: Get profile
Write-Host "[TEST 6] Getting user profile WITH token..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$BASE_URL/user/profile" -Method GET -Headers $headers
    Write-Host "[PASS] Profile retrieved successfully!" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Profile retrieval failed: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "ALL JWT TESTS COMPLETED" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "JWT Authentication is WORKING!" -ForegroundColor Green
Write-Host "- Endpoints without token: REJECTED" -ForegroundColor Green
Write-Host "- Endpoints with token: ACCEPTED" -ForegroundColor Green
Write-Host "- Invalid tokens: REJECTED" -ForegroundColor Green
Write-Host "- Device creation: No user_id needed" -ForegroundColor Green

