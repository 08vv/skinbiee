let deferredPrompt;

// PWA Event Listeners
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    console.log('[PWA] beforeinstallprompt captured');
});

window.addEventListener('appinstalled', (e) => {
    console.log('[PWA] App installed successfully');
    safeStorage.set('sc-pwa-installed', 'true');
    const prompt = document.getElementById('pwa-prompt-overlay');
    if (prompt) prompt.style.display = 'none';
});

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('[PWA] Service Worker registered:', reg))
            .catch(err => console.log('[PWA] Service Worker registration failed:', err));
    });
}

// Auto-detect API backend (Frontend 8001 -> Backend 5000 locally, deployed frontend -> Render backend)
const API_BASE_URL = (window.location.port === "8001" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
    ? "http://localhost:5000" 
    : "https://skinbiee-backend-hxkz.onrender.com";



/* --- Safe LocalStorage Utility --- */
const safeStorage = {
  get: (key) => { try { return localStorage.getItem(key); } catch(e) { return null; } },
  set: (key, val) => { try { localStorage.setItem(key, val); } catch(e) {} },
  remove: (key) => { try { localStorage.removeItem(key); } catch(e) {} },
  clear: () => { try { localStorage.clear(); } catch(e) {} }
};

function byId(...ids) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return el;
    }
    return null;
}

function authHeadersRaw() {
    const token = safeStorage.get('sc-token');
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function clearSession() {
    state.userId = null;
    state.username = 'Melani';
    safeStorage.remove('sc-user-id');
    safeStorage.remove('sc-username');
    safeStorage.remove('sc-token');
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
    const token = safeStorage.get('sc-token');
    const uid = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(uid) || uid < 1 || !token) {
        clearSession();
        return false;
    }
    state.userId = uid;
    state.username = safeStorage.get('sc-username') || '';
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = state.username;
    return true;
}


async function refreshUserDataFromServer() {
    if (state.userId == null) return;
    try {
        const res = await fetch(`${API_BASE_URL}/api/user/data`, { headers: authHeadersRaw() });
        if (res.status === 401) { clearSession(); switchView('auth'); return; }
        
        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await res.text();
            console.error('[SERVER] Expected JSON but got:', text.substring(0, 100));
            return;
        }

        const data = await res.json();
        if (data.status === 'success' || data.success) {
            state.activeDates = new Set(data.active_dates || []);
            state.streak = data.streak || 0;
        }
    } catch (e) {
        console.error('[SERVER] Refresh failed', e);
    }
}

async function readApiResponse(response) {
    const raw = await response.text();
    if (!raw.trim()) {
        return { ok: false, error: `Empty server response (${response.status})`, raw };
    }

    try {
        return { ok: true, data: JSON.parse(raw), raw };
    } catch (e) {
        console.error('[NET] Failed to parse JSON response:', raw);
        return {
            ok: false,
            error: `Server returned a non-JSON response (${response.status})`,
            raw
        };
    }
}


/* ==========================================================================
   STATE & DOM ELEMENTS
   ========================================================================== */
const state = {
    view: 'auth', // auth, onboarding, home, analyzer, planner, settings
    theme: 'light',
    mascotColor: 'blue',
    username: 'Melani',
    streak: 5,
    onboardingStep: 1,
    userId: null,
    activeDates: new Set()
};

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
    console.log("[DEBUG] init started");
    try {
        // Setup Theme
        const savedTheme = localStorage.getItem('sc-theme');
        if (savedTheme === 'dark') {
            toggleTheme();
        }

        const hadSession = restoreSession();
        // Auth Flow Listeners
        setupAuthListeners();

        // Onboarding Listeners
        setupOnboardingListeners();

        // App Navigation
        setupBottomNav();

        // Mascot Listeners
        setupMascotChat();

        // Feature specific listeners
        setupAnalyzer();
        setupPlanner();
        setupSettings();
        
        if (hadSession) {
            switchView("home");
            refreshUserDataFromServer();
        }

        // Initialize PWA Download Prompt (Show up to 3 times)
        initPWAPrompt();

        console.log("[DEBUG] init completed successfully");
    } catch (err) {
        console.error("[CRITICAL] init failed:", err);
        showToast("Application Initialization Error. Please refresh.");
    }
}

/* ==========================================================================
   ROUTING / VIEW MANAGEMENT
   ========================================================================== */
function switchView(viewName) {
    console.log("[DEBUG] switchView changing to:", viewName);
    
    // Hide all views robustly
    const allViews = document.querySelectorAll('.view');
    allViews.forEach(v => {
        v.classList.remove('active');
        v.style.display = 'none'; // Force hide to prevent overlaps
    });

    // Show target view
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.add('active');
        targetView.style.display = 'block'; // Force show
        state.view = viewName;
        
        // Reset scroll position to top when switching views
        targetView.scrollTop = 0;
    }


    // Toggle Shell elements Visibility
    const isAuthOrOnboarding = (viewName === 'auth' || viewName === 'onboarding');
    
    if (topBar) {
        topBar.style.display = isAuthOrOnboarding ? 'none' : 'flex';
    }
    if (bottomNav) {
        bottomNav.style.display = isAuthOrOnboarding ? 'none' : 'flex';
    }
    if (floatMascotBtn) {
        floatMascotBtn.style.display = isAuthOrOnboarding ? 'none' : 'block';
    }

    if (viewName === 'onboarding') {
        resetOnboarding();
    }

    // Update Bottom Nav active state
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === viewName);
    });
    // Scroll top
    if (document.getElementById('main-content')) {
        document.getElementById('main-content').scrollTop = 0;
    }

    if (viewName === 'planner') setupPlanner();
}

function switchTab(viewName) {
    console.log("[DEBUG] switchTab:", viewName);
    if (viewName === 'analyzer') {
        closeAnalyzerDetail();
    }
    switchView(viewName);
}

function setupBottomNav() {
    console.log("[DEBUG] setupBottomNav binding listeners");
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.target;
            if (target) {
                switchTab(target);
            }
        });
    });
}

/* ==========================================================================
   THEME & MASCOT SETTINGS
   ========================================================================== */
themeToggleBtn.addEventListener('click', toggleTheme);

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.body.setAttribute('data-theme', state.theme);
    themeToggleBtn.innerHTML = state.theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
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
    localStorage.setItem('sc-user-profile', JSON.stringify(profile));
}

function loadUserProfile() {
    const raw = localStorage.getItem('sc-user-profile');
    return raw ? JSON.parse(raw) : null;
}

function applyUserProfile(profile) {
    if (!profile) return;
    state.username = profile.username || state.username;
    
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
                    headers: { ...authHeadersRaw(),  'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: uname, password })
                });
                
                const contentType = res.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                   const text = await res.text();
                   console.error("[AUTH] Invalid response:", text);
                   hideLoading();
                   showToast("Server error: Invalid response format");
                   return;
                }

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

    // Actives toggle
    document.getElementById('ob-actives-toggle').addEventListener('click', (e) => {
        if (e.target.classList.contains('pill')) {
            const val = e.target.dataset.val;
            document.getElementById('ob-actives-text').style.display = val === 'Yes' ? 'block' : 'none';
        }
    });

    nextBtn.addEventListener('click', () => {
        const currentStep = document.getElementById(`ob-step-${state.onboardingStep}`);
        let isValid = true;

        if (state.onboardingStep === 1) {
            const age = document.getElementById('ob-age').value;
            const gender = currentStep.querySelector('.pill.active');
            if (!gender) { showToast("Please select your gender"); isValid = false; }
        } else if (state.onboardingStep === 2) {
            const skinType = currentStep.querySelector('[data-target="ob-skintype"] .pill.active');
            const concern = currentStep.querySelector('[data-target="ob-concern"] .pill.active');
            const sensitive = currentStep.querySelector('[data-target="ob-sensitive"] .pill.active');
            if (!skinType) { showToast("Please select your skin type"); isValid = false; }
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
            // Save collected onboarding data to localStorage
            const profileData = {
                username: state.username,
                age: document.getElementById('ob-age').value,
                gender: (document.querySelector('#ob-step-1 .pill.active') || {}).textContent || '',
                skinType: (document.querySelector('[data-target="ob-skintype"] .pill.active') || {}).textContent || '',
                concern: (document.querySelector('[data-target="ob-concern"] .pill.active') || {}).textContent || '',
                sensitive: (document.querySelector('[data-target="ob-sensitive"] .pill.active') || {}).textContent || '',
            };
            saveUserProfile(profileData);

            // Finish
            document.getElementById(`ob-step-4`).classList.remove('active');
            document.getElementById(`ob-step-done`).classList.add('active');

            mascot.classList.replace('idle', 'happy');
            document.querySelector('.ob-progress').style.display = 'none';
            backBtn.style.visibility = 'hidden';

            nextBtn.textContent = 'Go to Home';
            state.onboardingStep = 5;
        } else {
            applyUserProfile(loadUserProfile());
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
    document.getElementById('ob-back').style.visibility = 'hidden';
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
/* ==========================================================================
   TAB: ANALYZER (Restored Action Cards)
   ========================================================================== */
function setupAnalyzer() {
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
                    const processingPreview = document.getElementById('skin-img-processing');
                    if (processingPreview) processingPreview.src = event.target.result;
                    showAnalyzerSubState('skin', 'preview');
                    triggerMascotAnim('surprised');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    const btnAnalyzeSkin = document.getElementById('btn-analyze-skin');
    if (btnAnalyzeSkin) {
        btnAnalyzeSkin.onclick = async () => {
            const file = skinFileInput.files[0];
            if (!file) return;

            showAnalyzerSubState('skin', 'processing');
            triggerMascotAnim('thinking');

            const formData = new FormData();
            formData.append('image', file);

            try {
                showToast("Sending scan to AI model...");
                const response = await fetch(`${API_BASE_URL}/api/analyze-skin`, {
                    method: 'POST',
                    headers: authHeadersRaw(),
                    body: formData
                });

                const parsed = await readApiResponse(response);
                if (!parsed.ok) {
                    showToast(parsed.error);
                    showAnalyzerSubState('skin', 'input');
                    return;
                }
                const data = parsed.data;

                if (data.status === 'success') {
                    showToast("Analysis complete! Rendering results.");
                    renderSkinResults(Array.isArray(data.results) ? data.results : [], data.image_url || URL.createObjectURL(file));
                    showAnalyzerSubState('skin', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Analysis failed: " + (data.error || "Unknown error"));
                    showAnalyzerSubState('skin', 'input');
                }
            } catch (err) {
                console.error("[NET] Skin analysis failed:", err);
                showToast("Connection Error: " + (err.message || "Failed to reach AI Backend"));
                showAnalyzerSubState('skin', 'input');
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
                    const processingPreview = document.getElementById('prod-img-processing');
                    if (processingPreview) processingPreview.src = event.target.result;
                    showAnalyzerSubState('prod', 'preview');
                    triggerMascotAnim('surprised');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        };
    }

    const btnAnalyzeProd = document.getElementById('btn-analyze-prod');
    if (btnAnalyzeProd) {
        btnAnalyzeProd.onclick = async () => {
            const file = prodFileInput.files[0];
            if (!file) return;

            showAnalyzerSubState('prod', 'processing');
            triggerMascotAnim('thinking');

            const formData = new FormData();
            formData.append('image', file);

            try {
                showToast("Processing product ingredients...");
                const response = await fetch(`${API_BASE_URL}/api/analyze-product`, {
                    method: 'POST',
                    headers: authHeadersRaw(),
                    body: formData
                });

                const parsed = await readApiResponse(response);
                if (!parsed.ok) {
                    showToast(parsed.error);
                    showAnalyzerSubState('prod', 'input');
                    return;
                }
                const data = parsed.data;

                if (data.status === 'success') {
                    showToast("Scanner success! Results ready.");
                    renderProdResults(data);
                    showAnalyzerSubState('prod', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Scan failed: " + (data.error || "Unknown error"));
                    showAnalyzerSubState('prod', 'input');
                }
            } catch (err) {
                console.error("[NET] Product analysis failed:", err);
                showToast("Connection Error: " + (err.message || "Failed to reach AI Backend"));
                showAnalyzerSubState('prod', 'input');
            }
        };
    }

    // Remove buttons
    const removeSkin = document.getElementById('remove-skin-preview');
    if (removeSkin) removeSkin.onclick = () => showAnalyzerSubState('skin', 'input');
    
    const removeProd = document.getElementById('remove-prod-preview');
    if (removeProd) removeProd.onclick = () => showAnalyzerSubState('prod', 'input');
}

/**
 * Toggles visibility of states within analyzer sub-views
 */
function showAnalyzerSubState(mode, state) {
    if (mode === 'skin') {
        const states = {
            input: document.getElementById('skin-input-state'),
            preview: document.getElementById('skin-preview-zone'),
            processing: document.getElementById('skin-processing-state'),
            results: document.getElementById('skin-results-state')
        };
        // Reset all
        Object.values(states).forEach(el => { if (el) el.style.display = 'none'; });
        
        if (state === 'input') {
            if (states.input) states.input.style.display = 'block';
            const fileInput = document.getElementById('skin-file-input');
            if (fileInput) fileInput.value = '';
        } else if (state === 'preview') {
            if (states.input) states.input.style.display = 'block';
            if (states.preview) states.preview.style.display = 'block';
            const inst = states.input ? states.input.querySelector('.instruction-section') : null;
            const acts = states.input ? states.input.querySelector('.centered-action-group') : null;
            if (inst) inst.style.display = 'none';
            if (acts) acts.style.display = 'none';
        } else if (state === 'processing') {
            if (states.processing) states.processing.style.display = 'block';
        } else if (state === 'results') {
            if (states.results) states.results.style.display = 'block';
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
            if (states.results) states.results.style.display = 'block';
        }
    }
}

function renderSkinResults(results, imgUrl) {
    const img = document.getElementById('skin-result-img');
    if (img) img.src = imgUrl;

    const badgeContainer = document.getElementById('skin-result-badges');
    const list = document.getElementById('skin-concerns-list');
    const title = document.getElementById('skin-result-title');
    const desc = document.getElementById('skin-result-desc');
    
    if (badgeContainer) badgeContainer.innerHTML = '';
    if (list) {
        list.innerHTML = '';
        list.classList.add('result-card-entry');
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
        "Oiliness": "Oily", "Dryness": "Dry", "Acne": "Acne-Prone", "Normal": "Normal", "Healthy / Normal": "Normal"
    };
    const detectedConcerns = results.map(r => r.concern);
    let skinType = 'Normal';
    for (const concern of detectedConcerns) {
        if (skinTypeMap[concern]) { skinType = skinTypeMap[concern]; break; }
    }
    if (title) title.textContent = `Skin Type: ${skinType}`;

    const mainConcern = results.sort((a,b) => b.confidence - a.confidence)[0];
    if (desc) {
        if (mainConcern && (mainConcern.concern === 'Healthy / Normal' || mainConcern.concern === 'Normal')) {
            desc.innerHTML = `<strong>Overall:</strong> Your skin looks healthy and balanced! Keep up the good habits. 🌟`;
        } else if (mainConcern) {
            desc.innerHTML = `<strong>Overall:</strong> Your skin is showing signs of <strong>${mainConcern.concern}</strong>. Don't worry, bestie — we've got a plan for you! 💖`;
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

    const existingBtn = document.getElementById('btn-go-products');
    if (!existingBtn) {
        const btn = document.createElement('button');
        btn.id = 'btn-go-products';
        btn.className = 'primary-btn full-width mt-4';
        btn.textContent = 'See Recommended Products 🛍️';
        btn.onclick = () => renderSkinProductRecommendations(results);
        if (list) list.parentElement.appendChild(btn);

        const recContainer = document.createElement('div');
        recContainer.id = 'product-rec-container';
        if (list) list.parentElement.appendChild(recContainer);
    } else {
        existingBtn.onclick = () => renderSkinProductRecommendations(results);
        existingBtn.textContent = 'See Recommended Products 🛍️';
        const recContainer = document.getElementById('product-rec-container');
        if (recContainer) {
            recContainer.innerHTML = '';
        }
    }
}

function renderSkinProductRecommendations(results) {
    const container = document.getElementById('product-rec-container');
    if (!container) return;

    if (container.innerHTML.trim() !== '') {
        container.innerHTML = '';
        const btn = document.getElementById('btn-go-products');
        if (btn) btn.textContent = 'See Recommended Products 🛍️';
        return;
    }

    const btn = document.getElementById('btn-go-products');
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

    const mapFunc = {
        'Acne': '🧴', 'Dark Spots': '✨', 'Oiliness': '💦',
        'Dryness': '💧', 'Normal': '🌿', 'Healthy / Normal': '🌿',
        'Dark Circles': '👁️', 'Pigmentation': '🌸', 'Wrinkles': '🕰️',
        'Redness': '🌹', 'Sensitive Skin': '🤍'
    };

    results.forEach(res => {
        const info = PRODUCT_MAP[res.concern] || PRODUCT_MAP['Normal'];
        const amazonUrl = `https://www.amazon.in/s?k=${encodeURIComponent(info.query)}`;
        const emoji = mapFunc[res.concern] || '✨';

        const card = document.createElement('div');
        card.className = 'product-rec-card';
        card.innerHTML = `
            <div class="rec-card-icon">${emoji}</div>
            <div class="rec-card-body">
                <h4 class="rec-card-title">${res.concern}</h4>
                <p class="rec-card-tip">${info.tip}</p>
                <a class="shop-btn" style="text-decoration:none;" href="${amazonUrl}" target="_blank" rel="noopener noreferrer">
                    Shop on Amazon <span class="shop-arrow">→</span>
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderProdResults(data) {
    try {
        const analysis   = data.analysis   || {};
        const breakdown  = data.ingredient_breakdown || [];
        const skinCond   = data.skin_condition || 'general';
        const rawIngredients = data.ingredients || [];

        // 1. Score handling (0-10 scale)
        let score = typeof analysis.score === 'number' ? analysis.score : 5.0;
        if (score > 10.5) score = score / 10;
        score = Math.min(10, Math.max(0, score));

        const isGood = score >= 7.0;
        const isWarn = score >= 4.0 && score < 7.0;
        const barColor = isGood ? '#6bcb77' : isWarn ? '#ffd93d' : '#ff6b6b';

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
        if (vCount) vCount.innerText = `${breakdown.length || (typeof rawIngredients === 'string' ? 0 : rawIngredients.length)} ingredients detected`;

        // 3. Fast Facts Card (Pills)
        const factsCard = document.getElementById('prod-fast-facts-card');
        const pillsCont = document.getElementById('prod-pills-container');
        if (pillsCont) {
            pillsCont.innerHTML = '';
            const allIngs = (Array.isArray(breakdown) ? breakdown.map(i => i.name.toLowerCase()).join(' ') : "") + 
                            (typeof rawIngredients === 'string' ? rawIngredients.toLowerCase() : "");
            
            const facts = [];
            if (!allIngs.includes('alcohol') || allIngs.includes('alcohol free')) facts.push('Alcohol-Free');
            if (!allIngs.includes('fragrance') && !allIngs.includes('parfum')) facts.push('Fragrance-Free');
            if (!allIngs.includes('sulfate')) facts.push('Sulfate-Free');
            if (!allIngs.includes('paraben')) facts.push('Paraben-Free');
            if (!allIngs.includes('silicone') && !allIngs.includes('dimethicone')) facts.push('Silicone-Free');
            if (!allIngs.includes('oil ') && !allIngs.includes('mineral oil')) facts.push('Oil-Free');

            if (facts.length > 0) {
                if (factsCard) factsCard.style.display = 'block';
                facts.forEach(f => {
                    const pill = document.createElement('div');
                    pill.className = 'pill-item';
                    pill.textContent = f;
                    pillsCont.appendChild(pill);
                });
            } else {
                if (factsCard) factsCard.style.display = 'none';
            }
        }

        // 4. Ingredients breakdown
        const ingredientsText = document.getElementById('prod-ingredients-text');
        if (ingredientsText) {
            if (breakdown.length > 0) {
                ingredientsText.textContent = breakdown.map(i => i.name).join(', ');
            } else if (rawIngredients && rawIngredients.length > 0) {
                ingredientsText.textContent = typeof rawIngredients === 'string' ? (rawIngredients.substring(0, 300) + (rawIngredients.length > 300 ? "..." : "")) : "";
            } else {
                ingredientsText.textContent = "No ingredients were reliably detected.";
            }
        }
    } catch (err) {
        console.error("[UI] Product rendering error:", err);
    }
}

function resetAnalyzer() {
    const skinResults = document.getElementById('skin-results-state');
    const skinInput = document.getElementById('skin-input-state');
    if (skinResults) skinResults.style.display = 'none';
    if (skinInput) skinInput.style.display = 'block';

    const ingResults = document.getElementById('ing-results-state');
    const ingInput = document.getElementById('ing-input-state');
    if (ingResults) ingResults.style.display = 'none';
    if (ingInput) ingInput.style.display = 'block';

    const skinPreview = document.getElementById('skin-preview-zone');
    const prodPreview = document.getElementById('prod-preview-zone');
    if (skinPreview) skinPreview.style.display = 'none';
    if (prodPreview) prodPreview.style.display = 'none';
}

/**
 * Opens a sub-view in the analyzer tab
 */
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
            const ingResults = document.getElementById('ing-results-state');
            const ingInput = document.querySelector('#sub-ingredient-scanner .input-state');
            if (ingResults) ingResults.style.display = 'none';
            if (ingInput) ingInput.style.display = 'block';
        }
    }
}

/**
 * Returns to the analyzer main dashboard
 */
function closeAnalyzerDetail() {
    const dashboard = document.getElementById('analyzer-main-dashboard');
    const detailView = document.getElementById('analyzer-detail-view');
    if (dashboard) dashboard.style.display = 'flex';
    if (detailView) detailView.style.display = 'none';
    
    // Reset Mascot on back
    triggerMascotAnim('idle');
}

// resetAnalyzer logic merged upstairs

function renderScanHistory() {
    const gallery = document.getElementById('timeline-gallery-grid');
    const gallerySkinbiee = document.getElementById('timeline-gallery-grid-skinbiee');
    const mockData = [
        { date: 'Mar 26, 2026', img: 'assets/scan-face.png' },
        { date: 'Mar 24, 2026', img: 'assets/scan-face.png' },
        { date: 'Mar 20, 2026', img: 'assets/scan-face.png' },
        { date: 'Mar 15, 2026', img: 'assets/scan-face.png' }
    ];

    const allScans = [...plannerState.scans, ...mockData];

    const html = allScans.map(item => `
        <div class="gallery-item" onclick="showToast('Viewing scan from ${item.date}')">
            <img src="${item.img}" alt="Scan History">
            <div class="gallery-date">${item.date}</div>
        </div>
    `).join('');

    if (gallery) gallery.innerHTML = html;
    if (gallerySkinbiee) gallerySkinbiee.innerHTML = html;
}

function unhide(id) {
    document.querySelectorAll('.expand-area').forEach(el => el.style.display = 'none');
    document.getElementById(id).style.display = 'block';
}

function toggleAccordion(id) {
    const el = document.getElementById(id);
    const icon = el.previousElementSibling.querySelector('.acc-icon');
    if (el.style.display === 'block') {
        el.style.display = 'none';
        icon.style.transform = 'rotate(0deg)';
    } else {
        el.style.display = 'block';
        icon.style.transform = 'rotate(180deg)';
    }
}

/* ==========================================================================
   TAB: PLANNER
   ========================================================================== */
let plannerState = {
    hasSetup: localStorage.getItem('planner-has-setup') === 'true',
    routine: JSON.parse(localStorage.getItem('planner-routine')) || ['Cleanser', 'Moisturizer'],
    dailyDone: false,
    streak: parseInt(localStorage.getItem('planner-streak') || '0', 10) || 0,
    scans: JSON.parse(localStorage.getItem('planner-scans')) || [],
    currentMonth: new Date().getMonth(),
    currentYear: new Date().getFullYear(),
    setupStep: 0,
    answers: {}
};

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
    return localStorage.getItem('planner-last-completed-date') || localStorage.getItem('planner-daily-done');
}

function getPlannerLastDoneDate() {
    const lastDone = getPlannerLastDoneKey();
    if (!lastDone) return null;

    const parsed = new Date(`${lastDone}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function checkStreakMaintenance() {
    const lastDone = getPlannerLastDoneKey();
    if (!lastDone) return;

    const todayStr = getLocalDateKey();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateKey(yesterday);

    if (lastDone !== todayStr && lastDone !== yesterdayStr) {
        // More than a day missed! Reset streak.
        console.log("Streak missed. Resetting to 0.");
        plannerState.streak = 0;
        localStorage.setItem('planner-streak', '0');
    }
}

function setupPlanner() {
    console.log("[DEBUG] setupPlanner triggered");
    // RE-SYNC STATE WITH STORAGE TO PREVENT LOOPS
    plannerState.hasSetup = localStorage.getItem('planner-has-setup') === 'true';
    checkStreakMaintenance();
    plannerState.streak = parseInt(localStorage.getItem('planner-streak') || '0', 10) || 0;
    plannerState.dailyDone = getPlannerLastDoneKey() === getLocalDateKey();
    console.log("[DEBUG] Planner State:", { hasSetup: plannerState.hasSetup, dailyDone: plannerState.dailyDone });
    state.streak = plannerState.streak;

    const overlayContainer = document.getElementById('planner-onboarding-overlay');
    const mainDashboard = document.getElementById('planner-main-dashboard');
    const editorOverlay = document.getElementById('routine-editor-overlay');
    
    // Safety: Ensure we hide overlays by default
    if (overlayContainer) overlayContainer.style.display = 'none';
    if (editorOverlay) editorOverlay.style.display = 'none';
    
    // Toggling between Onboarding and Dashboard
    if (!plannerState.hasSetup) {
        if (overlayContainer) {
            overlayContainer.style.display = 'block';
            document.querySelectorAll('.overlay-screen').forEach(s => s.style.display = 'none');
            const welcome = document.getElementById('planner-ob-welcome');
            if (welcome) welcome.style.display = 'flex';
        }
        if (mainDashboard) mainDashboard.style.display = 'none';
    } else {
        if (overlayContainer) overlayContainer.style.display = 'none';
        if (mainDashboard) {
            mainDashboard.style.display = 'block';
            renderPlannerDashboard();
        }
    }
}

// SETUP FLOW
function startPlannerOnboarding() {
    const welcome = document.getElementById('planner-ob-welcome');
    const questions = document.getElementById('planner-ob-questions');
    if (welcome) welcome.style.display = 'none';
    if (questions) questions.style.display = 'flex';
    plannerState.setupStep = 0;
    plannerState.answers = {};
    renderSetupQuestion();
}

function renderSetupQuestion() {
    const area = byId('planner-ob-question-area', 'question-area');
    const step = setupQuestions[plannerState.setupStep];
    const progress = ((plannerState.setupStep + 1) / setupQuestions.length) * 100;
    const progressBar = byId('planner-ob-progress', 'setup-progress');
    
    if (progressBar) {
        progressBar.style.width = `${progress}%`;
        progressBar.style.setProperty('--progress', `${progress}%`);
    }

    let html = `<h2 class="mb-4">${step.q}</h2>`;
    
    if (step.type === 'text') {
        html += `
            <textarea id="setup-text-input" class="modern-input" placeholder="Type here..." rows="4" style="width:100%; border-radius:20px; padding:20px; border:2px solid #e1ecf7; font-family:inherit; outline:none; font-size:1.05rem;"></textarea>
            <button class="primary-btn full-width mt-4" onclick="nextSetupStep()">Submit</button>
        `;
    } else if (step.type === 'tags') {
        html += `
            <div class="tags-container mb-5">
                ${step.options.map(opt => `<div class="tag-pill" onclick="this.classList.toggle('active')">${opt}</div>`).join('')}
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
    if (area) {
        area.style.opacity = '0';
        area.innerHTML = html;
        setTimeout(() => area.style.opacity = '1', 50);
    }
}

function selectOption(el, qId, val) {
    document.querySelectorAll('.option-pill').forEach(p => p.classList.remove('active'));
    el.classList.add('active');
    plannerState.answers[qId] = val;
    setTimeout(() => nextSetupStep(), 400);
}

function nextSetupStep() {
    if (plannerState.setupStep < setupQuestions.length - 1) {
        plannerState.setupStep++;
        renderSetupQuestion();
    } else {
        finishSetupInternal();
    }
}

function finishSetupInternal() {
    // Generate routine based on answers
    const routine = [];
    const type = plannerState.answers.skinType || 'Normal';
    const concern = plannerState.answers.concern || 'Glow';

    if (type === 'Oily') routine.push("Salicylic Cleanser");
    else if (type === 'Dry') routine.push("Creamy Cleanser");
    else if (type === 'Sensitive') routine.push("Centella Lotion");
    else routine.push("Mild Foam Cleanser");

    if (concern === 'Acne') routine.push("Spot Treatment");
    else if (concern === 'Glow') routine.push("Vitamin C Serum");
    else if (concern === 'Dark Spots') routine.push("Niacinamide Serum");
    else if (concern === 'Anti-aging') routine.push("Retinol Cream");
    else routine.push("Moisturizer");

    plannerState.routine = routine;
    plannerState.hasSetup = true;
    localStorage.setItem('planner-has-setup', 'true');
    saveRoutine();

    const questionScreen = document.getElementById('planner-ob-questions');
    const revealScreen = document.getElementById('planner-ob-reveal');
    const morningReveal = document.getElementById('reveal-morning-steps');
    const nightReveal = document.getElementById('reveal-night-steps');
    
    if (questionScreen && revealScreen) {
        questionScreen.style.display = 'none';
        revealScreen.style.display = 'flex';
        const revealHtml = routine.map((item) => `<li>${item}</li>`).join('');
        if (morningReveal) morningReveal.innerHTML = revealHtml;
        if (nightReveal) nightReveal.innerHTML = revealHtml;
    } else {
        setupPlanner();
    }
}

function finishPlannerOnboarding() {
    const overlay = document.getElementById('planner-onboarding-overlay');
    const reveal = document.getElementById('planner-ob-reveal');
    if (reveal) reveal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    setupPlanner();
}


// DAILY FLOW
function openChecklist() {
    const dailyEntry = document.getElementById('daily-entry');
    if (dailyEntry) dailyEntry.style.display = 'none';
    const dailyChecklist = document.getElementById('daily-checklist') || document.getElementById('routine-checklist-overlay');
    if (dailyChecklist) dailyChecklist.style.display = 'flex';
    renderDailyItems();
}

function renderDailyItems() {
    const list = document.getElementById('daily-items-list') || document.getElementById('routine-checklist-items');
    if (list) {
        list.innerHTML = plannerState.routine.map((item, i) => `
            <div class="daily-row" onclick="toggleDailyItem(this, ${i})">
                <span class="bold">${item}</span>
                <div class="row-check"><i class="fa-solid fa-check"></i></div>
            </div>
        `).join('');
    }
    checkAllDone();
}

function toggleDailyItem(el, index) {
    el.classList.toggle('checked');
    checkAllDone();
}

function checkAllDone() {
    const all = document.querySelectorAll('.daily-row');
    const checked = document.querySelectorAll('.daily-row.checked');
    const cameraArea = document.getElementById('checklist-camera-area');
    const finishBtn = document.getElementById('finish-checklist-btn');
    
    if (cameraArea) {
        if (checked.length === all.length && all.length > 0) {
            cameraArea.style.display = 'block';
            if (finishBtn) finishBtn.disabled = false;
        } else {
            cameraArea.style.display = 'none';
            if (finishBtn) finishBtn.disabled = true;
        }
    }
}

function finishChecklist() {
    if (plannerState.dailyDone) {
        const checklistOverlay = document.getElementById('routine-checklist-overlay');
        if (checklistOverlay) checklistOverlay.style.display = 'none';
        setupPlanner();
        return;
    }

    const todayKey = getLocalDateKey();
    plannerState.dailyDone = true;
    localStorage.setItem('planner-daily-done', todayKey);
    localStorage.setItem('planner-last-completed-date', todayKey);
    
    plannerState.streak++;
    localStorage.setItem('planner-streak', String(plannerState.streak));
    state.streak = plannerState.streak;

    const checklistOverlay = document.getElementById('routine-checklist-overlay');
    if (checklistOverlay) checklistOverlay.style.display = 'none';
    setupPlanner();
    showToast("Routine completed! +1 Streak");
}

// SELFIE FEATURE
function openCamera() {
    const input = document.getElementById('selfie-upload-input');
    if (input) input.click();
}

function handleSelfieUpload(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const scan = {
                date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                img: e.target.result
            };
            plannerState.scans.unshift(scan);
            localStorage.setItem('planner-scans', JSON.stringify(plannerState.scans));
            
            showToast("Selfie saved to timeline! ✨");
            renderScanHistory(); // Update Timeline gallery
        };
        reader.readAsDataURL(input.files[0]);
    }
}

// DASHBOARD
function renderPlannerDashboard() {
    const sCount = `${plannerState.streak} Day Streak`;
    const streakEl = document.getElementById('streak-count');
    const homeStreakEl = document.getElementById('home-streak-count');
    
    if (streakEl) streakEl.textContent = sCount;
    if (homeStreakEl) homeStreakEl.textContent = plannerState.streak;
    
    // Toggle Dashboard Selfie Area
    document.querySelectorAll('.completion-status').forEach((el) => {
        el.style.display = plannerState.dailyDone ? 'block' : 'none';
    });

    const morningBlur = document.getElementById('morning-blur-overlay');
    const nightBlur = document.getElementById('night-blur-overlay');
    if (morningBlur) morningBlur.style.display = plannerState.dailyDone ? 'none' : 'flex';
    if (nightBlur) nightBlur.style.display = plannerState.dailyDone ? 'none' : 'flex';

    renderPlannerCalendar();
    renderMainChecklist();
}

function renderMainChecklist() {
    const html = plannerState.routine.map(item => `
        <li><i class="fa-solid fa-check blue-check"></i> <span>${item}</span></li>
    `).join('');
    const list = document.getElementById('main-routine-list');
    const morningList = document.getElementById('morning-routine-list');
    const nightList = document.getElementById('night-routine-list');
    if (list) list.innerHTML = html;
    if (morningList) morningList.innerHTML = html;
    if (nightList) nightList.innerHTML = html;
}

// CALENDAR
function renderPlannerCalendar() {
    console.log("[CALENDAR] Rendering grid...");
    const grid = document.getElementById('planner-calendar-grid');
    const monthLabel = document.getElementById('calendar-month-year');
    
    try {
        const d = new Date(plannerState.currentYear, plannerState.currentMonth, 1);
        if (monthLabel) monthLabel.textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        const firstDay = d.getDay();
        const daysInMonth = new Date(plannerState.currentYear, plannerState.currentMonth + 1, 0).getDate();
        const today = new Date();
        const lastDoneDate = getPlannerLastDoneDate();
        const streakDates = new Map();

        let html = '';
        if (lastDoneDate && plannerState.streak > 0) {
            for (let offset = 0; offset < plannerState.streak; offset++) {
                const streakDate = new Date(lastDoneDate);
                streakDate.setDate(lastDoneDate.getDate() - offset);
                streakDates.set(getLocalDateKey(streakDate), offset === 0 ? 'current' : 'past');
            }
        }

        // 1. Dummies for previous month days
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="cal-day empty"></div>';
        }
        
        // 2. Real days for current month
        for (let i = 1; i <= daysInMonth; i++) {
            const curDate = new Date(plannerState.currentYear, plannerState.currentMonth, i);
            const dateKey = getLocalDateKey(curDate);
            let cls = 'cal-day';
            
            // Check if today
            if (i === today.getDate() && plannerState.currentMonth === today.getMonth() && plannerState.currentYear === today.getFullYear()) {
                cls += ' today';
            }
            
            const streakType = streakDates.get(dateKey);
            let flameHtml = '';
            if (streakType) {
                cls += ' has-streak';
                flameHtml = `<img src="assets/blue-flame.png" alt="" class="calendar-flame ${streakType}" onerror="this.style.display='none'">`;
            }

            html += `
                <div class="${cls}">
                    <span class="cal-day-num">${i}</span>
                    ${flameHtml}
                </div>`;
        }
        
        if (grid) {
            grid.innerHTML = html;
            console.log("[CALENDAR] Successfully injected " + daysInMonth + " days.");
        }
    } catch (e) {
        console.error("[CALENDAR] Render error:", e);
        if (grid) grid.innerHTML = '<div class="p-3 text-danger">Rendering Error</div>';
    }
}

function navMonth(dir) {
    plannerState.currentMonth += dir;
    if (plannerState.currentMonth > 11) {
        plannerState.currentMonth = 0;
        plannerState.currentYear++;
    } else if (plannerState.currentMonth < 0) {
        plannerState.currentMonth = 11;
        plannerState.currentYear--;
    }
    renderPlannerCalendar();
}

// ROUTINE EDITOR
function openRoutineEditor() {
    const editorOverlay = document.getElementById('routine-editor-overlay');
    if (editorOverlay) editorOverlay.style.display = 'block';
    renderEditorItems();
}

function closeRoutineEditor() {
    const editorOverlay = document.getElementById('routine-editor-overlay');
    if (editorOverlay) editorOverlay.style.display = 'none';
    saveRoutine();
    renderDailyItems();
    renderMainChecklist();
}

function renderEditorItems() {
    const list = document.getElementById('editor-items-list');
    if (list) {
        list.innerHTML = plannerState.routine.map((item, i) => `
            <div class="editor-row">
                <input type="text" class="editor-input" value="${item}" onchange="updateRoutineStep(${i}, this.value)">
                <button class="remove-step-btn" onclick="removeRoutineStep(${i})"><i class="fa-solid fa-trash-can"></i></button>
            </div>
        `).join('');
    }
}

function updateRoutineStep(index, val) {
    plannerState.routine[index] = val;
}

function removeRoutineStep(index) {
    plannerState.routine.splice(index, 1);
    renderEditorItems();
}

function addRoutineItem() {
    plannerState.routine.push("New Step");
    renderEditorItems();
}

function saveRoutine() {
    localStorage.setItem('planner-routine', JSON.stringify(plannerState.routine));
}

function startPlannerOnboarding() {
    const welcome = document.getElementById('planner-ob-welcome');
    const questions = document.getElementById('planner-ob-questions');
    if (welcome) welcome.style.display = 'none';
    if (questions) questions.style.display = 'flex';
    plannerState.setupStep = 0;
    plannerState.answers = {};
    renderSetupQuestion();
}



function startRoutineChecklist(period = 'morning') {
    const overlay = document.getElementById('routine-checklist-overlay');
    const title = document.getElementById('checklist-title');
    const subtitle = document.getElementById('checklist-subtitle');
    if (title) title.textContent = "Today's Routine";
    if (subtitle) subtitle.textContent = `${period[0].toUpperCase()}${period.slice(1)} Routine`;
    if (overlay) overlay.style.display = 'block';
    renderDailyItems();
    checkAllDone();
}

function openRoutineEditorFromChecklist() {
    openRoutineEditor();
}

function saveAndCloseEditor() {
    closeRoutineEditor();
}

function openSelfieCamera() {
    openCamera();
}

function openSelfieFromChecklist() {
    openCamera();
}

function toggleIngredientsCollapse() {
    const list = document.getElementById('prod-others-list');
    if (!list) return;
    list.style.display = list.style.display === 'none' ? 'block' : 'none';
}

function openSettingsSubPage(pageId) {
    const overlay = document.getElementById(`settings-${pageId}`);
    if (overlay) overlay.style.display = 'block';
}

function closeSettingsSubPage(pageId) {
    const normalized = pageId === 'settings-routine-reminders' ? pageId : `settings-${pageId}`;
    const overlay = document.getElementById(normalized);
    if (overlay) overlay.style.display = 'none';
}

function openSettingsToOnboarding() {
    switchView('onboarding');
}

function toggleReminderScheduleItem() {
    const toggle = document.getElementById('settings-reminder-toggle');
    const scheduleItem = document.getElementById('reminder-schedule-item');
    if (scheduleItem) scheduleItem.style.display = toggle && toggle.checked ? 'flex' : 'none';
}

function togglePasswordChange() {
    const section = document.getElementById('password-change-section');
    if (!section) return;
    section.style.display = section.style.display === 'none' || !section.style.display ? 'flex' : 'none';
}

function saveAccountDetails() {
    const profile = loadUserProfile() || {};
    const input = byId('profile-edit-username', 'onboarding-profile-username');
    if (input && input.value.trim()) {
        profile.username = input.value.trim();
        state.username = profile.username;
        const userDisp = document.getElementById('user-display-name');
        if (userDisp) userDisp.textContent = state.username;
        safeStorage.set('sc-username', state.username);
    }
    saveUserProfile(profile);
    closeSettingsSubPage('account-details');
    showToast('Account details saved');
}

function saveEditProfile() {
    saveAccountDetails();
    closeEditProfile();
}

function closeEditProfile() {
    const overlay = document.getElementById('profile-editor-overlay');
    if (overlay) overlay.style.display = 'none';
}

function saveSkinProfile() {
    const profile = loadUserProfile() || {};
    document.querySelectorAll('[data-profile-key]').forEach((group) => {
        const key = group.dataset.profileKey;
        if (!key) return;
        if (group.classList.contains('color-swatches')) {
            const active = group.querySelector('.swatch.active');
            if (active) profile[key] = active.dataset.val || active.style.background;
        } else if (group.classList.contains('pill-group') && group.classList.contains('single-select')) {
            const active = group.querySelector('.pill.active');
            if (active) profile[key] = active.dataset.val || active.textContent.trim();
        } else if (group.classList.contains('pill-group') && group.classList.contains('multi-select')) {
            profile[key] = Array.from(group.querySelectorAll('.pill.active')).map((pill) => pill.dataset.val || pill.textContent.trim());
        }
    });
    saveUserProfile(profile);
    applyUserProfile(profile);
    closeSettingsSubPage('skin-profile');
    showToast('Skin profile saved');
}

function saveReminders() {
    const reminderSettings = {
        enabled: Boolean(document.getElementById('settings-reminder-toggle')?.checked),
        amActive: Boolean(document.getElementById('am-reminder-active')?.checked),
        amTime: document.getElementById('am-reminder-time')?.value || '08:00',
        pmActive: Boolean(document.getElementById('pm-reminder-active')?.checked),
        pmTime: document.getElementById('pm-reminder-time')?.value || '21:30'
    };
    safeStorage.set('sc-reminders', JSON.stringify(reminderSettings));
    closeSettingsSubPage('settings-routine-reminders');
    showToast('Reminder settings saved');
}

function performPasswordChange() {
    const oldPassword = document.getElementById('old-password')?.value || '';
    const newPassword = document.getElementById('new-password')?.value || '';
    const confirmPassword = document.getElementById('confirm-password')?.value || '';

    if (!oldPassword || !newPassword || !confirmPassword) {
        showToast('Please fill all password fields');
        return;
    }
    if (newPassword !== confirmPassword) {
        showToast('New passwords do not match');
        return;
    }
    if (newPassword.length < 6) {
        showToast('Password must be at least 6 characters');
        return;
    }
    showToast('Password update is not connected yet');
}

function executeExportData() {
    const payload = {
        profile: loadUserProfile(),
        planner: {
            streak: plannerState.streak,
            routine: plannerState.routine,
            scans: plannerState.scans
        },
        session: {
            username: safeStorage.get('sc-username')
        }
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'skinbiee-export.json';
    link.click();
    URL.revokeObjectURL(url);
    showToast('Export ready');
}

function openClearDataModal() {
    const modal = document.getElementById('clear-data-modal');
    if (modal) modal.style.display = 'flex';
}

function closeClearDataModal() {
    const modal = document.getElementById('clear-data-modal');
    if (modal) modal.style.display = 'none';
}

function executeClearData() {
    clearSession();
    safeStorage.remove('sc-user-profile');
    localStorage.removeItem('planner-has-setup');
    localStorage.removeItem('planner-routine');
    localStorage.removeItem('planner-streak');
    localStorage.removeItem('planner-scans');
    localStorage.removeItem('planner-daily-done');
    localStorage.removeItem('planner-last-completed-date');
    closeClearDataModal();
    switchView('auth');
    showToast('Local app data cleared');
}

/* ==========================================================================
   TAB: SETTINGS
   ========================================================================== */
function setupSettings() {
    document.querySelectorAll('.swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            changeMascotColor(sw.dataset.color || sw.dataset.val);
        });
    });

    document.querySelectorAll('.pill-group .pill[data-theme]').forEach((pill) => {
        pill.addEventListener('click', () => {
            const targetTheme = pill.dataset.theme;
            if (targetTheme && targetTheme !== state.theme) toggleTheme();
        });
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            clearSession();
            switchView('auth');
        });
    }

    const remindersRaw = safeStorage.get('sc-reminders');
    if (remindersRaw) {
        try {
            const reminders = JSON.parse(remindersRaw);
            const toggle = document.getElementById('settings-reminder-toggle');
            const amActive = document.getElementById('am-reminder-active');
            const amTime = document.getElementById('am-reminder-time');
            const pmActive = document.getElementById('pm-reminder-active');
            const pmTime = document.getElementById('pm-reminder-time');
            if (toggle) toggle.checked = Boolean(reminders.enabled);
            if (amActive) amActive.checked = Boolean(reminders.amActive);
            if (amTime) amTime.value = reminders.amTime || amTime.value;
            if (pmActive) pmActive.checked = Boolean(reminders.pmActive);
            if (pmTime) pmTime.value = reminders.pmTime || pmTime.value;
        } catch (e) {
            console.warn('Could not restore reminders', e);
        }
    }
    toggleReminderScheduleItem();
}

function openEditProfile() {
    const overlay = document.getElementById('profile-editor-overlay');
    if (overlay) overlay.style.display = 'block';
}


/* ==========================================================================
   MASCOT & CHAT LOGIC
   ========================================================================== */
function setupMascotChat() {
    const compactChat = document.getElementById('chat-panel');
    const fsChat = document.getElementById('chat-fs-panel');

    // Open Compact
    floatMascotBtn.addEventListener('click', () => {
        compactChat.classList.add('open');
        triggerMascotAnim('happy');
        // Hide floating button while chat is open
        floatMascotBtn.style.opacity = '0';
        floatMascotBtn.style.pointerEvents = 'none';
        
        // Proactive check on open
        checkProactiveGreeting();
    });

    // Close Compact
    document.getElementById('chat-close').addEventListener('click', () => {
        compactChat.classList.remove('open');
        setTimeout(() => {
            floatMascotBtn.style.opacity = '1';
            floatMascotBtn.style.pointerEvents = 'auto';
            triggerMascotAnim('idle');
        }, 400);
    });

    // Expand to FS
    document.getElementById('chat-expand').addEventListener('click', () => {
        compactChat.classList.remove('open');
        fsChat.style.display = 'flex';
        bottomNav.style.display = 'none';
        topBar.style.display = 'none';
    });

    // Collapse from FS
    document.getElementById('chat-fs-collapse').addEventListener('click', () => {
        fsChat.style.display = 'none';
        compactChat.classList.add('open');
        bottomNav.style.display = 'flex';
        topBar.style.display = 'flex';
    });

    // Send Button Listeners
    setupChatInputs();
}

function setupChatInputs() {
    const ids = [
        { input: 'chat-input-compact', btn: 'chat-send-compact' },
        { input: 'chat-input-fs', btn: 'chat-send-fs' }
    ];

    ids.forEach(pair => {
        const inputEl = document.getElementById(pair.input);
        const btnEl = document.getElementById(pair.btn);

        if (btnEl && inputEl) {
            btnEl.onclick = () => handleChatSend(pair.input);
            inputEl.onkeypress = (e) => {
                if (e.key === 'Enter') handleChatSend(pair.input);
            };
        }
    });
}

function handleChatSend(inputId) {
    const inputEl = document.getElementById(inputId);
    const text = inputEl.value.trim();
    if (!text) return;

    // Clear both inputs
    document.getElementById('chat-input-compact').value = '';
    document.getElementById('chat-input-fs').value = '';

    appendChatMessage('user', text);
    
    // Mascot "Thinking"
    triggerMascotAnim('thinking');
    
    setTimeout(() => {
        const response = getMascotAIResponse(text);
        appendChatMessage('mascot', response);
        triggerMascotAnim('happy');
    }, 1000);
}

function appendChatMessage(sender, text) {
    const containers = [
        document.getElementById('chat-history-compact'),
        document.getElementById('chat-history-fs')
    ];

    containers.forEach(container => {
        if (!container) return;
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${sender}-bubble`;
        bubble.textContent = text;
        container.appendChild(bubble);
        container.scrollTop = container.scrollHeight;
    });
}

function checkProactiveGreeting() {
    // Only greet proactively if chat was just opened and no recent history
    const history = document.getElementById('chat-history-compact');
    if (history && history.children.length <= 1) {
        let msg = `Hey ${state.username}! I was just looking at your skin journey... `;
        
        if (state.view === 'analyzer') {
            msg += "That last scan looked interesting. Want to dive into what those results mean for your routine? 🔬";
        } else if (state.view === 'planner') {
            msg += `You're on a ${plannerState.streak} day streak! I'm so proud of you. Let's keep it going today! 🔥`;
        } else {
            msg += "You're doing great! Anything specific you want to chat about? I'm all ears! 💖";
        }
        
        setTimeout(() => appendChatMessage('mascot', msg), 500);
    }
}

function getMascotAIResponse(input) {
    const low = input.toLowerCase();
    
    // Intent: Greeting
    if (low.includes('hi') || low.includes('hello') || low.includes('hey')) {
        return `Hi ${state.username}! It's so good to see you. How is your skin feeling today? I've been keeping an eye on your progress! ✨`;
    }

    // Intent: Progress/Streak
    if (low.includes('streak') || low.includes('progress') || low.includes('how am i doing')) {
        return `You're absolutely killing it, ${state.username}! You've got a ${plannerState.streak} day streak going. Consistency is the secret sauce for that glow! 🌟`;
    }

    // Intent: Skincare advice / Concerns
    if (low.includes('dry') || low.includes('breakout') || low.includes('bad skin day')) {
        return `Oh no, I'm so sorry you're having a rough skin day. 🥺 Don't stress too much—it happens to the best of us! Let's maybe strip back to basics today. Want me to adjust your routine for a 'soothing' day?`;
    }

    // Intent: Ending
    if (low.includes('thanks') || low.includes('thank you')) {
        return `Anytime, bestie! I'm always here to cheer you on. Go get that glow! 💖`;
    }

    // Default: Friendly companion
    return `That's interesting! Tell me more about that. You know I love hearing about your journey, and I'm always here if you need a tip or just a buddy to talk to! 🌿`;
}

function triggerMascotAnim(animType) {
    const mascots = document.querySelectorAll('.mascot-blob');
    mascots.forEach(m => {
        m.classList.remove('idle', 'happy', 'thinking', 'surprised', 'sad');
        m.classList.add(animType);
    });

    // Auto revert happy/surprised after duration
    if (animType === 'happy' || animType === 'surprised') {
        setTimeout(() => {
            mascots.forEach(m => {
                m.classList.remove(animType);
                if (!m.classList.contains('thinking')) m.classList.add('idle');
            });
        }, 2000);
    }
}

/* ==========================================================================
   HELPERS & UTILS
   ========================================================================== */
function showLoading() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading-overlay').style.display = 'none';
}

function showToast(message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideDownToast 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 2500);
}

/* ==========================================================================
   PWA INSTALLATION LOGIC
   ========================================================================== */
function initPWAPrompt() {
    const isInstalled = safeStorage.get('sc-pwa-installed') === 'true' || 
                        window.matchMedia('(display-mode: standalone)').matches;
    
    if (isInstalled) {
        safeStorage.set('sc-pwa-installed', 'true');
        return;
    }

    let shownCount = parseInt(safeStorage.get('sc-pwa-shown-count') || '0', 10);
    
    // User requested "at least 3 times pop of download"
    // We will show it until shownCount reaches 3 or they install it.
    if (shownCount >= 3) return;

    // Wait a brief period before showing the popup to not disrupt initial load
    setTimeout(() => {
        const overlay = document.getElementById('pwa-prompt-overlay');
        const installBtn = document.getElementById('pwa-main-install-btn');
        const laterBtn = document.getElementById('pwa-later-btn');
        const closeBtn = document.getElementById('pwa-close-btn');

        if (!overlay) return;

        overlay.style.display = 'flex';
        shownCount++;
        safeStorage.set('sc-pwa-shown-count', shownCount.toString());

        if (installBtn) {
            installBtn.onclick = async () => {
                if (deferredPrompt) {
                    deferredPrompt.prompt();
                    const { outcome } = await deferredPrompt.userChoice;
                    if (outcome === 'accepted') {
                        safeStorage.set('sc-pwa-installed', 'true');
                    }
                    deferredPrompt = null;
                } else {
                    // Fallback for browsers logic
                    showToast("To install: Open browser menu and select 'Install App' or 'Add to Home Screen'.");
                }
                overlay.style.display = 'none';
            };
        }

        const closePrompt = () => { overlay.style.display = 'none'; };
        if (laterBtn) laterBtn.onclick = closePrompt;
        if (closeBtn) closeBtn.onclick = closePrompt;

    }, 4000); 
}

// Start App
window.addEventListener('DOMContentLoaded', init);

document.addEventListener('click', (e) => {
    if (e.target.closest('#home-mascot')) {
        triggerMascotAnim('happy');

        setTimeout(() => {
            triggerMascotAnim('idle');
        }, 800);
    }
});
