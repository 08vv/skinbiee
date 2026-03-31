import pandas as pd
import os
from .recommendations import get_recommendations_for_condition

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'products.csv')

def load_products_db():
    if not os.path.exists(DB_PATH):
        return pd.DataFrame()
    return pd.read_csv(DB_PATH)

def get_all_products():
    """Returns a list of dicts for available products."""
    df = load_products_db()
    return df.to_dict('records')

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
    df = load_products_db()
    if df.empty or product_id not in df['product_id'].values:
        return None
        
    product = df[df['product_id'] == product_id].iloc[0]
    base_score, good, bad = score_ingredients(product['ingredients'], condition)
    
    # Bonus if tagged for detected condition
    if pd.notna(product['target_condition']) and condition in product['target_condition']:
        base_score += 5
        
    # Normalize
    final_score = max(0, min(100, 50 + base_score)) 
    
    recommendation = "Acceptable"
    if final_score >= 70:
        recommendation = "Good Fit"
    elif final_score < 40:
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
    final_score = max(0, min(100, 50 + base_score))
    
    recommendation = "Acceptable"
    if final_score >= 70:
        recommendation = "Good Fit"
    elif final_score < 40:
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
