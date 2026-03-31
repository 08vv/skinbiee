import json

def generate_routine(condition, time_available, sensitive, daily_spf):
    """
    Generates a generic routine structure based on inputs.
    """
    am_steps = []
    pm_steps = []
    
    # AM Base
    am_steps.append({"step_name": "Cleanser", "desc": "Gentle morning cleanse. Use water or a light cleanser."})
    
    if time_available != "< 5 min":
        if condition in ["acne", "oily_skin"]:
            am_steps.append({"step_name": "Treatment/Toner", "desc": "Niacinamide or BHA to control sebum."})
        elif condition == "dark_spots":
            am_steps.append({"step_name": "Treatment", "desc": "Vitamin C serum for brightening."})
        elif condition == "dry_skin":
            am_steps.append({"step_name": "Hydration", "desc": "Hyaluronic Acid serum on damp skin."})
            
    am_steps.append({"step_name": "Moisturizer", "desc": "Light daily moisturizer to seal in hydration."})
    
    if not daily_spf:
        am_steps.append({"step_name": "Sunscreen (SPF 30+)", "desc": "CRITICAL: Protects against UV damage and dark spots."})
    else:
        am_steps.append({"step_name": "Sunscreen (SPF 30+)", "desc": "Your usual daily SPF minimum 30."})

    # PM Base
    if daily_spf or time_available in ["5-10 min", "10+ min"]:
        pm_steps.append({"step_name": "Oil Cleanser / Micellar Water", "desc": "First cleanse to break down SPF and makeup."})
        
    pm_steps.append({"step_name": "Water-based Cleanser", "desc": "Second cleanse to actually clean pores."})
    
    if time_available != "< 5 min":
        if condition == "acne" and not sensitive:
            pm_steps.append({"step_name": "Exfoliant", "desc": "Salicylic acid treatment (2-3x a week)."})
        elif condition == "dry_skin":
            pm_steps.append({"step_name": "Hydration", "desc": "Layer hydrating serums or essences."})
            
    if condition == "dark_spots" and not sensitive:
        pm_steps.append({"step_name": "Renewal", "desc": "Retinol or AHA (start 2x a week slowly)."})
        
    pm_steps.append({"step_name": "Moisturizer", "desc": "Nourishing night cream to repair barrier overnight."})
    
    return {
        "am_steps": am_steps,
        "pm_steps": pm_steps
    }
