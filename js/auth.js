/* ============================================
   PrepNow Authentication Module
   Supabase Auth with Guest Fallback
   ============================================ */

let isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const submitBtn = document.getElementById('authSubmitBtn');
    const toggleText = document.getElementById('authToggleText');
    const toggleLink = document.getElementById('authToggleLink');
    const registerFields = document.getElementById('registerFields');

    if (isRegisterMode) {
        title.textContent = 'Create Account';
        subtitle.textContent = 'Join PrepNow and start your career preparation';
        submitBtn.textContent = 'Create Account';
        toggleText.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode()" id="authToggleLink">Sign In</a>';
        registerFields.style.display = 'block';
    } else {
        title.textContent = 'Welcome to PrepNow';
        subtitle.textContent = 'Sign in to start your career preparation journey';
        submitBtn.textContent = 'Sign In';
        toggleText.innerHTML = 'Don\'t have an account? <a href="#" onclick="toggleAuthMode()" id="authToggleLink">Register</a>';
        registerFields.style.display = 'none';
    }
}

async function handleAuth(event) {
    event.preventDefault();

    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const submitBtn = document.getElementById('authSubmitBtn');

    if (!email || !password) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    const supabase = SupabaseClient.getClient();
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = isRegisterMode ? 'Creating Account...' : 'Signing In...';

    try {
        if (isRegisterMode) {
            const name = document.getElementById('authName').value.trim();
            const major = document.getElementById('authMajor').value.trim();
            const targetRole = document.getElementById('authTargetRole').value.trim();

            if (!name) {
                showToast('Please enter your name', 'error');
                return;
            }

            const { data, error } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: name,
                        major: major || 'Not specified',
                        target_role: targetRole || 'Not specified'
                    }
                }
            });

            if (error) {
                showToast(error.message, 'error');
                return;
            }

            const authUser = data.user;
            if (!authUser) {
                showToast('Registration failed. Please try again.', 'error');
                return;
            }

            // SQL trigger auto-creates the users row; update it with target_role
            await SupabaseClient.updateUserRecord(authUser.id, {
                target_role: targetRole || 'Not specified'
            });

            const user = await buildUserObject(authUser);
            Store.setUser(user);

            showToast('Account created successfully!', 'success');
            hideAuthModal();
            updateUserUI();
            navigate('dashboard');

        } else {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                showToast(error.message, 'error');
                return;
            }

            const authUser = data.user;
            if (!authUser) {
                showToast('Login failed. Please try again.', 'error');
                return;
            }

            // Track login in login_history
            await SupabaseClient.recordLogin(authUser.id);

            const user = await buildUserObject(authUser);
            Store.setUser(user);

            showToast('Welcome back, ' + user.full_name + '!', 'success');
            hideAuthModal();
            updateUserUI();
            navigate('dashboard');
        }
    } catch (err) {
        console.error('Auth error:', err);
        showToast('An unexpected error occurred. Please try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

async function buildUserObject(authUser) {
    const metadata = authUser.user_metadata || {};
    // Fetch actual role from database with timeout
    let role = 'student';
    try {
        if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), 3000));
            const dbUser = await Promise.race([
                SupabaseClient.getUserRecord(authUser.id),
                timeoutPromise
            ]);
            if (dbUser && dbUser.role) role = dbUser.role;
        }
    } catch (err) {
        console.warn('[Auth] Failed to fetch role from DB, defaulting to student:', err.message);
    }
    return {
        id: authUser.id,
        email: authUser.email,
        full_name: metadata.full_name || 'User',
        major: metadata.major || 'Not specified',
        target_role: metadata.target_role || 'Not specified',
        role: role,
        isGuest: false,
        created_at: authUser.created_at
    };
}

function guestLogin() {
    const guest = {
        id: 'guest_' + Date.now(),
        email: 'guest@prepnow.local',
        full_name: 'Guest User',
        major: 'Not specified',
        target_role: 'Not specified',
        role: 'student',
        isGuest: true,
        created_at: new Date().toISOString()
    };
    Store.setUser(guest);
    hideAuthModal();
    updateUserUI();
    navigate('dashboard');
    showToast('Welcome! You\'re browsing as a guest.', 'info');
}

async function logout() {
    try {
        const supabase = SupabaseClient.getClient();
        await supabase.auth.signOut();
    } catch (err) {
        console.error('Sign out error:', err);
    }
    Store.clearUser();
    updateUserUI();
    showAuthModal();
    showToast('Signed out successfully', 'info');
}

function showAuthModal() {
    document.getElementById('authModal').style.display = 'flex';
}

function hideAuthModal() {
    document.getElementById('authModal').style.display = 'none';
}

function updateUserUI() {
    const user = Store.getUser();
    const nameEl = document.getElementById('sidebarUserName');
    const avatarEl = document.getElementById('sidebarAvatar');
    const logoutBtn = document.getElementById('logoutBtn');
    const adminNav = document.getElementById('adminNavItem');
    const roleEl = document.querySelector('.user-role');

    if (user) {
        nameEl.textContent = user.full_name;
        avatarEl.textContent = user.full_name.charAt(0).toUpperCase();
        logoutBtn.style.display = 'block';
        // Show admin nav only for admin users
        if (adminNav) adminNav.style.display = (user.role === 'admin') ? 'block' : 'none';
        if (roleEl) roleEl.textContent = user.role === 'admin' ? 'Admin' : 'Student';
    } else {
        nameEl.textContent = 'Guest';
        avatarEl.textContent = 'G';
        logoutBtn.style.display = 'none';
        if (adminNav) adminNav.style.display = 'none';
        if (roleEl) roleEl.textContent = 'Student';
    }
}

async function checkAuth() {
    try {
        const supabase = SupabaseClient.getClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session && session.user) {
            const user = await buildUserObject(session.user);
            Store.setUser(user);
            updateUserUI();
        } else {
            // No active Supabase session -- check for guest in localStorage
            const storedUser = Store.getUser();
            if (!storedUser) {
                showAuthModal();
            }
            updateUserUI();
        }
    } catch (err) {
        console.error('checkAuth error:', err);
        // Fallback to localStorage
        const storedUser = Store.getUser();
        if (!storedUser) {
            showAuthModal();
        }
        updateUserUI();
    }
}

// Listen to Supabase auth state changes
function initAuthListener() {
    try {
        const supabase = SupabaseClient.getClient();
        supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session && session.user) {
                const user = await buildUserObject(session.user);
                Store.setUser(user);
                updateUserUI();
            } else if (event === 'SIGNED_OUT') {
                Store.clearUser();
                updateUserUI();
                showAuthModal();
            } else if (event === 'TOKEN_REFRESHED' && session && session.user) {
                const user = await buildUserObject(session.user);
                Store.setUser(user);
            }
        });
    } catch (err) {
        console.error('Failed to initialize auth listener:', err);
    }
}

// Auth listener is initialized by initApp() in app.js after Supabase client is ready
