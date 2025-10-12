from config.observability import observe
from security.guards import SecurityGuard

class MobileCodeAgent:
    def __init__(self, llm_client):
        self.llm = llm_client
        self.guard = SecurityGuard()

    @observe()
    def generate_code(self, spec: str, platform: str = "react-native"):
        # Scan input for security issues
        safe_spec, _ = self.guard.scan_input(spec)

        if platform == "react-native":
            prompt = f"""You are an expert React Native developer. Generate production-ready TypeScript code for: {safe_spec}

Requirements:
- Use React Native with TypeScript
- Use functional components with hooks (useState, useEffect)
- Include proper TypeScript interfaces/types
- Use StyleSheet for styling (iOS-friendly design)
- Include error handling and loading states
- Add helpful comments
- Follow React Native best practices
- Make it visually appealing with proper spacing, colors, shadows

Output ONLY the code, no explanations or markdown."""

        elif platform == "swift":
            prompt = f"""Generate Swift code for iOS: {safe_spec}
- Use modern Swift syntax
- Include proper error handling
- Follow iOS best practices
Output ONLY code, no explanations."""
        
        else:
            prompt = f"""Generate {platform} code for: {safe_spec}
Output ONLY code, no explanations."""

        messages = [{"role": "user", "content": prompt}]
        code = self.llm.call(messages)
        return code
