#!/usr/bin/env python3
"""Real-time production monitoring for DropLink"""

import requests
import time
import os
from datetime import datetime
from colorama import init, Fore, Style

init(autoreset=True)

class ProductionMonitor:
    def __init__(self):
        self.base_url = "https://findable-production.up.railway.app"
        self.auth_token = None
        self.stats = {
            'total_requests': 0,
            'successful': 0,
            'failed': 0,
            'auth_errors': 0
        }
    
    def get_auth_token(self):
        """Get authentication token for testing"""
        # Use test credentials to get a valid token
        try:
            response = requests.post(
                f"{self.base_url}/auth/login",
                json={
                    "username": "test@droplink.com",
                    "password": "TestPass123!"
                },
                timeout=5
            )
            if response.status_code == 200:
                self.auth_token = response.json().get('token')
                print(f"{Fore.GREEN}✅ Got auth token for monitoring")
                return True
            else:
                print(f"{Fore.RED}❌ Failed to get auth token: {response.status_code}")
                return False
        except Exception as e:
            print(f"{Fore.RED}❌ Auth error: {e}")
            return False
    
    def check_health(self):
        """Check all endpoints"""
        endpoints = [
            ('GET', '/health', False),  # No auth needed
            ('GET', '/user/profile', True),  # Needs auth - THIS IS THE BUG!
            ('POST', '/user/profile', True),  # Needs auth - This works
        ]
        
        print(f"\n{Fore.CYAN}🔍 Checking production endpoints...")
        
        for method, endpoint, needs_auth in endpoints:
            try:
                headers = {}
                if needs_auth and self.auth_token:
                    headers['Authorization'] = f'Bearer {self.auth_token}'
                
                if method == 'GET':
                    response = requests.get(
                        f"{self.base_url}{endpoint}",
                        headers=headers,
                        timeout=5
                    )
                else:
                    response = requests.post(
                        f"{self.base_url}{endpoint}",
                        headers=headers,
                        json={},
                        timeout=5
                    )
                
                self.stats['total_requests'] += 1
                
                if response.status_code == 200:
                    self.stats['successful'] += 1
                    print(f"  ✅ {method:4} {endpoint:25} - {response.status_code}")
                elif response.status_code == 401:
                    self.stats['auth_errors'] += 1
                    print(f"  🔐 {method:4} {endpoint:25} - 401 Unauthorized (BUG!)")
                else:
                    self.stats['failed'] += 1
                    print(f"  ❌ {method:4} {endpoint:25} - {response.status_code}")
                    
            except Exception as e:
                self.stats['failed'] += 1
                print(f"  ❌ {method:4} {endpoint:25} - Connection Error: {str(e)[:50]}")
    
    def display_dashboard(self):
        """Show monitoring dashboard"""
        print(f"\n{Fore.GREEN}{'='*60}")
        print(f"{Style.BRIGHT}DROPLINK PRODUCTION MONITORING")
        print(f"{Fore.GREEN}{'='*60}")
        
        print(f"\n📈 Statistics:")
        total = max(1, self.stats['total_requests'])
        print(f"  Total Requests: {self.stats['total_requests']}")
        print(f"  Successful: {self.stats['successful']} ({self.stats['successful']/total*100:.0f}%)")
        print(f"  Failed: {self.stats['failed']}")
        print(f"  Auth Errors: {self.stats['auth_errors']}")
        
        if self.stats['auth_errors'] > 0:
            print(f"\n{Fore.YELLOW}⚠️  AUTH ERRORS DETECTED!")
            print(f"  GET /user/profile is failing with 401")
            print(f"  This is the bug we're fixing with middleware/auth.py")
    
    def continuous_monitor(self, interval=30):
        """Run continuous monitoring"""
        # Get auth token first
        if not self.get_auth_token():
            print(f"{Fore.RED}Cannot monitor without auth token. Exiting.")
            return
        
        while True:
            os.system('cls' if os.name == 'nt' else 'clear')
            print(f"{Fore.CYAN}Last Update: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"{Fore.CYAN}Base URL: {self.base_url}")
            
            self.check_health()
            self.display_dashboard()
            
            print(f"\n{Fore.GRAY}Refreshing in {interval} seconds... (Ctrl+C to stop)")
            time.sleep(interval)

if __name__ == "__main__":
    monitor = ProductionMonitor()
    monitor.continuous_monitor(30)  # Check every 30 seconds

