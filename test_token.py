import sys
sys.path.insert(0, 'backend')

# Mock the database connection to avoid errors
import unittest.mock as mock
with mock.patch('main.init_db'):
    from main import create_access_token

# Test token creation
token = create_access_token(user_id=1, username='test')
print(f'Token: {token}')
print(f'Segments: {len(token.split("."))}')
print(f'Valid JWT format: {len(token.split(".")) == 3}')

