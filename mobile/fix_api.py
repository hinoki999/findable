import re
with open('src/services/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()
fixed = re.sub(r'secureFetch([^]+), \{', r'secureFetch(\1, {', content)
with open('src/services/api.ts', 'w', encoding='utf-8') as f:
    f.write(fixed)
print('Fixed all secureFetch calls')
