import sys

def check_braces(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    braces = []
    line_num = 1
    col_num = 1
    
    in_string = False
    quote_char = None
    escaped = False
    
    for i, char in enumerate(content):
        if char == '\n':
            line_num += 1
            col_num = 1
        else:
            col_num += 1
            
        if escaped:
            escaped = False
            continue
            
        if char == '\\':
            escaped = True
            continue
            
        if char in ("'", '"', '`'):
            if not in_string:
                in_string = True
                quote_char = char
            elif char == quote_char:
                in_string = False
            continue
            
        if in_string:
            continue
            
        if char == '{':
            braces.append(('{', line_num, col_num))
        elif char == '}':
            if not braces:
                print(f"Error: Unexpected closing brace at line {line_num}, col {col_num}")
                return False
            braces.pop()
            
    if braces:
        for b, l, c in braces:
            print(f"Error: Unclosed brace '{b}' from line {l}, col {c}")
        return False
    
    print("Braces are balanced! ✨")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        check_braces(sys.argv[1])
    else:
        print("Usage: python check_js.py <filename>")
