// Auto-detect API backend if run on different ports (e.g. Frontend 8001 -> Backend 5000)
const API_BASE_URL = (window.location.port === "8001" || window.location.hostname === "localhost") 
    ? "http://localhost:5000" 
    : ""; 



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
        const data = await res.json();
        if (data.status === 'success' || data.success) {
            state.activeDates = new Set(data.active_dates || []);
            state.streak = data.streak || 0;
        }
    } catch (e) {
        console.error('[SERVER] Refresh failed', e);
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
}

/* ==========================================================================
   ROUTING / VIEW MANAGEMENT
   ========================================================================== */
function switchView(viewName) {
    // Hide all views
    views.forEach(v => v.classList.remove('active'));

    // Show target view
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) {
        targetView.classList.add('active');
        state.view = viewName;
    }

    // Toggle Shell elements
    if (viewName === 'auth' || viewName === 'onboarding') {
        topBar.style.display = 'none';
        bottomNav.style.display = 'none';
        floatMascotBtn.style.display = 'none';

        if (viewName === 'onboarding') {
            resetOnboarding();
        }
    } else {
        topBar.style.display = 'flex';
        bottomNav.style.display = 'flex';
        floatMascotBtn.style.display = 'block';

        // Update Bottom Nav active state
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.target === viewName);
        });
    }

    // Scroll top
    if (document.getElementById('main-content')) {
        document.getElementById('main-content').scrollTop = 0;
    }

    if (viewName === 'planner') setupPlanner();
}

function switchTab(viewName) {
    if (viewName === 'analyzer') {
        closeAnalyzerDetail();
    }
    switchView(viewName);
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
    // Buttons for Skin Analysis
    const btnSkinCamera = byId('btn-skin-camera', 'btn-skin-camera-sb');
    const btnSkinGallery = byId('btn-skin-gallery', 'btn-skin-gallery-sb');
    const skinFileInput = byId('skin-file-input', 'skin-file-input-sb');

    if (btnSkinCamera) btnSkinCamera.onclick = () => skinFileInput.click();
    if (btnSkinGallery) btnSkinGallery.onclick = () => skinFileInput.click();

    if (skinFileInput) {
        skinFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = byId('skin-img-preview', 'skin-img-preview-sb');
                    if (preview) preview.src = event.target.result;
                    const processingPreview = byId('skin-img-processing', 'skin-img-processing-sb');
                    if (processingPreview) processingPreview.src = event.target.result;
                    showAnalyzerSubState('skin', 'preview');
                    triggerMascotAnim('surprised');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    const btnAnalyzeSkin = byId('btn-analyze-skin', 'btn-analyze-skin-sb');
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
                const data = await response.json();

                if (data.status === 'success') {
                    showToast("Analysis complete! Rendering results.");
                    renderSkinResults(data.results, URL.createObjectURL(file));
                    showAnalyzerSubState('skin', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Analysis failed: " + data.error);
                    showAnalyzerSubState('skin', 'input');
                }
            } catch (err) {
                console.error(err);
                showToast("Connection Error: Make sure AI Backend is running on port 5000.");
                showAnalyzerSubState('skin', 'input');
            }
        };
    }

    // Buttons for Product Analysis
    const btnProdCamera = byId('btn-prod-camera', 'btn-prod-camera-sb');
    const btnProdGallery = byId('btn-prod-gallery', 'btn-prod-gallery-sb');
    const prodFileInput = byId('prod-file-input', 'prod-file-input-sb');

    if (btnProdCamera) btnProdCamera.onclick = () => prodFileInput.click();
    if (btnProdGallery) btnProdGallery.onclick = () => prodFileInput.click();

    if (prodFileInput) {
        prodFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = byId('prod-img-preview', 'prod-img-preview-sb');
                    if (preview) preview.src = event.target.result;
                    const processingPreview = byId('prod-img-processing', 'prod-img-processing-sb');
                    if (processingPreview) processingPreview.src = event.target.result;
                    showAnalyzerSubState('prod', 'preview');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    const btnAnalyzeProd = byId('btn-analyze-prod', 'btn-analyze-prod-sb');
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
                const data = await response.json();

                if (data.status === 'success') {
                    showToast("Scanner success! Results ready.");
                    renderProdResults(data);
                    showAnalyzerSubState('prod', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Scan failed: " + data.error);
                    showAnalyzerSubState('prod', 'input');
                }
            } catch (err) {
                console.error(err);
                showToast("Connection Error: Check AI Backend status.");
                showAnalyzerSubState('prod', 'input');
            }
        };
    }

    // Remove buttons
    const removeSkin = byId('remove-skin-preview', 'remove-skin-preview-sb');
    if (removeSkin) removeSkin.onclick = () => showAnalyzerSubState('skin', 'input');
    
    const removeProd = byId('remove-prod-preview', 'remove-prod-preview-sb');
    if (removeProd) removeProd.onclick = () => showAnalyzerSubState('prod', 'input');

    const goProductsBtn = byId('btn-go-products', 'btn-go-products-sb');
    if (goProductsBtn) goProductsBtn.onclick = () => openAnalyzerDetail('sub-ingredient-scanner');
}

/**
 * Toggles visibility of states within analyzer sub-views
 */
function showAnalyzerSubState(mode, state) {
    if (mode === 'skin') {
        const states = {
            input: byId('skin-input-state', 'skin-input-state-sb'),
            preview: byId('skin-preview-zone', 'skin-preview-zone-sb'),
            processing: byId('skin-processing-state', 'skin-processing-state-sb'),
            results: byId('skin-results-state', 'skin-results-state-sb')
        };
        // Reset all
        Object.values(states).forEach(el => { if (el) el.style.display = 'none'; });
        
        if (state === 'input') {
            if (states.input) states.input.style.display = 'block';
            const fileInput = byId('skin-file-input', 'skin-file-input-sb');
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
            input: byId('ing-input-state', 'ing-input-state-sb'),
            preview: byId('prod-preview-zone', 'prod-preview-zone-sb'),
            processing: byId('prod-processing-state', 'prod-processing-state-sb'),
            results: byId('ing-results-state', 'ing-results-state-sb')
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
            const fileInput = byId('prod-file-input', 'prod-file-input-sb');
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
    const img = byId('skin-result-img', 'skin-result-img-sb');
    if (img) img.src = imgUrl;

    const badgeContainer = byId('skin-result-badges', 'skin-result-badges-sb');
    const list = byId('skin-concerns-list', 'skin-concerns-list-sb');
    const title = byId('skin-result-title', 'skin-result-title-sb');
    const desc = byId('skin-result-desc', 'skin-result-desc-sb');
    
    if (badgeContainer) badgeContainer.innerHTML = '';
    if (list) list.innerHTML = '';
    if (title) title.textContent = 'Analysis Complete';
    if (desc) desc.textContent = "We've analyzed your photo. Here is what our trained models detected on your skin.";

    results.forEach(res => {
        // Badges
        const badge = document.createElement('span');
        badge.className = `severity-badge ${res.severity === 'Severe' ? 'badge-red' : res.severity === 'Moderate' ? 'badge-yellow' : 'badge-green'}`;
        badge.textContent = `${res.severity} ${res.concern}`;
        if (badgeContainer) badgeContainer.appendChild(badge);

        // List
        const card = document.createElement('div');
        card.className = 'ing-card mb-3';
        card.innerHTML = `
            <strong>${res.concern}</strong>
            <p class="micro-text mb-0">Confidence: ${(res.confidence * 100).toFixed(1)}%</p>
        `;
        if (list) list.appendChild(card);
    });
}

function renderProdResults(data) {
    const analysis = data.analysis || {};
    const goodList = analysis.good_ingredients || [];
    const badList = analysis.bad_ingredients || [];
    const breakdown = data.ingredient_breakdown || [];
    const detected = data.ingredients_detected || breakdown.map(item => item.name);
    const score = Number(analysis.score || 0);
    const safe = Boolean(analysis.safe);

    const verdictTitle = byId('prod-verdict-title', 'prod-result-title');
    const verdictSubtitle = byId('prod-verdict-subtitle', 'prod-result-desc');
    const scoreText = byId('prod-score-text', 'prod-score-badge');
    const scoreFill = document.getElementById('prod-score-fill');
    const ingCount = document.getElementById('prod-ing-count');
    const goodContainer = document.getElementById('prod-good-list');
    const badContainer = document.getElementById('prod-bad-list');
    const badCard = document.getElementById('prod-bad-card');
    const otherContainer = document.getElementById('prod-others-list');
    const pillsContainer = document.getElementById('prod-pills-container');
    const fastFactsCard = document.getElementById('prod-fast-facts-card');
    const tipText = document.getElementById('prod-tip-text');

    if (verdictTitle) verdictTitle.textContent = safe ? 'Good Match' : 'Use With Caution';
    if (verdictSubtitle) verdictSubtitle.textContent = analysis.recommendation || 'We checked this product against your skin profile.';
    if (scoreText) {
        if (scoreText.id === 'prod-score-badge') {
            scoreText.className = `severity-badge ${safe ? 'badge-green' : 'badge-red'}`;
            scoreText.textContent = `Compatibility: ${score}/10`;
        } else {
            scoreText.textContent = `${score.toFixed(1)} / 10`;
        }
    }
    if (scoreFill) scoreFill.style.width = `${Math.max(0, Math.min(score, 10)) * 10}%`;
    if (ingCount) ingCount.textContent = `${detected.length} ingredients detected`;
    if (tipText) tipText.textContent = analysis.recommendation || 'Patch test first if your skin is sensitive.';

    const renderIngredientRows = (container, items, emptyText) => {
        if (!container) return;
        if (!items.length) {
            container.innerHTML = `<div class="ing-card"><p class="micro-text mb-0">${emptyText}</p></div>`;
            return;
        }
        container.innerHTML = items.map((item) => {
            const name = typeof item === 'string' ? item : item.name;
            const reason = typeof item === 'string' ? '' : (item.reason || '');
            return `
                <div class="ing-card mb-3">
                    <strong>${name}</strong>
                    ${reason ? `<p class="micro-text mb-0">${reason}</p>` : ''}
                </div>
            `;
        }).join('');
    };

    renderIngredientRows(goodContainer, goodList, 'No standout ingredients were flagged as especially helpful.');
    renderIngredientRows(badContainer, badList, 'No major problem ingredients were detected.');
    renderIngredientRows(
        otherContainer,
        breakdown.filter((item) => item.rating === 'neutral'),
        'No additional neutral ingredients to show.'
    );

    if (badCard) badCard.style.display = badList.length ? 'block' : 'none';

    if (pillsContainer && fastFactsCard) {
        const pills = [];
        if (safe) pills.push('Generally compatible');
        if (goodList.length) pills.push(`${goodList.length} skin-friendly picks`);
        if (badList.length) pills.push(`${badList.length} ingredients to watch`);
        if (detected.length) pills.push(`${detected.length} total ingredients`);
        pillsContainer.innerHTML = pills.map((text) => `<span class="pill active">${text}</span>`).join('');
        fastFactsCard.style.display = pills.length ? 'block' : 'none';
    }
    return;
    const title = document.getElementById('prod-result-title');
    const scoreBadge = document.getElementById('prod-score-badge');
    const desc = document.getElementById('prod-result-desc');
    const ingredients = document.getElementById('prod-ingredients-text');

    if (title) title.textContent = "Analysis: " + (data.analysis.safe ? "Safe for you! ✅" : "Caution needed! ⚠️");
    if (scoreBadge) {
        scoreBadge.className = `severity-badge ${data.analysis.safe ? 'badge-green' : 'badge-red'}`;
        scoreBadge.textContent = `Compatibility: ${data.analysis.score}/10`;
    }
    if (desc) desc.textContent = data.analysis.recommendation || "We found some ingredients that might affect your skin concerns.";
    if (ingredients) ingredients.textContent = data.ingredients.substring(0, 200) + (data.ingredients.length > 200 ? "..." : "");
}

function resetAnalyzer() {
    const results = byId('skin-results-state', 'skin-results-state-sb');
    const input = byId('skin-input-state', 'skin-input-state-sb');
    if (results) results.style.display = 'none';
    if (input) input.style.display = 'block';
    
    const pZone = byId('skin-preview-zone', 'skin-preview-zone-sb');
    if (pZone) pZone.style.display = 'none';
    
    // Clear product results too
    const ingResults = byId('ing-results-state', 'ing-results-state-sb');
    const ingInput = byId('ing-input-state', 'ing-input-state-sb');
    if (ingResults) ingResults.style.display = 'none';
    if (ingInput) ingInput.style.display = 'block';
}

/**
 * Opens a sub-view in the analyzer tab
 * @param {string} subViewId 
 */
function openAnalyzerDetail(subViewId) {
    const dashboard = document.getElementById('analyzer-main-dashboard');
    const detailView = document.getElementById('analyzer-detail-view');
    
    if (dashboard) dashboard.style.display = 'none';
    if (detailView) detailView.style.display = 'block';
    
    // Hide all sub-views first
    document.querySelectorAll('.sub-view').forEach(v => v.style.display = 'none');
    
    // Show the specific sub-view
    const targetView = document.getElementById(subViewId);
    if (targetView) {
        targetView.style.display = 'block';
        
        // Populate timeline if opened
        if (subViewId === 'sub-timeline') {
            renderScanHistory();
        }

        // Reset state for the sub-view
        if (subViewId === 'sub-skin-analysis') resetAnalyzer();
        if (subViewId === 'sub-ingredient-scanner') {
            const ingResults = byId('ing-results-state', 'ing-results-state-sb');
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
    // RE-SYNC STATE WITH STORAGE TO PREVENT LOOPS
    plannerState.hasSetup = localStorage.getItem('planner-has-setup') === 'true';
    checkStreakMaintenance();
    plannerState.streak = parseInt(localStorage.getItem('planner-streak') || '0', 10) || 0;
    plannerState.dailyDone = getPlannerLastDoneKey() === getLocalDateKey();
    state.streak = plannerState.streak;

    const overlayContainer = byId('planner-onboarding-overlay', 'planner-overlay-container');
    const mainDashboard = document.getElementById('planner-main-dashboard');
    const editorOverlay = document.getElementById('routine-editor-overlay');
    
    if (overlayContainer) overlayContainer.style.display = 'none';
    if (editorOverlay) editorOverlay.style.display = 'none';
    
    document.querySelectorAll('.overlay-screen').forEach(s => s.style.display = 'none');
    
    if (!plannerState.hasSetup) {
        if (overlayContainer) overlayContainer.style.display = 'block';
        if (mainDashboard) mainDashboard.style.display = 'none';
        const plannerWelcome = document.getElementById('planner-ob-welcome');
        if (plannerWelcome) plannerWelcome.style.display = 'flex';
        const setupEntry = document.getElementById('setup-entry');
        if (setupEntry) setupEntry.style.display = 'flex';
    } else if (!plannerState.dailyDone) {
        if (overlayContainer) overlayContainer.style.display = 'none';
        if (mainDashboard) mainDashboard.style.display = 'block';
        const dailyEntry = document.getElementById('daily-entry');
        if (dailyEntry) dailyEntry.style.display = 'flex';
        renderPlannerDashboard();
    } else {
        if (overlayContainer) overlayContainer.style.display = 'none';
        if (mainDashboard) mainDashboard.style.display = 'block';
        renderPlannerDashboard();
    }
}

// SETUP FLOW
function startSetup() {
    const setupEntry = byId('planner-ob-welcome', 'setup-entry');
    const setupQuestionsScreen = byId('planner-ob-questions', 'setup-questions');
    if (setupEntry) setupEntry.style.display = 'none';
    if (setupQuestionsScreen) setupQuestionsScreen.style.display = 'flex';
    plannerState.setupStep = 0;
    plannerState.answers = {};
    renderSetupQuestion();
}

function renderSetupQuestion() {
    const area = document.getElementById('question-area') || document.getElementById('planner-ob-question-area');
    const step = setupQuestions[plannerState.setupStep];
    const progress = ((plannerState.setupStep + 1) / setupQuestions.length) * 100;
    const progressBar = document.getElementById('setup-progress') || document.getElementById('planner-ob-progress');
    if (progressBar) {
        if (progressBar.id === 'planner-ob-progress') {
            progressBar.style.width = `${progress}%`;
        } else {
            progressBar.style.setProperty('--progress', `${progress}%`);
        }
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
        finishSetup();
    }
}

function finishSetup() {
    // Top 2 steps logic
    const routine = [];
    const type = plannerState.answers.skinType;
    const concern = plannerState.answers.concern;

    // Type Step
    if (type === 'Oily') routine.push("Salicylic Cleanser");
    else if (type === 'Dry') routine.push("Creamy Cleanser");
    else if (type === 'Sensitive') routine.push("Centella Lotion");
    else routine.push("Mild Foam Cleanser");

    // Concern Step
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
    const revealHtml = routine.map((item) => `<li>${item}</li>`).join('');

    if (questionScreen && revealScreen) {
        questionScreen.style.display = 'none';
        revealScreen.style.display = 'flex';
        if (morningReveal) morningReveal.innerHTML = revealHtml;
        if (nightReveal) nightReveal.innerHTML = revealHtml;
        return;
    }

    showLoading();
    setTimeout(() => {
        hideLoading();
        setupPlanner();
    }, 1500);
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
    const grid = document.getElementById('planner-calendar-grid');
    const monthLabel = document.getElementById('calendar-month-year');
    
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

    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
    
    for (let i = 1; i <= daysInMonth; i++) {
        let cls = 'cal-day';
        if (i === today.getDate() && plannerState.currentMonth === today.getMonth() && plannerState.currentYear === today.getFullYear()) {
            cls += ' today';
        }
        const dateKey = getLocalDateKey(new Date(plannerState.currentYear, plannerState.currentMonth, i));
        const streakState = streakDates.get(dateKey);
        if (streakState) cls += ' has-streak';

        const flame = streakState
            ? `<img src="assets/blue-flame.png" alt="" class="calendar-flame ${streakState === 'current' ? 'current' : 'past'}">`
            : '';

        html += `
            <div class="${cls}">
                <span class="cal-day-num">${i}</span>
                ${flame}
            </div>
        `;
    }
    if (grid) grid.innerHTML = html;
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

function finishPlannerOnboarding() {
    const overlay = document.getElementById('planner-onboarding-overlay');
    const reveal = document.getElementById('planner-ob-reveal');
    if (reveal) reveal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    setupPlanner();
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
        
        if (state.view === 'view-analyzer') {
            msg += "That last scan looked interesting. Want to dive into what those results mean for your routine? 🔬";
        } else if (state.view === 'view-planner') {
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
