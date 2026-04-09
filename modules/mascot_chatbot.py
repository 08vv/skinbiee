import streamlit as st
import streamlit.components.v1 as components
import json
import os
import random
from modules.history_db import get_all_scans
from modules.tracker import calculate_streak_and_consistency
from modules.llm_provider import call_gemini


def init_mascot_memory():
    if "user_id" in st.session_state and st.session_state["user_id"] is not None:
        user_id = st.session_state["user_id"]
        scans = get_all_scans(user_id)
        if scans:
            last_scan = scans[0]
            condition = last_scan.get('condition', 'Unknown')
            severity = last_scan.get('severity', 'Unknown')
        else:
            condition = "Unknown"
            severity = "Unknown"

        streak, consistency = calculate_streak_and_consistency(user_id)
    else:
        condition = "Unknown"
        severity = "Unknown"
        streak = 0

    st.session_state["mascot_memory"] = {
        "user_name": st.session_state.get("username", "Friend"),
        "detected_condition": condition,
        "skin_severity": severity,
        "streak_count": streak,
    }

    if "chat_history" not in st.session_state:
        st.session_state["chat_history"] = []


def generate_response(user_input):
    memory = st.session_state.get("mascot_memory", {})
    name = memory.get("user_name", "Friend")
    condition = memory.get("detected_condition", "unknown skin type")
    streak = str(memory.get("streak_count", 0))
    current_tab = st.session_state.get("current_tab", "Home")

    chat_data_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'chat_data.json')
    with open(chat_data_path, "r", encoding="utf-8") as f:
        chat_data = json.load(f)

    user_input_lower = user_input.lower().strip()
    matched_response = None

    for intent, data in chat_data.items():
        if intent == "fallback":
            continue
        for keyword in data["keywords"]:
            if keyword in user_input_lower:
                matched_response = random.choice(data["responses"])
                break
        if matched_response:
            break

    if not matched_response:
        if current_tab == "Analyzer":
            matched_response = "Want me to explain your scan result? Just ask! 🔍"
        elif current_tab == "Planner":
            matched_response = "Check your planner to log today's routine! 📅"
        else:
            matched_response = random.choice(chat_data["fallback"]["responses"])

    prompt = f"""
    The user '{name}' (skin condition: {condition}, streak: {streak}) is asking: '{user_input}'.
    The current app tab is '{current_tab}'.
    
    Respond as 'GlowBot', a friendly, cute, and professional skincare mascot. 
    Keep it short (max 2 sentences), supportive, and use 1-2 emojis. 
    If they ask about skincare, give expert advice. If they just say hi, be welcoming.
    """
    
    llm_response = call_gemini(prompt, system_instruction="You are GlowBot, a friendly skincare expert mascot.")
    
    if llm_response:
        matched_response = llm_response
    else:
        # Fallback to rule-based if LLM fails
        matched_response = matched_response.replace("{name}", name)
        matched_response = matched_response.replace("{condition}", condition)
        matched_response = matched_response.replace("{streak}", streak)

    st.session_state["chat_history"].append({
        "role": "assistant", "content": matched_response
    })
    return matched_response


def render_floating_mascot():
    init_mascot_memory()
    memory = st.session_state.get("mascot_memory", {})
    name = memory.get("user_name", "Friend")
    condition = memory.get("detected_condition", "unknown")
    streak = str(memory.get("streak_count", 0))
    current_tab = st.session_state.get("current_tab", "Home")

    # Build chat history HTML
    history_html = ""
    for msg in st.session_state.get("chat_history", []):
        if msg["role"] == "user":
            history_html += f'<div class="msg-user">{msg["content"]}</div>'
        else:
            history_html += f'<div class="msg-bot">{msg["content"]}</div>'

    # --- Step 1: No longer moving the iframe to avoid React crash, styling the iframe directly ---
    st.markdown("""
    <style>
    /* Keep iframe visually transparent (and interactive only where enabled). */
    iframe[title="st.iframe"] {
        background: transparent !important;
        pointer-events: auto;
    }
    </style>
    """, unsafe_allow_html=True)

    # --- Step 2: The actual HTML component with JS (inside iframe) ---
    html = f"""
    <style>
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,600&family=Space+Grotesk:wght@400;500;700&display=swap');
      
      :root {{
        --bg-base: #EEF0F5;
        --bg-surface: #F2F4F8;
        --bg-deep: #E6E9F0;
        --accent-primary: #B8A9E8;
        --accent-warm: #F4A8B5;
        --text-primary: #3D3D5C;
        --text-secondary: #8A8FAD;
        --glass-white: rgba(255, 255, 255, 0.35);
        --glass-lavender: rgba(200, 185, 255, 0.22);
      }}

      html, body {{
        margin: 0; padding: 0;
        background: transparent !important;
        overflow: hidden;
        width: 100%; height: 100%;
        font-family: 'DM Sans', sans-serif;
      }}
      #mobile-aligner {{
        position: fixed;
        bottom: 0; right: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }}
      #mascot-btn {{
        position: absolute;
        bottom: 120px;
        right: 20px;
        width: 80px;
        height: 80px;
        background: transparent;
        border: none;
        cursor: pointer;
        z-index: 99999;
        pointer-events: auto;
        transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      }}
      #mascot-btn:hover {{ transform: scale(1.08) translateY(-4px); }}
      #mascot-svg {{
        width: 100%; height: 100%;
        filter: drop-shadow(0 12px 20px rgba(184, 169, 232, 0.4));
        animation: floatAnim 4s ease-in-out infinite;
      }}
      @keyframes floatAnim {{
        0%, 100% {{ transform: translateY(0px); }}
        50% {{ transform: translateY(-8px); }}
      }}

      #chat-panel {{
        position: absolute;
        bottom: 110px;
        right: 20px;
        width: 340px;
        max-width: 90vw;
        height: 50vh;
        min-height: 400px;
        background: rgba(255, 255, 255, 0.45);
        backdrop-filter: blur(24px) saturate(140%);
        -webkit-backdrop-filter: blur(24px) saturate(140%);
        border: 1px solid rgba(255, 255, 255, 0.6);
        border-radius: 24px;
        box-shadow: 0 16px 40px rgba(140, 140, 200, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.7);
        display: none;
        flex-direction: column;
        z-index: 99998;
        overflow: hidden;
        pointer-events: auto;
        transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
      }}
      
      #chat-panel.fullscreen {{
        width: 100vw;
        max-width: 480px;
        height: 100vh;
        bottom: 0;
        right: 50%;
        transform: translateX(50%);
        border-radius: 0;
      }}

      #chat-header {{
        background: transparent;
        border-bottom: 1px solid rgba(255,255,255,0.4);
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-family: 'Fraunces', serif;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary);
      }}
      .hdr-btn {{ background: rgba(255,255,255,0.5); border: none; color: var(--text-primary); font-size: 14px; cursor: pointer; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }}
      .hdr-btn:hover {{ background: rgba(255,255,255,0.8); }}
      
      #chat-messages {{
        padding: 20px;
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }}
      
      /* Webkit scrollbar for chat */
      #chat-messages::-webkit-scrollbar {{ width: 6px; }}
      #chat-messages::-webkit-scrollbar-thumb {{ background: rgba(184, 169, 232, 0.5); border-radius: 10px; }}
      
      .msg-bot {{ background: rgba(255, 255, 255, 0.7); border: 1px solid rgba(255,255,255,0.8); border-radius: 18px 18px 18px 6px; padding: 12px 16px; font-size: 0.95rem; max-width: 85%; align-self: flex-start; color: var(--text-primary); box-shadow: 3px 3px 8px rgba(140,140,200,0.1); }}
      .msg-user {{ background: var(--glass-lavender); color: var(--text-primary); border: 1px solid rgba(220, 210, 255, 0.45); border-radius: 18px 18px 6px 18px; padding: 12px 16px; font-size: 0.95rem; max-width: 85%; align-self: flex-end; box-shadow: 3px 3px 8px rgba(140,140,200,0.1); }}
      
      #chat-input-row {{ display: flex; padding: 16px 20px; gap: 12px; background: rgba(255,255,255,0.3); border-top: 1px solid rgba(255,255,255,0.4); }}
      #chat-input {{ flex: 1; border: none; border-radius: 24px; padding: 12px 20px; font-size: 0.95rem; font-family: 'DM Sans', sans-serif; outline: none; background: var(--bg-surface); color: var(--text-primary); box-shadow: inset 4px 4px 10px rgba(140,140,200,0.15), inset -4px -4px 10px #FFFFFF; }}
      #chat-input:focus {{ box-shadow: inset 4px 4px 10px rgba(140,140,200,0.15), inset -4px -4px 10px #FFFFFF, inset 0 0 0 2px rgba(184, 169, 232, 0.5); }}
      #send-btn {{ background: linear-gradient(135deg, var(--accent-warm), var(--accent-primary)); color: white; border: none; border-radius: 50%; width: 44px; height: 44px; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; box-shadow: 4px 4px 12px rgba(184,169,232,0.4); transition: transform 0.2s; }}
      #send-btn:hover {{ transform: scale(1.05); }}
      #send-btn:active {{ transform: scale(0.95); }}
    </style>

    <div id="mobile-aligner">
      <button id="mascot-btn" onclick="toggleChat()">
        <!-- Hybrid Soft UI Mascot Avatar SVG -->
        <svg viewBox="0 0 100 100" id="mascot-svg">
            <circle cx="50" cy="50" r="45" fill="var(--bg-surface)" stroke="var(--bg-deep)" stroke-width="4"/>
            <path d="M 35 45 Q 40 40 45 45" stroke="var(--text-primary)" stroke-width="3" fill="none" stroke-linecap="round"/>
            <circle cx="65" cy="45" r="4" fill="var(--text-primary)"/>
            <circle cx="32" cy="52" r="5" fill="var(--glass-pink)"/>
            <circle cx="68" cy="52" r="5" fill="var(--glass-pink)"/>
            <path id="mouth" d="M 45 60 Q 50 65 55 60" stroke="var(--text-primary)" stroke-width="3" fill="none" stroke-linecap="round"/>
        </svg>
      </button>

      <div id="chat-panel">
        <div id="chat-header">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">✨</span> GlowBot
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="hdr-btn" onclick="toggleFullscreen()">⛶</button>
            <button class="hdr-btn" onclick="closeChat()">✕</button>
          </div>
        </div>
        <div id="chat-messages">
          {history_html if history_html else f'<div class="msg-bot">Hey {name}! Have questions about your {condition}? Ask away! ✨</div>'}
        </div>
        <div id="chat-input-row">
          <input id="chat-input" placeholder="Message GlowBot..."
            onkeydown="if(event.key==='Enter') sendMessage()"/>
          <button id="send-btn" onclick="sendMessage()">⬆</button>
        </div>
      </div>
    </div>

    <script>
      var condition = "{condition}";
      var name = "{name}";
      var streak = "{streak}";
      var currentTab = "{current_tab}";
      var isOpen = false;
      var isFullscreen = false;

      window.onload = function() {{
        var btn = document.getElementById('mascot-btn');
        var mouth = document.getElementById('mouth');
        
        // Emotion logic mapped to new SVG
        if (currentTab === "Home") {{
            mouth.setAttribute('d', 'M 45 60 Q 50 68 55 60'); // Big smile
        }} else if (currentTab === "Analyzer") {{
            mouth.setAttribute('d', 'M 47 62 Q 50 60 53 62'); // Thinking
        }} else if (currentTab === "Planner") {{
            mouth.setAttribute('d', 'M 45 60 Q 50 65 55 60'); // Happy
        }} else {{
            mouth.setAttribute('d', 'M 45 60 Q 50 65 55 60'); // Default
        }}
        
        // Setup iframe styling directly without moving it to avoid React crash
        try {{
          if (window.frameElement) {{
              var f = window.frameElement;
              f.style.position = 'fixed';
              f.style.top = 'auto';
              f.style.left = 'auto';
              f.style.bottom = '0';
              f.style.right = '0';
              f.style.width = '480px';
              f.style.height = '600px';
              f.style.zIndex = '99999';
              f.style.border = 'none';
              f.style.background = 'transparent';
              f.style.pointerEvents = 'auto';
              
              var parent = f.parentElement;
              if (parent) {{
                  parent.style.position = 'static';
              }}
          }}
        }} catch(e) {{}}
      }};

      function toggleChat() {{
        isOpen = !isOpen;
        var panel = document.getElementById('chat-panel');
        panel.style.display = isOpen ? 'flex' : 'none';
        if (isOpen) scrollToBottom();
      }}

      function toggleFullscreen() {{
        isFullscreen = !isFullscreen;
        var panel = document.getElementById('chat-panel');
        var btn = document.getElementById('mascot-btn');
        if (isFullscreen) {{
            panel.classList.add('fullscreen');
            btn.style.display = 'none';
        }} else {{
            panel.classList.remove('fullscreen');
            btn.style.display = 'block';
        }}
        scrollToBottom();
      }}

      function closeChat() {{
        isOpen = false;
        isFullscreen = false;
        var panel = document.getElementById('chat-panel');
        panel.style.display = 'none';
        panel.classList.remove('fullscreen');
        document.getElementById('mascot-btn').style.display = 'block';
      }}

      function scrollToBottom() {{
        var msgs = document.getElementById('chat-messages');
        msgs.scrollTop = msgs.scrollHeight;
      }}

      function getReply(msg) {{
        msg = msg.toLowerCase().trim();
        if (msg.includes('routine')) return 'Cleanse, treat, hydrate! Consistency is your best friend. ✨';
        if (msg.includes('hi') || msg.includes('hello')) return 'Hi ' + name + '! Ready to glow? ✨';
        return "I'm your Skincare Companion! Ask me about your routine, ingredients, or progress. 🌱";
      }}

      function sendMessage() {{
        var input = document.getElementById('chat-input');
        var text = input.value.trim();
        if (!text) return;
        var msgs = document.getElementById('chat-messages');
        msgs.innerHTML += '<div class="msg-user">' + text + '</div>';
        msgs.innerHTML += '<div class="msg-bot">' + getReply(text) + '</div>';
        input.value = '';
        scrollToBottom();
      }}
    </script>
    """
    # Give the iframe enough height to mount; JS constrains it bottom-right.
    components.html(html, height=600)
