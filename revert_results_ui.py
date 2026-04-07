import re
import codecs

# 1. Update skinbiee.html (remove -sb and restore structure)
with open('frontend/skinbiee.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# I'll just remove the -sb suffix from IDs in the results sections
html_content = html_content.replace('id="skin-results-state-sb"', 'id="skin-results-state"')
html_content = html_content.replace('id="skin-result-img-sb"', 'id="skin-result-img"')
html_content = html_content.replace('id="skin-result-title-sb"', 'id="skin-result-title"')
html_content = html_content.replace('id="skin-result-badges-sb"', 'id="skin-result-badges"')
html_content = html_content.replace('id="skin-result-desc-sb"', 'id="skin-result-desc"')
html_content = html_content.replace('id="skin-concerns-list-sb"', 'id="skin-concerns-list"')
html_content = html_content.replace('id="btn-go-products-sb"', 'id="btn-go-products"')

html_content = html_content.replace('id="ing-results-state-sb"', 'id="ing-results-state"')
html_content = html_content.replace('id="prod-result-title-sb"', 'id="prod-result-title"')
html_content = html_content.replace('id="prod-score-badge-sb"', 'id="prod-score-badge"')
html_content = html_content.replace('id="prod-result-desc-sb"', 'id="prod-result-desc"')
html_content = html_content.replace('id="prod-ingredients-text-sb"', 'id="prod-ingredients-text"')

# Also revert some input state IDs if needed for consistency
html_content = html_content.replace('id="skin-input-state-sb"', 'id="skin-input-state"')
html_content = html_content.replace('id="ing-input-state-sb"', 'id="ing-input-state"')

with open('frontend/skinbiee.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

# 2. Update skinbiee.js (restore logic)
# I'll use the yesterday version's functions
yest_js = codecs.open('yesterday_skinbiee.js', 'r', 'utf-16le').read()

def extract_func(name, content):
    pattern = rf'function {name}[^{{]*\{{(?:[^{{}}]*|\{{(?:[^{{}}]*|\{{[^{{}}]*\}})*\}})*\}}'
    match = re.search(pattern, content, re.DOTALL)
    return match.group(0) if match else None

rsr = extract_func("renderSkinResultsSB", yest_js).replace("renderSkinResultsSB", "renderSkinResults")
spr = extract_func("showProductRecommendations", yest_js).replace("showProductRecommendations", "renderSkinProductRecommendations")
rpr = extract_func("renderProdResultsSB", yest_js).replace("renderProdResultsSB", "renderProdResults")

# In the reverted logic, remove the IDs with -sb since we just reverted the HTML
for id_name in ["skin-result-img", "skin-result-badges", "skin-concerns-list", "skin-result-desc", "skin-result-title", "btn-go-products"]:
    rsr = rsr.replace(f"'{id_name}-sb'", f"'{id_name}'").replace(f'"{id_name}-sb"', f'"{id_name}"')
    spr = spr.replace(f"'{id_name}-sb'", f"'{id_name}'").replace(f'"{id_name}-sb"', f'"{id_name}"')

with open('frontend/skinbiee.js', 'r', encoding='utf-8') as f:
    js_content = f.read()

# Replace existing functions in skinbiee.js
# Use rough regex to replace the functions
js_content = re.sub(r'function renderSkinResults\(.*?\)\s*\{.*?\}\n\nfunction renderSkinProductRecommendations\(.*?\)\s*\{.*?\}', 
                  rsr + "\n\n" + spr, js_content, flags=re.DOTALL)
js_content = re.sub(r'function renderProdResults\(.*?\)\s*\{.*?\}', 
                  rpr, js_content, flags=re.DOTALL)

with open('frontend/skinbiee.js', 'w', encoding='utf-8') as f:
    f.write(js_content)

# 3. Update skinbiee.css (remove messy cards)
# I'll just append the old styles if they are missing
with open('frontend/skinbiee.css', 'r', encoding='utf-8') as f:
    css_content = f.read()

# Remove the clustered card styles
css_content = re.sub(r'\.result-card\.verdict-card \{.*?\n\}', '', css_content, flags=re.DOTALL)
css_content = re.sub(r'\.fast-facts-card \{.*?\n\}', '', css_content, flags=re.DOTALL)
css_content = re.sub(r'\.good-card \{.*?\n\}', '', css_content, flags=re.DOTALL)
css_content = re.sub(r'\.bad-card \{.*?\n\}', '', css_content, flags=re.DOTALL)

with open('frontend/skinbiee.css', 'w', encoding='utf-8') as f:
    f.write(css_content)

print("Reverted results UI to yesterday's version.")
