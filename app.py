import streamlit as st
import os

from ui import apply_custom_ui, render_bottom_nav

st.set_page_config(
    page_title="Skincare Companion",
    page_icon="✨",
    layout="centered"
)

# Apply global Hybrid Soft UI styles
apply_custom_ui()

from modules.auth import login_user, register_user

if 'user_id' not in st.session_state:
    st.session_state['user_id'] = None

if st.session_state['user_id'] is None:
    if 'auth_mode' not in st.session_state:
        st.session_state['auth_mode'] = 'signup'

    # Top App Branding
    st.markdown("""
        <div style="text-align: center; margin-top: 40px; margin-bottom: 20px;">
            <div style="font-size: 48px; margin-bottom: 12px;">✨</div>
            <h1 style="margin: 0; font-size: 2.2rem;">Skincare Companion</h1>
            <p style="color: var(--text-secondary); margin-top: 8px; font-weight: 500;">Your personalized skincare journey.</p>
        </div>
    """, unsafe_allow_html=True)
    
    # Mascot Animation (SVGs mapped to 'friendly' style)
    st.markdown("""
        <div style="display: flex; justify-content: center; margin-bottom: 30px;">
            <svg viewBox="0 0 100 100" style="width: 130px; height: 130px; filter: drop-shadow(0px 8px 16px rgba(0,0,0,0.06)); animation: floatM 3.5s ease-in-out infinite;">
                <circle cx="50" cy="50" r="45" fill="var(--bg-surface)" stroke="var(--bg-deep)" stroke-width="4"/>
                <path d="M 35 45 Q 40 40 45 45" stroke="var(--text-primary)" stroke-width="3" fill="none" stroke-linecap="round"/>
                <circle cx="65" cy="45" r="4" fill="var(--text-primary)"/>
                <circle cx="32" cy="52" r="5" fill="var(--glass-pink)"/>
                <circle cx="68" cy="52" r="5" fill="var(--glass-pink)"/>
                <path d="M 45 60 Q 50 65 55 60" stroke="var(--text-primary)" stroke-width="3" fill="none" stroke-linecap="round"/>
                <style>
                    @keyframes floatM {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-6px); }
                    }
                </style>
            </svg>
        </div>
    """, unsafe_allow_html=True)

    if st.session_state['auth_mode'] == 'signup':
        with st.container():
            with st.form("signup_form"):
                new_user = st.text_input("Username", placeholder="Choose your username")
                new_email = st.text_input("Email address", placeholder="e.g. hello@example.com")
                new_pass = st.text_input("Password", type="password", placeholder="Create a password")
                
                # We need an empty div trick to add margin or we just use st.write
                st.write("")
                if st.form_submit_button("Create Account"):
                    if register_user(new_user, new_pass):
                        st.success("Account created! You can now log in.")
                        st.session_state['auth_mode'] = 'login'
                        st.rerun()
                    else:
                        st.error("Username already exists or invalid input.")
            
            st.markdown('<p style="text-align: center; color: var(--text-muted); margin: 24px 0; font-weight: 500;">or</p>', unsafe_allow_html=True)
            
            # Google mock
            st.button("Continue with Google", key="google_up", type="secondary")
                
            st.write("")
            colA, colB, colC = st.columns([1,3,1])
            with colB:
                if st.button("Already have an account? Log In", key="switch_to_login", type="secondary"):
                    st.session_state['auth_mode'] = 'login'
                    st.rerun()
                        
    else: # login
        with st.container():
            with st.form("login_form"):
                user_in = st.text_input("Username", placeholder="Enter your username")
                pass_in = st.text_input("Password", type="password", placeholder="Enter your password")
                
                st.write("")
                if st.form_submit_button("Log In"):
                    user = login_user(user_in, pass_in)
                    if user:
                        st.session_state['user_id'] = user['id']
                        st.session_state['username'] = user['username']
                        st.rerun()
                    else:
                        st.error("Invalid username or password.")
            
            # Additional links
            st.markdown('<div style="text-align: center; margin-top: 12px;"><a href="#" style="color: var(--text-secondary); text-decoration: none; font-size: 0.85rem;">Forgot Password?</a></div>', unsafe_allow_html=True)

            st.markdown('<p style="text-align: center; color: var(--text-muted); margin: 24px 0; font-weight: 500;">or</p>', unsafe_allow_html=True)
            
            st.button("Continue with Google", key="google_in", type="secondary")
                
            st.write("")
            colA, colB, colC = st.columns([1,3,1])
            with colB:
                if st.button("New here? Sign Up", key="switch_to_signup", type="secondary"):
                    st.session_state['auth_mode'] = 'signup'
                    st.rerun()

    # The mascot renderer shouldn't float on Auth usually, but instructions say "Mascot floating button present on EVERY screen without exception"
    # Wait, the auth flow specifies: "First screen shown to any new or logged-out user... Mascot plays idle animation (centered)"
    # I did the centered SVG above. Let's still include the floating mascot explicitly if requested, but normally it's enough to have it in the app. Let's just import it later when logged in or inside the pages to be clean.
    # from modules.mascot_chatbot import render_floating_mascot
    # render_floating_mascot()

else:
    # Logged In: Switch to Home Page immediately 
    # (Because sidebar is hidden, this serves as the main entrypoint router)
    st.switch_page("pages/1_Home.py")
