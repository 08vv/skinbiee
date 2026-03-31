/* ==========================================================================
   STATE & DOM ELEMENTS
   ========================================================================== */
const state = {
    view: 'auth', // auth, onboarding, home, analyzer, planner, settings
    theme: 'light',
    mascotColor: 'blue',
    username: 'Melani',
    streak: 5,
    onboardingStep: 1
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
    
    // Initial history load
    renderScanHistory();
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

    // RE-BIND ANALYZER LISTENERS TO BE ABSOLUTELY SURE
    if (viewName === 'analyzer') setupAnalyzer();
    if (viewName === 'planner') setupPlanner();
}

function switchTab(viewName) {
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
        authForm.onsubmit = (e) => {
            e.preventDefault();
            console.log("Auth form submitted. isSignup:", isSignup);
            
            const unameInput = document.getElementById('auth-username');
            const uname = unameInput ? unameInput.value.trim() : '';
            if (uname) state.username = uname;
            
            const userDisp = document.getElementById('user-display-name');
            if (userDisp) userDisp.textContent = state.username;

            if (isSignup) {
                console.log("Navigating to onboarding");
                switchView('onboarding');
            } else {
                let profile = loadUserProfile();
                console.log("Loaded profile:", profile);
                
                // If no profile found, create a default one so user isn't stuck
                if (!profile) {
                    console.log("No profile found - creating default for login");
                    profile = {
                        username: state.username,
                        skinType: 'Normal',
                        concern: 'None',
                        sensitive: 'No'
                    };
                    saveUserProfile(profile);
                }
                
                applyUserProfile(profile);
                console.log("Navigating to home (returning user)");
                switchView('home');
                triggerMascotAnim('happy');
                showToast(`Welcome back, ${state.username}!`);
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
function setupAnalyzer() {
    // Buttons for Skin Analysis (Skinbiee suffix: -sb)
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

            console.log("DEBUG: Starting skin analysis...");
            showAnalyzerSubStateSB('skin', 'processing');
            triggerMascotAnim('thinking');

            const formData = new FormData();
            formData.append('image', file);

            try {
                showToast("Mascot is scanning your skin... 🧸");
                const response = await fetch(`${API_BASE_URL}/api/analyze-skin`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.status === 'success') {
                    showToast("Results are in! ✨");
                    
                    // SAVE TO TIMELINE
                    const scanRecord = {
                        id: Date.now(),
                        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                        img: URL.createObjectURL(file), // Local blob for display
                        results: data.results,
                        type: 'face'
                    };
                    plannerState.scans.unshift(scanRecord);
                    localStorage.setItem('planner-scans', JSON.stringify(plannerState.scans));

                    renderSkinResultsSB(data.results, URL.createObjectURL(file));
                    showAnalyzerSubStateSB('skin', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Analysis failed: " + data.error);
                    showAnalyzerSubStateSB('skin', 'input');
                }
            } catch (err) {
                console.error("DEBUG: FETCH ERROR:", err);
                showToast("Connection Error: Is the AI Server running?");
                showAnalyzerSubStateSB('skin', 'input');
            }
        };
    }

    // Buttons for Product Analysis (Skinbiee suffix: -sb)
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

            console.log("DEBUG: Starting product scan...");
            showAnalyzerSubStateSB('prod', 'processing');
            triggerMascotAnim('thinking');

            const formData = new FormData();
            formData.append('image', file);

            try {
                showToast("Mascot is scanning your product... 🧴");
                const response = await fetch(`${API_BASE_URL}/api/analyze-product`, {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.status === 'success') {
                    showToast("Ingredient analysis ready!");
                    
                    // Optional: Save product scans to timeline too
                    const scanRecord = {
                        id: Date.now(),
                        date: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
                        img: URL.createObjectURL(file),
                        results: data.analysis,
                        type: 'product'
                    };
                    plannerState.scans.unshift(scanRecord);
                    localStorage.setItem('planner-scans', JSON.stringify(plannerState.scans));

                    renderProdResultsSB(data);
                    showAnalyzerSubStateSB('prod', 'results');
                    triggerMascotAnim('happy');
                } else {
                    showToast("Scan failed: " + data.error);
                    showAnalyzerSubStateSB('prod', 'input');
                }
            } catch (err) {
                console.error("DEBUG: FETCH ERROR:", err);
                showToast("Connection Error: Check AI Server console.");
                showAnalyzerSubStateSB('prod', 'input');
            }
        };
    }

    // Remove buttons
    const removeSkin = document.getElementById('remove-skin-preview-sb');
    if (removeSkin) removeSkin.onclick = () => showAnalyzerSubStateSB('skin', 'input');
    
    const removeProd = document.getElementById('remove-prod-preview-sb');
    if (removeProd) removeProd.onclick = () => showAnalyzerSubStateSB('prod', 'input');
}

/**
 * Toggles visibility of states within analyzer sub-views (Skinbiee Version)
 */
function showAnalyzerSubStateSB(mode, state) {
    if (mode === 'skin') {
        const states = {
            input: document.querySelector('#sub-skin-analysis .input-state'),
            preview: document.getElementById('skin-preview-zone-sb'),
            processing: document.getElementById('skin-processing-state-sb'),
            results: document.getElementById('skin-results-state-sb')
        };
        // Reset all
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
                renderScanHistory(); // Correct function name
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
                renderScanHistory(); // Correct function name
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
    if (list) list.innerHTML = '';

    // Friendly Advice Mapping
    const advice = {
        "Acne": "Your skin is dealing with some breakouts. We'll focus on soothing and clearing these areas gently! 🌿",
        "Dark Spots": "We noticed some areas with extra pigment. These can fade over time with brightening care! ✨",
        "Oiliness": "Your skin is producing extra glow. We'll help balance it so you stay fresh all day. 🌊",
        "Dryness": "Your skin is feeling a bit thirsty! We'll look for rich, hydrating ingredients for you. 💧",
        "Normal": "Your skin is looking balanced and healthy! Let's keep it protected and happy. ☀️",
        "Healthy / Normal": "Overall, your skin is in a great place! Just keep up the healthy habits. 🌟"
    };

    // Detect skin type from results
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
        // Correct color mapping: Moderate=yellow, Mild=green, anything else=red
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

    // Product recommendations button — appears after results, collapses/expands on click
    const existingBtn = document.getElementById('btn-go-products-sb');
    if (!existingBtn) {
        const btn = document.createElement('button');
        btn.id = 'btn-go-products-sb';
        btn.className = 'primary-btn full-width mt-4';
        btn.textContent = 'See Recommended Products 🛍️';
        btn.onclick = () => showProductRecommendations(results);
        if (list) list.parentElement.appendChild(btn);

        // Container that recommendations will be injected into
        const recContainer = document.createElement('div');
        recContainer.id = 'product-rec-container';
        if (list) list.parentElement.appendChild(recContainer);
    } else {
        // Results re-rendered — update closure so button always has fresh results
        existingBtn.onclick = () => showProductRecommendations(results);
        existingBtn.textContent = 'See Recommended Products 🛍️';
        const recContainer = document.getElementById('product-rec-container');
        if (recContainer) recContainer.innerHTML = '';
    }
}

/* ==========================================================================
   PRODUCT RECOMMENDATIONS
   ========================================================================== */
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

function showProductRecommendations(results) {
    const container = document.getElementById('product-rec-container');
    if (!container) return;

    // Toggle off if already shown
    if (container.innerHTML.trim() !== '') {
        container.innerHTML = '';
        const btn = document.getElementById('btn-go-products-sb');
        if (btn) btn.textContent = 'See Recommended Products 🛍️';
        return;
    }

    const btn = document.getElementById('btn-go-products-sb');
    if (btn) btn.textContent = 'Hide Recommendations ✕';

    // Build heading
    container.innerHTML = `
        <div class="rec-section-header mt-4">
            <h3>Recommended for You</h3>
            <p class="micro-text" style="color:var(--text-secondary);margin-bottom:0">Curated picks based on your scan results</p>
        </div>
        <div class="product-rec-grid mt-3" id="rec-cards-grid"></div>
    `;

    const grid = container.querySelector('#rec-cards-grid');

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

function renderProdResultsSB(data) {
    const analysis = data.analysis;
    const title = document.getElementById('prod-result-title-sb');
    const scoreBadge = document.getElementById('prod-score-badge-sb');
    const desc = document.getElementById('prod-result-desc-sb');
    const ingredientsBox = document.getElementById('prod-ingredients-text-sb');

    // Backend returns: score (0-100), recommendation, good_ingredients, bad_ingredients
    const isGood = analysis.recommendation === 'Good Fit';
    const isWarn = analysis.recommendation === 'Acceptable';
    const scoreOutOf10 = (analysis.score / 10).toFixed(1);

    if (title) title.textContent = isGood ? "Safe & Compatible! ✅" : isWarn ? "Use With Caution ⚠️" : "Not Recommended ❌";

    if (scoreBadge) {
        scoreBadge.className = `severity-badge ${isGood ? 'badge-green' : isWarn ? 'badge-yellow' : 'badge-red'}`;
        scoreBadge.textContent = `Score: ${scoreOutOf10}/10`;
    }

    if (desc) {
        let html = `<strong>Verdict:</strong> ${analysis.recommendation}<br><br>`;

        // Good ingredients found
        if (analysis.good_ingredients && analysis.good_ingredients.length > 0) {
            html += `<div class="mt-2 mb-2"><strong style="color:#6bcb77">✅ Beneficial Ingredients:</strong><ul class="micro-text mt-1 mb-0">`;
            analysis.good_ingredients.forEach(ing => {
                const name = ing.name || ing;
                const benefit = ing.benefit || ing.why || 'Beneficial for your skin type';
                html += `<li><strong>${name}</strong>: ${benefit}</li>`;
            });
            html += `</ul></div>`;
        }

        // Bad ingredients found
        if (analysis.bad_ingredients && analysis.bad_ingredients.length > 0) {
            html += `<div class="mt-2 mb-2"><strong style="color:#ff6b6b">⚠️ Ingredients to Watch:</strong><ul class="micro-text mt-1 mb-0">`;
            analysis.bad_ingredients.forEach(ing => {
                const name = ing.name || ing;
                const reason = ing.reason || ing.why || 'May be irritating for your skin type';
                html += `<li><strong>${name}</strong>: ${reason}</li>`;
            });
            html += `</ul></div>`;
        }

        if (analysis.good_ingredients.length === 0 && analysis.bad_ingredients.length === 0) {
            html += `<p class="micro-text text-muted">No specifically notable ingredients were detected. The product appears neutral for your skin type.</p>`;
        }

        desc.innerHTML = html;
    }

    // Show full extracted text
    if (ingredientsBox) {
        ingredientsBox.textContent = data.ingredients 
            ? data.ingredients 
            : 'No ingredient text could be extracted from the image.';
    }
}

function renderTimelineSB() {
    const grid = document.getElementById('timeline-gallery-grid-skinbiee');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    if (plannerState.scans.length === 0) {
        grid.innerHTML = '<div class="text-center py-5 text-muted" style="grid-column: 1/-1;">No scans saved yet. <br> Finish an analysis to see it here!</div>';
        return;
    }

    plannerState.scans.forEach(scan => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        
        const imgPath = scan.img || 'assets/scan-face.png';
        let summary = "Skin Scan";
        if (scan.type === 'face' && scan.results && scan.results.length > 0) {
            summary = `${scan.results[0].concern} (${scan.results[0].severity})`;
        } else if (scan.type === 'product') {
            summary = "Product Scan";
        }

        item.innerHTML = `
            <img src="${imgPath}" alt="Scan">
            <div class="gallery-date">${scan.date}</div>
            <div class="gallery-label">${summary}</div>
        `;
        
        grid.appendChild(item);
    });
}

function resetAnalyzer() {
    showAnalyzerSubStateSB('skin', 'input');
    showAnalyzerSubStateSB('prod', 'input');
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
            const ingResults = document.getElementById('ing-results-state-sb');
            const ingInput = document.getElementById('ing-input-state-sb');
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

function renderScanHistory() {
    const gallery = document.getElementById('timeline-gallery-grid-skinbiee');
    if (!gallery) return;

    if (plannerState.scans.length === 0) {
        gallery.innerHTML = '<div class="text-center py-5 text-muted" style="grid-column: 1/-1;">No scans saved yet. <br> Finish an analysis to see it here!</div>';
        return;
    }

    gallery.innerHTML = plannerState.scans.map(item => {
        const summary = (item.type === 'face' && item.results && item.results.length > 0) 
            ? `${item.results[0].severity} ${item.results[0].concern}` 
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

/* ==========================================================================
   TAB: PLANNER (REBUILT FOR SKINBIEE)
   ========================================================================== */
let plannerState = {
    hasSetup: localStorage.getItem('planner-has-setup') === 'true',
    routine: JSON.parse(localStorage.getItem('planner-routine')) || ['Cleanser', 'Moisturizer'],
    dailyDone: localStorage.getItem('planner-daily-done') === new Date().toDateString(),
    streak: parseInt(localStorage.getItem('planner-streak')) || 5,
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

function setupPlanner() {
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

// SETUP FLOW
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
    if (area) {
        area.innerHTML = html;
    }
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
    localStorage.setItem('planner-has-setup', 'true');
    saveRoutine();
    setupPlanner();
}

// DAILY FLOW
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

function finishChecklist() {
    plannerState.dailyDone = true;
    localStorage.setItem('planner-daily-done', new Date().toDateString());
    plannerState.streak++;
    localStorage.setItem('planner-streak', plannerState.streak);
    setupPlanner();
    showToast("Routine completed! +1 Streak");
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
    if (sBadge) sBadge.textContent = `${plannerState.streak} Day Streak`;
    
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
    const d = new Date(plannerState.currentYear, plannerState.currentMonth);
    if (monthLabel) monthLabel.textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    
    let html = '';
    for (let i = 1; i <= 31; i++) {
        html += `<div class="cal-day ${i === 26 ? 'today' : ''}">${i}</div>`;
    }
    if (grid) grid.innerHTML = html;
}

function navMonth(dir) {
    plannerState.currentMonth += dir;
    renderPlannerCalendar();
}

function openRoutineEditor() {
    document.getElementById('routine-editor-overlay').style.display = 'block';
}

function closeRoutineEditor() {
    document.getElementById('routine-editor-overlay').style.display = 'none';
}

function saveRoutine() {
    localStorage.setItem('planner-routine', JSON.stringify(plannerState.routine));
}

/* ==========================================================================
   TAB: SETTINGS
   ========================================================================== */
function setupSettings() {
    document.querySelectorAll('.swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            changeMascotColor(sw.dataset.color);
        });
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        switchView('auth');
    });
}

function openEditProfile() {
    showToast('Edit profile clicked');
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

/**
 * Appends a message to BOTH compact and fullscreen chat history
 */
function appendChatMessage(sender, text) {
    const containers = [
        document.getElementById('chat-history-compact'),
        document.getElementById('chat-history-fs')
    ];

    containers.forEach(container => {
        if (!container) return;
        
        // Remove "I can help you build your routine..." placeholder if it's the first real message
        if (container.children.length === 1 && container.children[0].classList.contains('mascot-bubble')) {
            const firstMsg = container.children[0].textContent.trim();
            if (firstMsg.includes('help you build') || firstMsg.includes('Don\'t forget your sunscreen')) {
                // Keep it if we want, or replace. Let's keep one initial greeting but remove duplicates
            }
        }

        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${sender}-bubble`;
        bubble.textContent = text;
        container.appendChild(bubble);
        
        // Auto scroll
        setTimeout(() => {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: 'smooth'
            });
        }, 100);
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
            msg += `You're on a ${state.streak} day streak! I'm so proud of you. Let's keep it going today! 🔥`;
        } else {
            msg += "You're doing great! Anything specific you want to chat about? I'm all ears! 💖";
        }
        
        setTimeout(() => appendChatMessage('mascot', msg), 500);
    }
}

function getMascotAIResponse(input) {
    const low = input.toLowerCase();
    const name = state.username || "bestie";
    
    // Friendly, "Best Friend" style logic
    
    if (low.includes('hi') || low.includes('hello') || low.includes('hey')) {
        const greetings = [
            `Hey ${name}! Oh my gosh, so good to see you! How's your skin feeling today? I was just thinking about your journey! ✨`,
            `Hi ${name}! I've been waiting for you! How are you doing? Tell me everything about your morning routine! 🌿`,
            `Hey bestie! ✨ I'm so glad you're here. How has your skin been treating you today?`
        ];
        return greetings[Math.floor(Math.random() * greetings.length)];
    }

    if (low.includes('dry') || low.includes('flak') || low.includes('tight')) {
        return `Ugh, I totally feel you! 🥺 Having dry skin is the worst. Don't worry though, we've got this! Maybe we should skip the actives tonight and just focus on a super thick moisturizer? What do you think?`;
    }

    if (low.includes('breakout') || low.includes('pimple') || low.includes('acne') || low.includes('bad skin day')) {
        return `Oh no, I'm so sorry you're having a rough skin day. 🥺 It happens to literally everyone, I promise! You're still glowing to me. Let's keep it simple today—lots of water and maybe a soothing mask? I'm right here with you! 💖`;
    }

    if (low.includes('excited') || low.includes('good news') || low.includes('glow') || low.includes('working')) {
        return `YAY! I'm literally so happy for you right now! 🥳 I knew those products would start working their magic. Look at you glowing! We definitely need to keep this energy up!`;
    }

    if (low.includes('streak') || low.includes('consistent')) {
        return `You're doing AMAZING! A ${state.streak}-day streak? That's serious dedication. I'm actually so proud of how well you're taking care of yourself. Keep it up! 🔥`;
    }

    if (low.includes('sunscreen')) {
        return `YES! Sunscreen is non-negotiable! ☀️ I'm so glad you're on top of it. Your future self is going to thank you SO much!`;
    }

    if (low.includes('thanks') || low.includes('thank you')) {
        return `Of course! Anytime, ${name}! You know I've always got your back. Now go out there and keep being awesome! 💖`;
    }

    // fallback
    return `That's so interesting, tell me more! I love hearing about how you're doing. You know I'm always here to listen and help however I can! 🌸`;
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