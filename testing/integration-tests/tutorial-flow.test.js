/**
 * Tutorial Flow Integration Tests
 * Tests complete user journey: signup → tutorials → backend update
 */

const https = require('https');

// Configuration
const BACKEND_HOST = process.env.BACKEND_URL?.replace('https://', '') || 'findable-production.up.railway.app';
const TEST_USER = 'caitie690';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

/**
 * Make HTTPS request to backend
 */
function backendRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BACKEND_HOST,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(responseData)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

describe('Tutorial Completion Flow', () => {
  let authToken;
  let userId;
  
  beforeAll(() => {
    if (!TEST_PASSWORD) {
      throw new Error('TEST_PASSWORD environment variable not set');
    }
  });
  
  test('should authenticate test user', async () => {
    const response = await backendRequest('POST', '/auth/login', {
      username: TEST_USER,
      password: TEST_PASSWORD
    });
    
    expect(response.status).toBe(200);
    expect(response.data.token).toBeDefined();
    expect(response.data.user_id).toBeDefined();
    
    authToken = response.data.token;
    userId = response.data.user_id;
    
    console.log(`✓ Authenticated as ${TEST_USER} (ID: ${userId})`);
  });
  
  test('should reset onboarding flag to false', async () => {
    const response = await backendRequest(
      'POST',
      '/user/profile',
      { hasCompletedOnboarding: false },
      { 'Authorization': `Bearer ${authToken}` }
    );
    
    expect(response.status).toBe(200);
    console.log('✓ Reset hasCompletedOnboarding to false');
  });
  
  test('should verify flag is false', async () => {
    const response = await backendRequest(
      'GET',
      '/user/profile',
      null,
      { 'Authorization': `Bearer ${authToken}` }
    );
    
    expect(response.status).toBe(200);
    expect(response.data.hasCompletedOnboarding).toBe(false);
    
    console.log('✓ Verified hasCompletedOnboarding = false');
  });
  
  test('should simulate tutorial completion', async () => {
    // Simulate user completing all tutorial screens
    const response = await backendRequest(
      'POST',
      '/user/profile',
      { hasCompletedOnboarding: true },
      { 'Authorization': `Bearer ${authToken}` }
    );
    
    expect(response.status).toBe(200);
    console.log('✓ Simulated tutorial completion (set flag to true)');
  });
  
  test('should verify backend updated correctly', async () => {
    const response = await backendRequest(
      'GET',
      '/user/profile',
      null,
      { 'Authorization': `Bearer ${authToken}` }
    );
    
    expect(response.status).toBe(200);
    expect(response.data.hasCompletedOnboarding).toBe(true);
    
    console.log('✓ Backend updated: hasCompletedOnboarding = true');
  });
  
  test('should persist across multiple requests', async () => {
    // Make 3 consecutive GET requests
    for (let i = 0; i < 3; i++) {
      const response = await backendRequest(
        'GET',
        '/user/profile',
        null,
        { 'Authorization': `Bearer ${authToken}` }
      );
      
      expect(response.status).toBe(200);
      expect(response.data.hasCompletedOnboarding).toBe(true);
    }
    
    console.log('✓ Flag persists across multiple requests');
  });
});

describe('Signup Flow with Onboarding', () => {
  test('should create new user with onboarding flag', async () => {
    const timestamp = Date.now();
    const testUsername = `testuser_${timestamp}`;
    
    // Step 1: Signup
    const signupRes = await backendRequest('POST', '/auth/register', {
      username: testUsername,
      password: 'TestPass123!',
      email: `${testUsername}@test.com`
    });
    
    expect(signupRes.status).toBe(200);
    expect(signupRes.data.token).toBeDefined();
    
    const token = signupRes.data.token;
    console.log(`✓ Created test user: ${testUsername}`);
    
    // Step 2: Set onboarding flag
    const profileRes = await backendRequest(
      'POST',
      '/user/profile',
      {
        name: 'Test User',
        email: `${testUsername}@test.com`,
        hasCompletedOnboarding: true
      },
      { 'Authorization': `Bearer ${token}` }
    );
    
    expect(profileRes.status).toBe(200);
    console.log('✓ Set hasCompletedOnboarding during signup');
    
    // Step 3: Verify persistence
    const getRes = await backendRequest(
      'GET',
      '/user/profile',
      null,
      { 'Authorization': `Bearer ${token}` }
    );
    
    expect(getRes.status).toBe(200);
    expect(getRes.data.hasCompletedOnboarding).toBe(true);
    
    console.log('✓ New user onboarding flag persisted correctly');
  });
});

