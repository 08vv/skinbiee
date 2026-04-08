import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
MODEL_ID = "google/gemma-3-27b-it:free"

def call_gemini(prompt, system_instruction="You are an expert dermatological assistant."):
    """
    Calls OpenRouter chat completions using the configured model.
    Returns the text response.
    """
    if not OPENROUTER_API_KEY:
        print("[LLM Provider] OPENROUTER_API_KEY missing in .env")
        return None

    try:
        response = requests.post(
            url="https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
            },
            data=json.dumps({
                "model": MODEL_ID,
                "messages": [
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ]
            }),
            timeout=15
        )
        
        if response.status_code == 200:
            result = response.json()
            return result['choices'][0]['message']['content']
        else:
            print(f"[LLM Provider] Error: {response.status_code} - {response.text}")
            return None
            
    except Exception as e:
        print(f"[LLM Provider] Exception: {e}")
        return None

def analyze_ingredients_llm(ingredients_text, skin_condition):
    """
    Specifically analyzes skin ingredients for a given condition.
    Returns structured JSON if possible, or a well-formatted string.
    """
    prompt = f"""
    Analyze these skincare ingredients for someone with {skin_condition} skin:
    Ingredients: {ingredients_text}
    
    Please provide:
    1. A safety score (0-10).
    2. Key good ingredients found (if any).
    3. Potential irritants or ingredients to avoid for {skin_condition} skin.
    4. A final recommendation (Good Fit, Acceptable, or Not Recommended).
    
    Format your response as a JSON object with keys: "score", "good_ingredients", "bad_ingredients", "recommendation".
    "good_ingredients" and "bad_ingredients" should be lists of ingredient names.
    "recommendation" should be a 1-2 sentence summary.
    """
    
    res = call_gemini(prompt, system_instruction="You are a professional cosmetic chemist and dermatologist assistant.")
    if not res:
        return None
        
    # Attempt to parse JSON from the response (sometimes LLM wraps it in markdown)
    try:
        clean_res = res.strip()
        if "```json" in clean_res:
            clean_res = clean_res.split("```json")[1].split("```")[0].strip()
        elif "```" in clean_res:
            clean_res = clean_res.split("```")[1].split("```")[0].strip()
            
        return json.loads(clean_res)
    except:
        # Fallback if parsing fails
        return {
            "score": 5.0,
            "good_ingredients": [],
            "bad_ingredients": [],
            "recommendation": res[:200] + "..."
        }
