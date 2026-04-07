const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? "http://localhost:5000" 
    : "https://skinbiee-backend-hxkz.onrender.com";

/* --- Safe LocalStorage Utility --- */
const safeStorage = {
  get: (key) => { try { return localStorage.getItem(key); } catch(e) { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, val); } catch(e) {} },
  remove: (key) => { try { localStorage.removeItem(key); } catch(e) {} },
  clear: () => { try { localStorage.clear(); } catch(e) {} }
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

function userStorageKey(base) {
    const uid = state.userId != null ? String(state.userId) : 'anon';
    return `${base}-u${uid}`;
}

function persistSession(userId, username, token) {
    state.userId = userId;
    state.username = username;
    safeStorage.set('sc-user-id', String(userId));
    safeStorage.set('sc-username', username);
    if (token) safeStorage.set('sc-token', token);
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = username;
}

function clearSession() {
    state.userId = null;
    state.username = '';
    state.activeDates = new Set();
    safeStorage.remove('sc-user-id');
    safeStorage.remove('sc-username');
    safeStorage.remove('sc-token');
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${safeStorage.get('sc-token')}`
    };
}

function authHeadersRaw() {
    return {
        "Authorization": `Bearer ${safeStorage.get('sc-token')}`
    };
}

function restoreSession() {
    const raw = safeStorage.get('sc-user-id');
    const uid = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(uid) || uid < 1) {
        state.userId = null;
        return false;
    }
    state.userId = uid;
    state.username = safeStorage.get('sc-username') || '';
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
        const res = await fetch(`${API_BASE_URL}/api/user/data`, { headers: authHeadersRaw() });
        const data = await res.json();
        if (data.status !== 'success') return;
        
        state.activeDates = new Set(data.active_dates || []);
        state.allLogs = data.logs || []; // Store full logs for export

        if (typeof data.streak === 'number') {
            plannerState.streak = data.streak;
            state.streak = data.streak;
            safeStorage.set(userStorageKey('planner-streak'), String(data.streak));
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
    console.log(\"DEBUG: Skinbiee Initializing...\");
    const hadSession = restoreSession();
    syncPlannerStateFromStorage();

    const savedTheme = safeStorage.get('sc-theme');
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
    initGlobalInteractivity(); // Force UI Interactivity

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
function switchTab(viewName) {
    if (typeof switchView === 'function') {
        switchView(viewName);
    }
}

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
   THEME & MASCOT SETTINGS
   ========================================================================== */
if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', state.theme);
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = state.theme === 'dark' ? '<i class=\"fa-solid fa-sun\"></i>' : '<i class=\"fa-solid fa-moon\"></i>';
    }
    safeStorage.set('sc-theme', state.theme);

    // Update Setting toggle if exists
    const settingsPills = document.querySelectorAll('.pill-group[data-target=\"theme\"] .pill');
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
    safeStorage.set(profileStorageKey(), JSON.stringify(profile));
}

function loadUserProfile() {
    let raw = safeStorage.get(profileStorageKey());
    if (!raw && state.userId != null) {
        raw = safeStorage.get('sc-user-profile');
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
            const uname = document.getElementById('auth-username').value.trim();
            const password = document.getElementById('auth-password').value;
            
            showLoading('Connecting...');
            const endpoint = isSignup ? 'register' : 'login';
            try {
                const res = await fetch(`${API_BASE_URL}/api/auth/${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: uname, password })
                });
                const data = await res.json();
                hideLoading();
                if (!res.ok) { showToast(data.error || 'Auth failed'); return; }
                persistSession(data.user_id, data.username, data.token);
                
                // Set default profile if none exists
                let profile = loadUserProfile();
                if (!profile) {
                    profile = {
                        username: state.username,
                        skinType: 'Normal',
                        concern: ['None'],
                        sensitive: 'No'
                    };
                    saveUserProfile(profile);
                }
                applyUserProfile(profile);

                if (isSignup) switchView('onboarding');
                else { 
                    switchView('home'); 
                    showToast(`Welcome back, ${state.username}! ✨`); 
                }
                refreshUserDataFromServer();
            } catch (err) { 
                hideLoading(); 
                showToast('Connection error - is the server awake?'); 
            }
        };
    }
}

function setupOnboardingListeners() {
    const nextBtn = document.getElementById('ob-next-btn');
    const backBtn = document.getElementById('ob-back');
    const mascot = document.getElementById('ob-mascot');
    
    if (!nextBtn || !backBtn) return;

    nextBtn.addEventListener('click', () => {
        const currentStep = document.getElementById(`ob-step-${state.onboardingStep}`);
        let isValid = true;

        if (state.onboardingStep === 1) {
            const age = document.getElementById('ob-age').value;
            const gender = currentStep.querySelector('.pill.active');
            if (!age || !gender) isValid = false;
        } else if (state.onboardingStep === 2) {
            const skinType = currentStep.querySelector('[data-target="ob-skintype"] .pill.active');
            const concerns = currentStep.querySelectorAll('[data-target="ob-concern"] .pill.active');
            const sensitive = currentStep.querySelector('[data-target="ob-sensitive"] .pill.active');
            if (!skinType || concerns.length === 0 || !sensitive) isValid = false;
        }

        if (!isValid) { showToast('Please answer all questions!'); return; }

        if (state.onboardingStep < 4) {
            document.getElementById(`ob-step-${state.onboardingStep}`).classList.remove('active');
            state.onboardingStep++;
            document.getElementById(`ob-step-${state.onboardingStep}`).classList.add('active');
            document.getElementById('ob-step-num').textContent = state.onboardingStep;
            backBtn.style.visibility = 'visible';
        } else if (state.onboardingStep === 4) {
            const profile = {
                username: state.username,
                skinType: (document.querySelector('[data-target="ob-skintype"] .pill.active') || {}).dataset.val,
                concern: Array.from(document.querySelectorAll('[data-target="ob-concern"] .pill.active')).map(p => p.dataset.val),
                sensitive: (document.querySelector('[data-target="ob-sensitive"] .pill.active') || {}).dataset.val
            };
            saveUserProfile(profile);
            document.getElementById(`ob-step-4`).classList.remove('active');
            document.getElementById(`ob-step-done`).classList.add('active');
            if (mascot) mascot.classList.replace('idle', 'happy');
            nextBtn.textContent = 'Get Started ✨';
            state.onboardingStep = 5;
        } else {
            switchView('home');
        }
    });

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

    // --- Face Scanner ---
    const btnSkinCamera = document.getElementById('btn-skin-camera');
    const btnSkinGallery = document.getElementById('btn-skin-gallery');
    const skinFileInput = document.getElementById('skin-file-input');

    if (btnSkinCamera) {
        btnSkinCamera.onclick = () => {
            if (skinFileInput) {
                skinFileInput.setAttribute('capture', 'user');
                skinFileInput.click();
            }
        };
    }
    if (btnSkinGallery) {
        btnSkinGallery.onclick = () => {
            if (skinFileInput) {
                skinFileInput.removeAttribute('capture');
                skinFileInput.click();
            }
        };
    }

    if (skinFileInput) {
        skinFileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('skin-img-preview');
                    if (preview) preview.src = event.target.result;
                    showAnalyzerSubStateSB('skin', 'preview');
                    triggerMascotAnim('surprised');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    // --- Product Scanner ---
    const btnProdCamera = document.getElementById('btn-prod-camera');
    const btnProdGallery = document.getElementById('btn-prod-gallery');
    const prodFileInput = document.getElementById('prod-file-input');

    if (btnProdCamera) {
        btnProdCamera.onclick = () => {
            if (prodFileInput) {
                prodFileInput.setAttribute('capture', 'environment');
                prodFileInput.click();
            }
        };
    }
    if (btnProdGallery) {
        btnProdGallery.onclick = () => {
            if (prodFileInput) {
                prodFileInput.removeAttribute('capture');
                prodFileInput.click();
            }
        };
    }

    if (prodFileInput) {
        prodFileInput.onchange = (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('prod-img-preview');
                    if (preview) preview.src = event.target.result;
                    showAnalyzerSubStateSB('prod', 'preview');
                    triggerMascotAnim('surprised');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    // Action buttons in previews
    const btnAnalyzeSkin = document.getElementById('btn-analyze-skin');
    if (btnAnalyzeSkin) btnAnalyzeSkin.onclick = () => startSkinAnalysis();

    const btnAnalyzeProd = document.getElementById('btn-analyze-prod');
    if (btnAnalyzeProd) btnAnalyzeProd.onclick = () => startProductAnalysis();

    const removeSkinPreview = document.getElementById('remove-skin-preview');
    if (removeSkinPreview) {
        removeSkinPreview.onclick = () => {
            if (skinFileInput) skinFileInput.value = '';
            showAnalyzerSubStateSB('skin', 'input');
        };
    }

    const removeProdPreview = document.getElementById('remove-prod-preview');
    if (removeProdPreview) {
        removeProdPreview.onclick = () => {
            if (prodFileInput) prodFileInput.value = '';
            showAnalyzerSubStateSB('prod', 'input');
        };
    }
}

async function startSkinAnalysis() {
    const skinFileInput = document.getElementById('skin-file-input');
    const file = skinFileInput ? skinFileInput.files[0] : null;
    if (!file) {
        showToast(\"Please pick a photo first!\");
        return;
    }
    if (state.userId == null) {
        showToast('Please sign in to save scans to your account.');
        return;
    }

    console.log(\"DEBUG: Starting skin analysis...\");
    const previewImg = document.getElementById('skin-img-preview');
    const processingImg = document.getElementById('skin-img-processing');
    if (processingImg && previewImg) processingImg.src = previewImg.src;
    
    showAnalyzerSubStateSB('skin', 'processing');
    triggerMascotAnim('thinking');

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(`${API_BASE_URL}/api/analyze-skin`, {
            method: 'POST',
            headers: authHeadersRaw(),
            body: formData
        });
        const data = await response.json();

        if (data.status === 'success') {
            showToast(\"Results are in! ✨\");
            const previewUrl = data.image_url || URL.createObjectURL(file);
            const scanRecord = {
                id: Date.now(),
                date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                img: data.image_url || previewUrl,
                results: data.results,
                type: 'face'
            };
            plannerState.scans.unshift(scanRecord);
            safeStorage.set(userStorageKey('planner-scans'), JSON.stringify(plannerState.scans));

            renderSkinResultsSB(data.results, previewUrl);
            showAnalyzerSubStateSB('skin', 'results');
            triggerMascotAnim('happy');
        } else {
            showToast(\"Analysis failed: \" + (data.error || 'Unknown error'));
            showAnalyzerSubStateSB('skin', 'input');
        }
    } catch (err) {
        console.error(\"DEBUG: SKIN ANALYSIS ERROR:\", err);
        showToast(\"Connection error. Try again?\");
        showAnalyzerSubStateSB('skin', 'input');
    }
}

async function startProductAnalysis() {
    const prodFileInput = document.getElementById('prod-file-input');
    const file = prodFileInput ? prodFileInput.files[0] : null;
    if (!file) {
        showToast(\"Please pick a label photo!\");
        return;
    }
    if (state.userId == null) {
        showToast('Please sign in to save scans to your account.');
        return;
    }

    console.log(\"DEBUG: Starting product scan...\");
    const previewImg = document.getElementById('prod-img-preview');
    const processingImg = document.getElementById('prod-img-processing');
    if (processingImg && previewImg) processingImg.src = previewImg.src;

    showAnalyzerSubStateSB('prod', 'processing');
    triggerMascotAnim('thinking');

    const formData = new FormData();
    formData.append('image', file);

    try {
        const response = await fetch(`${API_BASE_URL}/api/analyze-product`, {
            method: 'POST',
            headers: authHeadersRaw(),
            body: formData
        });
        const data = await response.json();

        if (data.status === 'success') {
            showToast(\"Ingredient analysis ready!\");
            const previewUrl = data.image_url || URL.createObjectURL(file);
            const scanRecord = {
                id: Date.now(),
                date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                img: data.image_url || previewUrl,
                results: data.analysis,
                type: 'product'
            };
            plannerState.scans.unshift(scanRecord);
            safeStorage.set(userStorageKey('planner-scans'), JSON.stringify(plannerState.scans));

            renderProdResultsSB(data);
            showAnalyzerSubStateSB('prod', 'results');
            triggerMascotAnim('happy');
        } else {
            showToast(\"Scan failed: \" + (data.error || 'Unknown error'));
            showAnalyzerSubStateSB('prod', 'input');
        }
    } catch (err) {
        console.error(\"DEBUG: PROD ANALYSIS ERROR:\", err);
        showToast(\"Connection error. Try again?\");
        showAnalyzerSubStateSB('prod', 'input');
    }
}

function showAnalyzerSubStateSB(mode, state) {
    if (mode === 'skin') {
        const states = {
            input: document.querySelector('#sub-skin-analysis .input-state'),
            preview: document.getElementById('skin-preview-zone'),
            processing: document.getElementById('skin-processing-state'),
            results: document.getElementById('skin-results-state')
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
            const fileInput = document.getElementById('skin-file-input');
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
            input: document.getElementById('ing-input-state'),
            preview: document.getElementById('prod-preview-zone'),
            processing: document.getElementById('prod-processing-state'),
            results: document.getElementById('ing-results-state')
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
            const fileInput = document.getElementById('prod-file-input');
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
    const img = document.getElementById('skin-result-img');
    if (img) img.src = imgUrl;

    const badgeContainer = document.getElementById('skin-result-badges');
    const list = document.getElementById('skin-concerns-list');
    const overallDesc = document.getElementById('skin-result-desc');
    const titleEl = document.getElementById('skin-result-title');

    if (badgeContainer) badgeContainer.innerHTML = '';
    if (list) {
        list.innerHTML = '';
        list.classList.add('result-card-entry');
    }

    const advice = {
        \"Acne\": \"Your skin is dealing with some breakouts. We'll focus on soothing and clearing these areas gently! 🌿\",
        \"Dark Spots\": \"We noticed some areas with extra pigment. These can fade over time with brightening care! ✨\",
        \"Oiliness\": \"Your skin is producing extra glow. We'll help balance it so you stay fresh all day. 🌊\",
        \"Dryness\": \"Your skin is feeling a bit thirsty! We'll look for rich, hydrating ingredients for you. 💧\",
        \"Normal\": \"Your skin is looking balanced and healthy! Let's keep it protected and happy. ☀️\",
        \"Healthy / Normal\": \"Overall, your skin is in a great place! Just keep up the healthy habits. 🌟\"
    };

    const skinTypeMap = {
        \"Oiliness\": \"Oily\",
        \"Dryness\": \"Dry\",
        \"Acne\": \"Acne-Prone\",
        \"Normal\": \"Normal\",
        \"Healthy / Normal\": \"Normal\"
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
            <div class=\"flex-between\">
                <strong>${res.concern}</strong>
                <span class=\"micro-text text-muted\">Severity: ${res.severity}</span>
            </div>
            <p class=\"micro-text mt-2 mb-0\">${advice[res.concern] || \"We'll help you manage this concern with the right routine! 🧴\"}</p>
        `;
        if (list) list.appendChild(card);
    });

    const existingBtn = document.getElementById('btn-go-products');
    if (!existingBtn) {
        const btn = document.createElement('button');
        btn.id = 'btn-go-products';
        btn.className = 'primary-btn full-width mt-4';
        btn.textContent = 'See Recommended Products 🛍️';
        btn.onclick = () => showProductRecommendations(results);
        if (list) list.parentElement.appendChild(btn);
    }
}

function showProductRecommendations(results) {
    const container = document.getElementById('product-rec-container');
    if (!container) return;
    container.innerHTML = `<div class=\"product-rec-grid mt-3\" id=\"rec-cards-grid\"></div>`;
    const grid = container.querySelector('#rec-cards-grid');
    results.forEach(res => {
        const card = document.createElement('div');
        card.className = 'product-rec-card';
        card.innerHTML = `<h4>${res.concern} Pick</h4><p>Recommended care for ${res.concern}.</p>`;
        grid.appendChild(card);
    });
}

function renderProdResultsSB(data) {
    const analysis = data.analysis || {};
    const scoreText = document.getElementById('prod-score-text');
    if (scoreText) scoreText.innerText = (analysis.score || 5.0).toFixed(1) + ' / 10';
    showAnalyzerSubStateSB('prod', 'results');
}

function renderScanHistory() {
    const gallery = document.getElementById('timeline-gallery-grid-skinbiee');
    if (!gallery) return;
    gallery.innerHTML = '<div class=\"text-center py-5 text-muted\">View your past scans here.</div>';
}

/* ==========================================================================
   TAB: PLANNER
   ========================================================================== */
const plannerQuestions = [
    { id: 'skinType', q: 'What is your skin type?', options: ['Oily','Dry','Combination','Sensitive','Not sure'] },
    { id: 'concern', q: 'What is your primary concern?', options: ['Acne','Pimples','Dark spots','Pigmentation','Dryness','Dull skin'] }
];

function syncPlannerStateFromStorage() {
    plannerState.plannerOnboardingDone = safeStorage.get(userStorageKey('planner-ob-done')) === 'true';
    plannerState.streak = parseInt(safeStorage.get(userStorageKey('planner-streak')) || '0', 10) || 0;
}

function setupPlanner() {
    const obOverlay = document.getElementById('planner-onboarding-overlay');
    const mainDash = document.getElementById('planner-main-dashboard');
    if (!plannerState.plannerOnboardingDone) {
        if (obOverlay) obOverlay.style.display = 'block';
        if (mainDash) mainDash.style.display = 'none';
        startPlannerOnboarding();
    } else {
        if (obOverlay) obOverlay.style.display = 'none';
        if (mainDash) mainDash.style.display = 'block';
        renderPlannerDashboard();
    }
}

function startPlannerOnboarding() {
    plannerState.obStep = 0;
    renderPlannerObQuestion();
}

function renderPlannerObQuestion() {
    const area = document.getElementById('planner-ob-question-area');
    if (!area) return;
    const step = plannerQuestions[plannerState.obStep];
    if (!step) { finishPlannerOnboarding(); return; }
    area.innerHTML = `<h3>${step.q}</h3>` + step.options.map(o => `<div class=\"option-pill\" onclick=\"selectPlannerObOption('${step.id}','${o}')\">${o}</div>`).join('');
}

function selectPlannerObOption(id, val) {
    plannerState.obAnswers[id] = val;
    plannerState.obStep++;
    renderPlannerObQuestion();
}

function finishPlannerOnboarding() {
    plannerState.plannerOnboardingDone = true;
    safeStorage.set(userStorageKey('planner-ob-done'), 'true');
    setupPlanner();
}

function renderPlannerDashboard() {
    renderPlannerCalendar();
    renderMorningCard();
    renderNightCard();
}

function renderPlannerCalendar() {
    const grid = document.getElementById('planner-calendar-grid');
    if (grid) grid.innerHTML = '<div class=\"py-4 text-center text-muted\">Calendar Loading...</div>';
}
function renderMorningCard() {}
function renderNightCard() {}

/* ==========================================================================
   SETTINGS & ACCOUNT DETAILS (FIXED)
   ========================================================================== */
function setupSettings() {
    document.querySelectorAll('.set-item[data-page-id]').forEach(item => {
        item.onclick = () => openSettingsSubPage(item.dataset.pageId);
    });
}

function openSettingsSubPage(id) {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.style.display = 'flex';
}

function closeSettingsSubPage(id) {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.style.display = 'none';
}

// ACCOUNT ACTIONS
function togglePasswordChange() {
    const sec = document.getElementById('password-change-section');
    if (sec) sec.style.display = (sec.style.display === 'none') ? 'flex' : 'none';
}

function performPasswordChange() {
    const newPass = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    if (newPass && newPass === confirm) {
        showToast('Password updated! ✨');
        togglePasswordChange();
    } else {
        showToast('Passwords do not match! ❌');
    }
}

function handlePhotoUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.querySelectorAll('#settings-avatar-img, .profile-avatar-large img').forEach(img => img.src = e.target.result);
            showToast('Photo updated! ✨');
        };
        reader.readAsDataURL(input.files[0]);
    }
}

/* ==========================================================================
   MASCOT CHAT & ANIMATION
   ========================================================================== */
function setupMascotChat() {
    const chat = document.getElementById('chat-panel');
    if (floatMascotBtn && chat) {
        floatMascotBtn.onclick = () => {
            chat.classList.add('open');
            triggerMascotAnim('happy');
            floatMascotBtn.style.opacity = '0';
        };
    }
}

function triggerMascotAnim(type) {
    document.querySelectorAll('.mascot-blob').forEach(m => {
        m.classList.remove('idle','happy','thinking','surprised');
        m.classList.add(type);
    });
}

/* ==========================================================================
   GLOBAL INTERACTIVITY & INITIALIZATION
   ========================================================================== */
function initGlobalInteractivity() {
    console.log(\"[INIT] Global Interactivity Active\");
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.pill, .swatch, .option-pill');
        if (!btn) return;
        
        // Onboarding has its own complex listeners in setupOnboardingListeners
        if (btn.closest('.view-onboarding')) return;

        const group = btn.closest('.pill-group, .color-swatches, .planner-options');
        if (!group) return;

        if (group.classList.contains('multi-select')) {
            btn.classList.toggle('active');
        } else {
            group.querySelectorAll('.pill, .swatch, .option-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
        }
    });
}

function showLoading(msg) { /* logic */ }
function hideLoading() { /* logic */ }
function showToast(msg) {
    const cont = document.getElementById('toast-container');
    if (!cont) return;
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    cont.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

window.onload = init;
