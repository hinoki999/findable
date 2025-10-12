from config.observability import observe
from security.guards import SecurityGuard

class MobileCodeAgent:
    def __init__(self, llm_client):
        self.llm = llm_client
        self.guard = SecurityGuard()

    @observe()
    def generate_code(self, spec: str, platform: str = "ios"):
        # Scan input for security issues
        safe_spec, _ = self.guard.scan_input(spec)

        prompt = f"""Generate {platform} code for: {safe_spec}

Context:
- iOS: Swift with proper error handling
- Android: Kotlin with Material Design 3
- Production-ready, secure code only

Output ONLY code, no explanations."""

        messages = [{"role": "user", "content": prompt}]
        code = self.llm.call(messages)
        return code
