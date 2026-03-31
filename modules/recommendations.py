import json
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'ingredient_db.json')

def load_ingredient_db():
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)

def get_recommendations_for_condition(condition: str):
    """
    Returns the recommended and avoid lists for a specific condition.
    `condition` must be one of: 'acne', 'dry_skin', 'oily_skin', 'dark_spots', 'normal_skin'
    """
    db = load_ingredient_db()
    
    if condition not in db:
        return {"recommended": [], "avoid": []}
        
    return db[condition]

def get_all_conditions():
    """Returns a list of all valid skin conditions."""
    db = load_ingredient_db()
    return list(db.keys())
