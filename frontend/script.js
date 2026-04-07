/* ==========================================================================
   CONFIG & API
   ========================================================================== */
const API_BASE_URL = (window.location.port === "8001" || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") 
    ? "http://localhost:5000" 
    : window.location.origin;

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
/* ==========================================================================
   TAB: ANALYZER (Restored Action Cards)
   ========================================================================== */
function setupAnalyzer() {
    // Buttons for Skin Analysis
    const btnSkinCamera = document.getElementById('btn-skin-camera');
    const btnSkinGallery = document.getElementById('btn-skin-gallery');
    const skinFileInput = document.getElementById('skin-file-input');

    if (btnSkinCamera) btnSkinCamera.onclick = () => skinFileInput.click();
    if (btnSkinGallery) btnSkinGallery.onclick = () => skinFileInput.click();

    if (skinFileInput) {
        skinFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('skin-img-preview');
                    if (preview) preview.src = event.target.result;
                    showAnalyzerSubState('skin', 'preview');
                    triggerMascotAnim('surprised');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
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
                    body: formData
                });
                
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text();
                    console.error("[NET] Non-JSON response in script.js:", text);
                    showToast("Server error: AI backend returned an invalid response.");
                    showAnalyzerSubState('skin', 'input');
                    return;
                }

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
    const btnProdCamera = document.getElementById('btn-prod-camera');
    const btnProdGallery = document.getElementById('btn-prod-gallery');
    const prodFileInput = document.getElementById('prod-file-input');

    if (btnProdCamera) btnProdCamera.onclick = () => prodFileInput.click();
    if (btnProdGallery) btnProdGallery.onclick = () => prodFileInput.click();

    if (prodFileInput) {
        prodFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    const preview = document.getElementById('prod-img-preview');
                    if (preview) preview.src = event.target.result;
                    showAnalyzerSubState('prod', 'preview');
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
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
                    body: formData
                });
                
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const text = await response.text();
                    console.error("[NET] Non-JSON response in script.js:", text);
                    showToast("Server error: Product scanner returned an invalid response.");
                    showAnalyzerSubState('prod', 'input');
                    return;
                }

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
            if (document.querySelector('#skin-input-state .instruction-section')) {
                document.querySelector('#skin-input-state .instruction-section').style.display = 'none';
            }
            if (document.querySelector('#skin-input-state .centered-action-group')) {
                document.querySelector('#skin-input-state .centered-action-group').style.display = 'none';
            }
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
    
    if (badgeContainer) badgeContainer.innerHTML = '';
    if (list) list.innerHTML = '';

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
    const results = document.getElementById('skin-results-state');
    const input = document.getElementById('skin-input-state');
    if (results) results.style.display = 'none';
    if (input) input.style.display = 'block';
    
    const pZone = document.getElementById('skin-preview-zone');
    if (pZone) pZone.style.display = 'none';
    
    // Clear product results too
    const ingResults = document.getElementById('ing-results-state');
    const ingInput = document.getElementById('ing-input-state');
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
    // RE-SYNC STATE WITH STORAGE TO PREVENT LOOPS
    plannerState.hasSetup = localStorage.getItem('planner-has-setup') === 'true';
    checkStreakMaintenance();
    plannerState.streak = parseInt(localStorage.getItem('planner-streak') || '0', 10) || 0;
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
    
    showLoading();
    setTimeout(() => {
        hideLoading();
        setupPlanner();
    }, 1500);
}

// DAILY FLOW
function openChecklist() {
    document.getElementById('daily-entry').style.display = 'none';
    const dailyChecklist = document.getElementById('daily-checklist');
    if (dailyChecklist) dailyChecklist.style.display = 'flex';
    renderDailyItems();
}

function renderDailyItems() {
    const list = document.getElementById('daily-items-list');
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
    const completionStatus = document.querySelector('.completion-status');
    if (completionStatus) {
        completionStatus.style.display = plannerState.dailyDone ? 'block' : 'none';
    }

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
