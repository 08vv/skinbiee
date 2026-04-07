with open('frontend/index.html', 'r', encoding='utf-8') as f:
    text = f.read()

import re

for id_to_check in ['top-bar', 'bottom-nav', 'float-mascot-btn', 'theme-toggle', 'auth-form', 'auth-submit-btn']:
    match = re.search(f'id="{id_to_check}"', text)
    print(f'{id_to_check}: {"FOUND" if match else "NOT FOUND"}')
