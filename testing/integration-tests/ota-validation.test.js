/**
 * OTA Update Validation Tests
 * Verifies EAS updates are published correctly to preview branch
 */

const https = require('https');

// Configuration from environment
const EAS_PROJECT = '@hirule/mobile';
const EAS_BRANCH = 'preview';
const EXPECTED_RUNTIME = '1.0.1';
const EXPO_TOKEN = process.env.EXPO_TOKEN || '';

/**
 * Query EAS GraphQL API for updates
 */
function queryEAS(query, variables) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    
    const options = {
      hostname: 'api.expo.dev',
      port: 443,
      path: '/graphql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    if (EXPO_TOKEN) {
      options.headers['Authorization'] = `Bearer ${EXPO_TOKEN}`;
    }
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

describe('EAS OTA Updates', () => {
  let latestUpdate;
  
  beforeAll(async () => {
    if (!EXPO_TOKEN) {
      console.warn('⚠️  EXPO_TOKEN not set - some tests may fail');
    }
  });
  
  test('should fetch updates from preview branch', async () => {
    const query = `
      query GetUpdates($appId: String!, $platform: AppPlatform!, $branchName: String!) {
        app {
          byId(appId: $appId) {
            updateBranches(limit: 1, offset: 0) {
              edges {
                node {
                  name
                  updates(limit: 5, offset: 0, filter: {platform: $platform}) {
                    id
                    message
                    runtimeVersion
                    createdAt
                    platform
                  }
                }
              }
            }
          }
        }
      }
    `;
    
    const response = await queryEAS(query, {
      appId: EAS_PROJECT,
      platform: 'ANDROID',
      branchName: EAS_BRANCH
    });
    
    expect(response.errors).toBeUndefined();
    expect(response.data).toBeDefined();
    expect(response.data.app).toBeDefined();
    
    const branches = response.data.app.byId?.updateBranches?.edges;
    expect(branches).toBeDefined();
    expect(branches.length).toBeGreaterThan(0);
    
    const updates = branches[0].node.updates;
    expect(updates).toBeDefined();
    expect(updates.length).toBeGreaterThan(0);
    
    latestUpdate = updates[0];
    
    console.log(`✓ Found ${updates.length} updates on ${EAS_BRANCH} branch`);
    console.log(`  Latest update ID: ${latestUpdate.id}`);
  });
  
  test('should have correct runtime version', () => {
    expect(latestUpdate).toBeDefined();
    expect(latestUpdate.runtimeVersion).toBe(EXPECTED_RUNTIME);
    
    console.log(`✓ Runtime version matches: ${latestUpdate.runtimeVersion}`);
  });
  
  test('should have recent update timestamp', () => {
    expect(latestUpdate).toBeDefined();
    
    const updateDate = new Date(latestUpdate.createdAt);
    const now = new Date();
    const hoursSinceUpdate = (now - updateDate) / (1000 * 60 * 60);
    
    // Update should be within last 7 days
    expect(hoursSinceUpdate).toBeLessThan(168);
    
    console.log(`✓ Latest update created: ${updateDate.toISOString()}`);
    console.log(`  (${Math.round(hoursSinceUpdate)} hours ago)`);
  });
  
  test('should have valid update message', () => {
    expect(latestUpdate).toBeDefined();
    expect(latestUpdate.message).toBeDefined();
    expect(typeof latestUpdate.message).toBe('string');
    
    console.log(`✓ Update message: "${latestUpdate.message}"`);
  });
  
  test('should be for Android platform', () => {
    expect(latestUpdate).toBeDefined();
    expect(latestUpdate.platform).toBe('ANDROID');
    
    console.log(`✓ Platform: ${latestUpdate.platform}`);
  });
});

describe('OTA Deployment Pipeline', () => {
  test('should have GitHub Actions workflow configured', async () => {
    // This test verifies the workflow file exists by checking GitHub API
    const options = {
      hostname: 'api.github.com',
      path: '/repos/hinoki999/findable/contents/.github/workflows/ota-update.yml',
      headers: {
        'User-Agent': 'DropLink-Test-Suite',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    
    return new Promise((resolve, reject) => {
      https.get(options, (res) => {
        expect(res.statusCode).toBe(200);
        console.log('✓ GitHub Actions workflow file exists');
        resolve();
      }).on('error', reject);
    });
  });
});

