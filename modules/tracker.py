from .history_db import get_daily_logs
import pandas as pd

def calculate_streak_and_consistency(user_id):
    df = get_daily_logs(user_id)
    if df.empty:
        return 0, 0.0
        
    df['date'] = pd.to_datetime(df['date'])
    df = df.sort_values(by='date', ascending=False)
    
    streak = 0
    today = pd.Timestamp.now().normalize()
    
    current_check = today
    
    # simple consecutive day tracker
    for _, row in df.iterrows():
        row_date = row['date'].normalize()
        if row_date == current_check or row_date == current_check - pd.Timedelta(days=1):
            if row['am_done'] == 1 or row['pm_done'] == 1:
                streak += 1
                current_check = row_date - pd.Timedelta(days=1)
            else:
                break
        elif row_date < current_check - pd.Timedelta(days=1):
            break
            
    # Completion Percentage
    total_days = len(df)
    completed_events = df['am_done'].sum() + df['pm_done'].sum()
    total_possible_events = total_days * 2
    
    consistency = (completed_events / total_possible_events) * 100 if total_possible_events > 0 else 0.0
    
    return streak, round(consistency, 1)
