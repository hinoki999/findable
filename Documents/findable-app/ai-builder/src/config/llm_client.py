from litellm import completion
import os
from dotenv import load_dotenv

load_dotenv()

class LLMClient:
    def __init__(self, model="gpt-4", temperature=0.7):
        self.model = model
        self.temperature = temperature
        
    def call(self, messages, **kwargs):
        try:
            response = completion(
                model=self.model,
                messages=messages,
                temperature=self.temperature,
                **kwargs
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"LLM call failed: {e}")
            raise

if __name__ == "__main__":
    client = LLMClient()
    result = client.call([{"role": "user", "content": "Say hello"}])
    print(result)
