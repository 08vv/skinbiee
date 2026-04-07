import re

def fix_buttons(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    content = re.sub(r'<button class="pill"', '<button type="button" class="pill"', content)
    content = re.sub(r'<button class="pill active"', '<button type="button" class="pill active"', content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)

fix_buttons('d:/sk/skincare/frontend/index.html')
fix_buttons('d:/sk/skincare/frontend/skinbiee.html')
print("Successfully fixed button types in HTML files.")
