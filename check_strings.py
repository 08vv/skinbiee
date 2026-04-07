import re

def find_unclosed_strings(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    in_multiline_string = False
    start_line = 0
    
    for i, line in enumerate(lines):
        line_num = i + 1
        # Count backticks
        backticks = line.count('`')
        if backticks % 2 != 0:
            if not in_multiline_string:
                in_multiline_string = True
                start_line = line_num
            else:
                in_multiline_string = False
        
        # Check for unclosed single/double quotes on this line
        # This is naïve but helps
        if not in_multiline_string:
            line_no_escapes = re.sub(r'\\.', '', line)
            for q in ("'", '"'):
                if line_no_escapes.count(q) % 2 != 0:
                    print(f"Potential unclosed {q} at line {line_num}")
    
    if in_multiline_string:
        print(f"Error: Unclosed backtick starting at line {start_line}")

if __name__ == "__main__":
    find_unclosed_strings('frontend/skinbiee.js')
