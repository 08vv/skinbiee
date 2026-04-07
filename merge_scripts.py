import re

with open('frontend/script.js', 'r', encoding='utf-8') as f:
    script_js = f.read()

with open('frontend/skinbiee.js', 'r', encoding='utf-8') as f:
    skinbiee_js = f.read()

# Extract blocks from skinbiee_js
api_base_match = re.search(r'const API_BASE_URL = [^\n]*\n', skinbiee_js)
safe_storage_match = re.search(r'/\* --- Safe LocalStorage Utility --- \*/.*?};\n', skinbiee_js, re.DOTALL)
persist_session_match = re.search(r'function persistSession.*?\n}\n', skinbiee_js, re.DOTALL)
restore_session_match = re.search(r'function restoreSession.*?\n}\n', skinbiee_js, re.DOTALL)
auth_headers_match = re.search(r'function authHeadersRaw.*?\n}\n', skinbiee_js, re.DOTALL)
refresh_match = re.search(r'async function refreshUserDataFromServer.*?\n}\n', skinbiee_js, re.DOTALL)
auth_listeners_match = re.search(r'// AUTH LISTENERS\nfunction setupAuthListeners.*?^\}', skinbiee_js, re.DOTALL | re.MULTILINE)

# Replace setupAuthListeners in script_js
new_js = re.sub(r'function setupAuthListeners\(\) \{.*?^\}', auth_listeners_match.group(0), script_js, flags=re.DOTALL|re.MULTILINE)

top_blocks = []
if api_base_match: top_blocks.append(api_base_match.group(0))
if safe_storage_match: top_blocks.append(safe_storage_match.group(0))
if persist_session_match: top_blocks.append(persist_session_match.group(0))
if restore_session_match: top_blocks.append(restore_session_match.group(0))
if auth_headers_match: top_blocks.append(auth_headers_match.group(0))
if refresh_match: top_blocks.append(refresh_match.group(0))

new_js = '\n\n'.join(top_blocks) + '\n\n' + new_js

# update init() to include session check
init_pattern = r'(function init\(\) \{.*?)(// Auth Flow Listeners)'
init_replacement = r'\1const hadSession = restoreSession();\n    \2'
new_js = re.sub(init_pattern, init_replacement, new_js, flags=re.DOTALL)

# update init() end to conditionally switch view
init_end_pattern = r'(setupSettings\(\);\n\})'
init_end_replacement = r'setupSettings();\n    if (hadSession) {\n        switchView("home");\n        refreshUserDataFromServer();\n    }\n}'
new_js = re.sub(init_end_pattern, init_end_replacement, new_js)

# append activeDates to state
new_js = new_js.replace("onboardingStep: 1", "onboardingStep: 1,\n    userId: null,\n    activeDates: new Set()")

with open('frontend/skinbiee.js', 'w', encoding='utf-8') as f:
    f.write(new_js)
print('Merged skinbiee.js created.')
