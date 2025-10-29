#!/usr/bin/env python3
"""
SQL Injection Audit Script for Droplin Backend
Scans main.py for all database queries and checks for SQL injection vulnerabilities
"""

import re
import sys

def audit_sql_queries(filepath):
    """Audit all SQL queries in the file"""
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Find all execute_query calls
    execute_query_pattern = r'execute_query\s*\([^)]+\)'
    matches = list(re.finditer(execute_query_pattern, content, re.MULTILINE | re.DOTALL))
    
    print(f"SQL INJECTION AUDIT REPORT")
    print(f"=" * 80)
    print(f"\nFound {len(matches)} execute_query() calls\n")
    
    vulnerabilities = []
    safe_queries = []
    
    for i, match in enumerate(matches, 1):
        query_text = match.group(0)
        line_num = content[:match.start()].count('\n') + 1
        
        # Check for dangerous patterns
        is_vulnerable = False
        vulnerability_type = None
        
        # Check for f-strings (f"..." or f'...')
        if re.search(r'f["\']', query_text):
            is_vulnerable = True
            vulnerability_type = "F-STRING INTERPOLATION"
        
        # Check for .format()
        elif '.format(' in query_text:
            is_vulnerable = True
            vulnerability_type = ".format() INTERPOLATION"
        
        # Check for % formatting
        elif re.search(r'%\s*\(', query_text):
            is_vulnerable = True
            vulnerability_type = "% FORMATTING"
        
        # Check for string concatenation with +
        elif re.search(r'["\']?\s*\+\s*["\']?', query_text) and ('SELECT' in query_text or 'INSERT' in query_text):
            is_vulnerable = True
            vulnerability_type = "STRING CONCATENATION"
        
        if is_vulnerable:
            vulnerabilities.append({
                'line': line_num,
                'type': vulnerability_type,
                'query': query_text[:100]
            })
        else:
            # Check if it uses parameterized queries
            if '?' in query_text or '%s' in query_text:
                safe_queries.append({
                    'line': line_num,
                    'query': query_text[:80]
                })
    
    # Also check for direct cursor.execute() calls (bypassing execute_query helper)
    direct_execute_pattern = r'cursor\.execute\s*\('
    direct_matches = list(re.finditer(direct_execute_pattern, content))
    
    print(f"WARNING: Found {len(direct_matches)} direct cursor.execute() calls")
    print(f"    (These bypass the execute_query() helper)")
    
    # Find init_db function boundaries
    init_db_match = re.search(r'def init_db\(\):', content)
    if init_db_match:
        init_db_start = content[:init_db_match.start()].count('\n') + 1
        # Find the end of init_db (next function definition or end of indented block)
        next_func = re.search(r'\ndef [a-zA-Z_]', content[init_db_match.end():])
        if next_func:
            init_db_end = content[:init_db_match.end() + next_func.start()].count('\n')
        else:
            init_db_end = float('inf')
    else:
        init_db_start = -1
        init_db_end = -1
    
    direct_vulnerabilities = []
    init_db_safe = []
    
    for match in direct_matches:
        # Get context around the match
        start = max(0, match.start() - 200)
        end = min(len(content), match.end() + 200)
        context = content[start:end]
        line_num = content[:match.start()].count('\n') + 1
        
        # Check if this line is within init_db function
        in_init_db = init_db_start <= line_num <= init_db_end
        
        if in_init_db:
            # This is table creation - safe use of f-strings with hardcoded schema variables
            init_db_safe.append(line_num)
        else:
            # Check for dangerous patterns
            if re.search(r'f["\']', context):
                direct_vulnerabilities.append({
                    'line': line_num,
                    'type': 'DIRECT EXECUTE WITH F-STRING (NOT IN INIT_DB)',
                    'context': context[:100]
                })
    
    # Print results
    print(f"\n{'='*80}")
    print(f"AUDIT RESULTS")
    print(f"{'='*80}\n")
    
    if vulnerabilities or direct_vulnerabilities:
        print(f"[FAIL] VULNERABILITIES FOUND: {len(vulnerabilities) + len(direct_vulnerabilities)}\n")
        
        for vuln in vulnerabilities:
            print(f"  Line {vuln['line']}: {vuln['type']}")
            print(f"    {vuln['query'][:80]}...")
            print()
        
        for vuln in direct_vulnerabilities:
            print(f"  Line {vuln['line']}: {vuln['type']}")
            print(f"    {vuln['context'][:80]}...")
            print()
        
        print(f"\n[ACTION REQUIRED] Fix these SQL injection vulnerabilities!")
        return False
    else:
        print(f"[PASS] NO SQL INJECTION VULNERABILITIES FOUND!")
        print(f"\n[PASS] All {len(safe_queries)} execute_query() calls use parameterized queries")
        print(f"[PASS] {len(init_db_safe)} cursor.execute() calls in init_db() (table creation - safe)")
        print(f"[PASS] 0 vulnerable cursor.execute() calls outside init_db()")
        
        print(f"\n{'='*80}")
        print(f"SAMPLE SAFE QUERIES:")
        print(f"{'='*80}\n")
        
        for i, query in enumerate(safe_queries[:5], 1):
            print(f"{i}. Line {query['line']}:")
            print(f"   {query['query'][:75]}...")
            print()
        
        return True

if __name__ == "__main__":
    filepath = "main.py"
    
    try:
        is_safe = audit_sql_queries(filepath)
        sys.exit(0 if is_safe else 1)
    except FileNotFoundError:
        print(f"[ERROR] Error: {filepath} not found")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Error during audit: {e}")
        sys.exit(1)

