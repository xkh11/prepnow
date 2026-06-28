/* ============================================
   PrepNow Main Application Controller
   ============================================ */

let currentPage = 'dashboard';

// ============================================
// Navigation
// ============================================
function navigate(page) {
    currentPage = page;

    // Update nav active state
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
    });

    // Stop any recording if navigating away from interview
    if (page !== 'interview' && interviewState.isRecording) {
        stopRecording();
    }

    // Render page
    try {
        switch (page) {
            case 'dashboard': renderDashboard(); break;
            case 'assessment': renderAssessmentPage(); break;
            case 'training': renderTrainingPage(); break;
            case 'interview': renderInterviewPage(); break;
            case 'history': renderHistoryPage(); break;
            case 'profile': renderProfilePage(); break;
            case 'admin': renderAdminPage(); break;
            default: renderDashboard();
        }
    } catch (err) {
        console.error('[Navigate] Page render error:', err);
        document.getElementById('mainContent').innerHTML = '<div style="padding:40px;text-align:center;color:#fff;">Page failed to load. Check console for errors.</div>';
    }

    // Scroll to top
    window.scrollTo(0, 0);
}

// ============================================
// Sidebar Toggle
// ============================================
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠',
        info: 'ℹ'
    };

    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ============================================
// App Initialization
// ============================================
async function initApp() {
    // Initialize Supabase connection (reads from config.js)
    if (typeof SupabaseClient !== 'undefined') {
        SupabaseClient.init();
    }

    // Initialize auth state listener
    if (typeof initAuthListener === 'function') initAuthListener();

    await checkAuth();
    navigate('dashboard');

    // Run API connection check after a short delay (let page render first)
    setTimeout(checkAPIConnections, 1500);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            // Close any modals
            document.querySelectorAll('.feedback-detail-overlay').forEach(el => el.remove());
        }
    });
}

// ============================================
// API Connection Check (runs on startup)
// ============================================
async function checkAPIConnections() {
    let supabaseOk = false;
    let openaiOk = false;

    // 1. Check Supabase — try to query the questions table
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        try {
            const result = await SupabaseClient.testConnection(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
            supabaseOk = result.success;
        } catch (e) {
            supabaseOk = false;
        }
    }

    // 2. Check OpenAI — verify API key against models endpoint
    const openaiKey = (typeof CONFIG !== 'undefined' && CONFIG.OPENAI_API_KEY) || '';
    if (openaiKey && openaiKey.startsWith('sk-')) {
        try {
            const res = await fetch('https://api.openai.com/v1/models/gpt-5.4-mini', {
                headers: { 'Authorization': `Bearer ${openaiKey}` }
            });
            openaiOk = res.ok;
        } catch (e) {
            openaiOk = false;
        }
    }

    // 3. Show results
    if (supabaseOk && openaiOk) {
        showToast('All APIs connected — Supabase + OpenAI ready', 'success');
    } else if (supabaseOk && !openaiOk) {
        showToast('Supabase connected — OpenAI failed (check API key & billing)', 'warning');
    } else if (!supabaseOk && openaiOk) {
        showToast('OpenAI connected — Supabase failed (check URL & key)', 'warning');
    } else {
        showToast('Both APIs failed — check config.js credentials', 'error');
    }

    console.log('[PrepNow] Supabase:', supabaseOk ? 'Connected' : 'Failed');
    console.log('[PrepNow] OpenAI:', openaiOk ? 'Connected' : 'Failed');
}

// Start the app
document.addEventListener('DOMContentLoaded', initApp);
