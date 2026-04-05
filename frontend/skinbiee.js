const API_BASE_URL = "http://localhost:5000";

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
    localStorage.setItem('sc-user-id', String(userId));
    localStorage.setItem('sc-username', username);
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = username;
}

function clearSession() {
    state.userId = null;
    state.username = '';
    state.activeDates = new Set();
    localStorage.removeItem('sc-user-id');
    localStorage.removeItem('sc-username');
}

function restoreSession() {
    const raw = localStorage.getItem('sc-user-id');
    const uid = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(uid) || uid < 1) {
        state.userId = null;
        return false;
    }
    state.userId = uid;
    state.username = localStorage.getItem('sc-username') || '';
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
        if (typeof data.streak === 'number') {
            plannerState.streak = data.streak;
            state.streak = data.streak;
            localStorage.setItem(userStorageKey('planner-streak'), String(data.streak));
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
    const hadSession = restoreSession();
    syncPlannerStateFromStorage();

    const savedTheme = localStorage.getItem('sc-theme');
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

function switchTab(viewName) {
    switchView(viewName);
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
    localStorage.setItem('sc-theme', state.theme);

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
    localStorage.setItem(profileStorageKey(), JSON.stringify(profile));
}

function loadUserProfile() {
    let raw = localStorage.getItem(profileStorageKey());
    if (!raw && state.userId != null) {
        raw = localStorage.getItem('sc-user-profile');
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

            if (isSignup) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: uname, password })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                        showToast(data.error || 'Could not create account.');
                        return;
                    }
                    persistSession(data.user_id, data.username);
                    syncPlannerStateFromStorage();
                    switchView('onboarding');
                } catch (err) {
                    console.error(err);
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
            if (e.target.classList.contains('pill')) {
                group.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
            }
        });
    });

    document.querySelectorAll('.pill-group.multi-select').forEach(group => {
        group.addEventListener('click', (e) => {
            if (e.target.classList.contains('pill')) {
                e.target.classList.toggle('active');
            }
        });
    });

    if (activesToggle) {
        activesToggle.addEventListener('click', (e) => {
            if (e.target.classList.contains('pill')) {
                const val = e.target.dataset.val;
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
                    localStorage.setItem(userStorageKey('planner-scans'), JSON.stringify(plannerState.scans));

                    renderSkinResultsSB(data.results, previewUrl);
                    showAnalyzerSubStateSB('skin', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Analysis failed: " + (data.error || 'Unknown error'));
                    showAnalyzerSubStateSB('skin', 'input');
                }
            } catch (err) {
                console.error("DEBUG: FETCH ERROR:", err);
                showToast("Connection Error: Is the AI Server running?");
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
                showToast("Mascot is scanning your product... 🧴");
                const response = await fetch(`${API_BASE_URL}/api/analyze-product`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

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
                    localStorage.setItem(userStorageKey('planner-scans'), JSON.stringify(plannerState.scans));

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
                states.results.style.display = 'block';
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
function renderProdResultsSB(data) {
    try {
        const analysis   = data.analysis   || {};
        const breakdown  = data.ingredient_breakdown || [];
        const skinCond   = data.skin_condition || 'general';

    // Pull good/bad from breakdown (preferred) or legacy analysis lists
    const goodItems = breakdown.filter(i => i.rating === 'good');
    const badItems  = breakdown.filter(i => i.rating === 'bad');
    const neutralItems = breakdown.filter(i => i.rating === 'neutral');

    // Also accept legacy list format (strings or {name} objects) when no breakdown
    const legacyGoodNames = (analysis.good_ingredients || []).map(g => typeof g === 'string' ? g : g.name || '');
    const legacyBadNames  = (analysis.bad_ingredients  || []).map(b => typeof b === 'string' ? b : b.name || '');

    const isGood = analysis.recommendation === 'Good Fit' || analysis.recommendation?.includes('Good');
    const isWarn = analysis.recommendation === 'Acceptable' || analysis.recommendation?.includes('Acceptable');
    const scoreRaw = typeof analysis.score === 'number' ? analysis.score : (isGood ? 75 : isWarn ? 50 : 30);
    const scorePct = Math.min(100, Math.max(0, scoreRaw));

    // ── DOM refs ─────────────────────────────────────────────────────────────
    const title         = document.getElementById('prod-result-title-sb') || document.getElementById('prod-result-title');
    const scoreBadge    = document.getElementById('prod-score-badge-sb')  || document.getElementById('prod-score-badge');
    const desc          = document.getElementById('prod-result-desc-sb')  || document.getElementById('prod-result-desc');
    const ingredientsBox= document.getElementById('prod-ingredients-text-sb') || document.getElementById('prod-ingredients-text');

    // ── Section 1: Verdict headline ──────────────────────────────────────────
    const headlineEmoji = isGood ? '🌟' : isWarn ? '🌿' : '🚫';
    const headlineText  = isGood ? 'Good Match' : isWarn ? 'Use With Caution' : 'Not Recommended';
    const condLabel     = skinCond.replace(/_/g, ' ');
    const verdictSub    = isGood
        ? `This product looks great for your ${condLabel} skin.`
        : isWarn
        ? `Some ingredients may not suit your ${condLabel} skin.`
        : `This product has ingredients that can irritate ${condLabel} skin.`;

    const barColor = isGood ? '#6bcb77' : isWarn ? '#ffd93d' : '#ff6b6b';

    if (title) {
        title.innerHTML = `<span class="prod-verdict-emoji">${headlineEmoji}</span> ${headlineText}`;
    }
    if (scoreBadge) {
        scoreBadge.innerHTML = `
            <p class="prod-verdict-sub">${verdictSub}</p>
            <div class="score-bar-wrap">
                <div class="score-bar-track">
                    <div class="score-bar-fill" style="width:${scorePct}%;background:${barColor};"></div>
                </div>
                <span class="score-bar-label" style="color:${barColor}">${scorePct}/100</span>
            </div>`;
    }

    // ── Section 2: Three buckets ─────────────────────────────────────────────
    function ingCard(item, legacyName) {
        const name     = item ? item.name     : (legacyName || '—');
        const category = item ? item.category : '';
        const rawReason= item ? item.reason   : '';
        const rating   = item ? item.rating   : 'neutral';
        const friendly = _friendlyReason(rawReason, name);
        const catLabel = category ? `<span class="ing-tag">${category}</span>` : '';
        return `
        <div class="ing-bucket-card">
            <div class="ing-bucket-card-top">
                <strong class="ing-name">${name}</strong>${catLabel}
            </div>
            <p class="ing-friendly-reason">${friendly}</p>
        </div>`;
    }

    let section2 = '';
    const hasGood    = goodItems.length > 0 || legacyGoodNames.length > 0;
    const hasBad     = badItems.length  > 0 || legacyBadNames.length  > 0;
    const hasNeutral = neutralItems.length > 0;

    if (hasGood) {
        const cards = goodItems.length > 0
            ? goodItems.map(i => ingCard(i, null)).join('')
            : legacyGoodNames.map(n => ingCard(null, n)).join('');
        section2 += `
        <div class="ing-bucket good-bucket">
            <div class="ing-bucket-header">🌸 Works for your skin <span class="ing-count">${goodItems.length || legacyGoodNames.length}</span></div>
            <div class="ing-bucket-body">${cards}</div>
        </div>`;
    }
    if (hasBad) {
        const cards = badItems.length > 0
            ? badItems.map(i => ingCard(i, null)).join('')
            : legacyBadNames.map(n => ingCard(null, n)).join('');
        section2 += `
        <div class="ing-bucket bad-bucket">
            <div class="ing-bucket-header">💀 Watch out for these <span class="ing-count">${badItems.length || legacyBadNames.length}</span></div>
            <div class="ing-bucket-body">${cards}</div>
        </div>`;
    }
    if (!hasGood && !hasBad) {
        section2 = `<p class="micro-text text-muted text-center" style="padding:16px 0">No notably good or bad ingredients were detected for your skin type.</p>`;
    }
    if (hasNeutral) {
        const cards = neutralItems.map(i => ingCard(i, null)).join('');
        section2 += `
        <div class="ing-bucket neutral-bucket">
            <button class="ing-toggle-btn" onclick="this.nextElementSibling.classList.toggle('open');this.textContent=this.nextElementSibling.classList.contains('open')?'🫧 Everything else — hide ▲':'🫧 Everything else — see all ▾'">
                🫧 Everything else — see all ▾
            </button>
            <div class="ing-bucket-body neutral-body">${cards}</div>
        </div>`;
    }

    // ── Section 3: Tip ───────────────────────────────────────────────────────
    const badNames = badItems.map(i => i.name).concat(legacyBadNames);
    const tipText  = _productTip(isGood, isWarn, badNames, skinCond);

    if (desc) {
        desc.innerHTML = `
        <div class="prod-result-card result-card-entry">
            ${section2}
            <div class="prod-tip-box">
                <span class="prod-tip-icon">💡</span>
                <p class="prod-tip-text">${tipText}</p>
            </div>
        </div>`;
    }

    // Detected ingredients (collapsed raw list — still shown below for reference)
    if (ingredientsBox) {
        const list = data.ingredients_detected?.length
            ? data.ingredients_detected
            : data.ingredients
            ? [data.ingredients]
            : [];
        ingredientsBox.textContent = list.length ? list.join(', ') : 'No ingredient text extracted.';
    }
    } catch (e) {
        console.error("UI RENDER CRASH:", e);
        showToast("Error displaying results: " + e.message);
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
   TAB: PLANNER (REBUILT FOR SKINBIEE)
   ========================================================================== */
let plannerState = {
    hasSetup: false,
    routine: ['Cleanser', 'Moisturizer'],
    dailyDone: false,
    streak: 0,
    scans: [],
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    setupStep: 0,
    answers: {}
};

function syncPlannerStateFromStorage() {
    plannerState.hasSetup = localStorage.getItem(userStorageKey('planner-has-setup')) === 'true';
    let routine = null;
    try {
        routine = JSON.parse(localStorage.getItem(userStorageKey('planner-routine')) || 'null');
    } catch (_) {}
    plannerState.routine = Array.isArray(routine) && routine.length ? routine : ['Cleanser', 'Moisturizer'];
    plannerState.streak = parseInt(localStorage.getItem(userStorageKey('planner-streak')) || '0', 10) || 0;
    try {
        plannerState.scans = JSON.parse(localStorage.getItem(userStorageKey('planner-scans')) || '[]');
    } catch (_) {
        plannerState.scans = [];
    }
    plannerState.currentMonth = new Date().getMonth();
    plannerState.currentYear = new Date().getFullYear();
    state.streak = plannerState.streak;
}

const setupQuestions = [
    { id: 'skinType', q: "What is your skin type?", options: ["Oily", "Dry", "Combination", "Sensitive"] },
    { id: 'concern', q: "What is your main concern?", options: ["Acne", "Glow", "Dark Spots", "Anti-aging"] },
    { id: 'level', q: "Your routine level?", options: ["Basic", "Advanced"] },
    { id: 'prefs', q: "Any preferences?", type: "tags", options: ["Organic", "Fragrance-free", "Vegan", "Budget-friendly"] },
    { id: 'notes', q: "Anything else we should know?", type: "text" }
];

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getPlannerLastDoneKey() {
    return localStorage.getItem(userStorageKey('planner-last-completed-date')) || localStorage.getItem(userStorageKey('planner-daily-done'));
}

function checkStreakMaintenance() {
    const lastDone = getPlannerLastDoneKey();
    if (!lastDone) return;
    const todayStr = getLocalDateKey();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateKey(yesterday);
    if (lastDone !== todayStr && lastDone !== yesterdayStr) {
        plannerState.streak = 0;
        localStorage.setItem(userStorageKey('planner-streak'), '0');
    }
}

function setupPlanner() {
    syncPlannerStateFromStorage();
    checkStreakMaintenance();
    plannerState.streak = parseInt(localStorage.getItem(userStorageKey('planner-streak')) || '0', 10) || 0;
    plannerState.dailyDone = getPlannerLastDoneKey() === getLocalDateKey();
    state.streak = plannerState.streak;

    const overlayContainer = document.getElementById('planner-overlay-container');
    const mainDashboard = document.getElementById('planner-main-dashboard');
    const editorOverlay = document.getElementById('routine-editor-overlay');
    
    if (overlayContainer) overlayContainer.style.display = 'none';
    if (editorOverlay) editorOverlay.style.display = 'none';
    
    document.querySelectorAll('.overlay-screen').forEach(s => s.style.display = 'none');
    
    if (!plannerState.hasSetup) {
        if (overlayContainer) overlayContainer.style.display = 'block';
        if (mainDashboard) mainDashboard.style.display = 'none';
        const setupEntry = document.getElementById('setup-entry');
        if (setupEntry) setupEntry.style.display = 'flex';
    } else if (!plannerState.dailyDone) {
        if (overlayContainer) overlayContainer.style.display = 'block';
        if (mainDashboard) mainDashboard.style.display = 'none';
        const dailyEntry = document.getElementById('daily-entry');
        if (dailyEntry) dailyEntry.style.display = 'flex';
    } else {
        if (overlayContainer) overlayContainer.style.display = 'none';
        if (mainDashboard) mainDashboard.style.display = 'block';
        renderPlannerDashboard();
    }
}

function startSetup() {
    document.getElementById('setup-entry').style.display = 'none';
    document.getElementById('setup-questions').style.display = 'flex';
    plannerState.setupStep = 0;
    plannerState.answers = {};
    renderSetupQuestion();
}

function renderSetupQuestion() {
    const area = document.getElementById('question-area');
    const step = setupQuestions[plannerState.setupStep];
    const progress = ((plannerState.setupStep + 1) / setupQuestions.length) * 100;
    const progressBar = document.getElementById('setup-progress');
    if (progressBar) progressBar.style.setProperty('--progress', `${progress}%`);

    let html = `<h2 class="mb-4">${step.q}</h2>`;
    if (step.type === 'text') {
        html += `
            <textarea id="setup-text-input" class="kawaii-input" placeholder="Type here..." rows="4" style="width:100%"></textarea>
            <button class="primary-btn full-width mt-4" onclick="nextSetupStep()">Submit</button>
        `;
    } else if (step.type === 'tags') {
        html += `
            <div class="pill-group multi-select mb-4">
                ${step.options.map(opt => `<button class="pill" onclick="this.classList.toggle('active')">${opt}</button>`).join('')}
            </div>
            <button class="primary-btn full-width" onclick="nextSetupStep()">Continue</button>
        `;
    } else {
        html += `
            <div class="options-list">
                ${step.options.map(opt => `
                    <div class="option-pill" onclick="selectOption(this, '${step.id}', '${opt}')">
                        <span>${opt}</span>
                        <i class="fa-solid fa-chevron-right micro-text text-muted"></i>
                    </div>
                `).join('')}
            </div>
        `;
    }
    if (area) area.innerHTML = html;
}

function selectOption(el, qId, val) {
    plannerState.answers[qId] = val;
    nextSetupStep();
}

function nextSetupStep() {
    if (plannerState.setupStep < setupQuestions.length - 1) {
        plannerState.setupStep++;
        renderSetupQuestion();
    } else {
        finishSetup();
    }
}

function finishSetup() {
    plannerState.hasSetup = true;
    plannerState.routine = ['Morning Cleanser', 'Daily Moisturizer', 'Night Serum'];
    localStorage.setItem(userStorageKey('planner-has-setup'), 'true');
    saveRoutine();
    setupPlanner();
}

function openChecklist() {
    document.getElementById('daily-entry').style.display = 'none';
    document.getElementById('daily-checklist').style.display = 'flex';
    renderDailyItems();
}

function renderDailyItems() {
    const list = document.getElementById('daily-items-list');
    if (list) {
        list.innerHTML = plannerState.routine.map((item, i) => `
            <div class="daily-row" onclick="this.classList.toggle('checked'); checkAllDone();">
                <span class="bold">${item}</span>
                <div class="row-check"><i class="fa-solid fa-check"></i></div>
            </div>
        `).join('');
    }
    checkAllDone();
}

function checkAllDone() {
    const all = document.querySelectorAll('.daily-row');
    const checked = document.querySelectorAll('.daily-row.checked');
    const cameraArea = document.getElementById('checklist-camera-area');
    if (cameraArea) cameraArea.style.display = (checked.length === all.length) ? 'block' : 'none';
}

async function finishChecklist() {
    if (plannerState.dailyDone) {
        setupPlanner();
        return;
    }

    const todayKey = getLocalDateKey();

    try {
        await saveDailyLogToServer();
        await refreshUserDataFromServer();
    } catch (err) {
        console.error(err);
        showToast(err.message || 'Could not sync your routine. Try again.');
        return;
    }

    plannerState.dailyDone = true;
    localStorage.setItem(userStorageKey('planner-daily-done'), todayKey);
    localStorage.setItem(userStorageKey('planner-last-completed-date'), todayKey);
    state.streak = plannerState.streak;

    setupPlanner();
    showToast('Routine completed! 🔥');
}

async function saveDailyLogToServer() {
    if (state.userId == null) throw new Error('Not signed in.');
    const fileInput = document.getElementById('selfie-upload-input');
    const file = fileInput ? fileInput.files[0] : null;

    const formData = new FormData();
    formData.append('user_id', state.userId);
    formData.append('date', getLocalDateKey());
    formData.append('am_done', 1);
    formData.append('pm_done', 1);
    formData.append('skin_feeling', 'Good');
    formData.append('skin_rating', 5);
    if (file) formData.append('image', file);

    const res = await fetch(`${API_BASE_URL}/api/daily-log`, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Daily log failed');
    return data;
}

function openCamera() {
    document.getElementById('selfie-upload-input').click();
}

function handleSelfieUpload(input) {
    if (input.files && input.files[0]) {
        showToast("Selfie saved! ✨");
    }
}

function renderPlannerDashboard() {
    const sBadge = document.getElementById('streak-count');
    const homeStreakEl = document.getElementById('home-streak-count');
    if (sBadge) sBadge.textContent = `${plannerState.streak} Day Streak`;
    if (homeStreakEl) homeStreakEl.textContent = plannerState.streak;
    renderPlannerCalendar();
    renderMainChecklist();
}

function renderMainChecklist() {
    const list = document.getElementById('main-routine-list');
    if (list) {
        list.innerHTML = plannerState.routine.map(item => `
            <li><i class="fa-solid fa-check blue-check"></i> <span>${item}</span></li>
        `).join('');
    }
}

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
    if (plannerState.currentMonth > 11) {
        plannerState.currentMonth = 0;
        plannerState.currentYear += 1;
    } else if (plannerState.currentMonth < 0) {
        plannerState.currentMonth = 11;
        plannerState.currentYear -= 1;
    }
    renderPlannerCalendar();
}

function openRoutineEditor() { document.getElementById('routine-editor-overlay').style.display = 'block'; }
function closeRoutineEditor() { document.getElementById('routine-editor-overlay').style.display = 'none'; }
function saveRoutine() { localStorage.setItem(userStorageKey('planner-routine'), JSON.stringify(plannerState.routine)); }

function setupSettings() {
    // Theme Toggles
    document.querySelectorAll('.pill[data-theme]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill[data-theme]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            let theme = btn.dataset.theme;
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }
        });
    });

    // Routine Reminders Toggle
    const reminderSwitch = document.querySelector('.settings-section .switch input');
    if (reminderSwitch) {
        reminderSwitch.addEventListener('change', (e) => {
            if (e.target.checked) {
                showToast('Routine reminders enabled');
            } else {
                showToast('Routine reminders disabled');
            }
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
    if (pageId === 'account-details') {
        const input = document.getElementById('profile-edit-username');
        if (input) input.value = state.username || '';
    }
}

function closeSettingsSubPage(pageId) {
    document.getElementById(`settings-${pageId}`).style.display = 'none';
}

function saveAccountDetails() {
    const newName = document.getElementById('profile-edit-username').value.trim();
    if (newName) {
        state.username = newName;
        const displayNameEl = document.getElementById('user-display-name');
        if (displayNameEl) displayNameEl.textContent = newName;
        localStorage.setItem(userStorageKey('data'), JSON.stringify(plannerState)); // Generic save trigger
        showToast('Profile updated!');
    }
    closeSettingsSubPage('account-details');
}

function executeExportData() {
    // Spreadsheet Header
    let csvHeader = ["Date", "Type", "Condition/Product", "Severity/Score", "Image URL"];
    let csvRows = [csvHeader.join(",")];

    // Add Scan data
    if (plannerState.scans && Array.isArray(plannerState.scans)) {
        plannerState.scans.forEach(item => {
            const row = [
                `"${item.date || ''}"`,
                `"${item.type || ''}"`,
                `"${item.condition || (item.type === 'product' ? 'Product Scan' : 'Unknown')}"`,
                `"${item.severity || item.score || ''}"`,
                `"${item.img || ''}"`
            ];
            csvRows.push(row.join(","));
        });
    }

    // Include Routine info as a separate table in the same CSV
    csvRows.push("\n");
    csvRows.push("--- USER PROFILE & ROUTINE ---");
    csvRows.push("Username,Streak");
    csvRows.push(`"${state.username || ''}","${plannerState.streak || 0}"`);
    csvRows.push("Routine Items");
    if (plannerState.routine && Array.isArray(plannerState.routine)) {
        plannerState.routine.forEach(item => csvRows.push(`"${item}"`));
    }

    const csvBody = csvRows.join("\n");
    const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "skinbiee_data_export.csv");
    document.body.appendChild(link); 
    link.click();
    link.remove();
    
    showToast('Spreadsheet (.csv) exported successfully!');
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

function showLoading() { document.getElementById('loading-overlay').style.display = 'flex'; }
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
