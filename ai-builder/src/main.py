from config.observability import observe
from config.llm_client import LLMClient
from agents.mobile_code_agent import MobileCodeAgent
import os

print("🤖 Findable AI Code Builder\n")

llm = LLMClient()
agent = MobileCodeAgent(llm)

# Generate React Native BLE Scanner Component
print("Generating React Native BLE Scanner component...")
ble_scanner = agent.generate_code(
    """Create a React Native BLE Scanner component that:
    - Scans for nearby BLE devices
    - Displays devices in a FlatList
    - Shows device name, RSSI signal strength, and estimated distance
    - Has a scan/stop button
    - Shows loading state while scanning
    - Handles permissions properly
    - Uses react-native-ble-plx library
    - Calculates distance from RSSI (use formula: distance = 10^((measuredPower - RSSI)/(10 * 2)))
    - Style it beautifully with cards, colors, and proper spacing""",
    platform="react-native"
)

print("\n✅ Generated BLE Scanner Component:\n")
print(f"`	ypescript\n{ble_scanner}\n`")

# Save to mobile project
output_dir = "../mobile/src/components"
os.makedirs(output_dir, exist_ok=True)

with open(f"{output_dir}/BLEScanner.tsx", "w") as f:
    f.write(ble_scanner)

print(f"\n💾 Code saved to {output_dir}/BLEScanner.tsx")
print("\n🎉 Check https://cloud.langfuse.com for traces!")
