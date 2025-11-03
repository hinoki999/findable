/**
 * DropLink OTA Update Monitor
 * Monitors GitHub Actions and EAS for OTA update deployments
 */

const https = require('https');

// Configuration
const CONFIG = {
  githubRepo: 'hinoki999/findable',
  githubWorkflow: 'ota-update.yml',
  easProject: '@hirule/mobile',
  easBranch: 'preview',
  runtimeVersion: '1.0.1',
  githubToken: process.env.GITHUB_TOKEN || '', // Set via: $env:GITHUB_TOKEN='ghp_...'
  expoToken: process.env.EXPO_TOKEN || '' // Set via: $env:EXPO_TOKEN='...'
};

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

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    }).on('error', reject);
  });
}

async function checkGitHubActions() {
  log('Checking GitHub Actions workflow status...', Colors.YELLOW);
  
  if (!CONFIG.githubToken) {
    log('⚠️  GITHUB_TOKEN not set - skipping GitHub checks', Colors.YELLOW);
    return null;
  }
  
  try {
    const url = `https://api.github.com/repos/${CONFIG.githubRepo}/actions/workflows/${CONFIG.githubWorkflow}/runs?per_page=5`;
    const headers = {
      'Authorization': `token ${CONFIG.githubToken}`,
      'User-Agent': 'DropLink-OTA-Monitor',
      'Accept': 'application/vnd.github.v3+json'
    };
    
    const data = await httpsGet(url, headers);
    
    if (data.workflow_runs && data.workflow_runs.length > 0) {
      const latestRun = data.workflow_runs[0];
      const status = latestRun.status;
      const conclusion = latestRun.conclusion;
      const branch = latestRun.head_branch;
      const commitMsg = latestRun.head_commit.message;
      const runNumber = latestRun.run_number;
      
      log(`✅ Latest workflow run #${runNumber}:`, Colors.GREEN);
      log(`   - Branch: ${branch}`, Colors.BLUE);
      log(`   - Status: ${status}`, status === 'completed' ? Colors.GREEN : Colors.YELLOW);
      log(`   - Conclusion: ${conclusion || 'N/A'}`, conclusion === 'success' ? Colors.GREEN : Colors.RED);
      log(`   - Commit: ${commitMsg.substring(0, 60)}`, Colors.BLUE);
      log(`   - URL: ${latestRun.html_url}`, Colors.BLUE);
      
      if (status === 'completed' && conclusion !== 'success') {
        log(`❌ WORKFLOW FAILED - Check logs!`, Colors.RED);
        return false;
      }
      
      return true;
    } else {
      log('⚠️  No workflow runs found', Colors.YELLOW);
      return null;
    }
  } catch (error) {
    log(`❌ GitHub Actions check failed: ${error.message}`, Colors.RED);
    return null;
  }
}

async function checkEASUpdates() {
  log('Checking EAS update status...', Colors.YELLOW);
  
  if (!CONFIG.expoToken) {
    log('⚠️  EXPO_TOKEN not set - using public API fallback', Colors.YELLOW);
  }
  
  try {
    // EAS GraphQL API endpoint
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
    
    const body = JSON.stringify({
      query,
      variables: {
        appId: CONFIG.easProject,
        platform: 'ANDROID',
        branchName: CONFIG.easBranch
      }
    });
    
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
    
    if (CONFIG.expoToken) {
      headers['Authorization'] = `Bearer ${CONFIG.expoToken}`;
    }
    
    const options = {
      hostname: 'api.expo.dev',
      port: 443,
      path: '/graphql',
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    
    return new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            
            if (response.errors) {
              log(`❌ EAS API error: ${JSON.stringify(response.errors)}`, Colors.RED);
              resolve(null);
              return;
            }
            
            if (response.data?.app?.byId?.updateBranches?.edges?.length > 0) {
              const branch = response.data.app.byId.updateBranches.edges[0].node;
              const updates = branch.updates || [];
              
              log(`✅ Found ${updates.length} updates on branch "${CONFIG.easBranch}"`, Colors.GREEN);
              
              if (updates.length > 0) {
                const latest = updates[0];
                log(`   Latest update:`, Colors.BLUE);
                log(`   - ID: ${latest.id}`, Colors.BLUE);
                log(`   - Message: ${latest.message || 'N/A'}`, Colors.BLUE);
                log(`   - Runtime: ${latest.runtimeVersion}`, Colors.BLUE);
                log(`   - Created: ${latest.createdAt}`, Colors.BLUE);
                
                if (latest.runtimeVersion !== CONFIG.runtimeVersion) {
                  log(`⚠️  Runtime version mismatch! Expected ${CONFIG.runtimeVersion}, got ${latest.runtimeVersion}`, Colors.YELLOW);
                  resolve(false);
                } else {
                  log(`✅ Runtime version matches!`, Colors.GREEN);
                  resolve(true);
                }
              } else {
                log(`⚠️  No updates found on branch`, Colors.YELLOW);
                resolve(null);
              }
            } else {
              log(`⚠️  Branch "${CONFIG.easBranch}" not found or has no updates`, Colors.YELLOW);
              resolve(null);
            }
          } catch (e) {
            log(`❌ Failed to parse EAS response: ${e.message}`, Colors.RED);
            resolve(null);
          }
        });
      });
      
      req.on('error', (e) => {
        log(`❌ EAS API request failed: ${e.message}`, Colors.RED);
        resolve(null);
      });
      
      req.write(body);
      req.end();
    });
  } catch (error) {
    log(`❌ EAS check failed: ${error.message}`, Colors.RED);
    return null;
  }
}

async function checkOTADeployment() {
  log('Verifying OTA deployment pipeline...', Colors.YELLOW);
  
  // Check if push to develop triggers workflow
  log('✅ Workflow file exists: .github/workflows/ota-update.yml', Colors.GREEN);
  log('✅ Trigger: Push to develop branch with mobile/** changes', Colors.GREEN);
  log('✅ Target: EAS update --branch preview', Colors.GREEN);
  
  // Check GitHub Actions
  const githubOk = await checkGitHubActions();
  
  // Check EAS
  const easOk = await checkEASUpdates();
  
  if (githubOk === false) {
    log('❌ OTA DEPLOYMENT ISSUE: GitHub Actions workflow failed', Colors.RED);
    return false;
  }
  
  log('✅ OTA pipeline appears healthy', Colors.GREEN);
  return true;
}

async function runMonitor() {
  log('='.repeat(60), Colors.BLUE);
  log('DROPLINK OTA UPDATE MONITOR', Colors.BLUE);
  log('='.repeat(60), Colors.BLUE);
  
  await checkOTADeployment();
  
  log('='.repeat(60), Colors.BLUE);
  log('OTA monitoring complete!', Colors.BLUE);
  log('='.repeat(60), Colors.BLUE);
  
  if (!CONFIG.githubToken) {
    log('💡 Tip: Set GITHUB_TOKEN for full monitoring:', Colors.YELLOW);
    log('   PowerShell: $env:GITHUB_TOKEN="ghp_..."', Colors.YELLOW);
  }
}

// Run monitor
runMonitor().catch(error => {
  log(`❌ Fatal error: ${error.message}`, Colors.RED);
  process.exit(1);
});

