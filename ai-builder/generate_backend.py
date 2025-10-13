import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from agents.mobile_code_agent import MobileCodeAgent
from config.llm_client import LLMClient
from config.observability import observe

# Initialize
llm_client = LLMClient()
agent = MobileCodeAgent(llm_client)

prompt = '''
Create a complete FastAPI backend for a BLE device tracking app with:
- SQLite database using SQLAlchemy
- Device model with fields: id, name, rssi, distance, timestamp, user_id
- Endpoints: POST /devices (save scan), GET /devices (retrieve history), GET /devices/{id}
- CORS enabled for React Native mobile app
- Pydantic models for request/response validation
- Error handling and logging
- Include all imports and database setup code
'''

print("🤖 Generating FastAPI Backend...\n")

# Generate Python backend code
code = agent.generate_code(prompt, platform="python")

print("\n" + "="*50)
print("GENERATED CODE:")
print("="*50)
print(code)

# Save to backend directory
os.makedirs('../backend', exist_ok=True)
with open('../backend/main.py', 'w', encoding='utf-8') as f:
    f.write(code)
    
print('\n\n✅ Backend API saved to ../backend/main.py')
