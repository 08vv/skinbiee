// Auto-detect API backend (local PC, localhost, or same-LAN phone access -> local Flask backend)
const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
const isPrivateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(window.location.hostname);
const isLocalFrontend = window.location.port === "8001" || isLocalHost || isPrivateIpv4;
const API_BASE_URL = isLocalFrontend
    ? `http://${window.location.hostname || "localhost"}:5000`
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

function getScopedStorage(_key, fallback = null) {
    return fallback;
}

function setScopedStorage() {}

function getScopedJson(_key, fallback) {
    return fallback;
}

function setScopedJson() {}

function clearScopedStorage() {}

function createDefaultPlannerState() {
    return {
        hasSetup: false,
        routine: ['Cleanser', 'Moisturizer'],
        dailyDone: false,
        amDone: false,
        pmDone: false,
        streak: 0,
        currentMonth: new Date().getMonth(),
        currentYear: new Date().getFullYear(),
        setupStep: 0,
        answers: {},
        currentChecklistPeriod: 'morning',
        plannerStartDate: null,
        onboardingCompletedAt: null
    };
}

function resetPlannerState() {
    plannerState = createDefaultPlannerState();
}

function resetGlowBotState() {
    glowBotMessages = [];
    glowBotProactiveShown = false;
}

let reminderSchedulerId = null;
let reminderTimeoutIds = [];
let reminderVisibilityHandler = null;

function resetUserRuntimeState(options = {}) {
    const { preserveIdentity = false } = options;
    resetPlannerState();
    resetGlowBotState();
    state.streak = 0;
    state.activeDates = new Set();
    state.serverScans = [];
    state.dailyLogs = [];
    state.userLogsWithPhotos = [];
    state.joinDate = null;
    state.userProfile = {};
    state.reminders = {};
    state.plannerMeta = {};
    state.userDataLoaded = false;
    state.userDataLoading = false;
    state.onboardingStep = 1;
    if (!preserveIdentity) {
        state.userId = null;
        state.username = 'Melani';
    }
}

function updateDisplayedUsername() {
    const userDisp = document.getElementById('user-display-name');
    if (userDisp) userDisp.textContent = state.username || 'Melani';
}

function loadPlannerStateFromStorage() {
    // Planner data now comes from the backend via /api/user/data.
}

function activateSession(userId, username) {
    resetUserRuntimeState({ preserveIdentity: true });
    state.userId = userId;
    state.username = username || '';
    updateDisplayedUsername();
    loadPlannerStateFromStorage();
    initializeGlowBotChat();
}

function clearSession() {
    stopReminderScheduler();
    resetUserRuntimeState();
    safeStorage.remove('sc-user-id');
    safeStorage.remove('sc-username');
    safeStorage.remove('sc-token');
    updateDisplayedUsername();
}


function persistSession(userId, username, token) {
    console.log("[SESSION] Saving session for:", username);
    const uid = parseInt(userId, 10);
    if (!Number.isFinite(uid) || uid < 1) {
        console.error('[SESSION] Refusing to persist invalid user id:', userId);
        clearSession();
        return;
    }

    activateSession(uid, username);
    safeStorage.set('sc-user-id', String(userId));
    safeStorage.set('sc-username', username);
    if (token) safeStorage.set('sc-token', token);
}


function restoreSession() {
    const raw = safeStorage.get('sc-user-id');
    const token = safeStorage.get('sc-token');
    const uid = raw != null ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(uid) || uid < 1 || !token) {
        clearSession();
        return false;
    }
    activateSession(uid, safeStorage.get('sc-username') || '');
    return true;
}


async function refreshUserDataFromServer() {
    if (state.userId == null) return;
    state.userDataLoading = true;
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
            state.serverScans = Array.isArray(data.scans) ? data.scans : [];
            state.dailyLogs = Array.isArray(data.logs) ? data.logs : [];
            state.userLogsWithPhotos = Array.isArray(data.logs)
                ? data.logs.filter((log) => log && log.photo_path)
                : [];
            state.activeDates = new Set(data.active_dates || []);
            state.joinDate = data.join_date || null;
            state.userProfile = data.profile && typeof data.profile === 'object' ? data.profile : {};
            state.reminders = data.reminders && typeof data.reminders === 'object' ? data.reminders : {};
            state.plannerMeta = data.planner && typeof data.planner === 'object' ? data.planner : {};
            state.email = data.email || '';
            applyUserProfile(state.userProfile);
            plannerState.streak = data.streak || 0;
            plannerState.hasSetup = Boolean(
                state.plannerMeta.onboarding_completed
                || (data.routine && Array.isArray(data.routine.am_steps) && data.routine.am_steps.length)
            );
            plannerState.routine = data.routine && Array.isArray(data.routine.am_steps) && data.routine.am_steps.length
                ? data.routine.am_steps
                : ['Cleanser', 'Moisturizer'];
            plannerState.plannerStartDate = state.plannerMeta.planner_start_date || state.joinDate || null;
            plannerState.onboardingCompletedAt = state.plannerMeta.onboarding_completed_at || null;
            const todaysLog = getPlannerLogForDate(getLocalDateKey(), state.dailyLogs);
            plannerState.amDone = Boolean(todaysLog?.am_done);
            plannerState.pmDone = Boolean(todaysLog?.pm_done);
            plannerState.dailyDone = plannerState.amDone || plannerState.pmDone;
            state.streak = plannerState.streak;
            state.userDataLoaded = true;
            applyRemindersToUI();
            startReminderScheduler();
            renderScanHistory();
            if (state.view === 'planner') setupPlanner();
        }
    } catch (e) {
        console.error('[SERVER] Refresh failed', e);
    } finally {
        state.userDataLoading = false;
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

/**
 * Resizes an image file if it exceeds target dimensions.
 * Returns a Blob.
 */
async function resizeImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => resolve(blob || file), file.type || 'image/jpeg', quality);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}


/* ==========================================================================
   STATE & DOM ELEMENTS
   ========================================================================== */
const state = {
    view: 'auth', // auth, onboarding, home, analyzer, planner, settings
    theme: 'light',
    mascotColor: 'blue',
    username: 'Melani',
    streak: 0,
    onboardingStep: 1,
    userId: null,
    activeDates: new Set(),
    serverScans: [],
    dailyLogs: [],
    userLogsWithPhotos: [],
    joinDate: null,
    userProfile: {},
    reminders: {},
    plannerMeta: {},
    userDataLoaded: false,
    userDataLoading: false,
    hasShownTriggerWarning: false
};

// DOM Elements
const views = document.querySelectorAll('.view');
const topBar = document.getElementById('top-bar');
const bottomNav = document.getElementById('bottom-nav');
const floatMascotBtn = document.getElementById('float-mascot-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

/* ==========================================================================
   SERVICE WORKER REGISTRATION
   ========================================================================== */
function registerServiceWorker() {
    console.log('[PWA] Checking PWA criteria...');
    console.log('[PWA] HTTPS:', location.protocol === 'https:' || location.hostname === 'localhost');
    console.log('[PWA] Service Worker supported:', 'serviceWorker' in navigator);

    if (isLocalFrontend && 'serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
            .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
            .then(() => {
                console.log('[SW] Local dev mode: unregistered existing service workers');
            })
            .catch((error) => {
                console.log('[SW] Local dev unregister failed:', error);
            });
        return;
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            console.log('[PWA] Page loaded, attempting service worker registration...');
            // Try root path first since that's where the server serves it from
            navigator.serviceWorker.register('/sw.js')
                .then((registration) => {
                    console.log('[SW] Service Worker registered successfully:', registration.scope);
                    console.log('[SW] Active:', registration.active);
                    console.log('[SW] Installing:', registration.installing);
                    console.log('[SW] Waiting:', registration.waiting);
                    
                    // Check if PWA install criteria are met
                    setTimeout(() => {
                        console.log('[PWA] Checking if install button should appear...');
                        console.log('[PWA] Manifest exists:', !!document.querySelector('link[rel="manifest"]'));
                        console.log('[PWA] Service Worker active:', !!registration.active);
                        console.log('[PWA] User not on mobile:', !/Mobi|Android/i.test(navigator.userAgent));
                    }, 2000);
                })
                .catch((error) => {
                    console.log('[SW] Service Worker registration failed:', error);
                    // Try frontend path as fallback
                    console.log('[SW] Trying frontend service worker path');
                    navigator.serviceWorker.register('/frontend/sw.js')
                        .then((reg) => {
                            console.log('[SW] Frontend service worker registered:', reg.scope);
                        })
                        .catch((err) => {
                            console.log('[SW] Frontend path also failed:', err);
                        });
                });
        });
    } else {
        console.log('[SW] Service Workers are not supported in this browser');
    }
}

/* ==========================================================================
   INITIALIZATION
   ========================================================================== */
async function init() {
    console.log("[DEBUG] init started");
    try {
        // 1. Basic initialization (fast)
        registerServiceWorker();
        const savedTheme = localStorage.getItem('sc-theme');
        if (savedTheme === 'dark') { toggleTheme(); }

        // 2. Auth State Check (Immediate UI direction)
        const hadSession = restoreSession();
        
        // Listeners & Components (can happen while loading data)
        setupAuthListeners();
        setupOnboardingListeners();
        setupBottomNav();
        setupMascotChat();
        setupAnalyzer();
        setupSettings();

        // 3. Routing Logic
        if (!hadSession) {
            // No session? Go straight to login.
            console.log("[AUTH] No session found, showing login.");
            switchView("auth");
        } else {
            // Session exists. Stay on splash while fetching fresh data.
            console.log("[AUTH] Session exists, refreshing data...");
            const statusEl = document.getElementById('splash-status');
            if (statusEl) statusEl.textContent = "Syncing your routine...";
            
            await refreshUserDataFromServer();
            
            // If still authenticated after refresh, go home.
            // (refreshUserDataFromServer handles 401 -> switchView('auth'))
            if (state.userId) {
                switchView("home");
            }
        }
        
        // Background tasks
        loadGlowBotChatData().catch(e => console.error("GlowBot data failed", e));

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
    const isAuthOrOnboarding = (viewName === 'auth' || viewName === 'onboarding' || viewName === 'splash');
    
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
        resetOnboarding(Boolean(state.fromSettings));
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
   USER PROFILE (API-backed)
   ========================================================================== */
async function saveUserProfile(profile) {
    if (!profile) return;
    
    // Optimistic Update
    const oldProfile = { ...state.userProfile };
    state.userProfile = { ...state.userProfile, ...profile };
    applyUserProfile(state.userProfile);

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/preferences`, {
            method: 'PUT',
            headers: {
                ...authHeadersRaw(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ profile: state.userProfile })
        });
        const parsed = await readApiResponse(response);
        if (!parsed.ok || !response.ok) {
            throw new Error(parsed.error || parsed.data?.error || 'Could not save profile');
        }
        state.userProfile = parsed.data.profile || profile;
        applyUserProfile(state.userProfile);
        return state.userProfile;
    } catch (err) {
        // Rollback on error
        state.userProfile = oldProfile;
        applyUserProfile(state.userProfile);
        throw err;
    }
}

function loadUserProfile() {
    return state.userProfile || {};
}

function applyUserProfile(profile) {
    if (!profile) return;
    state.username = profile.username || state.username;
    
    // Fix: Add null check for user-display-name
    updateDisplayedUsername();
    
    // Update profile photo in UI
    if (profile.photo_url) {
        updateAvatarUI(profile.photo_url);
    }
    
    // Surface relevant info on the mascot chat greeting
    const greetingBubble = document.querySelector('#chat-panel .mascot-bubble');
    if (greetingBubble && profile.skinType) {
        greetingBubble.textContent = `Hey ${state.username}! Remember to focus on your ${profile.skinType} skin routine today! 🌿`;
    }
}

function updateAvatarUI(url) {
    if (!url) return;
    const avatars = document.querySelectorAll('.user-avatar-image');
    avatars.forEach(avatar => {
        avatar.style.backgroundImage = `url('${url}')`;
        const icon = avatar.querySelector('i');
        if (icon) icon.style.display = 'none';
        
        // If it's the large preview, maybe we want to keep it looking polished
        if (avatar.id === 'profile-avatar-preview') {
            avatar.style.border = '2px solid var(--primary)';
        }
    });
}

function openProfilePicCamera() {
    const input = document.getElementById('profile-pic-input');
    if (input) input.click();
}

async function handleProfilePicUpload(input) {
    if (input.files && input.files[0]) {
        showLoading('Updating profile photo...');
        try {
            const resizedBlob = await resizeImage(input.files[0], 512, 512, 0.8);
            const formData = new FormData();
            formData.append('image', resizedBlob, 'profile.jpg');

            const response = await fetch(`${API_BASE_URL}/api/user/profile-photo`, {
                method: 'POST',
                headers: authHeadersRaw(),
                body: formData
            });

            const parsed = await readApiResponse(response);
            if (!parsed.ok) throw new Error(parsed.error || 'Upload failed');

            const profile = loadUserProfile() || {};
            profile.photo_url = parsed.data.photo_url;
            state.userProfile = profile; 
            
            updateAvatarUI(profile.photo_url);
            showToast('Profile photo updated! ✨');
        } catch (err) {
            console.error('[PROFILE] Upload failed', err);
            showToast('Could not update profile photo');
        } finally {
            hideLoading();
            input.value = ''; // Reset input
        }
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
                   console.error("[AUTH] Invalid response format");
                   hideLoading();
                   showToast("Server error: Invalid response format");
                   return;
                }

                const data = await res.json();
                hideLoading();
                if (!res.ok) { showToast(data.error || 'Auth Error'); return; }
                if (!Number.isFinite(parseInt(data.user_id, 10))) {
                    showToast('Server did not return a valid user session');
                    return;
                }

                persistSession(data.user_id, data.username, data.token);
                // Background refresh, don't block the switch
                refreshUserDataFromServer().catch(e => console.error("Initial refresh failed", e));
                switchView(isSignup ? 'onboarding' : 'home');
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

    // ── Google Sign-In ──────────────────────────────────────────────────
    initGoogleSignIn();
}

/* --------------------------------------------------------------------------
   GOOGLE SIGN-IN (Google Identity Services)
   -------------------------------------------------------------------------- */

// The Client ID is injected via a meta tag or set here directly.
// Replace with your actual Google Client ID once created.
const GOOGLE_CLIENT_ID = (() => {
    const meta = document.querySelector('meta[name="google-client-id"]');
    return meta ? meta.content : 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
})();

function initGoogleSignIn() {
    const googleBtn = document.getElementById('google-signin-btn');
    if (!googleBtn) return;

    // Wait for GIS library to load (it's async)
    function onGISReady() {
        if (typeof google === 'undefined' || !google.accounts) {
            // Retry in 500ms — GIS script is still loading
            setTimeout(onGISReady, 500);
            return;
        }

        // Initialize Google Identity Services
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: true,
        });

        // Wire up our custom button to trigger Google's popup
        googleBtn.addEventListener('click', (e) => {
            e.preventDefault();

            // Use the prompt (One Tap) popup
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed()) {
                    console.log('[GoogleAuth] One Tap not displayed:', notification.getNotDisplayedReason());
                    // Fallback: render an invisible Google button and click it
                    const hiddenDiv = document.createElement('div');
                    hiddenDiv.id = 'g_id_hidden';
                    hiddenDiv.style.cssText = 'position:fixed;top:-9999px;left:-9999px;';
                    document.body.appendChild(hiddenDiv);

                    google.accounts.id.renderButton(hiddenDiv, {
                        type: 'standard',
                        size: 'large',
                        theme: 'outline',
                    });

                    // Auto-click the rendered Google button
                    setTimeout(() => {
                        const gBtn = hiddenDiv.querySelector('[role="button"], button, div[tabindex]');
                        if (gBtn) gBtn.click();
                    }, 200);
                } else if (notification.isSkippedMoment()) {
                    console.log('[GoogleAuth] Prompt skipped:', notification.getSkippedReason());
                }
            });
        });

        console.log('[GoogleAuth] Google Sign-In initialized');
    }

    onGISReady();
}

async function handleGoogleCredentialResponse(response) {
    console.log('[GoogleAuth] Credential response received');

    if (!response || !response.credential) {
        showToast('Google sign-in was cancelled');
        return;
    }

    showLoading('Signing in with Google...');

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_token: response.credential })
        });

        const contentType = res.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            hideLoading();
            showToast('Server error: Invalid response format');
            return;
        }

        const data = await res.json();
        hideLoading();

        if (!res.ok) {
            showToast(data.error || 'Google sign-in failed');
            return;
        }

        if (!Number.isFinite(parseInt(data.user_id, 10))) {
            showToast('Server did not return a valid user session');
            return;
        }

        // Same flow as normal login — persist session + navigate
        persistSession(data.user_id, data.username, data.token);
        refreshUserDataFromServer().catch(e => console.error("Initial refresh failed", e));
        
        // New Google users go to onboarding, returning users go home
        // Check if user has profile data — if not, it's a new sign-up
        try {
            const userDataRes = await fetch(`${API_BASE_URL}/api/user/data`, {
                headers: authHeadersRaw()
            });
            const userData = await userDataRes.json();
            const hasProfile = userData.profile && Object.keys(userData.profile).length > 0;
            switchView(hasProfile ? 'home' : 'onboarding');
        } catch {
            // Default to onboarding for safety
            switchView('onboarding');
        }

        showToast('Welcome to Skinbiee! 🌿');
    } catch (err) {
        hideLoading();
        console.error('[GoogleAuth] Error:', err);
        showToast('Connection error during Google sign-in');
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
            // Save collected onboarding data to the backend
            const profileData = {
                username: state.username,
                age: document.getElementById('ob-age').value,
                gender: (document.querySelector('#ob-step-1 .pill.active') || {}).textContent || '',
                skinType: (document.querySelector('[data-target="ob-skintype"] .pill.active') || {}).textContent || '',
                concern: (document.querySelector('[data-target="ob-concern"] .pill.active') || {}).textContent || '',
                sensitive: (document.querySelector('[data-target="ob-sensitive"] .pill.active') || {}).textContent || '',
            };
            saveUserProfile(profileData).catch((err) => {
                console.error('[PROFILE] Failed to save onboarding profile', err);
                showToast('Could not save profile');
            });

            // Finish
            document.getElementById(`ob-step-4`).classList.remove('active');
            document.getElementById(`ob-step-done`).classList.add('active');

            mascot.classList.replace('idle', 'happy');
            document.querySelector('.ob-progress').style.display = 'none';
            backBtn.style.visibility = 'hidden';

            nextBtn.textContent = state.fromSettings ? 'Back to Settings' : 'Go to Home';
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

            if (state.onboardingStep === 1) {
                backBtn.style.visibility = state.fromSettings ? 'visible' : 'hidden';
            }
        } else if (state.onboardingStep === 1 && state.fromSettings) {
            state.fromSettings = false;
            switchView('settings');
        }
    });
}

function resetOnboarding(fromSettings = false) {
    state.onboardingStep = 1;
    document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
    document.getElementById('ob-step-1').classList.add('active');
    document.getElementById('ob-next-btn').textContent = 'Continue';
    document.getElementById('ob-step-num').textContent = '1';
    document.getElementById('ob-back').style.visibility = fromSettings ? 'visible' : 'hidden';
    document.querySelector('.ob-progress').style.display = 'block';
    document.getElementById('ob-mascot').classList.remove('happy');
    document.getElementById('ob-mascot').classList.add('idle');
}

/* ==========================================================================
   NAVIGATION (see setupBottomNav above in ROUTING section)
   ========================================================================== */

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
            showLoading();
            triggerMascotAnim('thinking');

            try {
                const resizedBlob = await resizeImage(file);
                const formData = new FormData();
                formData.append('image', resizedBlob, 'photo.jpg');

                const response = await fetch(`${API_BASE_URL}/api/analyze-skin`, {
                    method: 'POST',
                    headers: authHeadersRaw(),
                    body: formData
                });

                const parsed = await readApiResponse(response);
                hideLoading();
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
                    refreshUserDataFromServer().catch(e => console.error("Background sync failed", e));
                } else {
                    showToast("Analysis failed: " + (data.error || "Unknown error"));
                    showAnalyzerSubState('skin', 'input');
                }
            } catch (err) {
                hideLoading();
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
            showLoading();
            triggerMascotAnim('thinking');

            try {
                const resizedBlob = await resizeImage(file);
                const formData = new FormData();
                formData.append('image', resizedBlob, 'product.jpg');

                const response = await fetch(`${API_BASE_URL}/api/analyze-product`, {
                    method: 'POST',
                    headers: authHeadersRaw(),
                    body: formData
                });

                const parsed = await readApiResponse(response);
                hideLoading();
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
                    refreshUserDataFromServer().catch(e => console.error("Background sync failed", e));
                } else {
                    showToast("Scan failed: " + (data.error || "Unknown error"));
                    showAnalyzerSubState('prod', 'input');
                }
            } catch (err) {
                hideLoading();
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
        const borderColor = res.severity === 'Moderate' ? 'var(--severity-moderate)' : res.severity === 'Mild' ? 'var(--severity-mild)' : 'var(--severity-severe)';

        const badge = document.createElement('span');
        badge.className = `severity-badge ${severityColor}`;
        badge.textContent = `${res.severity} ${res.concern}`;
        if (badgeContainer) badgeContainer.appendChild(badge);

        const card = document.createElement('div');
        card.className = 'ing-card mb-3';
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
    let recContainer = document.getElementById('product-rec-container');
    
    if (!existingBtn) {
        const btn = document.createElement('button');
        btn.id = 'btn-go-products';
        btn.className = 'primary-btn full-width mt-4';
        btn.textContent = 'See Recommended Products 🛍️';
        btn.onclick = () => renderSkinProductRecommendations(results);
        if (list) list.parentElement.appendChild(btn);
    } else {
        existingBtn.onclick = () => renderSkinProductRecommendations(results);
        existingBtn.textContent = 'See Recommended Products 🛍️';
    }

    // Ensure container always exists
    if (!recContainer) {
        recContainer = document.createElement('div');
        recContainer.id = 'product-rec-container';
        const target = existingBtn || (list ? list.parentElement : null);
        if (target && target.parentElement) {
            target.insertAdjacentElement('afterend', recContainer);
        } else if (list) {
            list.parentElement.appendChild(recContainer);
        }
    } else {
        recContainer.innerHTML = '';
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
        const barColor = isGood ? 'var(--severity-mild)' : isWarn ? 'var(--severity-moderate)' : 'var(--severity-severe)';

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
    const progressPhotos = (state.userLogsWithPhotos || []).map((log) => ({
        date: formatTimelineDate(log.date),
        img: log.photo_path,
        label: 'Progress Photo'
    }));
    const serverScans = (state.serverScans || []).map((scan) => ({
        date: formatTimelineDate(scan.timestamp),
        img: scan.image_path || 'assets/scan-face.png',
        label: scan.condition || 'Scan'
    }));
    const allScans = [...progressPhotos, ...serverScans];

    if (allScans.length === 0) {
        const emptyHtml = '<div class="empty-state-copy">No scans saved for this account yet.</div>';
        if (gallery) gallery.innerHTML = emptyHtml;
        if (gallerySkinbiee) gallerySkinbiee.innerHTML = emptyHtml;
        return;
    }

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
let plannerState = createDefaultPlannerState();

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
    const dates = Array.from(state.activeDates || []);
    return dates.length ? dates.sort().slice(-1)[0] : null;
}

function getPlannerLogForDate(dateKey, logs = state.dailyLogs) {
    if (!dateKey || !Array.isArray(logs)) return null;
    return logs.find((log) => log && String(log.date || '').slice(0, 10) === dateKey) || null;
}

function getPlannerStartDateKey() {
    return plannerState.plannerStartDate || state.plannerMeta?.planner_start_date || state.joinDate || null;
}

function isPlannerDateStarted(dateKey) {
    const startDateKey = getPlannerStartDateKey();
    return Boolean(startDateKey && dateKey >= startDateKey);
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
    }
}

function setupPlanner() {
    console.log("[DEBUG] setupPlanner triggered");
    // RE-SYNC STATE WITH STORAGE TO PREVENT LOOPS
    loadPlannerStateFromStorage();
    const overlayContainer = document.getElementById('planner-onboarding-overlay');
    const mainDashboard = document.getElementById('planner-main-dashboard');
    const editorOverlay = document.getElementById('routine-editor-overlay');

    if (state.userId && !state.userDataLoaded) {
        if (overlayContainer) overlayContainer.style.display = 'none';
        if (mainDashboard) mainDashboard.style.display = 'none';
        if (editorOverlay) editorOverlay.style.display = 'none';
        if (!state.userDataLoading) {
            refreshUserDataFromServer();
        }
        return;
    }

    checkStreakMaintenance();
    const todaysLog = getPlannerLogForDate(getLocalDateKey());
    plannerState.amDone = Boolean(todaysLog?.am_done);
    plannerState.pmDone = Boolean(todaysLog?.pm_done);
    plannerState.dailyDone = plannerState.amDone || plannerState.pmDone;
    console.log("[DEBUG] Planner State:", {
        hasSetup: plannerState.hasSetup,
        amDone: plannerState.amDone,
        pmDone: plannerState.pmDone,
        plannerStartDate: plannerState.plannerStartDate
    });
    state.streak = plannerState.streak;

    // Safety: Ensure we hide overlays by default
    if (overlayContainer) overlayContainer.style.display = 'none';
    if (editorOverlay) editorOverlay.style.display = 'none';
    
    // Toggling between Onboarding and Dashboard
    if (!plannerState.hasSetup) {
        if (overlayContainer) {
            overlayContainer.style.display = 'block';
            const welcomeScreen = document.getElementById('planner-ob-welcome');
            const questions = document.getElementById('planner-ob-questions');
            const reveal = document.getElementById('planner-ob-reveal');
            if (welcomeScreen) welcomeScreen.style.display = 'none';
            if (questions) questions.style.display = 'none';
            if (reveal) reveal.style.display = 'none';
            if (welcomeScreen) welcomeScreen.style.display = 'flex';
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

async function finishSetupInternal() {
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

    try {
        await saveRoutine(routine, concern, {
            onboarding_completed: true,
            onboarding_completed_at: getLocalDateKey()
        });
    } catch (err) {
        console.error('[ROUTINE] Failed to save generated routine', err);
        showToast('Could not save routine');
        return;
    }

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

async function finishPlannerOnboarding() {
    const overlay = document.getElementById('planner-onboarding-overlay');
    const welcome = document.getElementById('planner-ob-welcome');
    const questions = document.getElementById('planner-ob-questions');
    const reveal = document.getElementById('planner-ob-reveal');
    const dashboard = document.getElementById('planner-main-dashboard');
    if (welcome) welcome.style.display = 'none';
    if (questions) questions.style.display = 'none';
    if (reveal) reveal.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
    
    // Transition immediately, refresh in background
    plannerState.hasSetup = true;
    setupPlanner();
    requestAnimationFrame(() => {
        if (dashboard) dashboard.style.display = 'block';
        renderPlannerDashboard();
    });

    refreshUserDataFromServer().catch(e => console.error("Planner refresh failed", e));
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
    const period = plannerState.currentChecklistPeriod === 'night' ? 'night' : 'morning';
    const alreadyDone = period === 'night' ? plannerState.pmDone : plannerState.amDone;
    if (alreadyDone) {
        const checklistOverlay = document.getElementById('routine-checklist-overlay');
        if (checklistOverlay) checklistOverlay.style.display = 'none';
        renderPlannerDashboard();
        return;
    }

    const formData = new FormData();
    const todayKey = getLocalDateKey();
    formData.append('date', todayKey);
    formData.append(period === 'morning' ? 'am_done' : 'pm_done', '1');
    formData.append('skin_feeling', 'Good');
    formData.append('skin_rating', '5');

    try {
        // Optimistic Update
        const oldState = { am: plannerState.amDone, pm: plannerState.pmDone, streak: plannerState.streak, dates: new Set(state.activeDates) };
        if (period === 'morning') plannerState.amDone = true;
        else plannerState.pmDone = true;
        
        const dateKey = getLocalDateKey();
        if (!state.activeDates.has(dateKey)) {
            state.activeDates.add(dateKey);
            plannerState.streak++;
            state.streak = plannerState.streak;
        }
        renderPlannerDashboard();

        fetch(`${API_BASE_URL}/api/daily-log`, {
            method: 'POST',
            headers: authHeadersRaw(),
            body: formData
        }).then(response => readApiResponse(response)).then(parsed => {
            if (!parsed.ok) {
                throw new Error(parsed.error || 'Could not save routine completion');
            }
            const checklistOverlay = document.getElementById('routine-checklist-overlay');
            if (checklistOverlay) checklistOverlay.style.display = 'none';
            showToast("Routine completed! +1 Streak");
            refreshUserDataFromServer().catch(e => console.error("Post-log sync failed", e));
        }).catch(err => {
            // Rollback on hard failure
            plannerState.amDone = oldState.am;
            plannerState.pmDone = oldState.pm;
            plannerState.streak = oldState.streak;
            state.streak = oldState.streak;
            state.activeDates = oldState.dates;
            renderPlannerDashboard();
            console.error('[PLANNER] finishChecklist failed:', err);
            showToast("Error saving progress 🌿");
        });
    } catch (err) {
        console.error('[PLANNER] finishChecklist failed:', err);
        showToast("Error saving progress 🌿");
    }
}

// SELFIE FEATURE
function openCamera() {
    const input = document.getElementById('selfie-upload-input');
    if (input) input.click();
}

async function handleSelfieUpload(input) {
    if (input.files && input.files[0]) {
        showLoading();
        try {
            const resizedBlob = await resizeImage(input.files[0]);
            const formData = new FormData();
            formData.append('date', getLocalDateKey());
            formData.append('image', resizedBlob, 'progress.jpg');

            const response = await fetch(`${API_BASE_URL}/api/progress-photo`, {
                method: 'POST',
                headers: authHeadersRaw(),
                body: formData
            });
            const parsed = await readApiResponse(response);
            hideLoading();
            if (!parsed.ok || !response.ok) {
                throw new Error(parsed.error || parsed.data?.error || 'Could not save progress photo');
            }
            refreshUserDataFromServer().catch(e => console.error("Selfie sync failed", e));
            showToast("Selfie saved to Cloudinary!");
        } catch (err) {
            hideLoading();
            console.error('[TIMELINE] Failed to upload progress photo', err);
            showToast('Could not save selfie');
        }
    }
}

// DASHBOARD
function renderPlannerDashboard() {
    const sCount = `${plannerState.streak} Day Streak`;
    const streakEl = document.getElementById('streak-count');
    const homeStreakEl = document.getElementById('home-streak-count');
    const morningStatus = document.querySelector('#morning-completion-card .completion-status');
    const nightStatus = document.querySelector('#night-completion-card .completion-status');
    
    if (streakEl) streakEl.textContent = sCount;
    if (homeStreakEl) homeStreakEl.textContent = plannerState.streak;
    
    const morningBlur = document.getElementById('morning-blur-overlay');
    const nightBlur = document.getElementById('night-blur-overlay');
    if (morningStatus) morningStatus.style.display = plannerState.amDone ? 'block' : 'none';
    if (nightStatus) nightStatus.style.display = plannerState.pmDone ? 'block' : 'none';
    if (morningBlur) morningBlur.style.display = plannerState.amDone ? 'none' : 'flex';
    if (nightBlur) nightBlur.style.display = plannerState.pmDone ? 'none' : 'flex';

    // Update Fire Icons (Blue Fire Logic)
    const homeFireIcon = document.querySelector('.home-streak-icon');
    const plannerFireIcon = document.querySelector('.streak-flame-icon');
    if (homeFireIcon) {
        homeFireIcon.classList.toggle('streak-active-fire', plannerState.dailyDone);
    }
    if (plannerFireIcon) {
        plannerFireIcon.classList.toggle('streak-active-fire', plannerState.dailyDone);
    }

    renderPlannerCalendar();
    requestAnimationFrame(() => renderPlannerCalendar());
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
    if (!grid) return;
    
    try {
        const currentMonth = Number.isInteger(plannerState.currentMonth) ? plannerState.currentMonth : new Date().getMonth();
        const currentYear = Number.isInteger(plannerState.currentYear) ? plannerState.currentYear : new Date().getFullYear();
        const d = new Date(currentYear, currentMonth, 1);
        if (monthLabel) monthLabel.textContent = d.toLocaleString('default', { month: 'long', year: 'numeric' });
        
        const firstDay = d.getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const today = new Date();
        const todayKey = getLocalDateKey(today);
        const lastDoneDate = getPlannerLastDoneDate();
        const streakDates = new Map();
        const startDateKey = getPlannerStartDateKey();

        if (lastDoneDate && plannerState.streak > 0) {
            for (let offset = 0; offset < plannerState.streak; offset++) {
                const streakDate = new Date(lastDoneDate);
                streakDate.setDate(lastDoneDate.getDate() - offset);
                streakDates.set(getLocalDateKey(streakDate), offset === 0 ? 'current' : 'past');
            }
        }

        grid.innerHTML = '';

        // 1. Dummies for previous month days
        for (let i = 0; i < firstDay; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'cal-day empty';
            emptyDay.setAttribute('aria-hidden', 'true');
            grid.appendChild(emptyDay);
        }
        
        // 2. Real days for current month
        for (let i = 1; i <= daysInMonth; i++) {
            const curDate = new Date(currentYear, currentMonth, i);
            const dateKey = getLocalDateKey(curDate);
            const dayEl = document.createElement('div');
            dayEl.className = 'cal-day';
            
            // Check if today
            if (i === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
                dayEl.classList.add('today');
            }

            const dayNum = document.createElement('span');
            dayNum.className = 'cal-day-num';
            dayNum.textContent = String(i);
            dayEl.appendChild(dayNum);
            
            const isStartedDay = Boolean(startDateKey && dateKey >= startDateKey && dateKey <= todayKey);
            let streakType = streakDates.get(dateKey);

            // Force current day to be active if any task is done
            if (dateKey === todayKey && plannerState.dailyDone) {
                streakType = 'current';
            }

            if (streakType || isStartedDay) {
                dayEl.classList.add('has-streak');
                const flame = document.createElement('i');
                flame.className = streakType
                    ? `fa-solid fa-fire calendar-flame active-day ${streakType}`
                    : 'fa-solid fa-fire calendar-flame inactive-day';
                flame.setAttribute('aria-hidden', 'true');
                dayEl.appendChild(flame);
            }

            grid.appendChild(dayEl);
        }

        const trailingCells = (7 - (grid.children.length % 7)) % 7;
        for (let i = 0; i < trailingCells; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'cal-day empty';
            emptyDay.setAttribute('aria-hidden', 'true');
            grid.appendChild(emptyDay);
        }

        console.log("[CALENDAR] Successfully injected " + daysInMonth + " days.");
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
    saveRoutine().catch((err) => {
        console.error('[ROUTINE] Failed to save edited routine', err);
        showToast('Could not save routine');
    });
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

function saveRoutineDraftLocally() {
    setScopedJson('planner-routine', plannerState.routine);
}

function startPlannerOnboardingLegacy() {
    const welcome = document.getElementById('planner-ob-welcome');
    const questions = document.getElementById('planner-ob-questions');
    if (welcome) welcome.style.display = 'none';
    if (questions) questions.style.display = 'flex';
    plannerState.setupStep = 0;
    plannerState.answers = {};
    renderSetupQuestion();
}



function startRoutineChecklist(period = 'morning') {
    const hour = new Date().getHours();
    
    if (period === 'morning' && (hour < 4 || hour >= 17)) {
        showToast('Morning routine is only available 4 AM - 5 PM 🌤️');
        return;
    }
    
    if (period === 'night' && (hour >= 4 && hour < 17)) {
        showToast('Night routine is only available 5 PM - 4 AM 🌙');
        return;
    }

    const overlay = document.getElementById('routine-checklist-overlay');
    const title = document.getElementById('checklist-title');
    const subtitle = document.getElementById('checklist-subtitle');
    plannerState.currentChecklistPeriod = period === 'night' ? 'night' : 'morning';
    if (title) title.textContent = "Today's Routine";
    if (subtitle) subtitle.textContent = `${plannerState.currentChecklistPeriod[0].toUpperCase()}${plannerState.currentChecklistPeriod.slice(1)} Routine`;
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
    const normalized = String(pageId || '').startsWith('settings-') ? pageId : `settings-${pageId}`;
    const overlay = document.getElementById(normalized);
    if (overlay) overlay.style.display = 'block';

    if (pageId === 'account-details' || pageId === 'settings-account-details') {
        const emailInput = document.getElementById('profile-edit-email');
        if (emailInput && state.email) {
            emailInput.value = state.email;
        }
    }
}

function closeSettingsSubPage(pageId) {
    const normalized = pageId === 'settings-routine-reminders' ? pageId : `settings-${pageId}`;
    const overlay = document.getElementById(normalized);
    if (overlay) overlay.style.display = 'none';
}

function openSettingsToOnboarding() {
    state.fromSettings = true;
    resetOnboarding(true);
    switchView('onboarding');
}

function toggleReminderScheduleItem() {
    const toggle = document.getElementById('settings-reminder-toggle');
    const scheduleItem = document.getElementById('reminder-schedule-item');
    if (scheduleItem) scheduleItem.style.display = toggle && toggle.checked ? 'flex' : 'none';
}

function getReminderStorageKey(period, dateKey, timeValue) {
    return `sc-reminder-scheduled-${state.userId || 'guest'}-${period}-${dateKey}-${timeValue}`;
}

function calculateNextReminderTime(timeValue, offsetMinutes = 0) {
    if (!timeValue || !/^\d{2}:\d{2}$/.test(timeValue)) return null;
    const [hours, minutes] = timeValue.split(':').map(Number);
    const now = new Date();
    
    // Create date in local time
    const scheduledDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    
    // Apply optional offset (for testing)
    if (offsetMinutes > 0) {
        scheduledDate.setTime(now.getTime() + (offsetMinutes * 60 * 1000));
    } else if (scheduledDate.getTime() <= now.getTime()) {
        // If time has already passed today, schedule for tomorrow
        scheduledDate.setDate(scheduledDate.getDate() + 1);
    }
    
    return scheduledDate;
}

function shouldFireReminder(period, timeValue, now = new Date()) {
    if (!timeValue || !/^\d{2}:\d{2}$/.test(timeValue)) return false;
    const [hours, minutes] = timeValue.split(':').map(Number);
    if (now.getHours() !== hours || now.getMinutes() !== minutes) return false;
    const dateKey = getLocalDateKey(now);
    return safeStorage.get(getReminderStorageKey(period, dateKey, timeValue)) !== '1';
}

function markReminderFired(period, timeValue, now = new Date()) {
    safeStorage.set(getReminderStorageKey(period, getLocalDateKey(now), timeValue), '1');
}

// 🎵 Skinbiee Signature Procedural Audio Engine (Modern & Cute)
function playSkinbieeChime(type = 'am') {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const now = ctx.currentTime;

        const playTone = (freq, start, duration, volume = 0.3) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            // Soft sine wave for a "cute" bubble feel
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, start);
            
            gain.gain.setValueAtTime(0, start);
            gain.gain.linearRampToValueAtTime(volume, start + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start(start);
            osc.stop(start + duration);
        };

        if (type === 'am' || type === 'test') {
            // "Sunshine" - Bright rising pentatonic (C5, E5, G5, C6)
            playTone(523.25, now, 0.6);        // C5
            playTone(659.25, now + 0.1, 0.6);  // E5
            playTone(783.99, now + 0.2, 0.6);  // G5
            playTone(1046.50, now + 0.3, 0.8, 0.2); // C6
        } else {
            // "Night Glow" - Soft descending dreamy chime (G5, E5, C5)
            playTone(783.99, now, 0.8, 0.2);   // G5
            playTone(659.25, now + 0.15, 0.8); // E5
            playTone(523.25, now + 0.3, 1.0);  // C5
        }
    } catch (e) {
        console.error('[AUDIO] Procedural chime failed', e);
    }
}

function playReminderSound(period = 'am') {
    playSkinbieeChime(period);
}

async function ensureReminderPermission() {
    if (!('Notification' in window)) {
        showToast('This browser does not support notifications');
        return false;
    }

    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        showToast('Notifications are blocked in this browser');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            showToast('Allow notifications so reminders can reach you');
            return false;
        }
        return true;
    } catch (error) {
        console.error('[REMINDERS] Notification permission failed', error);
        showToast('Could not enable notifications');
        return false;
    }
}

async function showReminderNotification(period) {
    const title = period === 'am' ? 'Morning Sunshine ☀️' : 'Night Glow 🌙';
    const body = period === 'am'
        ? 'Time for your routine. Keep your Skinbiee streak glowing today!'
        : 'Your evening routine is ready. A quick check-in keeps the streak alive.';
    
    const options = {
        body,
        icon: 'assets/app-icon-192.png',
        badge: 'assets/app-icon-32.png',
        tag: `skinbiee-reminder-${period}`,
        renotify: true,
        vibrate: [200, 100, 200],
        requireInteraction: true,
        actions: [
            { action: 'open-planner', title: 'Open Planner 📅' }
        ],
        data: {
            url: '/skinbiee.html?tab=planner',
            period
        }
    };

    playReminderSound(period);

    let notificationShown = false;

    // Strategy 1: Use ServiceWorker (REQUIRED for PWA standalone mode on mobile)
    // navigator.serviceWorker.ready guarantees a resolved, active registration
    // unlike getRegistration() which can return undefined on scope mismatch
    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            const registration = await navigator.serviceWorker.ready;
            if (registration && 'showNotification' in registration) {
                await registration.showNotification(title, options);
                console.log(`[REMINDERS] ✅ ${period} notification shown via SW.ready`);
                notificationShown = true;
            }
        }
    } catch (swErr) {
        console.warn('[REMINDERS] SW notification failed, trying fallbacks...', swErr);
    }

    // Strategy 2: Try getRegistration() as backup (different scope resolution)
    if (!notificationShown) {
        try {
            if ('serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg && 'showNotification' in reg) {
                    await reg.showNotification(title, options);
                    console.log(`[REMINDERS] ✅ ${period} notification shown via getRegistration()`);
                    notificationShown = true;
                }
            }
        } catch (regErr) {
            console.warn('[REMINDERS] getRegistration fallback also failed', regErr);
        }
    }

    // Strategy 3: Direct Notification constructor (works in browser tabs, NOT in PWA standalone on mobile)
    if (!notificationShown) {
        try {
            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(title, { body: options.body, icon: options.icon, tag: options.tag });
                console.log(`[REMINDERS] ✅ ${period} notification shown via Notification constructor`);
                notificationShown = true;
            }
        } catch (notifErr) {
            console.warn('[REMINDERS] Notification constructor failed (expected in PWA mode)', notifErr);
        }
    }

    // Strategy 4: Last resort — show an in-app toast so the user still gets reminded
    if (!notificationShown) {
        console.error('[REMINDERS] All notification strategies failed for', period);
        showToast(period === 'am'
            ? '☀️ Time for your morning routine!'
            : '🌙 Time for your night routine!');
    }
}

async function scheduleLocalNotification(period, timeValue, isTest = false) {
    if (!('Notification' in window) || Notification.permission !== 'granted') {
        console.warn('[REMINDERS] Cannot schedule: Notifications not granted');
        return;
    }

    const nextTime = calculateNextReminderTime(timeValue, isTest ? 1 : 0);
    if (!nextTime) return;

    const now = Date.now();
    const delayMs = nextTime.getTime() - now;

    if (delayMs < 0) {
        console.warn(`[REMINDERS] Scheduled time is in the past for ${period}, skipping setTimeout`);
        return;
    }

    // Cap at 24 hours to avoid browser overflow issues with large setTimeout values
    const maxDelay = 24 * 60 * 60 * 1000;
    if (delayMs > maxDelay) {
        console.log(`[REMINDERS] ${period} reminder is >24h away (${Math.round(delayMs / 3600000)}h). Will re-schedule on next tick.`);
        return;
    }

    if (isTest) playReminderSound(period);

    // Schedule a real setTimeout that fires the notification at the right time
    const timeoutId = setTimeout(async () => {
        try {
            const dateKey = getLocalDateKey(new Date());
            const storageKey = `sc-reminder-fired-${state.userId}-${period}-${dateKey}`;
            if (safeStorage.get(storageKey) === '1') {
                console.log(`[REMINDERS] ${period} already fired today, skipping`);
                return;
            }
            safeStorage.set(storageKey, '1');
            await showReminderNotification(period);
            console.log(`[REMINDERS] ✅ ${period} notification delivered via setTimeout!`);
        } catch (e) {
            console.error(`[REMINDERS] setTimeout delivery error for ${period}`, e);
        }
    }, delayMs);

    reminderTimeoutIds.push(timeoutId);
    const minutesAway = Math.round(delayMs / 60000);
    console.log(`[REMINDERS] ⏰ ${period} scheduled via setTimeout in ${minutesAway} min (${nextTime.toLocaleTimeString()})`);

    if (isTest) {
        showToast(`Test reminder will fire in ~${Math.max(1, Math.ceil(delayMs / 60000))} minute(s). Keep this tab open!`);
    }
}

async function runReminderSchedulerTick() {
    const reminders = state.reminders || {};
    if (!state.userId || !reminders.enabled) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    // Wider match window: fire if within 0-2 minutes AFTER target time.
    // This handles browser throttling of background-tab timers.
    const checkFire = (period, timeValue) => {
        if (!timeValue || !/^\d{2}:\d{2}$/.test(timeValue)) return false;
        const [h, m] = timeValue.split(':').map(Number);
        const targetMinutes = h * 60 + m;
        const diff = nowMinutes - targetMinutes;
        if (diff >= 0 && diff <= 2) {
            const dateKey = getLocalDateKey(now);
            const storageKey = `sc-reminder-fired-${state.userId}-${period}-${dateKey}`;
            if (safeStorage.get(storageKey) !== '1') {
                safeStorage.set(storageKey, '1');
                return true;
            }
        }
        return false;
    };

    if (reminders.amActive && checkFire('am', reminders.amTime)) {
        await showReminderNotification('am');
        console.log('[REMINDERS] ✅ AM notification fired via polling tick');
    }
    if (reminders.pmActive && checkFire('pm', reminders.pmTime)) {
        await showReminderNotification('pm');
        console.log('[REMINDERS] ✅ PM notification fired via polling tick');
    }
}

function stopReminderScheduler() {
    if (reminderSchedulerId) {
        clearInterval(reminderSchedulerId);
        reminderSchedulerId = null;
    }
    // Clear all pending setTimeout reminder timers
    reminderTimeoutIds.forEach(id => clearTimeout(id));
    reminderTimeoutIds = [];
    // Remove visibility change handler
    if (reminderVisibilityHandler) {
        document.removeEventListener('visibilitychange', reminderVisibilityHandler);
        reminderVisibilityHandler = null;
    }
}

function startReminderScheduler() {
    stopReminderScheduler();
    const reminders = state.reminders || {};
    if (!state.userId || !reminders.enabled) return;

    // 1. Schedule precise setTimeout timers for each active reminder
    if (reminders.amActive && reminders.amTime) scheduleLocalNotification('am', reminders.amTime);
    if (reminders.pmActive && reminders.pmTime) scheduleLocalNotification('pm', reminders.pmTime);

    // 2. Polling fallback every 30s (catches edge cases while tab is open)
    reminderSchedulerId = window.setInterval(() => {
        runReminderSchedulerTick().catch(e => console.error('[REMINDERS] Tick error', e));
    }, 30000);

    // 3. Catch-up on tab re-focus: re-check immediately when user returns
    reminderVisibilityHandler = () => {
        if (document.visibilityState === 'visible') {
            console.log('[REMINDERS] Tab became visible — running catch-up tick');
            runReminderSchedulerTick().catch(e => console.error('[REMINDERS] Visibility tick error', e));
            // Re-schedule setTimeout timers (browser may have killed them while backgrounded)
            reminderTimeoutIds.forEach(id => clearTimeout(id));
            reminderTimeoutIds = [];
            const r = state.reminders || {};
            if (r.amActive && r.amTime) scheduleLocalNotification('am', r.amTime);
            if (r.pmActive && r.pmTime) scheduleLocalNotification('pm', r.pmTime);
        }
    };
    document.addEventListener('visibilitychange', reminderVisibilityHandler);

    // 4. Run an immediate tick on startup in case we're already past a reminder time
    runReminderSchedulerTick().catch(e => console.error('[REMINDERS] Initial tick error', e));
    console.log('[REMINDERS] 🟢 Scheduler started with setTimeout + polling + visibility catch-up');
}

function applyRemindersToUI() {
    const reminders = state.reminders || {};
    const toggle = document.getElementById('settings-reminder-toggle');
    if (toggle) {
        toggle.checked = Boolean(reminders.enabled);
        toggleReminderScheduleItem();
    }
    
    const amActive = document.getElementById('am-reminder-active');
    if (amActive) amActive.checked = reminders.amActive !== false;
    
    const pmActive = document.getElementById('pm-reminder-active');
    if (pmActive) pmActive.checked = reminders.pmActive !== false;

    if (reminders.amTime && reminders.amTime.includes(':')) {
        const [h, m] = reminders.amTime.split(':');
        const hEl = document.getElementById('am-hour');
        const mEl = document.getElementById('am-minute');
        if (hEl) hEl.value = h;
        if (mEl) mEl.value = m;
    }
    
    if (reminders.pmTime && reminders.pmTime.includes(':')) {
        const [h, m] = reminders.pmTime.split(':');
        const hEl = document.getElementById('pm-hour');
        const mEl = document.getElementById('pm-minute');
        if (hEl) hEl.value = h;
        if (mEl) mEl.value = m;
    }
}

function togglePasswordChange() {
    const section = document.getElementById('password-change-section');
    if (!section) return;
    section.style.display = section.style.display === 'none' || !section.style.display ? 'flex' : 'none';
}

/* Legacy duplicates removed — server-backed versions below handle all saves */

async function performPasswordChange() {
    const oldPassword = document.getElementById('old-password')?.value || '';
    const newPassword = document.getElementById('new-password')?.value || '';
    const confirmPassword = document.getElementById('confirm-password')?.value || '';

    if (!newPassword || !confirmPassword) {
        showToast('Please fill new password fields');
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

    try {
        showLoading('Updating...');
        const res = await fetch(`${API_BASE_URL}/api/user/password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeadersRaw()
            },
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
        const data = await res.json();
        hideLoading();
        if (!res.ok) {
            showToast(data.error || 'Failed to update password');
        } else {
            showToast('Password updated! ?');
            document.getElementById('old-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
            if (typeof togglePasswordChange === 'function') togglePasswordChange();
        }
    } catch (err) {
        hideLoading();
        showToast('Failed to connect to server');
    }
}

function executeExportData() {
    // Get actual user data from state
    const profile = state.userProfile || {};
    const username = state.username || safeStorage.get('sc-username') || 'Guest';
    const streak = state.streak || plannerState.streak || 0;
    const routine = plannerState.routine || [];
    const scans = state.serverScans || [];
    const dailyLogs = state.dailyLogs || [];
    const progressPhotos = state.userLogsWithPhotos || [];
    const activeDates = Array.from(state.activeDates || []);
    const joinDate = state.joinDate;
    const reminders = state.reminders || {};
    
    // Create CSV content
    let csvContent = '';
    
    // Header
    csvContent += 'Skinbiee Data Export\n';
    csvContent += `Username,"${username}"\n`;
    csvContent += `Current Streak,${streak}\n`;
    csvContent += `Join Date,"${joinDate || 'N/A'}"\n`;
    csvContent += `Export Date,"${new Date().toLocaleDateString()}"\n\n`;
    
    // User Info Section
    csvContent += 'USER INFO\n';
    csvContent += 'Field,Value\n';
    csvContent += `Username,"${username}"\n`;
    if (profile.username) csvContent += `Display Name,"${profile.username}"\n`;
    if (profile.skinType) csvContent += `Skin Type,"${profile.skinType}"\n`;
    if (profile.skinTone) csvContent += `Skin Tone,"${profile.skinTone}"\n`;
    if (profile.concern) csvContent += `Primary Concern,"${profile.concern}"\n`;
    if (profile.age) csvContent += `Age,${profile.age}\n`;
    if (profile.gender) csvContent += `Gender,"${profile.gender}"\n`;
    if (profile.sensitive) csvContent += `Sensitive Skin,"${profile.sensitive}"\n`;
    if (profile.routine) csvContent += `Routine Goal,"${profile.routine}"\n`;
    csvContent += '\n';
    
    // Face Scans Section
    if (scans.length > 0) {
        csvContent += 'FACE SCANS\n';
        csvContent += 'Date,Product Name,Brand,Category,Analysis Score,Analysis Result,Notes\n';
        scans.forEach(scan => {
            const date = scan.scan_date || scan.created_at || new Date().toLocaleDateString();
            const productName = scan.product_name || scan.name || 'Unknown Product';
            const brand = scan.brand || '';
            const category = scan.category || scan.type || '';
            const score = scan.analysis_score || scan.score || '';
            const result = scan.analysis_result || scan.result || '';
            const notes = scan.notes || scan.analysis || '';
            csvContent += `"${date}","${productName}","${brand}","${category}","${score}","${result}","${notes}"\n`;
        });
        csvContent += '\n';
    }
    
    // Product Scans Section (if different from face scans)
    if (scans.length > 0) {
        csvContent += 'PRODUCT SCANS\n';
        csvContent += 'Date,Product Name,Brand,Category,Flag,Rating,Concerns Detected\n';
        scans.forEach(scan => {
            const date = scan.scan_date || scan.created_at || new Date().toLocaleDateString();
            const productName = scan.product_name || scan.name || 'Unknown Product';
            const brand = scan.brand || '';
            const category = scan.category || scan.type || '';
            const flag = scan.flag || scan.warning || '';
            const rating = scan.rating || scan.score || '';
            const concerns = scan.concerns_detected || scan.concerns || '';
            csvContent += `"${date}","${productName}","${brand}","${category}","${flag}","${rating}","${concerns}"\n`;
        });
        csvContent += '\n';
    }
    
    // Calendar/Routine Section
    csvContent += 'CALENDAR\n';
    csvContent += 'Date,AM Routine Complete,PM Routine Complete,Notes,Streak Impact\n';
    dailyLogs.forEach(log => {
        const date = log.date || log.log_date || new Date().toLocaleDateString();
        const amComplete = log.am_done ? 'Yes' : 'No';
        const pmComplete = log.pm_done ? 'Yes' : 'No';
        const notes = log.notes || log.skin_feeling || '';
        const streakImpact = log.streak_impact || '';
        csvContent += `"${date}","${amComplete}","${pmComplete}","${notes}","${streakImpact}"\n`;
    });
    
    // Add active dates summary
    if (activeDates.length > 0) {
        csvContent += '\nActive Routine Dates\n';
        csvContent += 'Date\n';
        activeDates.forEach(date => {
            csvContent += `"${date}"\n`;
        });
        csvContent += '\n';
    }
    
    // Progress Photos Section
    if (progressPhotos.length > 0) {
        csvContent += 'PROGRESS PHOTOS\n';
        csvContent += 'Date,Notes,Photo Count,Photo Path\n';
        progressPhotos.forEach(photo => {
            const date = photo.date || photo.log_date || new Date().toLocaleDateString();
            const notes = photo.notes || photo.skin_feeling || '';
            const count = photo.photo_count || photo.photos?.length || 1;
            const path = photo.photo_path || '';
            csvContent += `"${date}","${notes}",${count},"${path}"\n`;
        });
        csvContent += '\n';
    }
    
    // Routine Steps Section
    if (routine.length > 0) {
        csvContent += 'ROUTINE STEPS\n';
        csvContent += 'Step Number,Product Name,Category,Instructions,Time of Day\n';
        routine.forEach((step, index) => {
            const stepNum = index + 1;
            const productName = step.product_name || step.name || 'Unknown Product';
            const category = step.category || step.type || 'General';
            const instructions = step.instructions || step.how_to_use || '';
            const timeOfDay = step.time_of_day || step.period || 'Morning';
            csvContent += `${stepNum},"${productName}","${category}","${instructions}","${timeOfDay}"\n`;
        });
        csvContent += '\n';
    }
    
    // Reminders Section
    if (Object.keys(reminders).length > 0) {
        csvContent += 'REMINDERS\n';
        csvContent += 'Setting,Value\n';
        csvContent += `Reminders Enabled,${reminders.enabled ? 'Yes' : 'No'}\n`;
        csvContent += `AM Reminder Active,${reminders.amActive ? 'Yes' : 'No'}\n`;
        csvContent += `AM Reminder Time,"${reminders.amTime || 'N/A'}"\n`;
        csvContent += `PM Reminder Active,${reminders.pmActive ? 'Yes' : 'No'}\n`;
        csvContent += `PM Reminder Time,"${reminders.pmTime || 'N/A'}"\n`;
        csvContent += '\n';
    }
    
    // Create blob and download
    try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `skinbiee-export-${username}-${new Date().toISOString().split('T')[0]}.csv`;
        
        // Append to body and click for better compatibility
        document.body.appendChild(link);
        link.click();
        
        // Clean up
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
        
        showToast('Spreadsheet exported successfully!');
    } catch (error) {
        console.error('Export failed:', error);
        showToast('Export failed. Please try again.');
    }
}

function openClearDataModal() {
    const modal = document.getElementById('clear-data-modal');
    if (modal) modal.style.display = 'flex';
}

function closeClearDataModal() {
    const modal = document.getElementById('clear-data-modal');
    if (modal) modal.style.display = 'none';
}

/* ==========================================================================
   TAB: SETTINGS (LEGACY REMOVED - SEE SERVER-BACKED SECTION BELOW)
   ========================================================================== */


function openEditProfile() {
    const overlay = document.getElementById('profile-editor-overlay');
    if (overlay) overlay.style.display = 'block';
}

/* ==========================================================================
   SERVER-BACKED USER DATA OVERRIDES
   ========================================================================== */
async function saveRoutine(routine = plannerState.routine, condition = getGlowBotSkinContext(), plannerMeta = null) {
    // Optimistic Update
    const oldRoutine = [...plannerState.routine];
    plannerState.routine = routine;
    plannerState.hasSetup = true;
    renderPlannerDashboard();

    try {
        const response = await fetch(`${API_BASE_URL}/api/user/routine`, {
            method: 'POST',
            headers: {
                ...authHeadersRaw(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ routine, condition, planner: plannerMeta })
        });
        const parsed = await readApiResponse(response);
        if (!parsed.ok || !response.ok) {
            throw new Error(parsed.error || parsed.data?.error || 'Could not save routine');
        }
        const savedPlanner = parsed.data.planner && typeof parsed.data.planner === 'object' ? parsed.data.planner : {};
        state.plannerMeta = { ...state.plannerMeta, ...savedPlanner };
        plannerState.hasSetup = Boolean(
            savedPlanner.onboarding_completed
            || (parsed.data.routine?.am_steps && parsed.data.routine.am_steps.length)
        );
        plannerState.routine = parsed.data.routine?.am_steps || routine;
        plannerState.plannerStartDate = savedPlanner.planner_start_date || plannerState.plannerStartDate || getLocalDateKey();
        plannerState.onboardingCompletedAt = savedPlanner.onboarding_completed_at || plannerState.onboardingCompletedAt;
        
        renderPlannerDashboard();
        return plannerState.routine;
        return plannerState.routine;
    } catch (err) {
        // Rollback
        plannerState.routine = oldRoutine;
        renderPlannerDashboard();
        throw err;
    }
}

async function saveAccountDetails() {
    const profile = loadUserProfile() || {};
    const input = byId('profile-edit-username', 'onboarding-profile-username');
    if (input && input.value.trim()) {
        profile.username = input.value.trim();
        state.username = profile.username;
        updateDisplayedUsername();
        safeStorage.set('sc-username', state.username);
    }
    
    // Save email
    const emailInput = document.getElementById('profile-edit-email');
    if (emailInput && emailInput.value) {
        try {
            const res = await fetch(`${API_BASE_URL}/api/user/email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...authHeadersRaw()
                },
                body: JSON.stringify({ email: emailInput.value.trim() })
            });
            if (res.ok) {
                state.email = emailInput.value.trim();
            } else {
                const data = await res.json();
                showToast(data.error || 'Could not save email');
                return;
            }
        } catch (e) {
            showToast('Failed to connect to server');
            return;
        }
    }

    saveUserProfile(profile)
        .then(() => {
            closeSettingsSubPage('account-details');
            showToast('Account details saved');
        })
        .catch((err) => {
            console.error('[PROFILE] Failed to save account details', err);
            showToast('Could not save account details');
        });
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

    saveUserProfile(profile)
        .then((savedProfile) => {
            applyUserProfile(savedProfile);
            closeSettingsSubPage('skin-profile');
            showToast('Skin profile saved');
        })
        .catch((err) => {
            console.error('[PROFILE] Failed to save skin profile', err);
            showToast('Could not save skin profile');
        });
}

function saveReminders() {
    const amH = document.getElementById('am-hour')?.value || '08';
    const amM = document.getElementById('am-minute')?.value || '00';
    const pmH = document.getElementById('pm-hour')?.value || '21';
    const pmM = document.getElementById('pm-minute')?.value || '30';

    const reminderSettings = {
        enabled: Boolean(document.getElementById('settings-reminder-toggle')?.checked),
        amActive: Boolean(document.getElementById('am-reminder-active')?.checked),
        amTime: `${amH}:${amM}`,
        pmActive: Boolean(document.getElementById('pm-reminder-active')?.checked),
        pmTime: `${pmH}:${pmM}`
    };

    Promise.resolve(reminderSettings.enabled ? ensureReminderPermission() : true)
        .then((permissionGranted) => {
            if (reminderSettings.enabled && !permissionGranted) {
                throw new Error('Notifications not enabled');
            }
            return fetch(`${API_BASE_URL}/api/user/preferences`, {
                method: 'PUT',
                headers: {
                    ...authHeadersRaw(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ reminders: reminderSettings })
            });
        })
        .then((response) => readApiResponse(response).then((parsed) => ({ response, parsed })))
        .then(({ response, parsed }) => {
            if (!parsed.ok || !response.ok) {
                throw new Error(parsed.error || parsed.data?.error || 'Could not save reminders');
            }
            state.reminders = parsed.data.reminders || {};
            startReminderScheduler();
            closeSettingsSubPage('settings-routine-reminders');
            showToast('Reminder settings saved');
        })
        .catch((err) => {
            console.error('[REMINDERS] Failed to save reminders', err);
            showToast(err.message === 'Notifications not enabled' ? 'Turn on browser notifications to use reminders' : 'Could not save reminders');
        });
}

function executeClearData() {
    clearSession();
    closeClearDataModal();
    switchView('auth');
    showToast('Session cleared');
}

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

    const reminders = state.reminders || {};
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
    toggleReminderScheduleItem();
    
    // Initialize simple time pickers
    initializeSimpleTimePickers();
}

function initializeSimpleTimePickers() {
    // AM Time Picker
    const amHourSelect = document.getElementById('am-hour');
    const amMinuteSelect = document.getElementById('am-minute');
    const amHiddenInput = document.getElementById('am-reminder-time');
    
    if (amHourSelect && amMinuteSelect && amHiddenInput) {
        // Set initial values from hidden input
        const currentValue = amHiddenInput.value;
        if (currentValue && /^\d{2}:\d{2}$/.test(currentValue)) {
            const [hours, minutes] = currentValue.split(':');
            amHourSelect.value = hours;
            amMinuteSelect.value = minutes;
        }
        
        // Add change handlers
        amHourSelect.addEventListener('change', () => updateTimeValue('am'));
        amMinuteSelect.addEventListener('change', () => updateTimeValue('am'));
    }
    
    // PM Time Picker
    const pmHourSelect = document.getElementById('pm-hour');
    const pmMinuteSelect = document.getElementById('pm-minute');
    const pmHiddenInput = document.getElementById('pm-reminder-time');
    
    if (pmHourSelect && pmMinuteSelect && pmHiddenInput) {
        // Set initial values from hidden input
        const currentValue = pmHiddenInput.value;
        if (currentValue && /^\d{2}:\d{2}$/.test(currentValue)) {
            const [hours, minutes] = currentValue.split(':');
            pmHourSelect.value = hours;
            pmMinuteSelect.value = minutes;
        }
        
        // Add change handlers
        pmHourSelect.addEventListener('change', () => updateTimeValue('pm'));
        pmMinuteSelect.addEventListener('change', () => updateTimeValue('pm'));
    }
}

function updateTimeValue(period) {
    const hourSelect = document.getElementById(`${period}-hour`);
    const minuteSelect = document.getElementById(`${period}-minute`);
    const hiddenInput = document.getElementById(`${period}-reminder-time`);
    
    if (hourSelect && minuteSelect && hiddenInput) {
        const hour = hourSelect.value.padStart(2, '0');
        const minute = minuteSelect.value.padStart(2, '0');
        hiddenInput.value = `${hour}:${minute}`;
    }
}

/* getGlowBotProfile defined below in GlowBot section */

/* ... */
/* ==========================================================================
   MASCOT & CHAT LOGIC
   ========================================================================== */
function setupMascotChat() {
    const compactChat = document.getElementById('chat-panel');
    const fsChat = document.getElementById('chat-fs-panel');
    initializeGlowBotChat();

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

let glowBotMessages = [];
let glowBotProactiveShown = false;
let glowBotChatData = null;
let glowBotChatDataPromise = null;

function getGlowBotProfile() {
    return loadUserProfile() || {};
}

function getGlowBotSkinContext() {
    const profile = getGlowBotProfile();
    return String(profile.concern || profile.skinType || 'skin').trim();
}

function getGlowBotContext() {
    return {
        name: state.username || 'Friend',
        condition: getGlowBotSkinContext(),
        streak: String(state.streak || plannerState.streak || 0),
        currentView: state.view || 'home'
    };
}

function normalizeGlowBotText(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/\bcan u\b/g, 'can you')
        .replace(/\bu\b/g, 'you')
        .replace(/\bsomtign\b/g, 'something')
        .replace(/\bsomthin\b/g, 'something')
        .replace(/\bsugget\b/g, 'suggest')
        .replace(/\bsugest\b/g, 'suggest')
        .replace(/\bbalckheads\b/g, 'blackheads')
        .replace(/\bblack head(s)?\b/g, 'blackheads')
        .replace(/\byears?\s*old\b/g, 'year old')
        .replace(/\s+/g, ' ')
        .trim();
}

function fillGlowBotTemplate(template, context = getGlowBotContext()) {
    return String(template || '')
        .replaceAll('{name}', context.name)
        .replaceAll('{condition}', context.condition)
        .replaceAll('{streak}', context.streak);
}

function pickGlowBotResponse(responses) {
    if (!Array.isArray(responses) || responses.length === 0) return '';
    return responses[Math.floor(Math.random() * responses.length)];
}

async function loadGlowBotChatData() {
    if (glowBotChatData) return glowBotChatData;
    if (glowBotChatDataPromise) return glowBotChatDataPromise;

    glowBotChatDataPromise = fetch(`${API_BASE_URL}/api/chat-data`, {
        headers: authHeadersRaw()
    })
        .then(async (response) => {
            const parsed = await readApiResponse(response);
            if (!parsed.ok || !parsed.data || typeof parsed.data !== 'object') {
                throw new Error(parsed.error || 'Invalid chat data payload');
            }
            glowBotChatData = parsed.data;
            initializeGlowBotChat();
            return glowBotChatData;
        })
        .catch((error) => {
            console.warn('[GlowBot] Chat data unavailable:', error);
            glowBotChatData = null;
            return null;
        })
        .finally(() => {
            glowBotChatDataPromise = null;
        });

    return glowBotChatDataPromise;
}

function getGlowBotJsonResponse(input) {
    if (!glowBotChatData) return null;

    const normalizedInput = normalizeGlowBotText(input);
    const directReply = getGlowBotDirectReply(normalizedInput);
    if (directReply) return directReply;
    const childSafetyReply = getGlowBotChildSafetyReply(normalizedInput);
    if (childSafetyReply) return childSafetyReply;
    const context = getGlowBotContext();
    let fallbackIntent = null;

    for (const [, intent] of Object.entries(glowBotChatData)) {
        if (!intent || !Array.isArray(intent.responses)) continue;

        const keywords = Array.isArray(intent.keywords) ? intent.keywords : [];
        if (keywords.length === 0) {
            fallbackIntent = intent;
            continue;
        }

        const matched = keywords.some((keyword) => {
            const normalizedKeyword = normalizeGlowBotText(keyword);
            return normalizedKeyword && normalizedInput.includes(normalizedKeyword);
        });

        if (matched) {
            return fillGlowBotTemplate(pickGlowBotResponse(intent.responses), context);
        }
    }

    if (fallbackIntent) {
        return fillGlowBotTemplate(pickGlowBotResponse(fallbackIntent.responses), context);
    }

    return null;
}

async function getGlowBotOpenRouterResponse(input) {
    try {
        const context = getGlowBotContext();
        const response = await fetch(`${API_BASE_URL}/api/glowbot-chat`, {
            method: 'POST',
            headers: {
                ...authHeadersRaw(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: input,
                name: context.name,
                condition: context.condition,
                streak: context.streak,
                current_view: context.currentView
            })
        });

        const parsed = await readApiResponse(response);
        if (!parsed.ok || !parsed.data || parsed.data.status !== 'success' || !parsed.data.reply) {
            return null;
        }

        return String(parsed.data.reply).trim();
    } catch (error) {
        console.warn('[GlowBot] OpenRouter layer unavailable:', error);
        return null;
    }
}

function getGlowBotGreeting() {
    const greetingFromJson = getGlowBotJsonResponse('hello');
    if (greetingFromJson) return greetingFromJson;

    const skinContext = getGlowBotSkinContext();
    const streak = state.streak || plannerState.streak || 0;

    if (state.view === 'analyzer') {
        return `Hi ${state.username}! Want help understanding your latest ${skinContext} scan or product check?`;
    }
    if (state.view === 'planner') {
        return `Hi ${state.username}! You're on a ${streak}-day streak. Want a quick routine check-in for today?`;
    }
    return `Hi ${state.username}! I'm GlowBot. Ask me about your ${skinContext}, routine, scans, or ingredients.`;
}

function initializeGlowBotChat() {
    if (glowBotMessages.length === 0) {
        glowBotMessages = [{ sender: 'mascot', text: getGlowBotGreeting() }];
    } else if (!glowBotMessages.some(msg => msg.sender === 'user')) {
        glowBotMessages[0] = { sender: 'mascot', text: getGlowBotGreeting() };
    }
    renderGlowBotMessages();
}

function renderGlowBotMessages() {
    const containers = [
        document.getElementById('chat-history-compact'),
        document.getElementById('chat-history-fs')
    ];

    containers.forEach(container => {
        if (!container) return;
        container.innerHTML = '';

        glowBotMessages.forEach(({ sender, text }) => {
            const bubble = document.createElement('div');
            bubble.className = `chat-bubble ${sender}-bubble`;
            bubble.textContent = text;
            container.appendChild(bubble);
        });

        container.scrollTop = container.scrollHeight;
    });
}

async function handleChatSend(inputId) {
    const inputEl = document.getElementById(inputId);
    const text = inputEl.value.trim();
    if (!text) return;
    const normalizedText = normalizeGlowBotText(text);

    // Clear both inputs
    document.getElementById('chat-input-compact').value = '';
    document.getElementById('chat-input-fs').value = '';

    appendChatMessage('user', text);
    
    // Mascot "Thinking"
    triggerMascotAnim('thinking');

    const directReply = getGlowBotDirectReply(normalizedText);
    if (directReply) {
        setTimeout(() => {
            appendChatMessage('mascot', directReply);
            triggerMascotAnim('happy');
        }, 250);
        return;
    }

    const childSafetyReply = getGlowBotChildSafetyReply(normalizedText);
    if (childSafetyReply) {
        setTimeout(() => {
            appendChatMessage('mascot', childSafetyReply);
            triggerMascotAnim('happy');
        }, 250);
        return;
    }
    
    setTimeout(async () => {
        const response = await getMascotAIResponse(text);
        appendChatMessage('mascot', response);
        triggerMascotAnim('happy');
    }, 1000);
}

function appendChatMessage(sender, text) {
    glowBotMessages.push({ sender, text });
    renderGlowBotMessages();
}

function checkProactiveGreetingLegacy() {
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

function checkProactiveGreeting() {
    const hasUserMessages = glowBotMessages.some(msg => msg.sender === 'user');
    const mascotMessageCount = glowBotMessages.filter(msg => msg.sender === 'mascot').length;
    if (!glowBotProactiveShown && !hasUserMessages && mascotMessageCount === 0) {
        glowBotProactiveShown = true;
        let msg = `Hey ${state.username}, I'm here with a quick check-in. `;

        if (state.view === 'analyzer') {
            msg += 'If you want, I can help explain your scan result or ingredient score.';
        } else if (state.view === 'planner') {
            msg += `Your current streak is ${state.streak || plannerState.streak || 0} days. Let's keep it going today.`;
        } else {
            msg += `Want tips for your ${getGlowBotSkinContext()} or help building today's routine?`;
        }

        setTimeout(() => appendChatMessage('mascot', msg), 500);
    }
}

function getMascotLegacyFallbackResponseOld(input) {
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

function getMascotEmergencyFallbackResponse(input) {
    const low = normalizeGlowBotText(input);
    const directReply = getGlowBotDirectReply(low);
    if (directReply) return directReply;
    const skinContext = getGlowBotSkinContext();
    const streak = state.streak || plannerState.streak || 0;

    if (low.includes('hi') || low.includes('hello') || low.includes('hey')) {
        return `Hi ${state.username}! How can I help with your ${skinContext} today?`;
    }

    if (low.includes('streak') || low.includes('progress') || low.includes('how am i doing')) {
        return `You're on a ${streak}-day streak, ${state.username}. Consistency like that really helps your skin over time.`;
    }

    if (low.includes('routine') || low.includes('am') || low.includes('pm') || low.includes('order')) {
        return `A solid simple routine is cleanser, treatment, moisturizer, and SPF in the morning. If you want, I can tailor that to your ${skinContext}.`;
    }

    if (low.includes('spf') || low.includes('sunscreen') || low.includes('sun')) {
        return 'Wear SPF 30 or higher every morning and reapply if you are outdoors. It is one of the best things you can do for irritation, marks, and long-term skin health.';
    }

    if (low.includes('acne') || low.includes('pimple') || low.includes('breakout') || low.includes('zit')) {
        return 'For breakouts, keep things gentle and consistent. Salicylic acid, niacinamide, and a non-comedogenic moisturizer are good starting points.';
    }

    if (low.includes('dry') || low.includes('flaky') || low.includes('tight') || low.includes('dehydrated')) {
        return 'Dry-feeling skin usually needs barrier support. Try a gentle cleanser, hydrating serum, ceramides, and a richer moisturizer.';
    }

    if (low.includes('oily') || low.includes('greasy') || low.includes('shiny')) {
        return 'Oily skin still needs moisture. Lightweight gel moisturizers, niacinamide, and gentle cleansing can help balance shine without over-stripping.';
    }

    if (low.includes('dark spot') || low.includes('pigment') || low.includes('marks') || low.includes('uneven')) {
        return 'For dark spots, vitamin C in the morning and daily sunscreen are a strong combo. Ingredients like niacinamide or alpha arbutin can also help over time.';
    }

    if (low.includes('sensitive') || low.includes('barrier') || low.includes('irritat') || low.includes('redness')) {
        return 'If your skin feels reactive, strip the routine back a little. Focus on fragrance-free basics, barrier-supporting moisturizers, and slow introduction of actives.';
    }

    if (low.includes('retinol') || low.includes('retinoid')) {
        return 'Start retinol slowly, usually a couple of nights a week, and moisturize well. Daily sunscreen matters even more when you use it.';
    }

    if (low.includes('niacinamide')) {
        return 'Niacinamide is a nice all-rounder. It can help with oiliness, redness, and post-acne marks without making a routine too complicated.';
    }

    if (low.includes('scan') || low.includes('result') || low.includes('confidence') || low.includes('analyz')) {
        return 'If you share your scan result or concern, I can help you interpret it in simple terms and suggest the next routine step.';
    }

    if (low.includes('product') || low.includes('ingredient')) {
        return `I can help you think through ingredients for your ${skinContext}. Tell me the ingredient name or what product you are checking.`;
    }

    if (low.includes('planner') || low.includes('calendar') || low.includes('reminder')) {
        return 'Use the planner to log AM and PM routines each day. That makes it much easier to spot patterns and build a streak.';
    }

    if (low.includes('thanks') || low.includes('thank you')) {
        return `Always here for you, ${state.username}. Keep going, your skin journey is built on steady small wins.`;
    }

    if (low.includes('bye') || low.includes('see you')) {
        return `See you soon, ${state.username}. Don't forget your sunscreen and a little patience with your skin.`;
    }

    return `I can help with routines, ingredients, scan results, or daily skincare habits. Tell me what is going on with your ${skinContext} and we'll figure it out.`;
}

function getGlowBotDirectReply(input) {
    const low = normalizeGlowBotText(input);

    if (getGlowBotChildSafetyReply(low)) {
        return getGlowBotChildSafetyReply(low);
    }

    if (/(blackheads|clogged pores|sebaceous filaments|whiteheads?)/.test(low)) {
        return 'For blackheads, salicylic acid is usually the best starting point. Use a gentle BHA 2 to 3 times a week, avoid squeezing, and pair it with a simple moisturizer and daily sunscreen.';
    }

    return null;
}

function getGlowBotChildSafetyReply(input) {
    const low = normalizeGlowBotText(input);
    const mentionsChild = /(child|kid|kids|baby|toddler|year old|yr old|\b[0-9]{1,2}\s*(year old|yo)\b)/.test(low);
    if (!mentionsChild) return null;

    if (low.includes('sunscreen') || low.includes('spf')) {
        return 'Yes, an 8 year old can usually use sunscreen. Choose a gentle broad-spectrum sunscreen, preferably one made for kids, and avoid getting it in the eyes. For babies under 6 months, ask a pediatrician first.';
    }

    if (low.includes('salicylic acid') || low.includes('bha')) {
        return 'Usually be careful with salicylic acid for a child. It is better not to use strong acne actives on an 8 year old unless a doctor or pediatric dermatologist recommends it.';
    }

    if (low.includes('azelaic acid')) {
        return 'Be careful with azelaic acid for a child. Even though it can be gentler than some acne actives, it is better to use it for an 8 year old only if a doctor or pediatric dermatologist recommends it.';
    }

    if (low.includes('retinol') || low.includes('retinoid') || low.includes('tretinoin')) {
        return 'Retinol and similar vitamin A actives are usually not a good first choice for a child unless a doctor specifically recommends them.';
    }

    if (low.includes('glycolic acid') || low.includes('aha') || low.includes('lactic acid') || low.includes('mandelic acid')) {
        return 'Be careful with exfoliating acids for a child. It is usually best not to use strong acids on young skin unless a doctor recommends them.';
    }

    if (low.includes('acid') || low.includes('active') || low.includes('serum') || low.includes('treatment')) {
        return 'For a child, it is usually best to keep skincare simple and gentle. Strong treatment actives should only be used if a doctor or pediatric dermatologist recommends them.';
    }

    return null;
}

async function getMascotAIResponse(input) {
    const directReply = getGlowBotDirectReply(input);
    if (directReply) return directReply;

    const childSafetyReply = getGlowBotChildSafetyReply(input);
    if (childSafetyReply) return childSafetyReply;

    const aiReply = await getGlowBotOpenRouterResponse(input);
    if (aiReply) return aiReply;

    const jsonReply = getGlowBotJsonResponse(input);
    if (jsonReply) return jsonReply;

    return getMascotEmergencyFallbackResponse(input);
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

function formatTimelineDate(rawTimestamp) {
    if (!rawTimestamp) return 'Saved scan';
    const parsed = new Date(rawTimestamp);
    if (Number.isNaN(parsed.getTime())) return String(rawTimestamp);
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
   PWA INSTALLATION (Both Native + Custom Pop-up)
   ========================================================================== */
let deferredPrompt = null;
const MAX_INSTALL_PROMPTS = 3;
const PROMPT_DELAYS = [0, 86400000, 259200000]; // 0, 24h, 72h in milliseconds

// Listen for the beforeinstallprompt event
window.addEventListener('beforeinstallprompt', (e) => {
    console.log('[PWA] beforeinstallprompt fired - browser install button should appear');
    // Don't prevent default - let browser show native install button
    deferredPrompt = e;
    
    // Also show custom pop-up after 2 seconds (only if not already installed)
    setTimeout(() => {
        showInstallPrompt();
    }, 2000);
});

// Listen for app installed event
window.addEventListener('appinstalled', () => {
    console.log('[PWA] App was installed!');
    localStorage.setItem('pwa-installed', 'true');
    hideInstallPrompt();
});

// Fallback: Show pop-up even if beforeinstallprompt doesn't fire
setTimeout(() => {
    if (!deferredPrompt) {
        console.log('[PWA] No beforeinstallprompt, showing fallback pop-up');
        showInstallPrompt();
    }
}, 3000);

// Function to show install prompt
function showInstallPrompt() {
    // Don't show if already in PWA mode (installed app)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
        console.log('[PWA] Already running as installed PWA, skipping pop-up');
        return;
    }
    
    // Get current prompt count
    let promptCount = parseInt(localStorage.getItem('install-prompt-count') || '0');
    
    // Don't show if max prompts reached
    if (promptCount >= MAX_INSTALL_PROMPTS) {
        console.log('[PWA] Max install prompts already shown');
        return;
    }
    
    // Check if enough time has passed for this prompt
    const firstPromptTime = parseInt(localStorage.getItem('first-prompt-time') || '0');
    const currentTime = Date.now();
    const delayForThisPrompt = PROMPT_DELAYS[promptCount];
    
    if (currentTime - firstPromptTime < delayForThisPrompt) {
        console.log('[PWA] Not enough time passed for next prompt');
        return;
    }
    
    const overlay = document.getElementById('pwa-install-overlay');
    if (overlay && overlay.style.display === 'none') {
        overlay.style.display = 'flex';
        
        // Update counters
        if (promptCount === 0) {
            localStorage.setItem('first-prompt-time', currentTime.toString());
        }
        localStorage.setItem('install-prompt-count', (promptCount + 1).toString());
        
        console.log(`[PWA] Showing install prompt #${promptCount + 1} of ${MAX_INSTALL_PROMPTS}`);
    }
}

// Handle install button click
function handleInstallClick() {
    if (deferredPrompt) {
        // Trigger browser's native install dialog
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('[PWA] User accepted install');
                showToast('Installing Skinbiee App...');
                hideInstallPrompt();
                // Mark as installed (will be confirmed by appinstalled event)
            } else {
                console.log('[PWA] User dismissed install');
                showToast('Maybe next time!');
            }
            deferredPrompt = null;
        });
    } else {
        // Mark as installed since user is manually installing
        localStorage.setItem('pwa-installed', 'true');
        hideInstallPrompt();
        
        // Show detailed manual instructions based on browser
        const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
        const isFirefox = /Firefox/.test(navigator.userAgent);
        const isBrave = /Brave/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor);
        
        let instructions = '';
        if (isBrave || isChrome) {
            instructions = 'Look for the install icon (download/+) in your browser address bar or click the menu (three dots) and select "Install Skinbiee"';
        } else if (isFirefox) {
            instructions = 'Open your browser menu and look for "Install" or "Add to Home Screen"';
        } else if (isSafari) {
            instructions = 'Tap the Share button and select "Add to Home Screen"';
        } else {
            instructions = 'Look for "Install" or "Add to Home Screen" in your browser menu';
        }
        
        showToast(instructions);
    }
}

// Function to hide install prompt
function hideInstallPrompt() {
    const overlay = document.getElementById('pwa-install-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

// Function to dismiss install prompt
function dismissInstallPrompt() {
    localStorage.setItem('install-prompt-shown', 'true');
    hideInstallPrompt();
}

// Setup PWA install listeners
function setupPWAInstall() {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.addEventListener('click', handleInstallClick);
    }
}

// Start App
window.addEventListener('DOMContentLoaded', () => {
    init();
    setupPWAInstall();
});

document.addEventListener('click', (e) => {
    if (e.target.closest('#home-mascot')) {
        triggerMascotAnim('happy');

        setTimeout(() => {
            triggerMascotAnim('idle');
        }, 800);
    }
});
