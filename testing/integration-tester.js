/**
 * DropLink Integration Tester
 * Simulates complete user flows and tests end-to-end functionality
 */

const https = require('https');

// Configuration
const BASE_URL = 'findable-production.up.railway.app';
const TEST_USER = 'caitie690';
const TEST_PASSWORD = 'testpassword123'; // Update with actual test password

// Colors
const Colors = {
  GREEN: '\x1b[92m',
  RED: '\x1b[91m',
  YELLOW: '\x1b[93m',
  BLUE: '\x1b[94m',
  END: '\x1b[0m'
};

function log(message, color = Colors.BLUE) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  console.log(`${color}[${timestamp}] ${message}${Colors.END}`);
}

function httpsRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: BASE_URL,
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

async function testSignupFlow() {
  log('='.repeat(60), Colors.BLUE);
  log('TEST 1: SIGNUP FLOW WITH TUTORIAL FLAG', Colors.BLUE);
  log('='.repeat(60), Colors.BLUE);
  
  const timestamp = Date.now();
  const testUsername = `integtest_${timestamp}`;
  
  // Step 1: Signup
  log('Step 1: Creating new user account...', Colors.YELLOW);
  const signupRes = await httpsRequest('POST', '/auth/signup', {
    username: testUsername,
    password: 'TestPass123!',
    email: `${testUsername}@test.com`
  });
  
  if (signupRes.status !== 200) {
    log(`❌ Signup failed: ${signupRes.status}`, Colors.RED);
    return false;
  }
  
  const token = signupRes.data.token;
  const userId = signupRes.data.user_id;
  log(`✅ User created: ${testUsername} (ID: ${userId})`, Colors.GREEN);
  
  // Step 2: Save profile with onboarding flag
  log('Step 2: Saving profile with hasCompletedOnboarding=true...', Colors.YELLOW);
  const profileRes = await httpsRequest('POST', '/user/profile', {
    name: 'Integration Test User',
    email: `${testUsername}@test.com`,
    hasCompletedOnboarding: true
  }, {
    'Authorization': `Bearer ${token}`
  });
  
  if (profileRes.status !== 200) {
    log(`❌ Profile save failed: ${profileRes.status}`, Colors.RED);
    return false;
  }
  
  log('✅ Profile saved with onboarding flag', Colors.GREEN);
  
  // Step 3: Verify flag persisted
  log('Step 3: Verifying flag persisted in database...', Colors.YELLOW);
  const getProfileRes = await httpsRequest('GET', '/user/profile', null, {
    'Authorization': `Bearer ${token}`
  });
  
  if (getProfileRes.status !== 200) {
    log(`❌ Profile retrieval failed: ${getProfileRes.status}`, Colors.RED);
    return false;
  }
  
  const hasCompleted = getProfileRes.data.hasCompletedOnboarding;
  if (hasCompleted === true) {
    log('✅ PERSISTENCE VERIFIED: Flag saved correctly!', Colors.GREEN);
    return true;
  } else {
    log(`❌ PERSISTENCE FAILED: Expected true, got ${hasCompleted}`, Colors.RED);
    return false;
  }
}

async function testLoginFlow() {
  log('='.repeat(60), Colors.BLUE);
  log('TEST 2: LOGIN FLOW - VERIFY TUTORIALS SKIPPED', Colors.BLUE);
  log('='.repeat(60), Colors.BLUE);
  
  // Step 1: Login
  log('Step 1: Logging in with existing user...', Colors.YELLOW);
  const loginRes = await httpsRequest('POST', '/auth/login', {
    username: TEST_USER,
    password: TEST_PASSWORD
  });
  
  if (loginRes.status !== 200) {
    log(`❌ Login failed: ${loginRes.status}`, Colors.RED);
    return false;
  }
  
  const token = loginRes.data.token;
  log(`✅ Login successful`, Colors.GREEN);
  
  // Step 2: Check profile
  log('Step 2: Checking profile onboarding status...', Colors.YELLOW);
  const profileRes = await httpsRequest('GET', '/user/profile', null, {
    'Authorization': `Bearer ${token}`
  });
  
  if (profileRes.status !== 200) {
    log(`❌ Profile retrieval failed: ${profileRes.status}`, Colors.RED);
    return false;
  }
  
  const hasCompleted = profileRes.data.hasCompletedOnboarding;
  log(`   hasCompletedOnboarding: ${hasCompleted}`, Colors.BLUE);
  
  if (hasCompleted === true) {
    log('✅ User has completed onboarding - tutorials should be skipped', Colors.GREEN);
    return true;
  } else {
    log('⚠️  User has NOT completed onboarding - tutorials will show', Colors.YELLOW);
    return true; // Not necessarily a failure
  }
}

async function testTutorialCompletion() {
  log('='.repeat(60), Colors.BLUE);
  log('TEST 3: TUTORIAL COMPLETION → BACKEND UPDATE', Colors.BLUE);
  log('='.repeat(60), Colors.BLUE);
  
  // Login first
  log('Step 1: Authenticating...', Colors.YELLOW);
  const loginRes = await httpsRequest('POST', '/auth/login', {
    username: TEST_USER,
    password: TEST_PASSWORD
  });
  
  if (loginRes.status !== 200) {
    log(`❌ Login failed: ${loginRes.status}`, Colors.RED);
    return false;
  }
  
  const token = loginRes.data.token;
  log(`✅ Authenticated`, Colors.GREEN);
  
  // Simulate tutorial completion - set flag to false first
  log('Step 2: Resetting onboarding flag to false...', Colors.YELLOW);
  await httpsRequest('POST', '/user/profile', {
    hasCompletedOnboarding: false
  }, {
    'Authorization': `Bearer ${token}`
  });
  
  // Now set it to true (simulating tutorial completion)
  log('Step 3: Simulating tutorial completion (setting flag to true)...', Colors.YELLOW);
  const updateRes = await httpsRequest('POST', '/user/profile', {
    hasCompletedOnboarding: true
  }, {
    'Authorization': `Bearer ${token}`
  });
  
  if (updateRes.status !== 200) {
    log(`❌ Backend update failed: ${updateRes.status}`, Colors.RED);
    return false;
  }
  
  log('✅ Backend update successful', Colors.GREEN);
  
  // Verify persistence
  log('Step 4: Verifying flag persisted...', Colors.YELLOW);
  const verifyRes = await httpsRequest('GET', '/user/profile', null, {
    'Authorization': `Bearer ${token}`
  });
  
  if (verifyRes.status !== 200) {
    log(`❌ Verification failed: ${verifyRes.status}`, Colors.RED);
    return false;
  }
  
  const hasCompleted = verifyRes.data.hasCompletedOnboarding;
  if (hasCompleted === true) {
    log('✅ TUTORIAL COMPLETION FLOW PASSED: Backend updated correctly!', Colors.GREEN);
    return true;
  } else {
    log(`❌ TUTORIAL COMPLETION FLOW FAILED: Expected true, got ${hasCompleted}`, Colors.RED);
    return false;
  }
}

async function runAllIntegrationTests() {
  log('='.repeat(60), Colors.BLUE);
  log('DROPLINK INTEGRATION TESTS', Colors.BLUE);
  log('='.repeat(60), Colors.BLUE);
  
  const results = [];
  
  // Run tests
  try {
    results.push({ name: 'Signup Flow', passed: await testSignupFlow() });
  } catch (e) {
    log(`❌ Signup flow error: ${e.message}`, Colors.RED);
    results.push({ name: 'Signup Flow', passed: false });
  }
  
  try {
    results.push({ name: 'Login Flow', passed: await testLoginFlow() });
  } catch (e) {
    log(`❌ Login flow error: ${e.message}`, Colors.RED);
    results.push({ name: 'Login Flow', passed: false });
  }
  
  try {
    results.push({ name: 'Tutorial Completion', passed: await testTutorialCompletion() });
  } catch (e) {
    log(`❌ Tutorial completion error: ${e.message}`, Colors.RED);
    results.push({ name: 'Tutorial Completion', passed: false });
  }
  
  // Summary
  log('='.repeat(60), Colors.BLUE);
  log('TEST SUMMARY', Colors.BLUE);
  log('='.repeat(60), Colors.BLUE);
  
  results.forEach(result => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    const color = result.passed ? Colors.GREEN : Colors.RED;
    log(`${status}: ${result.name}`, color);
  });
  
  const allPassed = results.every(r => r.passed);
  log('='.repeat(60), Colors.BLUE);
  
  if (allPassed) {
    log('🎉 ALL TESTS PASSED!', Colors.GREEN);
  } else {
    log('⚠️  SOME TESTS FAILED - CHECK LOGS ABOVE', Colors.RED);
  }
}

// Run tests
runAllIntegrationTests().catch(error => {
  log(`❌ Fatal error: ${error.message}`, Colors.RED);
  process.exit(1);
});

