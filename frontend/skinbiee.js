const API_BASE_URL = ""; // Use relative paths for robustness

/* --- Safe LocalStorage Utility --- */
const safeStorage = {
  get: (key) => { try { return localStorage.getItem(key); } catch(e) { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, val); } catch(e) {} },
  remove: (key) => { try { localStorage.removeItem(key); } catch(e) {} },
  clear: () => { try { localStorage.clear(); } catch(e) {} }
};

const state = {
    view: 'auth',
    theme: 'light',
    username: '',
    userId: null,
    streak: 0,
    onboardingStep: 1,
    activeDates: new Set()
};

let plannerState = {
    plannerOnboardingDone: false,
    morningRoutine: [],
    nightRoutine: [],
    streak: 0,
    scans: [],
    obStep: 0,
    obAnswers: {}
};

function userStorageKey(base) {
    const uid = state.userId != null ? String(state.userId) : 'anon';
    return `${base}-u${uid}`;
}

function persistSession(userId, username, token) {
    console.log("[SESSION] Saving session for:", username);
    state.userId = userId;
    state.username = username;
    safeStorage.set('sc-user-id', String(userId));
    safeStorage.set('sc-username', username);
    if (token) safeStorage.set('sc-token', token);
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = username;
}

function restoreSession() {
    const raw = safeStorage.get('sc-user-id');
    const uid = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(uid) || uid < 1) return false;
    state.userId = uid;
    state.username = safeStorage.get('sc-username') || '';
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = state.username;
    return true;
}

function authHeadersRaw() {
    return { "Authorization": `Bearer ${safeStorage.get('sc-token')}` };
}

async function refreshUserDataFromServer() {
    if (state.userId == null) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/user/data`, { headers: authHeadersRaw() });
        const data = await res.json();
        if (data.status === 'success') {
            state.activeDates = new Set(data.active_dates || []);
            state.streak = data.streak || 0;
        }
    } catch (e) {
        console.error('[SERVER] Refresh failed', e);
    }
}

// ROUTING
function switchView(viewName) {
    console.log(`[ROUTER] Switching to: ${viewName.toUpperCase()}`);
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.sub-page-overlay').forEach(el => el.style.display = 'none');

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.add('active');
        state.view = viewName;
    }

    const topBar = document.getElementById('top-bar');
    const bottomNav = document.getElementById('bottom-nav');
    const floatMascot = document.getElementById('float-mascot-btn');

    if (viewName === 'auth' || viewName === 'onboarding') {
        if (topBar) topBar.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (floatMascot) floatMascot.style.display = 'none';
        if (viewName === 'onboarding') resetOnboarding();
    } else {
        if (topBar) topBar.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'flex';
        if (floatMascot) floatMascot.style.display = 'block';
    }

    const debug = document.getElementById('debug-view-status');
    if (debug) debug.textContent = `VIEW: ${viewName.toUpperCase()}`;
}

// AUTH LISTENERS
function setupAuthListeners() {
    const authForm = document.getElementById('auth-form');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchLink = document.getElementById('auth-switch-link');
    let isSignup = true;

    if (switchLink) {
        switchLink.onclick = (e) => {
            e.preventDefault();
            isSignup = !isSignup;
            const emailGroup = document.querySelector('.signup-only');
            if (emailGroup) emailGroup.style.display = isSignup ? 'block' : 'none';
            submitBtn.textContent = isSignup ? 'Create Account' : 'Log In';
            switchLink.textContent = isSignup ? 'Log In' : 'Sign Up';
        };
    }

    if (authForm) {
        authForm.onsubmit = async (e) => {
            e.preventDefault();
            const unameInput = document.getElementById('auth-username');
            const passInput = document.getElementById('auth-password');
            if (!unameInput || !passInput) return;

            const uname = unameInput.value.trim();
            const password = passInput.value;
            const endpoint = isSignup ? 'register' : 'login';

            showLoading(isSignup ? 'Joining Skinbiee...' : 'Welcome Back...');
            try {
                const res = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: uname, password })
                });
                const data = await res.json();
                hideLoading();
                if (!res.ok) { showToast(data.error || 'Auth Error'); return; }

                persistSession(data.user_id, data.username, data.token);
                switchView(isSignup ? 'onboarding' : 'home');
                refreshUserDataFromServer();
            } catch (err) {
                hideLoading();
                showToast('Server connection error 🌿');
            }
        };
    }

    // Eye toggle
    const eyeToggle = document.querySelector('.eye-toggle');
    if (eyeToggle) {
        eyeToggle.onclick = () => {
            const input = document.getElementById('auth-password');
            const icon = eyeToggle.querySelector('i');
            if (input && icon) {
                input.type = input.type === 'password' ? 'text' : 'password';
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }
        };
    }
}

// ONBOARDING
function setupOnboardingListeners() {
    const nextBtn = document.getElementById('ob-next-btn');
    if (!nextBtn) return;
    nextBtn.onclick = () => {
        if (state.onboardingStep < 4) {
            const current = document.getElementById(`ob-step-${state.onboardingStep}`);
            if (current) current.classList.remove('active');
            state.onboardingStep++;
            const next = document.getElementById(`ob-step-${state.onboardingStep}`);
            if (next) next.classList.add('active');
            const num = document.getElementById('ob-step-num');
            if (num) num.textContent = state.onboardingStep;
        } else {
            switchView('home');
        }
    };
}
function resetOnboarding() {
    state.onboardingStep = 1;
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    const step1 = document.getElementById('ob-step-1');
    if (step1) step1.classList.add('active');
}

// GLOBAL UI
function initGlobalInteractivity() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill, .swatch, .option-pill');
        if (!btn || btn.closest('.view-onboarding')) return;

        const group = btn.closest('.pill-group, .color-swatches');
        if (!group) return;

        if (group.classList.contains('multi-select')) {
            btn.classList.toggle('active');
        } else {
            group.querySelectorAll('.pill, .swatch, .option-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
        }
    });
}

function showLoading(msg) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        const txt = document.getElementById('loading-text');
        if (txt) txt.textContent = msg;
    }
}
function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}
function showToast(msg) {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// SETTINGS
function setupSettings() {
    document.querySelectorAll('.set-item[data-page-id]').forEach(item => {
        item.onclick = () => {
            const overlay = document.getElementById(`settings-${item.dataset.pageId}`);
            if (overlay) overlay.style.display = 'flex';
        };
    });
}
function closeSettingsSubPage(id) {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.style.display = 'none';
}

// INITIALIZATION
function init() {
    console.log("DEBUG: Skinbiee Initialized! ✨");
    const hadSession = restoreSession();
    setupAuthListeners();
    setupOnboardingListeners();
    setupSettings();
    initGlobalInteractivity();
    
    if (hadSession) {
        switchView('home');
        refreshUserDataFromServer();
    }

    // Floating Mascot
    const floatBtn = document.getElementById('float-mascot-btn');
    if (floatBtn) {
        floatBtn.onclick = () => {
            const chat = document.getElementById('chat-panel');
            if (chat) chat.classList.add('open');
        };
    }

    // Debug View Overlay
    if (!document.getElementById('debug-view-status')) {
        const div = document.createElement('div');
        div.id = 'debug-view-status';
        div.style = "position:fixed; bottom:10px; right:10px; background:rgba(0,0,0,0.5); color:white; padding:3px 8px; border-radius:10px; font-size:9px; z-index:10000; font-family:monospace; pointer-events:none;";
        div.textContent = `VIEW: ${state.view.toUpperCase()}`;
        document.body.appendChild(div);
    }
}

window.onload = init;
