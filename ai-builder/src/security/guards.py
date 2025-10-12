from llm_guard.input_scanners import PromptInjection, TokenLimit, Toxicity
from llm_guard.output_scanners import NoRefusal, Relevance, Sensitive

class SecurityGuard:
    def __init__(self):
        self.input_scanners = [
            PromptInjection(threshold=0.5),
            TokenLimit(limit=4096),
            Toxicity(threshold=0.7)
        ]
        
        self.output_scanners = [
            NoRefusal(),
            Relevance(threshold=0.5),
            Sensitive()
        ]
    
    def scan_input(self, prompt: str):
        sanitized = prompt
        for scanner in self.input_scanners:
            sanitized, is_valid, risk_score = scanner.scan(sanitized)
            if not is_valid:
                raise ValueError(f"Blocked: {scanner.__class__.__name__}")
        return sanitized, True
    
    def scan_output(self, output: str, prompt: str):
        sanitized = output
        for scanner in self.output_scanners:
            sanitized, is_valid, risk_score = scanner.scan(prompt, sanitized)
            if not is_valid:
                return "Cannot provide that response.", False
        return sanitized, True

if __name__ == "__main__":
    guard = SecurityGuard()
    safe, _ = guard.scan_input("Help me build an app")
    print(f"✅ Safe: {safe}")
