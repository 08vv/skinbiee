from .history_db import get_daily_logs
from datetime import datetime, timedelta

def calculate_streak_and_consistency(user_id):
    logs = get_daily_logs(user_id)
    if not logs:
        return 0, 0.0
        
    logs.sort(key=lambda x: x['date'], reverse=True)
    
    streak = 0
    today = datetime.now().date()
    
    current_check = today
    
    # simple consecutive day tracker
    for row in logs:
        # DB date format is usually YYYY-MM-DD
        try:
            row_date = datetime.strptime(row['date'], "%Y-%m-%d").date()
        except (ValueError, TypeError):
            continue
            
        if row_date == current_check or row_date == current_check - timedelta(days=1):
            if row['am_done'] == 1 or row['pm_done'] == 1:
                streak += 1
                current_check = row_date - timedelta(days=1)
            else:
                break
        elif row_date < current_check - timedelta(days=1):
            break
            
    # Completion Percentage
    total_days = len(logs)
    completed_events = sum(1 for r in logs if r['am_done'] == 1) + sum(1 for r in logs if r['pm_done'] == 1)
    total_possible_events = total_days * 2
    
    consistency = (completed_events / total_possible_events) * 100 if total_possible_events > 0 else 0.0
    
    return streak, round(consistency, 1)
