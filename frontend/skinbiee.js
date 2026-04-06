const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? "http://localhost:5000" 
    : "https://skinbiee-backend-hxkz.onrender.com";

/* --- Safe LocalStorage Utility --- */
const safeLS = {
    get: (key) => {
        try { return localStorage.getItem(key); }
        catch (e) { console.warn("LS blocked:", e); return null; }
    },
    set: (key, val) => {
        try { localStorage.setItem(key, val); }
        catch (e) { console.warn("LS blocked:", e); }
    },
    remove: (key) => {
        try { localStorage.removeItem(key); }
        catch (e) { console.warn("LS blocked:", e); }
    }
};

/* ==========================================================================
   STATE & DOM ELEMENTS
   ========================================================================== */
const state = {
    view: 'auth', // auth, onboarding, home, analyzer, planner, settings
    theme: 'light',
    mascotColor: 'blue',
    username: '',
    userId: null,
    streak: 0,
    onboardingStep: 1,
    /** Dates (YYYY-MM-DD) with logged routine activity — from server daily_logs */
    activeDates: new Set()
};

function userStorageKey(base) {
    const uid = state.userId != null ? String(state.userId) : 'anon';
    return `${base}-u${uid}`;
}

function persistSession(userId, username) {
    state.userId = userId;
    state.username = username;
    safeLS.set('sc-user-id', String(userId));
    safeLS.set('sc-username', username);
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = username;
}

function clearSession() {
    state.userId = null;
    state.username = '';
    state.activeDates = new Set();
    safeLS.remove('sc-user-id');
    safeLS.remove('sc-username');
}

function restoreSession() {
    const raw = safeLS.get('sc-user-id');
    const uid = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(uid) || uid < 1) {
        state.userId = null;
        return false;
    }
    state.userId = uid;
    state.username = safeLS.get('sc-username') || '';
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = state.username;
    return true;
}

function profileStorageKey() {
    return state.userId != null ? `sc-user-profile-u${state.userId}` : 'sc-user-profile';
}

async function refreshUserDataFromServer() {
    if (state.userId == null) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/user/data?user_id=${state.userId}`);
        const data = await res.json();
        if (data.status !== 'success') return;
        
        state.activeDates = new Set(data.active_dates || []);
        state.allLogs = data.logs || []; // Store full logs for export

        if (typeof data.streak === 'number') {
            plannerState.streak = data.streak;
            state.streak = data.streak;
            safeLS.set(userStorageKey('planner-streak'), String(data.streak));
        }

        const sBadge = document.getElementById('streak-count');
        const homeStreakEl = document.getElementById('home-streak-count');
        if (sBadge) sBadge.textContent = `${plannerState.streak} Day Streak`;
        if (homeStreakEl) homeStreakEl.textContent = plannerState.streak;
        
        renderPlannerCalendar();
    } catch (e) {
        console.error('refreshUserDataFromServer', e);
    }
}

// DOM Elements
const views = document.querySelectorAll('.view');
const topBar = document.getElementById('top-bar');
const bottomNav = document.getElementById('bottom-nav');
const floatMascotBtn = document.getElementById('float-mascot-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
function init() {
    console.log("DEBUG: Skinbiee Initializing...");
    const hadSession = restoreSession();
    syncPlannerStateFromStorage();

    const savedTheme = safeLS.get('sc-theme');
    if (savedTheme === 'dark') {
        toggleTheme();
    }

    setupAuthListeners();
    setupOnboardingListeners();
    setupBottomNav();
    setupMascotChat();
    setupAnalyzer();
    setupPlanner();
    setupSettings();

    if (hadSession) {
        applyUserProfile(loadUserProfile());
        switchView('home');
        refreshUserDataFromServer();
    }

    renderScanHistory();
}

/* ==========================================================================
   ROUTING / VIEW MANAGEMENT
   ========================================================================== */
function switchView(viewName) {
    // Hide all views
    views.forEach(v => v.classList.remove('active'));

    // Dismiss any settings overlays or modals
    document.querySelectorAll('.sub-page-overlay, .clear-data-modal-overlay').forEach(el => {
        el.style.display = 'none';
    });

    // Show target view
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.add('active');
        state.view = viewName;
    }

    // Toggle Shell elements
    if (viewName === 'auth' || viewName === 'onboarding') {
        if (topBar) topBar.style.display = 'none';
        if (bottomNav) bottomNav.style.display = 'none';
        if (floatMascotBtn) floatMascotBtn.style.display = 'none';

        if (viewName === 'onboarding') {
            resetOnboarding();
        }
    } else {
        if (topBar) topBar.style.display = 'flex';
        if (bottomNav) bottomNav.style.display = 'flex';
        if (floatMascotBtn) floatMascotBtn.style.display = 'block';

        // Update Bottom Nav active state
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === viewName);
        });
    }

    // Scroll top
    if (document.getElementById('main-content')) {
        document.getElementById('main-content').scrollTop = 0;
    }

    if (viewName === 'analyzer') setupAnalyzer();
    if (viewName === 'planner') {
        refreshUserDataFromServer();
        setupPlanner();
    }
}

/* ==========================================================================
   AUTH FLOW
   ========================================================================== */
function setupAuthListeners() {
    const authForm = document.getElementById('auth-form');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchTextEl = document.getElementById('auth-switch-text');
    let isSignup = true;

    if (switchTextEl) {
        switchTextEl.onclick = (e) => {
            if (e.target.id === 'auth-switch-link') {
                e.preventDefault();
                isSignup = !isSignup;
                
                const emailGroup = document.querySelector('.signup-only');
                const forgotLink = document.querySelector('.login-only');
                
                if (isSignup) {
                    if (emailGroup) emailGroup.style.display = 'block';
                    if (forgotLink) forgotLink.style.display = 'none';
                    if (submitBtn) submitBtn.textContent = 'Create Account';
                    switchTextEl.innerHTML = `Already have an account? <a href="#" id="auth-switch-link">Log In</a>`;
                } else {
                    if (emailGroup) emailGroup.style.display = 'none';
                    if (forgotLink) forgotLink.style.display = 'block';
                    if (submitBtn) submitBtn.textContent = 'Log In';
                    switchTextEl.innerHTML = `New here? <a href="#" id="auth-switch-link">Sign Up</a>`;
                }
            }
        };
    }

    if (authForm) {
        authForm.onsubmit = async (e) => {
            e.preventDefault();
            const uname = document.getElementById('auth-username').value.trim();
            const pass = document.getElementById('auth-password').value;
            const email = isSignup ? document.getElementById('auth-email').value.trim() : null;

            try {
                showToast(isSignup ? "Creating your portal... 🪄" : "Opening the gates... 🏰");
                const endpoint = isSignup ? '/api/signup' : '/api/login';
                const body = { username: uname, password: pass };
                if (isSignup) body.email = email;

                const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();

                if (data.status === 'success') {
                    persistSession(data.user_id, data.username);
                    if (isSignup) {
                        switchView('onboarding');
                    } else {
                        applyUserProfile(loadUserProfile());
                        switchView('home');
                        triggerMascotAnim('happy');
                        refreshUserDataFromServer();
                    }
                } else {
                    showToast(data.error || "Authentication failed");
                }
            } catch (err) {
                console.error(err);
                showToast("Connection error. Is the server awake?");
            }
        };
    }

    const eyeToggle = document.querySelector('.eye-toggle');
    if (eyeToggle) {
        eyeToggle.onclick = function () {
            const input = document.getElementById('auth-password');
            const icon = this.querySelector('i');
            if (input && icon) {
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.replace('fa-eye', 'fa-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.replace('fa-eye-slash', 'fa-eye');
                }
            }
        };
    }
}

/* ==========================================================================
   ONBOARDING FLOW
   ========================================================================== */
function setupOnboardingListeners() {
    const nextBtn = document.getElementById('ob-next-btn');
    const backBtn = document.getElementById('ob-back');
    const mascot = document.getElementById('ob-mascot');

    // Pill Selects
    document.querySelectorAll('.pill-group.single-select').forEach(group => {
        group.addEventListener('click', (e) => {
            const pill = e.target.closest('.pill');
            if (pill) {
                group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            }
        });
    });

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            const currentStep = document.getElementById(`ob-step-${state.onboardingStep}`);
            let isValid = true;

            if (state.onboardingStep === 1) {
                const age = document.getElementById('ob-age').value;
                const gender = currentStep.querySelector('.pill.active');
                if (!age || !gender) isValid = false;
            } else if (state.onboardingStep === 2) {
                const skinType = currentStep.querySelector('[data-target="ob-skintype"] .pill.active');
                const concern = currentStep.querySelector('[data-target="ob-concern"] .pill.active');
                const sensitive = currentStep.querySelector('[data-target="ob-sensitive"] .pill.active');
                if (!skinType || !concern || !sensitive) isValid = false;
            } else if (state.onboardingStep >= 3 && state.onboardingStep <= 4) {
                const groups = currentStep.querySelectorAll('.pill-group.single-select');
                groups.forEach(g => {
                    if (!g.querySelector('.pill.active')) isValid = false;
                });
            }

            if (!isValid) {
                showToast('Please answer all questions to continue');
                return;
            }

            if (state.onboardingStep < 4) {
                document.getElementById(`ob-step-${state.onboardingStep}`).classList.remove('active');
                state.onboardingStep++;
                document.getElementById(`ob-step-${state.onboardingStep}`).classList.add('active');
                document.getElementById('ob-step-num').textContent = state.onboardingStep;
                if (backBtn) backBtn.style.visibility = 'visible';
            } else if (state.onboardingStep === 4) {
                const profileData = {
                    username: state.username,
                    age: document.getElementById('ob-age').value,
                    gender: (document.querySelector('#ob-step-1 .pill.active') || {}).textContent || '',
                    skinType: (document.querySelector('[data-target="ob-skintype"] .pill.active') || {}).textContent || '',
                    concern: (document.querySelector('[data-target="ob-concern"] .pill.active') || {}).textContent || '',
                    sensitive: (document.querySelector('[data-target="ob-sensitive"] .pill.active') || {}).textContent || '',
                };
                saveUserProfile(profileData);

                document.getElementById(`ob-step-4`).classList.remove('active');
                document.getElementById(`ob-step-done`).classList.add('active');

                if (mascot) mascot.classList.replace('idle', 'happy');
                const progress = document.querySelector('.ob-progress');
                if (progress) progress.style.display = 'none';
                if (backBtn) backBtn.style.visibility = 'hidden';

                nextBtn.textContent = 'Go to Home';
                state.onboardingStep = 5;
            } else {
                applyUserProfile(loadUserProfile());
                switchView('home');
            }
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (state.onboardingStep > 1) {
                document.getElementById(`ob-step-${state.onboardingStep}`).classList.remove('active');
                state.onboardingStep--;
                document.getElementById(`ob-step-${state.onboardingStep}`).classList.add('active');
                document.getElementById('ob-step-num').textContent = state.onboardingStep;
                if (state.onboardingStep === 1) backBtn.style.visibility = 'hidden';
            }
        });
    }
}

function resetOnboarding() {
    state.onboardingStep = 1;
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    const step1 = document.getElementById('ob-step-1');
    if (step1) step1.classList.add('active');
    const nextBtn = document.getElementById('ob-next-btn');
    if (nextBtn) nextBtn.textContent = 'Continue';
    const stepNum = document.getElementById('ob-step-num');
    if (stepNum) stepNum.textContent = '1';
    const backBtn = document.getElementById('ob-back');
    if (backBtn) backBtn.style.visibility = 'hidden';
    const progress = document.querySelector('.ob-progress');
    if (progress) progress.style.display = 'block';
    const mascot = document.getElementById('ob-mascot');
    if (mascot) {
        mascot.classList.remove('happy');
        mascot.classList.add('idle');
    }
}

/* ==========================================================================
   NAVIGATION
   ========================================================================== */
function setupBottomNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            switchTab(target);
        });
    });
}

/* ==========================================================================
   THEME & MASCOT SETTINGS
   ========================================================================== */
if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', state.theme);
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = state.theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    }
    safeLS.set('sc-theme', state.theme);

    // Update Setting toggle if exists
    const settingsPills = document.querySelectorAll('.pill-group[data-target="theme"] .pill');
    settingsPills.forEach(p => p.classList.toggle('active', p.dataset.theme === state.theme));
}

function changeMascotColor(colorName) {
    const root = document.documentElement;
    if (colorName === 'blue') {
        root.style.setProperty('--mascot-color', 'var(--accent-blue)');
        root.style.setProperty('--mascot-shade', 'var(--accent-blue-dark)');
    } else if (colorName === 'pink') {
        root.style.setProperty('--mascot-color', 'var(--accent-pink)');
        root.style.setProperty('--mascot-shade', 'var(--accent-pink-dark)');
    } else if (colorName === 'green') {
        root.style.setProperty('--mascot-color', 'var(--accent-green)');
        root.style.setProperty('--mascot-shade', 'var(--accent-green-dark)');
    }
}

/* ==========================================================================
   USER PROFILE (localStorage)
   ========================================================================== */
function saveUserProfile(profile) {
    safeLS.set(profileStorageKey(), JSON.stringify(profile));
}

function loadUserProfile() {
    let raw = safeLS.get(profileStorageKey());
    if (!raw && state.userId != null) {
        raw = safeLS.get('sc-user-profile');
    }
    return raw ? JSON.parse(raw) : null;
}

function applyUserProfile(profile) {
    if (!profile) return;
    // Keep server/session username; only fill in from profile if missing
    state.username = state.username || profile.username || '';
    
    // Fix: Add null check for user-display-name
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = state.username;
    
    // Surface relevant info on the mascot chat greeting
    const greetingBubble = document.querySelector('#chat-panel .mascot-bubble');
    if (greetingBubble && profile.skinType) {
        greetingBubble.textContent = `Hey ${state.username}! Remember to focus on your ${profile.skinType} skin routine today! 🌿`;
    }
}

/* ==========================================================================
   AUTH FLOW
   ========================================================================== */
function setupAuthListeners() {
    const authForm = document.getElementById('auth-form');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchTextEl = document.getElementById('auth-switch-text');
    let isSignup = true;

    console.log("Auth listeners initialized");

    if (switchTextEl) {
        switchTextEl.onclick = (e) => {
            if (e.target.id === 'auth-switch-link') {
                e.preventDefault();
                isSignup = !isSignup;
                console.log("Auth mode toggled. isSignup:", isSignup);
                
                const emailGroup = document.querySelector('.signup-only');
                const forgotLink = document.querySelector('.login-only');
                
                if (isSignup) {
                    if (emailGroup) emailGroup.style.display = 'block';
                    if (forgotLink) forgotLink.style.display = 'none';
                    submitBtn.textContent = 'Create Account';
                    switchTextEl.innerHTML = `Already have an account? <a href="#" id="auth-switch-link">Log In</a>`;
                } else {
                    if (emailGroup) emailGroup.style.display = 'none';
                    if (forgotLink) forgotLink.style.display = 'block';
                    submitBtn.textContent = 'Log In';
                    switchTextEl.innerHTML = `New here? <a href="#" id="auth-switch-link">Sign Up</a>`;
                }
            }
        };
    }

    if (authForm) {
        authForm.onsubmit = async (e) => {
            e.preventDefault();
            const unameInput = document.getElementById('auth-username');
            const passInput = document.getElementById('auth-password');
            const uname = unameInput ? unameInput.value.trim() : '';
            const password = passInput ? passInput.value : '';
            if (!uname || !password) {
                showToast('Please enter username and password.');
                return;
            }

            showLoading('Waking up server (may take 30-60s on first load)...');

            if (isSignup) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: uname, password })
                    });
                    const data = await res.json().catch(() => ({}));
                    hideLoading();
                    if (!res.ok) {
                        showToast(data.error || 'Could not create account.');
                        return;
                    }
                    persistSession(data.user_id, data.username);
                    syncPlannerStateFromStorage();
                    switchView('onboarding');
                } catch (err) {
                    console.error(err);
                    hideLoading();
                    showToast('Connection error — is the API server running?');
                }
            } else {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: uname, password })
                    });
                    const data = await res.json().catch(() => ({}));
                    hideLoading();
                    if (!res.ok) {
                        showToast(data.error || 'Invalid username or password.');
                        return;
                    }
                    persistSession(data.user_id, data.username);
                    syncPlannerStateFromStorage();
                    let profile = loadUserProfile();
                    if (!profile) {
                        profile = {
                            username: state.username,
                            skinType: 'Normal',
                            concern: 'None',
                            sensitive: 'No'
                        };
                        saveUserProfile(profile);
                    }
                    applyUserProfile(profile);
                    await refreshUserDataFromServer();
                    switchView('home');
                    triggerMascotAnim('happy');
                    showToast(`Welcome back, ${state.username}!`);
                    renderScanHistory();
                } catch (err) {
                    console.error(err);
                    hideLoading();
                    showToast('Connection error — is the API server running?');
                }
            }
        };
    }

    // Eye toggle
    const eyeToggle = document.querySelector('.eye-toggle');
    if (eyeToggle) {
        eyeToggle.onclick = function () {
            const input = document.getElementById('auth-password');
            const icon = this.querySelector('i');
            if (input && icon) {
                if (input.type === 'password') {
                    input.type = 'text';
                    icon.classList.replace('fa-eye', 'fa-eye-slash');
                } else {
                    input.type = 'password';
                    icon.classList.replace('fa-eye-slash', 'fa-eye');
                }
            }
        };
    }
}

/* ==========================================================================
   ONBOARDING FLOW
   ========================================================================== */
function setupOnboardingListeners() {
    const nextBtn = document.getElementById('ob-next-btn');
    const backBtn = document.getElementById('ob-back');
    const mascot = document.getElementById('ob-mascot');
    const activesToggle = document.getElementById('ob-actives-toggle');
    if (!nextBtn || !backBtn || !mascot) return;

    // Pill Selects
    document.querySelectorAll('.pill-group.single-select').forEach(group => {
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill');
            if (btn) {
                group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
            }
        });
    });

    document.querySelectorAll('.pill-group.multi-select').forEach(group => {
        group.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill');
            if (btn) {
                btn.classList.toggle('active');
            }
        });
    });

    if (activesToggle) {
        activesToggle.addEventListener('click', (e) => {
            const btn = e.target.closest('.pill');
            if (btn) {
                const val = btn.dataset.val;
                const at = document.getElementById('ob-actives-text');
                if (at) at.style.display = val === 'Yes' ? 'block' : 'none';
            }
        });
    }

    nextBtn.addEventListener('click', () => {
        const currentStep = document.getElementById(`ob-step-${state.onboardingStep}`);
        let isValid = true;

        if (state.onboardingStep === 1) {
            const age = document.getElementById('ob-age').value;
            const gender = currentStep.querySelector('.pill.active');
            if (!age || !gender) isValid = false;
        } else if (state.onboardingStep === 2) {
            const skinType = currentStep.querySelector('[data-target="ob-skintype"] .pill.active');
            const concern = currentStep.querySelector('[data-target="ob-concern"] .pill.active');
            const sensitive = currentStep.querySelector('[data-target="ob-sensitive"] .pill.active');
            if (!skinType || !concern || !sensitive) isValid = false;
        } else if (state.onboardingStep >= 3 && state.onboardingStep <= 4) {
            const groups = currentStep.querySelectorAll('.pill-group.single-select');
            groups.forEach(g => {
                if (!g.querySelector('.pill.active')) isValid = false;
            });
        }

        if (!isValid) {
            showToast('Please answer all questions to continue');
            return;
        }

        if (state.onboardingStep < 4) {
            document.getElementById(`ob-step-${state.onboardingStep}`).classList.remove('active');
            state.onboardingStep++;
            document.getElementById(`ob-step-${state.onboardingStep}`).classList.add('active');
            document.getElementById('ob-step-num').textContent = state.onboardingStep;
            backBtn.style.visibility = 'visible';
        } else if (state.onboardingStep === 4) {
            const profileData = {
                username: state.username,
                age: document.getElementById('ob-age').value,
                gender: (document.querySelector('#ob-step-1 .pill.active') || {}).textContent || '',
                skinType: (document.querySelector('[data-target="ob-skintype"] .pill.active') || {}).textContent || '',
                concern: (document.querySelector('[data-target="ob-concern"] .pill.active') || {}).textContent || '',
                sensitive: (document.querySelector('[data-target="ob-sensitive"] .pill.active') || {}).textContent || '',
            };
            saveUserProfile(profileData);

            document.getElementById(`ob-step-4`).classList.remove('active');
            document.getElementById(`ob-step-done`).classList.add('active');

            mascot.classList.replace('idle', 'happy');
            document.querySelector('.ob-progress').style.display = 'none';
            backBtn.style.visibility = 'hidden';

            nextBtn.textContent = state.fromSettings ? 'Go to Settings' : 'Go to Home';
            state.onboardingStep = 5;
        } else {
            applyUserProfile(loadUserProfile());
            if (state.fromSettings) {
                state.fromSettings = false;
                switchView('settings');
            } else {
                switchView('home');
            }
        }
    });

    backBtn.addEventListener('click', () => {
        if (state.onboardingStep > 1) {
            document.getElementById(`ob-step-${state.onboardingStep}`).classList.remove('active');
            state.onboardingStep--;
            document.getElementById(`ob-step-${state.onboardingStep}`).classList.add('active');
            document.getElementById('ob-step-num').textContent = state.onboardingStep;

            if (state.onboardingStep === 1 && !state.fromSettings) {
                backBtn.style.visibility = 'hidden';
            }
        } else if (state.fromSettings && state.onboardingStep === 1) {
            state.fromSettings = false;
            switchView('settings');
        }
    });
}

function resetOnboarding() {
    state.onboardingStep = 1;
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    document.getElementById('ob-step-1').classList.add('active');
    document.getElementById('ob-next-btn').textContent = 'Continue';
    document.getElementById('ob-step-num').textContent = '1';
    document.getElementById('ob-back').style.visibility = state.fromSettings ? 'visible' : 'hidden';
    document.querySelector('.ob-progress').style.display = 'block';
    document.getElementById('ob-mascot').classList.remove('happy');
    document.getElementById('ob-mascot').classList.add('idle');
}

/* ==========================================================================
   NAVIGATION
   ========================================================================== */
function setupBottomNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            switchView(target);
        });
    });
}

/* ==========================================================================
   TAB: ANALYZER
   ========================================================================== */
function setupAnalyzer() {
    if (state.analyzerInitialized) return;
    state.analyzerInitialized = true;

    const btnSkinCamera = document.getElementById('btn-skin-camera-sb');
    const btnSkinGallery = document.getElementById('btn-skin-gallery-sb');
    const skinFileInput = document.getElementById('skin-file-input-sb');

    if (btnSkinCamera) btnSkinCamera.onclick = () => skinFileInput.click();
    if (btnSkinGallery) btnSkinGallery.onclick = () => skinFileInput.click();

    if (skinFileInput) {
        skinFileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('skin-img-preview-sb');
                    if (preview) preview.src = event.target.result;
                    showAnalyzerSubStateSB('skin', 'preview');
                    triggerMascotAnim('surprised');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    const btnAnalyzeSkin = document.getElementById('btn-analyze-skin-sb');
    if (btnAnalyzeSkin) {
        btnAnalyzeSkin.onclick = async () => {
            const file = skinFileInput.files[0];
            if (!file) {
                showToast("Please pick a photo first!");
                return;
            }
            if (state.userId == null) {
                showToast('Please sign in to save scans to your account.');
                return;
            }

            console.log("DEBUG: Starting skin analysis...");
            const preview = document.getElementById('skin-img-processing-sb');
            if (preview) preview.src = document.getElementById('skin-img-preview-sb').src;
            
            showAnalyzerSubStateSB('skin', 'processing');
            triggerMascotAnim('thinking');

            const formData = new FormData();
            formData.append('image', file);
            formData.append('user_id', state.userId);

            try {
                showToast("Mascot is scanning your skin... 🧸");
                const response = await fetch(`${API_BASE_URL}/api/analyze-skin`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.status === 'success') {
                    showToast("Results are in! ✨");
                    const previewUrl = data.image_url || URL.createObjectURL(file);
                    const scanRecord = {
                        id: Date.now(),
                        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                        img: data.image_url || previewUrl,
                        results: data.results,
                        type: 'face'
                    };
                    plannerState.scans.unshift(scanRecord);
                    safeLS.set(userStorageKey('planner-scans'), JSON.stringify(plannerState.scans));

                    renderSkinResultsSB(data.results, previewUrl);
                    showAnalyzerSubStateSB('skin', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Analysis failed: " + (data.error || 'Unknown error'));
                    showAnalyzerSubStateSB('skin', 'input');
                }
            } catch (err) {
                console.error("DEBUG: FETCH ERROR:", err);
                showToast("Connection error. Try again?");
                showAnalyzerSubStateSB('skin', 'input');
            }
        };
    }

    const btnProdCamera = document.getElementById('btn-prod-camera-sb');
    const btnProdGallery = document.getElementById('btn-prod-gallery-sb');
    const prodFileInput = document.getElementById('prod-file-input-sb');

    if (btnProdCamera) btnProdCamera.onclick = () => prodFileInput.click();
    if (btnProdGallery) btnProdGallery.onclick = () => prodFileInput.click();

    if (prodFileInput) {
        prodFileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('prod-img-preview-sb');
                    if (preview) preview.src = event.target.result;
                    showAnalyzerSubStateSB('prod', 'preview');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    const btnAnalyzeProd = document.getElementById('btn-analyze-prod-sb');
    if (btnAnalyzeProd) {
        btnAnalyzeProd.onclick = async () => {
            const file = prodFileInput.files[0];
            if (!file) return;
            if (state.userId == null) {
                showToast('Please sign in to save scans to your account.');
                return;
            }

            console.log("DEBUG: Starting product scan...");
            const preview = document.getElementById('prod-img-processing-sb');
            if (preview) preview.src = document.getElementById('prod-img-preview-sb').src;

            showAnalyzerSubStateSB('prod', 'processing');
            triggerMascotAnim('thinking');

            const formData = new FormData();
            formData.append('image', file);
            formData.append('user_id', state.userId);

            try {
                const processingTitle = document.getElementById('prod-processing-title-sb');
                const processingSub = document.getElementById('prod-processing-subtitle-sb');
                if (processingTitle) processingTitle.innerText = "Reading ingredients...";
                if (processingSub) processingSub.innerText = "AI is scanning your image label.";

                // Change message after 8s if it's still running
                const msgTimeout = setTimeout(() => {
                    if (processingTitle) processingTitle.innerText = "Analyzing benefits...";
                    if (processingSub) processingSub.innerText = "Checking ingredients for your skin type.";
                }, 8000);

                const response = await fetch(`${API_BASE_URL}/api/analyze-product`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                clearTimeout(msgTimeout);

                if (data.status === 'success') {
                    showToast("Ingredient analysis ready!");
                    const previewUrl = data.image_url || URL.createObjectURL(file);
                    const scanRecord = {
                        id: Date.now(),
                        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                        img: data.image_url || previewUrl,
                        results: data.analysis,
                        type: 'product'
                    };
                    plannerState.scans.unshift(scanRecord);
                    safeLS.set(userStorageKey('planner-scans'), JSON.stringify(plannerState.scans));

                    renderProdResultsSB(data);
                    showAnalyzerSubStateSB('prod', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Scan failed: " + (data.error || 'Unknown error'));
                    showAnalyzerSubStateSB('prod', 'input');
                }
            } catch (err) {
                console.error("DEBUG: FETCH ERROR:", err);
                showToast("Connection Error: Check AI Server console.");
                showAnalyzerSubStateSB('prod', 'input');
            }
        };
    }

    const removeSkin = document.getElementById('remove-skin-preview-sb');
    if (removeSkin) removeSkin.onclick = () => showAnalyzerSubStateSB('skin', 'input');
    
    const removeProd = document.getElementById('remove-prod-preview-sb');
    if (removeProd) removeProd.onclick = () => showAnalyzerSubStateSB('prod', 'input');
}

function showAnalyzerSubStateSB(mode, state) {
    if (mode === 'skin') {
        const states = {
            input: document.querySelector('#sub-skin-analysis .input-state'),
            preview: document.getElementById('skin-preview-zone-sb'),
            processing: document.getElementById('skin-processing-state-sb'),
            results: document.getElementById('skin-results-state-sb')
        };
        Object.values(states).forEach(el => { if (el) el.style.display = 'none'; });
        
        if (state === 'input') {
            if (states.input) {
                states.input.style.display = 'block';
                const inst = states.input.querySelector('.instruction-section');
                const acts = states.input.querySelector('.centered-action-group');
                if (inst) inst.style.display = 'block';
                if (acts) acts.style.display = 'flex';
            }
            const fileInput = document.getElementById('skin-file-input-sb');
            if (fileInput) fileInput.value = '';
        } else if (state === 'preview') {
            if (states.input) {
                states.input.style.display = 'block';
                const inst = states.input.querySelector('.instruction-section');
                const acts = states.input.querySelector('.centered-action-group');
                if (inst) inst.style.display = 'none';
                if (acts) acts.style.display = 'none';
            }
            if (states.preview) states.preview.style.display = 'block';
        } else if (state === 'processing') {
            if (states.processing) states.processing.style.display = 'block';
        } else if (state === 'results') {
            if (states.results) {
                states.results.style.display = 'block';
                renderScanHistory();
            }
        }
    } else {
        const states = {
            input: document.getElementById('ing-input-state-sb'),
            preview: document.getElementById('prod-preview-zone-sb'),
            processing: document.getElementById('prod-processing-state-sb'),
            results: document.getElementById('ing-results-state-sb')
        };
        Object.values(states).forEach(el => { if (el) el.style.display = 'none'; });

        if (state === 'input') {
            if (states.input) {
                states.input.style.display = 'block';
                const inst = states.input.querySelector('.instruction-section');
                const acts = states.input.querySelector('.centered-action-group');
                if (inst) inst.style.display = 'block';
                if (acts) acts.style.display = 'flex';
            }
            const fileInput = document.getElementById('prod-file-input-sb');
            if (fileInput) fileInput.value = '';
        } else if (state === 'preview') {
            if (states.input) {
                states.input.style.display = 'block';
                const inst = states.input.querySelector('.instruction-section');
                const acts = states.input.querySelector('.centered-action-group');
                if (inst) inst.style.display = 'none';
                if (acts) acts.style.display = 'none';
            }
            if (states.preview) states.preview.style.display = 'block';
        } else if (state === 'processing') {
            if (states.processing) states.processing.style.display = 'block';
        } else if (state === 'results') {
            if (states.results) {
                states.results.style.display = (mode === 'prod') ? 'flex' : 'block';
                if (mode === 'prod') {
                    states.results.style.flexDirection = 'column';
                }
                renderScanHistory();
            }
        }
    }
}

function renderSkinResultsSB(results, imgUrl) {
    const img = document.getElementById('skin-result-img-sb');
    if (img) img.src = imgUrl;

    const badgeContainer = document.getElementById('skin-result-badges-sb');
    const list = document.getElementById('skin-concerns-list-sb');
    const overallDesc = document.getElementById('skin-result-desc-sb');
    const titleEl = document.getElementById('skin-result-title-sb');

    if (badgeContainer) badgeContainer.innerHTML = '';
    if (list) {
        list.innerHTML = '';
        list.classList.add('result-card-entry'); // Entrance animation
    }

    const advice = {
        "Acne": "Your skin is dealing with some breakouts. We'll focus on soothing and clearing these areas gently! 🌿",
        "Dark Spots": "We noticed some areas with extra pigment. These can fade over time with brightening care! ✨",
        "Oiliness": "Your skin is producing extra glow. We'll help balance it so you stay fresh all day. 🌊",
        "Dryness": "Your skin is feeling a bit thirsty! We'll look for rich, hydrating ingredients for you. 💧",
        "Normal": "Your skin is looking balanced and healthy! Let's keep it protected and happy. ☀️",
        "Healthy / Normal": "Overall, your skin is in a great place! Just keep up the healthy habits. 🌟"
    };

    const skinTypeMap = {
        "Oiliness": "Oily",
        "Dryness": "Dry",
        "Acne": "Acne-Prone",
        "Normal": "Normal",
        "Healthy / Normal": "Normal"
    };
    const detectedConcerns = results.map(r => r.concern);
    let skinType = 'Normal';
    for (const concern of detectedConcerns) {
        if (skinTypeMap[concern]) { skinType = skinTypeMap[concern]; break; }
    }
    if (titleEl) titleEl.textContent = `Skin Type: ${skinType}`;

    const mainConcern = results.sort((a,b) => b.confidence - a.confidence)[0];
    if (overallDesc) {
        if (mainConcern.concern === 'Healthy / Normal' || mainConcern.concern === 'Normal') {
            overallDesc.innerHTML = `<strong>Overall:</strong> Your skin looks healthy and balanced! Keep up the good habits. 🌟`;
        } else {
            overallDesc.innerHTML = `<strong>Overall:</strong> Your skin is showing signs of <strong>${mainConcern.concern}</strong>. Don't worry, bestie — we've got a plan for you! 💖`;
        }
    }

    results.forEach(res => {
        const severityColor = res.severity === 'Moderate' ? 'badge-yellow' : res.severity === 'Mild' ? 'badge-green' : 'badge-red';
        const borderColor = res.severity === 'Moderate' ? '#ffd93d' : res.severity === 'Mild' ? '#6bcb77' : '#ff6b6b';

        const badge = document.createElement('span');
        badge.className = `severity-badge ${severityColor}`;
        badge.textContent = `${res.severity} ${res.concern}`;
        if (badgeContainer) badgeContainer.appendChild(badge);

        const card = document.createElement('div');
        card.className = 'ing-card mb-3';
        card.style.borderLeft = `5px solid ${borderColor}`;
        card.innerHTML = `
            <div class="flex-between">
                <strong>${res.concern}</strong>
                <span class="micro-text text-muted">Severity: ${res.severity}</span>
            </div>
            <p class="micro-text mt-2 mb-0">${advice[res.concern] || "We'll help you manage this concern with the right routine! 🧴"}</p>
        `;
        if (list) list.appendChild(card);
    });

    const existingBtn = document.getElementById('btn-go-products-sb');
    if (!existingBtn) {
        const btn = document.createElement('button');
        btn.id = 'btn-go-products-sb';
        btn.className = 'primary-btn full-width mt-4';
        btn.textContent = 'See Recommended Products 🛍️';
        btn.onclick = () => showProductRecommendations(results);
        if (list) list.parentElement.appendChild(btn);

        const recContainer = document.createElement('div');
        recContainer.id = 'product-rec-container';
        if (list) list.parentElement.appendChild(recContainer);
    } else {
        existingBtn.onclick = () => showProductRecommendations(results);
        existingBtn.textContent = 'See Recommended Products 🛍️';
        const recContainer = document.getElementById('product-rec-container');
        if (recContainer) recContainer.innerHTML = '';
    }
}

function showProductRecommendations(results) {
    const container = document.getElementById('product-rec-container');
    if (!container) return;

    if (container.innerHTML.trim() !== '') {
        container.innerHTML = '';
        const btn = document.getElementById('btn-go-products-sb');
        if (btn) btn.textContent = 'See Recommended Products 🛍️';
        return;
    }

    const btn = document.getElementById('btn-go-products-sb');
    if (btn) btn.textContent = 'Hide Recommendations ✕';

    container.innerHTML = `
        <div class="rec-section-header mt-4">
            <h3>Recommended for You</h3>
            <p class="micro-text" style="color:var(--text-secondary);margin-bottom:0">Curated picks based on your scan results</p>
        </div>
        <div class="product-rec-grid mt-3" id="rec-cards-grid"></div>
    `;

    const grid = container.querySelector('#rec-cards-grid');

    const PRODUCT_MAP = {
        'Acne':          { query: 'best salicylic acid face wash for acne skin india', tip: 'Use a salicylic acid-based face wash to unclog pores.' },
        'Dark Spots':    { query: 'dark spot removal serum cream india', tip: 'A Vitamin C or niacinamide serum helps fade dark spots.' },
        'Oiliness':      { query: 'oil control mattifying face wash india', tip: 'A lightweight, oil-free moisturiser keeps shine in check.' },
        'Dryness':       { query: 'best deep moisturiser for dry skin india', tip: 'Look for hyaluronic acid or ceramide-rich moisturisers.' },
        'Normal':        { query: 'gentle daily face wash normal skin india', tip: 'Maintain your balance with a gentle cleanser and SPF.' },
        'Healthy / Normal': { query: 'gentle daily face wash normal skin india', tip: 'Keep your healthy skin protected with a good SPF routine.' },
        'Dark Circles':  { query: 'dark circle removal under eye cream india', tip: 'Caffeine or retinol eye creams can lighten dark circles.' },
        'Pigmentation':  { query: 'pigmentation removal face cream india', tip: 'Alpha-arbutin or kojic acid serums work well on pigmentation.' },
        'Wrinkles':      { query: 'anti aging wrinkle cream retinol india', tip: 'Retinol and peptide creams are proven anti-aging ingredients.' },
        'Redness':       { query: 'soothing redness relief face cream india', tip: 'Centella asiatica and green tea extracts calm redness.' },
        'Sensitive Skin':{ query: 'gentle face wash sensitive skin fragrance free india', tip: 'Stick to fragrance-free, dermatologist-tested products.' }
    };

    results.forEach(res => {
        const info = PRODUCT_MAP[res.concern] || PRODUCT_MAP['Normal'];
        const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(info.query)}`;

        const card = document.createElement('div');
        card.className = 'product-rec-card';
        card.innerHTML = `
            <div class="rec-card-icon">${getConcernEmoji(res.concern)}</div>
            <div class="rec-card-body">
                <h4 class="rec-card-title">${res.concern}</h4>
                <p class="rec-card-tip">${info.tip}</p>
                <a class="shop-btn" href="${amazonUrl}" target="_blank" rel="noopener noreferrer">
                    Shop on Amazon <span class="shop-arrow">→</span>
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}

function getConcernEmoji(concern) {
    const map = {
        'Acne': '🧴', 'Dark Spots': '✨', 'Oiliness': '💦',
        'Dryness': '💧', 'Normal': '🌿', 'Healthy / Normal': '🌿',
        'Dark Circles': '👁️', 'Pigmentation': '🌸', 'Wrinkles': '🕰️',
        'Redness': '🌹', 'Sensitive Skin': '🤍'
    };
    return map[concern] || '✨';
}

// ── Human-readable reason rewrites ──────────────────────────────────────────
const _FRIENDLY_REASONS = {
    // good
    "Helps control oil and keeps pores clear.":          ["salicylic", "bha", "niacinamide"],
    "Locks in moisture all day long.":                   ["hyaluronic", "glycerin", "glycerine", "urea"],
    "Calms redness and helps skin heal faster.":         ["allantoin", "centella", "cica"],
    "Rebuilds your skin's protective barrier.":          ["ceramide"],
    "Brightens dark spots over time.":                   ["vitamin c", "ascorbic", "kojic", "niacinamide"],
    "Natural germ-fighter that keeps breakouts away.":   ["tea tree", "benzoyl"],
    "Blocks UV rays and protects from sun damage.":      ["zinc oxide", "titanium dioxide", "sunscreen", "spf"],
    "Rich antioxidant that protects against pollution.": ["vitamin e", "tocopherol"],
    "Gently exfoliates dead skin cells.":                ["lactic acid", "glycolic", "aha"],
    "Helps skin look plump and youthful.":               ["retinol", "retinoid", "bakuchiol"],
    "Super gentle moisturiser safe for all types.":      ["squalane", "jojoba"],
    // bad
    "Fragrance can trigger breakouts or irritation — especially on sensitive skin.": ["fragrance", "parfum"],
    "A harsh detergent that can strip your skin barrier.":  ["sodium lauryl sulfate", "sls"],
    "May clog pores for acne-prone or oily skin types.":    ["isopropyl myristate", "coconut oil", "cocoa butter"],
    "Heavy oil that can trap sebum — avoid if acne-prone.": ["mineral oil", "petrolatum"],
    "Can be drying with daily use — best in small amounts.":["alcohol denat", "sd alcohol"],
};

function _friendlyReason(rawReason, name) {
    const key = (name + ' ' + rawReason).toLowerCase();
    for (const [friendly, triggers] of Object.entries(_FRIENDLY_REASONS)) {
        if (triggers.some(t => key.includes(t))) return friendly;
    }
    // Remove clinical phrasing if no override found
    return rawReason
        .replace(/^Beneficial for .+? skin\.\s*/i, '')
        .replace(/^May not suit .+? skin\.\s*/i, '');
}

// ── Tip generator ────────────────────────────────────────────────────────────
function _productTip(isGood, isWarn, badIngredients, skinCondition) {
    if (isGood) {
        if (skinCondition === 'acne') return "Looks like a solid pick for acne-prone skin — just introduce it gradually.";
        if (skinCondition === 'oily_skin') return "Good fit for oily skin. Use a light layer and you're set.";
        if (skinCondition === 'dry_skin') return "Great for dry skin — apply on slightly damp skin to lock in more moisture.";
        if (skinCondition === 'dark_spots') return "Promising ingredients for brightening. Pair with SPF for best results.";
        return "Looks like a good match for your skin. Enjoy! 🌟";
    }
    if (isWarn) {
        const hasFrag = badIngredients.some(n => /fragrance|parfum/i.test(n));
        const hasAlc  = badIngredients.some(n => /alcohol denat/i.test(n));
        if (hasFrag) return "The fragrance in this product can irritate sensitive skin — do a patch test first.";
        if (hasAlc)  return "Alcohol can be drying with daily use. Consider an alcohol-free alternative if your skin feels tight.";
        return "A few ingredients are worth watching. Patch test before committing to daily use.";
    }
    return "We'd suggest looking for an alternative — there are a few ingredients that don't play nicely with your skin type.";
}

// ── Main renderer ────────────────────────────────────────────────────────────
// ── Main renderer ────────────────────────────────────────────────────────────
function renderProdResultsSB(data) {
    try {
        const analysis   = data.analysis   || {};
        const breakdown  = data.ingredient_breakdown || [];
        const skinCond   = data.skin_condition || 'general';
        const rawIngredients = data.ingredients || [];

        // 1. Score handling (0-10 scale)
        let score = typeof analysis.score === 'number' ? analysis.score : 5.0;
        if (score > 10.5) score = score / 10; // Handle migration from 0-100
        score = Math.min(10, Math.max(0, score));

        const isGood = score >= 7.0;
        const isWarn = score >= 4.0 && score < 7.0;
        const barColor = isGood ? 'var(--success)' : isWarn ? 'var(--warning)' : 'var(--danger)';

        // 2. Verdict Card
        const vTitle = document.getElementById('prod-verdict-title');
        const vSub   = document.getElementById('prod-verdict-subtitle');
        const vFill  = document.getElementById('prod-score-fill');
        const vText  = document.getElementById('prod-score-text');
        const vCount = document.getElementById('prod-ing-count');

        if (vTitle) vTitle.innerText = isGood ? 'Good Match' : isWarn ? 'Use With Caution' : 'Not Recommended';
        if (vSub) {
            const dispCond = skinCond.replace(/_/g, ' ');
            const suffix = dispCond.endsWith('skin') ? '' : ' skin';
            const fullCond = dispCond + suffix;
            
            vSub.innerText = isGood 
                ? `This product is a great choice for your ${fullCond}.` 
                : isWarn 
                ? `Mind the details — some ingredients may not suit ${fullCond}.` 
                : `We found ingredients that might be harsh for ${fullCond}.`;
        }
        if (vFill) {
            vFill.style.width = (score * 10) + '%';
            vFill.style.background = barColor;
        }
        if (vText) {
            vText.innerText = score.toFixed(1) + ' / 10';
            vText.style.color = barColor;
        }
        if (vCount) vCount.innerText = `${breakdown.length || rawIngredients.length} ingredients detected`;

        // 3. Fast Facts Card (Pills)
        const factsCard = document.getElementById('prod-fast-facts-card');
        const pillsCont = document.getElementById('prod-pills-container');
        if (pillsCont) {
            const allIngs = breakdown.map(i => i.name.toLowerCase()).join(' ');
            const facts = [];
            if (!allIngs.includes('alcohol') || allIngs.includes('alcohol free')) facts.push('Alcohol-Free');
            if (!allIngs.includes('fragrance') && !allIngs.includes('parfum')) facts.push('Fragrance-Free');
            if (!allIngs.includes('sulfate')) facts.push('Sulfate-Free');
            if (!allIngs.includes('paraben')) facts.push('Paraben-Free');
            if (!allIngs.includes('silicone') && !allIngs.includes('dimethicone')) facts.push('Silicone-Free');
            if (!allIngs.includes('oil ') && !allIngs.includes('mineral oil')) facts.push('Oil-Free');

            if (facts.length > 0) {
                pillsCont.innerHTML = facts.map(f => 
                    `<span class="pill-badge">${f}</span>`
                ).join('');
                factsCard.style.display = 'block';
            } else {
                factsCard.style.display = 'none';
            }
        }

        // 4. Ingredient Lists
        const goodList = document.getElementById('prod-good-list');
        const badList  = document.getElementById('prod-bad-list');
        const othersList = document.getElementById('prod-others-list');

        function createIngItem(item) {
            const friendly = _friendlyReason(item.reason, item.name);
            return `
                <div class="ingredient-item">
                    <div class="ing-top-line">
                        <span class="ing-name">${item.name}</span>
                        <span class="ing-category-tag">${item.category || 'general'}</span>
                    </div>
                    <p class="ing-reason">${friendly}</p>
                </div>`;
        }


        const goodItems = breakdown.filter(i => i.rating === 'good');
        const badItems  = breakdown.filter(i => i.rating === 'bad');
        const otherItems= breakdown.filter(i => i.rating === 'neutral' || !i.rating);

        if (goodList) {
            if (goodItems.length > 0) {
                goodList.innerHTML = goodItems.map(createIngItem).join('');
                document.getElementById('prod-good-card').style.display = 'block';
            } else {
                document.getElementById('prod-good-card').style.display = 'none';
            }
        }

        if (badList) {
            if (badItems.length > 0) {
                badList.innerHTML = badItems.map(createIngItem).join('');
                document.getElementById('prod-bad-card').style.display = 'block';
            } else {
                document.getElementById('prod-bad-card').style.display = 'none';
            }
        }

        if (othersList) {
            othersList.innerHTML = otherItems.map(createIngItem).join('');
            othersList.style.display = 'none'; // Collapsed by default
        }


        // 5. Tip Card
        const tipText = document.getElementById('prod-tip-text');
        if (tipText) {
            if (isGood) {
                tipText.innerText = "This formula contains great actives! Don't forget to use sunscreen if using this in your AM routine.";
            } else if (isWarn) {
                tipText.innerText = "Try a small patch test on your jawline for 24 hours before applying it to your entire face.";
            } else {
                tipText.innerText = "Consider a gentler alternative. If you still want to try it, pair it with a very basic, soothing moisturizer.";
            }
        }

        // 6. Show the state
        showAnalyzerSubStateSB('prod', 'results');

    } catch (err) {
        console.error("Error rendering product results:", err);
        showToast("Error displaying results: " + err.message);
        showAnalyzerSubStateSB('prod', 'input');
    }
}

function toggleIngredientsCollapse() {
    const list = document.getElementById('prod-others-list');
    const toggle = document.querySelector('.collapse-toggle span');
    if (!list || !toggle) return;

    if (list.style.display === 'none') {
        list.style.display = 'flex';
        toggle.innerHTML = `Hide ingredients <i class="fa-solid fa-chevron-up ml-1"></i>`;
    } else {
        list.style.display = 'none';
        toggle.innerHTML = `See all ingredients <i class="fa-solid fa-chevron-down ml-1"></i>`;
    }
}


function renderScanHistory() {
    const gallery = document.getElementById('timeline-gallery-grid-skinbiee');
    if (!gallery) return;

    if (state.userId == null) {
        gallery.innerHTML = '<div class="text-center py-5 text-muted" style="grid-column: 1/-1;">Sign in to view your scan history.</div>';
        return;
    }

    fetch(`${API_BASE_URL}/api/user/data?user_id=${state.userId}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                plannerState.scans = data.scans.map(s => ({
                    ...s,
                    img: s.image_path, 
                    date: s.timestamp ? s.timestamp.split(' ')[0] : 'Today',
                    type: s.condition === 'Product Scan' ? 'product' : 'face'
                }));
                
                if (plannerState.scans.length === 0) {
                    gallery.innerHTML = '<div class="text-center py-5 text-muted" style="grid-column: 1/-1;">No scans saved yet. <br> Finish an analysis to see it here!</div>';
                    return;
                }

                gallery.innerHTML = plannerState.scans.map(item => {
                    const summary = (item.type === 'face' && item.condition) 
                        ? `${item.severity || ''} ${item.condition}` 
                        : "Product Scan";
                        
                    return `
                        <div class="gallery-item" onclick="showToast('Viewing scan from ${item.date}')">
                            <img src="${item.img || 'assets/scan-face.png'}" alt="Scan History">
                            <div class="gallery-date">${item.date}</div>
                            <div class="gallery-label">${summary}</div>
                        </div>
                    `;
                }).join('');
            }
        })
        .catch(err => {
            console.error("Failed to fetch scan history:", err);
            if (plannerState.scans.length === 0) {
                gallery.innerHTML = '<div class="text-center py-5 text-muted" style="grid-column: 1/-1;">No scans saved yet.</div>';
            }
        });
}
function resetAnalyzer() {
    showAnalyzerSubStateSB('skin', 'input');
    showAnalyzerSubStateSB('prod', 'input');

    // Reset animation classes so they can re-trigger on next scan
    const skinList = document.getElementById('skin-concerns-list-sb');
    if (skinList) skinList.classList.remove('result-card-entry');
    const prodDesc = document.getElementById('prod-result-desc-sb');
    if (prodDesc) prodDesc.classList.remove('result-card-entry');
}

function openAnalyzerDetail(subViewId) {
    const dashboard = document.getElementById('analyzer-main-dashboard');
    const detailView = document.getElementById('analyzer-detail-view');
    
    if (dashboard) dashboard.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
    
    document.querySelectorAll('.sub-view').forEach(v => v.style.display = 'none');
    
    const targetView = document.getElementById(subViewId);
    if (targetView) {
        targetView.style.display = 'block';
        if (subViewId === 'sub-timeline') renderScanHistory();
        if (subViewId === 'sub-skin-analysis') resetAnalyzer();
        if (subViewId === 'sub-ingredient-scanner') {
            const ingResults = document.getElementById('ing-results-state-sb');
            const ingInput = document.getElementById('ing-input-state-sb');
            if (ingResults) ingResults.style.display = 'none';
            if (ingInput) ingInput.style.display = 'block';
        }
    }
}

function closeAnalyzerDetail() {
    const dashboard = document.getElementById('analyzer-main-dashboard');
    const detailView = document.getElementById('analyzer-detail-view');
    if (dashboard) dashboard.style.display = 'flex';
    if (detailView) detailView.style.display = 'none';
    triggerMascotAnim('idle');
}

/* ==========================================================================
   TAB: PLANNER (FULL REBUILD – Skinbiee Spec)
   ========================================================================== */
let plannerState = {
    plannerOnboardingDone: false,
    morningRoutine: [],
    nightRoutine: [],
    amDoneToday: false,
    pmDoneToday: false,
    streak: 0,
    scans: [],
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    // Onboarding
    obStep: 0,
    obAnswers: {},
    // Editor context
    editingRoutineType: null, // 'morning' | 'night'
    // Checklist context
    checklistType: null // 'morning' | 'night'
};

/* ── 10 Fixed Planner Questions ───────────────────────────────────────── */
const plannerQuestions = [
    { id: 'skinType',      q: 'What is your skin type?',                              options: ['Oily','Dry','Combination','Sensitive','Not sure'] },
    { id: 'concern',       q: 'What is your primary skin concern?',                   options: ['Acne','Pimples','Dark spots','Pigmentation','Dryness','Dull skin','Fine lines','Aging','No major concerns'] },
    { id: 'currentRoutine',q: 'Do you currently follow a skincare routine?',           options: ['Yes (basic)','Yes (advanced)','No'] },
    { id: 'sensitivity',   q: 'How sensitive is your skin?',                           options: ['Not sensitive','Slightly sensitive','Very sensitive'] },
    { id: 'breakouts',     q: 'Do you experience frequent breakouts?',                 options: ['Yes','Occasionally','No'] },
    { id: 'timeWilling',   q: 'How much time are you willing to spend on skincare?',   options: ['Minimal (2–3 steps)','Moderate (3–5 steps)','Detailed (5+ steps)'] },
    { id: 'routineStyle',  q: 'Do you prefer simple or targeted routines?',            options: ['Simple (basic care only)','Targeted (treat specific concerns)'] },
    { id: 'sunExposure',   q: 'Are you exposed to sunlight regularly?',                options: ['Yes (daily outdoor)','Sometimes','Rarely'] },
    { id: 'serums',        q: 'Do you want to include treatment products like serums?', options: ['Yes','No','Not sure'] },
    { id: 'allergies',     q: 'Any known allergies or product reactions?',              options: ['Yes','No'] }
];

/* ── Storage Helpers ──────────────────────────────────────────────────── */
function syncPlannerStateFromStorage() {
    plannerState.plannerOnboardingDone = safeLS.get(userStorageKey('planner-ob-done')) === 'true';
    try { plannerState.morningRoutine = JSON.parse(safeLS.get(userStorageKey('planner-morning-routine')) || 'null') || []; } catch(_) { plannerState.morningRoutine = []; }
    try { plannerState.nightRoutine = JSON.parse(safeLS.get(userStorageKey('planner-night-routine')) || 'null') || []; } catch(_) { plannerState.nightRoutine = []; }
    // Legacy compat
    if (!plannerState.morningRoutine.length && !plannerState.nightRoutine.length) {
        try {
            const old = JSON.parse(safeLS.get(userStorageKey('planner-routine')) || 'null');
            if (Array.isArray(old) && old.length) {
                plannerState.morningRoutine = old;
                plannerState.nightRoutine = old;
            }
        } catch(_) {}
    }
    // Also check legacy hasSetup
    if (!plannerState.plannerOnboardingDone && safeLS.get(userStorageKey('planner-has-setup')) === 'true') {
        plannerState.plannerOnboardingDone = true;
        safeLS.set(userStorageKey('planner-ob-done'), 'true');
    }
    plannerState.streak = parseInt(safeLS.get(userStorageKey('planner-streak')) || '0', 10) || 0;
    try { plannerState.scans = JSON.parse(safeLS.get(userStorageKey('planner-scans')) || '[]'); } catch(_) { plannerState.scans = []; }
    plannerState.currentMonth = new Date().getMonth();
    plannerState.currentYear = new Date().getFullYear();
    state.streak = plannerState.streak;

    // Today's completion status
    const todayKey = getLocalDateKey();
    plannerState.amDoneToday = safeLS.get(userStorageKey('planner-am-done-date')) === todayKey;
    plannerState.pmDoneToday = safeLS.get(userStorageKey('planner-pm-done-date')) === todayKey;
}

function saveMorningRoutine() { safeLS.set(userStorageKey('planner-morning-routine'), JSON.stringify(plannerState.morningRoutine)); }
function saveNightRoutine() { safeLS.set(userStorageKey('planner-night-routine'), JSON.stringify(plannerState.nightRoutine)); }

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function checkStreakMaintenance() {
    const lastAM = safeLS.get(userStorageKey('planner-am-done-date')) || '';
    const lastPM = safeLS.get(userStorageKey('planner-pm-done-date')) || '';
    const lastDone = lastAM > lastPM ? lastAM : lastPM;
    if (!lastDone) return;
    const todayStr = getLocalDateKey();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateKey(yesterday);
    if (lastDone !== todayStr && lastDone !== yesterdayStr) {
        plannerState.streak = 0;
        safeLS.set(userStorageKey('planner-streak'), '0');
    }
}

/* ── Main Setup Entry Point ───────────────────────────────────────────── */
function setupPlanner() {
    syncPlannerStateFromStorage();
    checkStreakMaintenance();
    plannerState.streak = parseInt(safeLS.get(userStorageKey('planner-streak')) || '0', 10) || 0;
    state.streak = plannerState.streak;

    const obOverlay = document.getElementById('planner-onboarding-overlay');
    const mainDash = document.getElementById('planner-main-dashboard');
    const checklistOl = document.getElementById('routine-checklist-overlay');
    const editorOl = document.getElementById('routine-editor-overlay');

    // Hide overlays
    if (checklistOl) checklistOl.style.display = 'none';
    if (editorOl) editorOl.style.display = 'none';

    if (!plannerState.plannerOnboardingDone) {
        // Show onboarding
        if (obOverlay) obOverlay.style.display = 'block';
        if (mainDash) mainDash.style.display = 'none';
        // Show welcome screen
        hideAllPlannerObScreens();
        const welcome = document.getElementById('planner-ob-welcome');
        if (welcome) welcome.style.display = 'flex';
    } else {
        // Show main dashboard
        if (obOverlay) obOverlay.style.display = 'none';
        if (mainDash) mainDash.style.display = 'block';
        renderPlannerDashboard();
    }
}

function hideAllPlannerObScreens() {
    ['planner-ob-welcome','planner-ob-questions','planner-ob-reveal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
}

/* ── Planner Onboarding (10 Questions) ────────────────────────────────── */
function startPlannerOnboarding() {
    hideAllPlannerObScreens();
    plannerState.obStep = 0;
    plannerState.obAnswers = {};
    const qScreen = document.getElementById('planner-ob-questions');
    if (qScreen) qScreen.style.display = 'flex';
    renderPlannerObQuestion();
}

function renderPlannerObQuestion() {
    const area = document.getElementById('planner-ob-question-area');
    const step = plannerQuestions[plannerState.obStep];
    const progress = ((plannerState.obStep + 1) / plannerQuestions.length) * 100;
    const bar = document.getElementById('planner-ob-progress');
    if (bar) bar.style.setProperty('--progress', `${progress}%`);

    let html = `<p class="micro-text text-muted mb-1">Question ${plannerState.obStep + 1} of ${plannerQuestions.length}</p>`;
    html += `<h2 class="mb-4">${step.q}</h2>`;
    html += `<div class="options-list">`;
    step.options.forEach(opt => {
        html += `<div class="option-pill" onclick="selectPlannerObOption('${step.id}', '${opt.replace(/'/g, "\\'")}')"><span>${opt}</span><i class="fa-solid fa-chevron-right micro-text text-muted"></i></div>`;
    });
    html += `</div>`;
    if (area) area.innerHTML = html;
}

function selectPlannerObOption(qId, val) {
    plannerState.obAnswers[qId] = val;
    if (plannerState.obStep < plannerQuestions.length - 1) {
        plannerState.obStep++;
        renderPlannerObQuestion();
    } else {
        // All answered — generate routines and show reveal
        generateRoutinesFromAnswers();
        showRoutineReveal();
    }
}

/* ── Routine Generation Engine ────────────────────────────────────────── */
function generateRoutinesFromAnswers() {
    const a = plannerState.obAnswers;
    const morning = ['Cleanser'];
    const night = ['Cleanser'];

    const skinType = (a.skinType || '').toLowerCase();
    const concern = (a.concern || '').toLowerCase();
    const timeWilling = (a.timeWilling || '').toLowerCase();
    const routineStyle = (a.routineStyle || '').toLowerCase();
    const wantsSerums = (a.serums || '').toLowerCase();
    const breakouts = (a.breakouts || '').toLowerCase();

    const isMinimal = timeWilling.includes('minimal');
    const isDetailed = timeWilling.includes('detailed');
    const isTargeted = routineStyle.includes('targeted');

    // Moisturizer — add if dry skin or if not strictly minimal
    if (skinType === 'dry' || skinType === 'combination' || !isMinimal) {
        morning.push('Moisturizer');
        night.push('Moisturizer');
    }

    // Serum — add if user wants glow/dullness/targeted or said yes to serums
    if (concern.includes('dull') || concern.includes('glow') || wantsSerums === 'yes' || isTargeted) {
        if (!isMinimal || wantsSerums === 'yes') {
            morning.push('Serum');
            night.push('Serum');
        }
    }

    // Spot treatment — add if acne, breakouts, dark spots, pimples, pigmentation
    const needsSpotTreatment = ['acne','pimples','dark spots','pigmentation'].some(c => concern.includes(c))
        || breakouts === 'yes' || breakouts === 'occasionally';
    if (needsSpotTreatment && (isTargeted || !isMinimal)) {
        night.push('Spot Treatment');
    }

    // Extra steps for detailed routine
    if (isDetailed) {
        if (!morning.includes('Serum')) morning.splice(morning.length, 0, 'Serum');
        if (!night.includes('Serum')) night.splice(night.length - (night.includes('Spot Treatment') ? 1 : 0), 0, 'Serum');
        morning.splice(1, 0, 'Toner');
        night.splice(1, 0, 'Toner');
    }

    // Morning must end with Sunscreen
    morning.push('Sunscreen');

    plannerState.morningRoutine = morning;
    plannerState.nightRoutine = night;
    saveMorningRoutine();
    saveNightRoutine();
}

function showRoutineReveal() {
    hideAllPlannerObScreens();
    const reveal = document.getElementById('planner-ob-reveal');
    if (reveal) reveal.style.display = 'flex';

    const morningList = document.getElementById('reveal-morning-steps');
    const nightList = document.getElementById('reveal-night-steps');

    if (morningList) morningList.innerHTML = plannerState.morningRoutine.map(s => `<li>${s}</li>`).join('');
    if (nightList) nightList.innerHTML = plannerState.nightRoutine.map(s => `<li>${s}</li>`).join('');
}

function finishPlannerOnboarding() {
    plannerState.plannerOnboardingDone = true;
    safeLS.set(userStorageKey('planner-ob-done'), 'true');
    // Also set legacy flag for compat
    safeLS.set(userStorageKey('planner-has-setup'), 'true');
    try { safeLS.set(userStorageKey('planner-ob-answers'), JSON.stringify(plannerState.obAnswers)); } catch(_) {}
    setupPlanner();
}

/* ── Main Dashboard Rendering ─────────────────────────────────────────── */
function renderPlannerDashboard() {
    const sBadge = document.getElementById('streak-count');
    const homeStreakEl = document.getElementById('home-streak-count');
    if (sBadge) sBadge.textContent = `${plannerState.streak} Day Streak`;
    if (homeStreakEl) homeStreakEl.textContent = plannerState.streak;

    renderPlannerCalendar();
    renderMorningCard();
    renderNightCard();
    updateBlurStates();
}

function renderMorningCard() {
    const list = document.getElementById('morning-routine-list');
    if (list) {
        list.innerHTML = plannerState.morningRoutine.map(item =>
            `<li><i class="fa-solid fa-check blue-check"></i> <span>${item}</span></li>`
        ).join('');
    }
}

function renderNightCard() {
    const list = document.getElementById('night-routine-list');
    if (list) {
        list.innerHTML = plannerState.nightRoutine.map(item =>
            `<li><i class="fa-solid fa-check blue-check"></i> <span>${item}</span></li>`
        ).join('');
    }
}

function updateBlurStates() {
    const todayKey = getLocalDateKey();
    plannerState.amDoneToday = safeLS.get(userStorageKey('planner-am-done-date')) === todayKey;
    plannerState.pmDoneToday = safeLS.get(userStorageKey('planner-pm-done-date')) === todayKey;

    const morningBlur = document.getElementById('morning-blur-overlay');
    const nightBlur = document.getElementById('night-blur-overlay');

    if (morningBlur) morningBlur.style.display = plannerState.amDoneToday ? 'none' : 'flex';
    if (nightBlur) nightBlur.style.display = plannerState.pmDoneToday ? 'none' : 'flex';
}

/* ── Checklist Flow ───────────────────────────────────────────────────── */
function startRoutineChecklist(type) {
    plannerState.checklistType = type;
    const overlay = document.getElementById('routine-checklist-overlay');
    const title = document.getElementById('checklist-title');
    const subtitle = document.getElementById('checklist-subtitle');

    if (title) title.textContent = "Today's Routine";
    if (subtitle) subtitle.textContent = type === 'morning' ? 'Morning Routine' : 'Night Routine';

    renderChecklistItems(type);
    if (overlay) overlay.style.display = 'flex';
}

function renderChecklistItems(type) {
    const list = document.getElementById('routine-checklist-items');
    const routine = type === 'morning' ? plannerState.morningRoutine : plannerState.nightRoutine;
    if (list) {
        list.innerHTML = routine.map((item, i) => `
            <div class="daily-row" onclick="this.classList.toggle('checked'); checkAllDone();">
                <span class="bold">${item}</span>
                <div class="row-check"><i class="fa-solid fa-check"></i></div>
            </div>
        `).join('');
    }
    // Reset camera area
    const cam = document.getElementById('checklist-camera-area');
    if (cam) cam.style.display = 'none';
}

function checkAllDone() {
    const all = document.querySelectorAll('#routine-checklist-items .daily-row');
    const checked = document.querySelectorAll('#routine-checklist-items .daily-row.checked');
    const cameraArea = document.getElementById('checklist-camera-area');
    if (cameraArea) cameraArea.style.display = (checked.length === all.length && all.length > 0) ? 'block' : 'none';
}

async function finishChecklist() {
    const type = plannerState.checklistType;
    if (!type) return;

    const todayKey = getLocalDateKey();

    // Mark this routine as done today
    if (type === 'morning') {
        plannerState.amDoneToday = true;
        safeLS.set(userStorageKey('planner-am-done-date'), todayKey);
    } else {
        plannerState.pmDoneToday = true;
        safeLS.set(userStorageKey('planner-pm-done-date'), todayKey);
    }

    // Save to server
    try {
        await saveDailyLogToServer();
        await refreshUserDataFromServer();
    } catch (err) {
        console.error('finishChecklist server sync error:', err);
        // Still allow completion locally
    }

    state.streak = plannerState.streak;

    // Close checklist overlay
    const overlay = document.getElementById('routine-checklist-overlay');
    if (overlay) overlay.style.display = 'none';

    // Update dashboard
    renderPlannerDashboard();
    showToast(type === 'morning' ? 'Morning routine completed! ☀️' : 'Night routine completed! 🌙');
}

async function saveDailyLogToServer() {
    if (state.userId == null) return;
    const fileInput = document.getElementById('selfie-upload-input');
    const file = fileInput ? fileInput.files[0] : null;

    const formData = new FormData();
    formData.append('user_id', state.userId);
    formData.append('date', getLocalDateKey());
    formData.append('am_done', plannerState.amDoneToday ? 1 : 0);
    formData.append('pm_done', plannerState.pmDoneToday ? 1 : 0);
    formData.append('skin_feeling', 'Good');
    formData.append('skin_rating', 5);
    if (file) formData.append('image', file);

    const res = await fetch(`${API_BASE_URL}/api/daily-log`, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Daily log failed');
    return data;
}

function openSelfieCamera(type) {
    const input = document.getElementById('selfie-upload-input');
    if (input) input.click();
}

function openSelfieFromChecklist() {
    const input = document.getElementById('selfie-upload-input');
    if (input) input.click();
}

function handleSelfieUpload(input) {
    if (input.files && input.files[0]) {
        showToast("Selfie saved! ✨");
    }
}

/* ── Routine Editor ───────────────────────────────────────────────────── */
function openRoutineEditor(type) {
    plannerState.editingRoutineType = type;
    const overlay = document.getElementById('routine-editor-overlay');
    const title = document.getElementById('editor-title');
    if (title) title.textContent = type === 'morning' ? 'Edit Morning Routine' : 'Edit Night Routine';
    renderEditorItems();
    if (overlay) overlay.style.display = 'block';
}

function openRoutineEditorFromChecklist() {
    openRoutineEditor(plannerState.checklistType);
}

function renderEditorItems() {
    const list = document.getElementById('editor-items-list');
    const type = plannerState.editingRoutineType;
    const routine = type === 'morning' ? plannerState.morningRoutine : plannerState.nightRoutine;
    if (list) {
        list.innerHTML = routine.map((item, i) => `
            <div class="editor-row">
                <input type="text" class="editor-input" value="${item}" onchange="updateRoutineItem('${type}', ${i}, this.value)">
                <button class="remove-step-btn" onclick="removeRoutineItem('${type}', ${i})"><i class="fa-solid fa-trash"></i></button>
            </div>
        `).join('');
    }
}

function updateRoutineItem(type, index, value) {
    if (type === 'morning') plannerState.morningRoutine[index] = value;
    else plannerState.nightRoutine[index] = value;
}

function removeRoutineItem(type, index) {
    if (type === 'morning') plannerState.morningRoutine.splice(index, 1);
    else plannerState.nightRoutine.splice(index, 1);
    renderEditorItems();
}

function addRoutineItem() {
    const type = plannerState.editingRoutineType;
    if (type === 'morning') plannerState.morningRoutine.push('New Step');
    else plannerState.nightRoutine.push('New Step');
    renderEditorItems();
}

function saveAndCloseEditor() {
    const type = plannerState.editingRoutineType;
    if (type === 'morning') saveMorningRoutine();
    else saveNightRoutine();
    closeRoutineEditor();
    renderPlannerDashboard();
    // If checklist was open, re-render
    const checklistOverlay = document.getElementById('routine-checklist-overlay');
    if (checklistOverlay && checklistOverlay.style.display !== 'none') {
        renderChecklistItems(plannerState.checklistType);
    }
    showToast('Routine saved!');
}

function closeRoutineEditor() {
    const overlay = document.getElementById('routine-editor-overlay');
    if (overlay) overlay.style.display = 'none';
}

function saveRoutine() {
    // Legacy compat — save both
    saveMorningRoutine();
    saveNightRoutine();
}

/* ── Calendar ─────────────────────────────────────────────────────────── */
function renderPlannerCalendar() {
    const grid = document.getElementById('planner-calendar-grid');
    const monthLabel = document.getElementById('calendar-month-year');
    const d = new Date(plannerState.currentYear, plannerState.currentMonth, 1);
    if (monthLabel) monthLabel.textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });

    const firstDay = d.getDay();
    const daysInMonth = new Date(plannerState.currentYear, plannerState.currentMonth + 1, 0).getDate();
    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const activeSet = state.activeDates instanceof Set ? state.activeDates : new Set();
    let html = '';

    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

    for (let i = 1; i <= daysInMonth; i++) {
        const isToday = i === today.getDate() && plannerState.currentMonth === today.getMonth() && plannerState.currentYear === today.getFullYear();
        const dateKey = getLocalDateKey(new Date(plannerState.currentYear, plannerState.currentMonth, i));
        const isFuture = dateKey > todayKey;
        let flame = '';
        if (!isFuture) {
            if (activeSet.has(dateKey)) {
                const cls = isToday ? 'active-day current' : 'active-day past';
                flame = `<i class="fa-solid fa-fire calendar-flame ${cls}" aria-hidden="true"></i>`;
            } else {
                flame = '<i class="fa-solid fa-fire calendar-flame inactive-day" aria-hidden="true"></i>';
            }
        }
        html += `<div class="cal-day${isToday ? ' today' : ''}${!isFuture && activeSet.has(dateKey) ? ' has-streak' : ''}"><span class="cal-day-num">${i}</span>${flame}</div>`;
    }
    if (grid) grid.innerHTML = html;
}

function navMonth(dir) {
    plannerState.currentMonth += dir;
    if (plannerState.currentMonth > 11) { plannerState.currentMonth = 0; plannerState.currentYear += 1; }
    else if (plannerState.currentMonth < 0) { plannerState.currentMonth = 11; plannerState.currentYear -= 1; }
    renderPlannerCalendar();
}

function openRoutineEditorOld(type) { 
    plannerState.editingRoutineType = type || 'morning';
    openRoutineEditor(plannerState.editingRoutineType); 
}
function openChecklist(type) { startRoutineChecklist(type || 'morning'); }
function openCamera(type) { openSelfieCamera(type || 'morning'); }

function setupSettings() {
    // Theme Toggles
    document.querySelectorAll('.pill[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill[data-theme]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            let theme = btn.dataset.theme;
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                state.theme = 'dark';
            } else {
                document.documentElement.removeAttribute('data-theme');
                state.theme = 'light';
            }
            safeLS.set('sc-theme', state.theme);
        });
    });

    // Pill Group Logic (Unified)
    document.querySelectorAll('.pill-group .pill').forEach(pill => {
        pill.addEventListener('click', () => {
            const group = pill.closest('.pill-group');
            if (group.classList.contains('single-select')) {
                group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
            } else {
                pill.classList.toggle('active');
            }
        });
    });

    // Color Swatch Logic
    document.querySelectorAll('.color-swatches .swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            const group = swatch.closest('.color-swatches');
            group.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
        });
    });

    // Routine Reminders Toggle
    const reminderSwitch = document.querySelector('.settings-section .switch input');
    if (reminderSwitch) {
        reminderSwitch.addEventListener('change', (e) => {
            showToast(e.target.checked ? 'Routine reminders enabled' : 'Routine reminders disabled');
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            clearSession();
            syncPlannerStateFromStorage();
            switchView('auth');
        });
    }
}
function openSettingsToOnboarding() {
    state.fromSettings = true;
    switchView('onboarding');
}

function openSettingsSubPage(pageId) {
    document.getElementById(`settings-${pageId}`).style.display = 'flex';
    
    const profile = loadUserProfile() || {};

    if (pageId === 'account-details') {
        const input = document.getElementById('profile-edit-username');
        if (input) input.value = state.username || '';
    } else if (pageId === 'skin-profile') {
        // Sync Pills from Profile
        document.querySelectorAll('#settings-skin-profile [data-profile-key]').forEach(group => {
            const key = group.dataset.profileKey;
            const savedVal = profile[key];
            if (!savedVal) return;

            if (group.classList.contains('pill-group')) {
                group.querySelectorAll('.pill').forEach(p => {
                    const isActive = Array.isArray(savedVal) ? savedVal.includes(p.dataset.val) : savedVal === p.dataset.val;
                    p.classList.toggle('active', isActive);
                });
            } else if (group.classList.contains('color-swatches')) {
                group.querySelectorAll('.swatch').forEach(s => {
                    s.classList.toggle('active', s.dataset.val === savedVal);
                });
            }
        });
    }
}

function closeSettingsSubPage(pageId) {
    document.getElementById(`settings-${pageId}`).style.display = 'none';
}

function saveSkinProfile() {
    const profile = loadUserProfile() || {};

    document.querySelectorAll('#settings-skin-profile [data-profile-key]').forEach(group => {
        const key = group.dataset.profileKey;
        if (group.classList.contains('pill-group')) {
            if (group.classList.contains('single-select')) {
                const active = group.querySelector('.pill.active');
                if (active) profile[key] = active.dataset.val;
            } else {
                const actives = Array.from(group.querySelectorAll('.pill.active')).map(p => p.dataset.val);
                profile[key] = actives;
            }
        } else if (group.classList.contains('color-swatches')) {
            const active = group.querySelector('.swatch.active');
            if (active) profile[key] = active.dataset.val;
        }
    });

    saveUserProfile(profile);
    applyUserProfile(profile);
    showToast('Skin profile updated! ✨');
    closeSettingsSubPage('skin-profile');
}

function saveAccountDetails() {
    const newName = document.getElementById('profile-edit-username').value.trim();
    if (newName) {
        state.username = newName;
        const displayNameEl = document.getElementById('user-display-name');
        if (displayNameEl) displayNameEl.textContent = newName;
        
        // Ensure profile updated too
        const profile = loadUserProfile() || {};
        profile.username = newName;
        saveUserProfile(profile);
        
        showToast('Profile updated!');
    }
    closeSettingsSubPage('account-details');
}

function executeExportData() {
    let csvRows = [];
    const profile = loadUserProfile() || {};

    // --- Section 1: User Profile ---
    csvRows.push("--- USER SKIN PROFILE ---");
    csvRows.push(`"Metric","Value"`);
    csvRows.push(`"Username","${state.username || 'Skinbiee User'}"`);
    csvRows.push(`"Current Streak","${plannerState.streak || 0} Days"`);
    csvRows.push(`"Skin Type","${profile.skinType || 'Not specified'}"`);
    csvRows.push(`"Primary Concern","${profile.concern || 'General Care'}"`);
    csvRows.push(`"Sensitivity Level","${profile.sensitive || 'Unknown'}"`);
    csvRows.push("\n");

    // --- Section 2: Daily Routine History ---
    csvRows.push("--- DAILY ROUTINE HISTORY ---");
    csvRows.push(`"Date","Morning Done","Night Done","Rating","Feeling"`);
    if (state.allLogs && state.allLogs.length > 0) {
        state.allLogs.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(log => {
            const am = log.am_done ? "YES" : "NO";
            const pm = log.pm_done ? "YES" : "NO";
            csvRows.push(`"${log.date}","${am}","${pm}","${log.skin_rating || '-'}","${log.skin_feeling || '-'}"`);
        });
    } else {
        csvRows.push(`"No daily logs found."`);
    }
    csvRows.push("\n");

    // --- Section 3: Analysis History ---
    csvRows.push("--- SCANNER & ANALYSIS HISTORY ---");
    csvRows.push(`"Date","Analysis Type","Subject/Condition","Severity/Score","Visual Reference"`);
    if (plannerState.scans && Array.isArray(plannerState.scans)) {
        plannerState.scans.forEach(item => {
            const typeLabel = item.type === 'product' ? 'Product Safety Check' : 'Skin Condition Analysis';
            const subject = item.condition || (item.type === 'product' ? (item.productName || 'Unnamed Product') : 'Unknown');
            const result = item.severity || (item.score ? `${item.score}/100` : '-');
            
            csvRows.push(`"${item.date || ''}","${typeLabel}","${subject}","${result}","${item.img || ''}"`);
        });
    } else {
        csvRows.push(`"No scan history found."`);
    }

    const csvBody = csvRows.join("\n");
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `skinbiee_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); 
    link.click();
    link.remove();
    
    showToast('Your curated data journal has been exported! ✨');
    closeSettingsSubPage('export-data');
}

function openClearDataModal() {
    document.getElementById('clear-data-modal').style.display = 'flex';
}

function closeClearDataModal() {
    document.getElementById('clear-data-modal').style.display = 'none';
}

function executeClearData() {
    localStorage.clear();
    clearSession();
    closeClearDataModal();
    showToast('All personal data cleared.');
    setTimeout(() => location.reload(), 1500);
}

function setupMascotChat() {
    const compactChat = document.getElementById('chat-panel');
    const fsChat = document.getElementById('chat-fs-panel');
    if (!floatMascotBtn || !compactChat) return;
    floatMascotBtn.addEventListener('click', () => {
        compactChat.classList.add('open');
        triggerMascotAnim('happy');
        floatMascotBtn.style.opacity = '0';
        floatMascotBtn.style.pointerEvents = 'none';
        checkProactiveGreeting();
    });
    const chatClose = document.getElementById('chat-close');
    const chatExpand = document.getElementById('chat-expand');
    const chatFsCollapse = document.getElementById('chat-fs-collapse');
    if (chatClose) {
        chatClose.addEventListener('click', () => {
            compactChat.classList.remove('open');
            setTimeout(() => {
                floatMascotBtn.style.opacity = '1';
                floatMascotBtn.style.pointerEvents = 'auto';
                triggerMascotAnim('idle');
            }, 400);
        });
    }
    if (chatExpand && fsChat) {
        chatExpand.addEventListener('click', () => {
            compactChat.classList.remove('open');
            fsChat.style.display = 'flex';
            if (bottomNav) bottomNav.style.display = 'none';
            if (topBar) topBar.style.display = 'none';
        });
    }
    if (chatFsCollapse && fsChat) {
        chatFsCollapse.addEventListener('click', () => {
            fsChat.style.display = 'none';
            compactChat.classList.add('open');
            if (bottomNav) bottomNav.style.display = 'flex';
            if (topBar) topBar.style.display = 'flex';
        });
    }
    setupChatInputs();
}

function setupChatInputs() {
    const ids = [{ input: 'chat-input-compact', btn: 'chat-send-compact' }, { input: 'chat-input-fs', btn: 'chat-send-fs' }];
    ids.forEach(pair => {
        const inputEl = document.getElementById(pair.input);
        const btnEl = document.getElementById(pair.btn);
        if (btnEl && inputEl) {
            btnEl.onclick = () => handleChatSend(pair.input);
            inputEl.onkeypress = (e) => { if (e.key === 'Enter') handleChatSend(pair.input); };
        }
    });
}

function handleChatSend(inputId) {
    const inputEl = document.getElementById(inputId);
    const text = inputEl.value.trim();
    if (!text) return;
    document.getElementById('chat-input-compact').value = '';
    document.getElementById('chat-input-fs').value = '';
    appendChatMessage('user', text);
    triggerMascotAnim('thinking');
    setTimeout(() => {
        const response = getMascotAIResponse(text);
        appendChatMessage('mascot', response);
        triggerMascotAnim('happy');
    }, 1000);
}

function appendChatMessage(sender, text) {
    const containers = [document.getElementById('chat-history-compact'), document.getElementById('chat-history-fs')];
    containers.forEach(container => {
        if (!container) return;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${sender}-bubble`;
        bubble.textContent = text;
        container.appendChild(bubble);
        setTimeout(() => { container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }); }, 100);
    });
}

function checkProactiveGreeting() {
    const history = document.getElementById('chat-history-compact');
    if (history && history.children.length <= 1) {
        let msg = `Hey ${state.username}! I was just looking at your skin journey... `;
        if (state.view === 'analyzer') msg += "That last scan looked interesting. Want to dive into what those results mean for your routine? 🔬";
        else if (state.view === 'planner') msg += `You're on a ${state.streak} day streak! I'm so proud of you. Let's keep it going today! 🔥`;
        else msg += "You're doing great! Anything specific you want to chat about? I'm all ears! 💖";
        setTimeout(() => appendChatMessage('mascot', msg), 500);
    }
}

function getMascotAIResponse(input) {
    const low = input.toLowerCase();
    const name = state.username || "bestie";
    if (low.includes('hi') || low.includes('hello') || low.includes('hey')) return `Hey ${name}! How's your skin feeling today? ✨`;
    if (low.includes('dry')) return `Ugh, dry skin is the worst! 🥺 Maybe focus on a thick moisturizer tonight?`;
    if (low.includes('breakout')) return `Oh no, I'm sorry! 🥺 Let's keep it simple today — lots of water and soothing care!`;
    return `That's interesting! I'm always here to listen and help! 🌸`;
}

function triggerMascotAnim(animType) {
    const mascots = document.querySelectorAll('.mascot-blob');
    mascots.forEach(m => {
        m.classList.remove('idle', 'happy', 'thinking', 'surprised', 'sad');
        m.classList.add(animType);
    });
    if (animType === 'happy' || animType === 'surprised') {
        setTimeout(() => {
            mascots.forEach(m => {
                m.classList.remove(animType);
                if (!m.classList.contains('thinking')) m.classList.add('idle');
            });
        }, 2000);
    }
}

function showLoading(msg) {
    const overlay = document.getElementById('loading-overlay');
    const textEl = overlay.querySelector('.loading-text');
    if (textEl) {
        if (msg) textEl.textContent = msg;
        else textEl.textContent = 'Analyzing...';
    }
    overlay.style.display = 'flex';
}
function hideLoading() { document.getElementById('loading-overlay').style.display = 'none'; }
function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => { toast.style.animation = 'slideDownToast 0.3s reverse forwards'; setTimeout(() => toast.remove(), 300); }, 2500);
}

window.addEventListener('DOMContentLoaded', init);
document.addEventListener('click', (e) => {
    if (e.target.closest('#home-mascot')) {
        triggerMascotAnim('happy');
        setTimeout(() => { triggerMascotAnim('idle'); }, 800);
    }
});

/* ==========================================================================
   PWA INTEGRATION LOGIC
   ========================================================================== */
let deferredPrompt;

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then((reg) => {
            console.log('PWA SW registered:', reg.scope);
        }).catch((err) => {
            console.log('PWA SW registration failed:', err);
        });
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show custom modal after 4 seconds of entering the app
    setTimeout(() => {
        const pwaModal = document.getElementById('pwa-install-overlay');
        if (pwaModal) pwaModal.style.display = 'flex';
    }, 4000);
});

const pwaInstallBtn = document.getElementById('pwa-install-btn');
if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
        const pwaModal = document.getElementById('pwa-install-overlay');
        if (pwaModal) pwaModal.style.display = 'none';
        
        if (deferredPrompt) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`Install prompt outcome: ${outcome}`);
            deferredPrompt = null;
        }
    });
}

window.addEventListener('appinstalled', (evt) => {
    console.log('Skinbiee was installed to Home Screen successfully!');
});

// iOS Safari detection and manual install banner
const isIos = () => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(userAgent);
};
const isInStandaloneMode = () => ('standalone' in window.navigator) && (window.navigator.standalone);

if (isIos() && !isInStandaloneMode()) {
    setTimeout(() => {
        const iosBanner = document.getElementById('ios-install-banner');
        if (iosBanner) iosBanner.style.display = 'block';
    }, 4000);
}
