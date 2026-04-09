import csv
import os
from .recommendations import get_recommendations_for_condition

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'products.csv')

def load_products_db():
    if not os.path.exists(DB_PATH):
        return []
    with open(DB_PATH, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return [row for row in reader]

def get_all_products():
    """Returns a list of dicts for available products."""
    return load_products_db()

def score_ingredients(ingredient_list: str, condition: str):
    """
    Score a list of ingredients against a specific skin condition.
    Returns: score (0-100), good_found, bad_found (lists of dicts)
    """
    recs = get_recommendations_for_condition(condition)
    
    ingredients = [i.strip().lower() for i in ingredient_list.split(',')]
    
    score = 0
    good_found = []
    bad_found = []
    
    for ing in ingredients:
        # Check good
        for good_item in recs['recommended']:
            if good_item['name'].lower() in ing:
                score += 10
                if good_item not in good_found:
                    good_found.append(good_item)
                    
        # Check bad
        for bad_item in recs['avoid']:
            bad_name = bad_item['name'].lower()
            if "(" in bad_name:
                bad_name = bad_name.split('(')[1].replace(')', '').strip()
            
            if bad_name in ing or ing in bad_name:
                score -= 5
                if bad_item not in bad_found:
                    bad_found.append(bad_item)
                    
    return score, good_found, bad_found

def analyze_product(product_id: int, condition: str):
    """Analyzes a known product from DB by ID."""
    products = load_products_db()
    product = next((p for p in products if int(p.get('product_id', 0)) == int(product_id)), None)
    if not product:
        return None
        
    base_score, good, bad = score_ingredients(product.get('ingredients', ''), condition)
    
    # Bonus if tagged for detected condition
    target_condition = product.get('target_condition', '')
    if target_condition and condition in target_condition:
        base_score += 5
        
    # Normalize
    final_score = max(0, min(10.0, 5.0 + (base_score / 10.0))) 
    
    recommendation = "Use With Caution"
    if final_score >= 7.0:
        recommendation = "Good Match"
    elif final_score < 4.0:
        recommendation = "Not Recommended"
        
    return {
        "product_name": product['product_name'],
        "brand": product['brand'],
        "score": final_score,
        "good_ingredients": good,
        "bad_ingredients": bad,
        "recommendation": recommendation
    }

def analyze_custom_ingredients(ingredient_list: str, condition: str):
    """Analyzes a custom pasted string of ingredients."""
    base_score, good, bad = score_ingredients(ingredient_list, condition)
    final_score = max(0, min(10.0, 5.0 + (base_score / 10.0)))
    
    recommendation = "Use With Caution"
    if final_score >= 7.0:
        recommendation = "Good Match"
    elif final_score < 4.0:
        recommendation = "Not Recommended"
        
    return {
        "score": final_score,
        "good_ingredients": good,
        "bad_ingredients": bad,
        "recommendation": recommendation
    }

def compare_products(prod1_id: int, prod2_id: int, condition: str):
    res1 = analyze_product(prod1_id, condition)
    res2 = analyze_product(prod2_id, condition)
    
    if not res1 or not res2: return None
    
    if res1['score'] > res2['score']:
        winner = res1['product_name']
        reasoning = f"{winner} is a better fit because it scores higher ({res1['score']} vs {res2['score']})."
    elif res2['score'] > res1['score']:
        winner = res2['product_name']
        reasoning = f"{winner} is a better fit because it scores higher ({res2['score']} vs {res1['score']})."
    else:
        winner = "Tie"
        reasoning = "Both products scored equally well for your skin condition."
        
    return {
        "product_1": res1,
        "product_2": res2,
        "winner": winner,
        "reasoning": reasoning
    }
