import sys

def convert_and_extract(filename, outfile):
    try:
        # Try both UTF-16LE and UTF-8-sig etc just in case
        try:
            with open(filename, 'r', encoding='utf-16le') as f:
                content = f.read()
        except:
            with open(filename, 'r', encoding='utf-16') as f:
                content = f.read()
        
        # Search for key functions and extract blocks
        def extract(name, length=3000):
            idx = content.find(name)
            if idx != -1:
                return content[idx:idx+length]
            return ""

        skin = extract('function renderSkinResults')
        prod = extract('function renderProdResults')
        recs = extract('function renderSkinProductRecommendations')
        ids  = extract('function setupAnalyzer')

        with open(outfile, 'w', encoding='utf-8') as f:
            f.write(f"\n--- EXTRACTED FROM {filename} ---\n\n")
            f.write(skin + "\n\n" + prod + "\n\n" + recs + "\n\n" + ids)
            
    except Exception as e:
        print(f"Error: {e}")

convert_and_extract(r'd:\sk\skincare\yesterday_skinbiee.js', r'd:\sk\skincare\old_funcs.txt')
