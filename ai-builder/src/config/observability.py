from langfuse import Langfuse
from langfuse.decorators import observe, langfuse_context
import os
from dotenv import load_dotenv

load_dotenv()

langfuse = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
    host=os.getenv("LANGFUSE_HOST")
)

@observe()
def traced_llm_call(prompt: str, model: str = "gpt-4"):
    from src.config.llm_client import call_llm
    
    langfuse_context.update_current_trace(
        user_id="dev_user",
        tags=["development"]
    )
    
    response = call_llm([{"role": "user", "content": prompt}], model=model)
    return response

if __name__ == "__main__":
    result = traced_llm_call("What is AI?")
    print(result)
