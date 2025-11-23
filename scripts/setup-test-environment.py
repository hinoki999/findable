#!/usr/bin/env python3
"""
Complete test environment setup with validation
Ensures all prerequisites are met before running tests
"""

import os
import sys
import requests
import psycopg2
from colorama import init, Fore, Style

init(autoreset=True)

class TestEnvironmentSetup:
    def __init__(self):
        self.errors = []
        self.warnings = []
        
    def check_environment_variables(self):
        """Verify all required env vars are set"""
        required_vars = [
            'TEST_DATABASE_URL',
            'TEST_USER_EMAIL',
            'TEST_USER_PASSWORD',
            'TEST_BACKEND_URL'
        ]
        
        print(f"{Fore.CYAN}📋 Checking environment variables...")
        for var in required_vars:
            if os.getenv(var):
                print(f"  ✅ {var} is set")
            else:
                self.errors.append(f"Missing: {var}")
                print(f"  ❌ {var} is NOT set")
    
    def check_database_connection(self):
        """Test database connectivity"""
        print(f"\n{Fore.CYAN}🗄️  Testing database connection...")
        try:
            conn = psycopg2.connect(os.getenv('TEST_DATABASE_URL'))
            cursor = conn.cursor()
            cursor.execute("SELECT version();")
            version = cursor.fetchone()[0]
            print(f"  ✅ Connected to: {version}")
            conn.close()
        except Exception as e:
            self.errors.append(f"Database connection failed: {e}")
            print(f"  ❌ Connection failed: {e}")
    
    def create_test_user(self):
        """Ensure test user exists in database"""
        print(f"\n{Fore.CYAN}👤 Setting up test user...")
        try:
            conn = psycopg2.connect(os.getenv('TEST_DATABASE_URL'))
            cursor = conn.cursor()
            
            # Check if user exists
            cursor.execute(
                "SELECT id FROM users WHERE email = %s",
                (os.getenv('TEST_USER_EMAIL'),)
            )
            
            if cursor.fetchone():
                print(f"  ✅ Test user already exists")
            else:
                # Create test user with hashed password
                from werkzeug.security import generate_password_hash
                hashed_pw = generate_password_hash(os.getenv('TEST_USER_PASSWORD'))
                
                cursor.execute("""
                    INSERT INTO users (email, password, created_at)
                    VALUES (%s, %s, NOW())
                """, (os.getenv('TEST_USER_EMAIL'), hashed_pw))
                
                conn.commit()
                print(f"  ✅ Test user created")
                
            conn.close()
        except Exception as e:
            self.errors.append(f"Test user creation failed: {e}")
            print(f"  ❌ Failed to create test user: {e}")
    
    def test_backend_health(self):
        """Verify backend is running and healthy"""
        print(f"\n{Fore.CYAN}🏥 Checking backend health...")
        backend_url = os.getenv('TEST_BACKEND_URL', 'http://localhost:8000')
        
        try:
            response = requests.get(f"{backend_url}/health", timeout=5)
            if response.status_code == 200:
                print(f"  ✅ Backend is healthy")
            else:
                self.warnings.append(f"Backend returned {response.status_code}")
                print(f"  ⚠️  Backend returned: {response.status_code}")
        except requests.exceptions.ConnectionError:
            self.errors.append("Backend not reachable")
            print(f"  ❌ Cannot connect to backend at {backend_url}")
        except Exception as e:
            self.errors.append(f"Backend check failed: {e}")
            print(f"  ❌ Error: {e}")
    
    def test_authentication(self):
        """Verify authentication works with test credentials"""
        print(f"\n{Fore.CYAN}🔐 Testing authentication...")
        backend_url = os.getenv('TEST_BACKEND_URL', 'http://localhost:8000')
        
        try:
            response = requests.post(
                f"{backend_url}/auth/login",
                json={
                    "username": os.getenv('TEST_USER_EMAIL'),
                    "password": os.getenv('TEST_USER_PASSWORD')
                },
                timeout=5
            )
            
            if response.status_code == 200:
                print(f"  ✅ Authentication successful")
                token = response.json().get('token', '')
                if token:
                    print(f"  📝 Token received: {token[:20]}...")
            else:
                self.errors.append(f"Auth failed: {response.status_code} - {response.text}")
                print(f"  ❌ Auth failed: {response.status_code}")
                print(f"     Response: {response.text}")
        except Exception as e:
            self.errors.append(f"Auth test failed: {e}")
            print(f"  ❌ Error: {e}")
    
    def run(self):
        """Run all setup checks"""
        print(f"{Fore.GREEN}{'='*50}")
        print(f"{Style.BRIGHT}DROP-LINK TEST ENVIRONMENT SETUP")
        print(f"{Fore.GREEN}{'='*50}\n")
        
        self.check_environment_variables()
        self.check_database_connection()
        self.create_test_user()
        self.test_backend_health()
        self.test_authentication()
        
        # Summary
        print(f"\n{Fore.GREEN}{'='*50}")
        print(f"{Style.BRIGHT}SETUP SUMMARY")
        print(f"{Fore.GREEN}{'='*50}\n")
        
        if self.errors:
            print(f"{Fore.RED}❌ {len(self.errors)} ERROR(S) FOUND:")
            for error in self.errors:
                print(f"   • {error}")
            print(f"\n{Fore.RED}Setup failed. Fix errors before running tests.\n")
            sys.exit(1)
        
        if self.warnings:
            print(f"{Fore.YELLOW}⚠️  {len(self.warnings)} WARNING(S):")
            for warning in self.warnings:
                print(f"   • {warning}")
            print()
        
        print(f"{Fore.GREEN}✅ All checks passed! Environment is ready for testing.\n")
        print(f"{Fore.CYAN}Next steps:")
        print(f"  1. Run pytest: python -m pytest tests/")
        print(f"  2. Run with coverage: python -m pytest --cov=. tests/")
        print(f"  3. Generate HTML report: python -m pytest --cov=. --cov-report=html tests/\n")
        
        sys.exit(0)


if __name__ == '__main__':
    setup = TestEnvironmentSetup()
    setup.run()

