import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config.llm_client import LLMClient
from agents.mobile_code_agent import MobileCodeAgent

print("🤖 Findable AI Code Builder\n")

# Initialize LLM client
llm = LLMClient()

# Initialize mobile code agent
agent = MobileCodeAgent(llm)

# Generate BLE scanner code
print("Generating BLE Scanner code...")
ble_code = agent.generate_code(
    "Create a Swift class for BLE scanning that discovers nearby devices"
)

print("\n✅ Generated Code:\n")
print(ble_code)

# Save to file
with open("generated_code.swift", "w") as f:
    f.write(ble_code)

print("\n💾 Code saved to generated_code.swift")
print("\n🎉 Check https://cloud.langfuse.com for traces!")
