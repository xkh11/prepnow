/* ============================================
   PrepNow Admin Dashboard
   Platform management for admin users
   ============================================ */

let adminState = {
    tab: 'overview',
    users: [],
    questions: [],
    stats: null
};

async function renderAdminPage() {
    const main = document.getElementById('mainContent');
    const user = Store.getUser();

    if (!user || user.isGuest || user.role !== 'admin') {
        main.innerHTML = `
            <div class="page-header fade-in">
                <h1>Access Denied</h1>
                <p>You do not have permission to access the admin dashboard.</p>
            </div>
            <div class="card fade-in" style="text-align:center; padding:40px;">
                <p style="color:var(--text-secondary);">Only admin users can access this page.</p>
                <button class="btn btn-primary" onclick="navigate('dashboard')" style="margin-top:16px;">Go to Dashboard</button>
            </div>`;
        return;
    }

    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>Admin Dashboard</h1>
            <p>Manage users, questions, and monitor platform activity</p>
        </div>
        <div class="admin-tabs fade-in">
            <button class="admin-tab ${adminState.tab === 'overview' ? 'active' : ''}" onclick="switchAdminTab('overview')">Overview</button>
            <button class="admin-tab ${adminState.tab === 'analytics' ? 'active' : ''}" onclick="switchAdminTab('analytics')">Analytics</button>
            <button class="admin-tab ${adminState.tab === 'users' ? 'active' : ''}" onclick="switchAdminTab('users')">Users</button>
            <button class="admin-tab ${adminState.tab === 'questions' ? 'active' : ''}" onclick="switchAdminTab('questions')">Questions</button>
        </div>
        <div id="adminContent" class="fade-in">
            <div class="loading-overlay"><div class="spinner"></div><span>Loading...</span></div>
        </div>`;

    await loadAdminTab();
}

function switchAdminTab(tab) {
    adminState.tab = tab;
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.textContent.toLowerCase() === tab));
    loadAdminTab();
}

async function loadAdminTab() {
    const container = document.getElementById('adminContent');
    if (!container) return;
    container.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Loading...</span></div>';

    switch (adminState.tab) {
        case 'overview': await renderAdminOverview(container); break;
        case 'analytics': await renderAdminAnalytics(container); break;
        case 'users': await renderAdminUsers(container); break;
        case 'questions': await renderAdminQuestions(container); break;
    }
}

// ============================================
// Analytics Tab — Platform-wide skill performance + recent assessments
// ============================================
async function renderAdminAnalytics(container) {
    const [skillAnalytics, recentAssessments] = await Promise.all([
        SupabaseClient.getSkillAnalytics(),
        SupabaseClient.getRecentAssessments(20)
    ]);

    const skills = skillAnalytics || [];
    const assessments = recentAssessments || [];

    const techSkills = skills.filter(s => s.skill_category === 'technical');
    const softSkills = skills.filter(s => s.skill_category === 'soft');

    const scoreColor = (s) => s >= 70 ? 'var(--accent)' : s >= 50 ? 'var(--warning)' : 'var(--danger)';

    const renderSkillRow = (s) => `
        <div style="border:1px solid var(--border); border-radius:var(--radius-md); padding:12px; margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-weight:600; font-size:0.9rem;">${s.skill_name}</span>
                <div style="display:flex; gap:12px; align-items:center;">
                    <span style="font-size:0.7rem; color:var(--text-muted);">${s.attempts} attempt${s.attempts === 1 ? '' : 's'}</span>
                    <span style="font-weight:700; color:${scoreColor(s.avg_score)};">${s.avg_score}%</span>
                </div>
            </div>
            <div class="progress-bar" style="height:6px;">
                <div class="progress-fill ${s.avg_score < 50 ? 'danger' : s.avg_score < 70 ? 'warning' : ''}" style="width:${s.avg_score}%"></div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:24px;" class="admin-analytics-grid">
            <div class="card">
                <div class="card-header"><span class="card-title">Technical Skills — Platform Average</span></div>
                ${techSkills.length > 0 ? techSkills.map(renderSkillRow).join('') : '<p style="color:var(--text-muted); font-size:0.85rem;">No assessment data yet.</p>'}
            </div>
            <div class="card">
                <div class="card-header"><span class="card-title">Soft Skills — Platform Average</span></div>
                ${softSkills.length > 0 ? softSkills.map(renderSkillRow).join('') : '<p style="color:var(--text-muted); font-size:0.85rem;">No assessment data yet.</p>'}
            </div>
        </div>

        <div class="card">
            <div class="card-header"><span class="card-title">Recent Assessments (${assessments.length})</span></div>
            ${assessments.length > 0 ? `
                <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                    <thead>
                        <tr style="border-bottom:1px solid var(--border); text-align:left;">
                            <th style="padding:8px;">Student</th>
                            <th style="padding:8px;">Type</th>
                            <th style="padding:8px;">Score</th>
                            <th style="padding:8px;">Date</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${assessments.map(a => `
                            <tr style="border-bottom:1px solid var(--border);">
                                <td style="padding:8px;">
                                    <div style="font-weight:600;">${a.users?.full_name || 'Unknown'}</div>
                                    <div style="font-size:0.7rem; color:var(--text-muted);">${a.users?.email || ''}</div>
                                </td>
                                <td style="padding:8px;">
                                    <span class="badge badge-${a.type === 'skill' ? 'info' : 'warning'}">${a.type === 'skill' ? 'Technical' : 'Soft'}</span>
                                </td>
                                <td style="padding:8px;">
                                    <span style="font-weight:700; color:${scoreColor(Math.round(a.total_score))}">${Math.round(a.total_score)}%</span>
                                </td>
                                <td style="padding:8px; color:var(--text-muted);">
                                    ${new Date(a.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '<p style="color:var(--text-muted); font-size:0.85rem; padding:16px;">No assessments completed yet. Once students take assessments, results will appear here.</p>'}
        </div>
    `;
}

// ============================================
// Overview Tab — Platform Stats
// ============================================
async function renderAdminOverview(container) {
    const stats = await SupabaseClient.getAdminStats();
    adminState.stats = stats;

    if (!stats) {
        container.innerHTML = '<div class="card" style="padding:30px;text-align:center;"><p>Failed to load stats.</p></div>';
        return;
    }

    container.innerHTML = `
        <div class="admin-stats-grid">
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:rgba(6,214,160,0.1);color:var(--accent);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                </div>
                <div class="admin-stat-info">
                    <span class="admin-stat-value">${stats.totalUsers}</span>
                    <span class="admin-stat-label">Total Users</span>
                </div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:rgba(124,92,252,0.1);color:var(--purple);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="admin-stat-info">
                    <span class="admin-stat-value">${stats.totalQuestions}</span>
                    <span class="admin-stat-label">Total Questions</span>
                </div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:rgba(96,165,250,0.1);color:var(--blue);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                </div>
                <div class="admin-stat-info">
                    <span class="admin-stat-value">${stats.totalAssessments}</span>
                    <span class="admin-stat-label">Assessments Taken</span>
                </div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:rgba(251,191,36,0.1);color:#fbbf24;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                </div>
                <div class="admin-stat-info">
                    <span class="admin-stat-value">${stats.totalInterviews}</span>
                    <span class="admin-stat-label">Interview Attempts</span>
                </div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:rgba(6,214,160,0.1);color:var(--accent);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                </div>
                <div class="admin-stat-info">
                    <span class="admin-stat-value">${stats.totalTrainingPlans}</span>
                    <span class="admin-stat-label">Training Plans</span>
                </div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon" style="background:rgba(124,92,252,0.1);color:var(--purple);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4"/><polyline points="10 17 15 12 10 7"/></svg>
                </div>
                <div class="admin-stat-info">
                    <span class="admin-stat-value">${stats.totalLogins}</span>
                    <span class="admin-stat-label">Total Logins</span>
                </div>
            </div>
        </div>`;
}

// ============================================
// Users Tab — View & Manage Users
// ============================================
async function renderAdminUsers(container) {
    const users = await SupabaseClient.getAllUsers();
    adminState.users = users || [];

    if (!users || users.length === 0) {
        container.innerHTML = '<div class="card" style="padding:30px;text-align:center;"><p>No users found.</p></div>';
        return;
    }

    const rows = users.map(u => `
        <tr>
            <td title="${u.id}">${u.id.substring(0, 8)}...</td>
            <td>${u.full_name || '-'}</td>
            <td>${u.email || '-'}</td>
            <td>
                <select class="admin-role-select" onchange="changeUserRole('${u.id}', this.value)" ${u.role === 'admin' ? 'disabled' : ''}>
                    <option value="student" ${u.role === 'student' ? 'selected' : ''}>Student</option>
                    <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                </select>
            </td>
            <td>${u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</td>
        </tr>`).join('');

    container.innerHTML = `
        <div class="card admin-table-card">
            <div class="admin-table-header">
                <h3>All Users (${users.length})</h3>
            </div>
            <div class="admin-table-wrapper">
                <table class="admin-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Joined</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}

async function changeUserRole(userId, newRole) {
    const result = await SupabaseClient.updateUserRole(userId, newRole);
    if (result) {
        showToast(`User role updated to ${newRole}`, 'success');
    } else {
        showToast('Failed to update role', 'error');
        renderAdminUsers(document.getElementById('adminContent'));
    }
}

// ============================================
// Questions Tab — View, Add, Edit, Toggle
// ============================================
async function renderAdminQuestions(container) {
    const questions = await SupabaseClient.getAllQuestions();
    adminState.questions = questions || [];

    if (!questions || questions.length === 0) {
        container.innerHTML = '<div class="card" style="padding:30px;text-align:center;"><p>No questions found.</p></div>';
        return;
    }

    // Group by type and category
    const groups = {};
    questions.forEach(q => {
        const key = `${q.question_type} - ${q.category}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(q);
    });

    let questionsHTML = '';
    for (const [group, qs] of Object.entries(groups)) {
        const activeCount = qs.filter(q => q.active).length;
        const rows = qs.map(q => {
            const escapedText = (q.text || '').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
            return `
            <tr class="${q.active ? '' : 'admin-row-disabled'}">
                <td><code>${q.id}</code></td>
                <td class="admin-q-text" title="${escapedText}">${q.text.length > 50 ? q.text.substring(0, 50) + '...' : q.text}</td>
                <td><span class="admin-badge admin-badge-${q.difficulty}">${q.difficulty}</span></td>
                <td>
                    <label class="admin-toggle">
                        <input type="checkbox" ${q.active ? 'checked' : ''} onchange="toggleQuestion('${q.id}', this.checked)">
                        <span class="admin-toggle-slider"></span>
                    </label>
                </td>
                <td>
                    <button class="btn-admin-edit" onclick="openQuestionForm('${q.id}')">Edit</button>
                </td>
            </tr>`;
        }).join('');

        questionsHTML += `
            <div class="card admin-table-card" style="margin-bottom:16px;">
                <div class="admin-table-header">
                    <h3>${group.charAt(0).toUpperCase() + group.slice(1)}</h3>
                    <span class="admin-count">${activeCount}/${qs.length} active</span>
                </div>
                <div class="admin-table-wrapper">
                    <table class="admin-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Question</th>
                                <th>Difficulty</th>
                                <th>Active</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>`;
    }

    container.innerHTML = `
        <div class="admin-questions-toolbar">
            <div class="admin-questions-summary">
                <span class="admin-count-badge">${questions.length} total</span>
                <span class="admin-count-badge">${questions.filter(q => q.active).length} active</span>
                <span class="admin-count-badge">${questions.filter(q => !q.active).length} disabled</span>
            </div>
            <button class="btn btn-primary" onclick="openQuestionForm(null)">+ Add Question</button>
        </div>
        ${questionsHTML}`;
}

async function toggleQuestion(questionId, active) {
    const result = await SupabaseClient.toggleQuestionActive(questionId, active);
    if (result) {
        showToast(`Question ${active ? 'enabled' : 'disabled'}`, 'success');
    } else {
        showToast('Failed to update question', 'error');
        renderAdminQuestions(document.getElementById('adminContent'));
    }
}

// ============================================
// Add / Edit Question Form (Modal)
// ============================================
function openQuestionForm(questionId) {
    let q = null;
    if (questionId) {
        q = adminState.questions.find(x => x.id === questionId);
    }

    const isEdit = !!q;
    const title = isEdit ? 'Edit Question' : 'Add New Question';

    // For assessment questions, options is an array of {text:...}
    const optionsStr = (q && q.options) ? q.options.map(o => typeof o === 'object' ? o.text : o).join('\n') : '';
    const isInterview = q ? q.question_type === 'interview' : false;

    const overlay = document.createElement('div');
    overlay.className = 'admin-modal-overlay';
    overlay.id = 'questionFormOverlay';
    overlay.innerHTML = `
        <div class="admin-modal">
            <div class="admin-modal-header">
                <h3>${title}</h3>
                <button class="admin-modal-close" onclick="closeQuestionForm()">&times;</button>
            </div>
            <form id="questionForm" onsubmit="saveQuestion(event, ${isEdit ? "'" + questionId + "'" : 'null'})">
                <div class="admin-form-row">
                    <div class="form-group">
                        <label>Question ID</label>
                        <input type="text" id="qFormId" value="${q ? q.id : ''}" ${isEdit ? 'readonly' : 'required'} placeholder="e.g., t61 or it21">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="qFormType" onchange="toggleQuestionTypeFields()" ${isEdit ? 'disabled' : ''}>
                            <option value="assessment" ${!isInterview ? 'selected' : ''}>Assessment</option>
                            <option value="interview" ${isInterview ? 'selected' : ''}>Interview</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Question Text</label>
                    <textarea id="qFormText" rows="3" required placeholder="Enter the question text">${q ? q.text : ''}</textarea>
                </div>
                <div class="admin-form-row">
                    <div class="form-group">
                        <label>Category</label>
                        <select id="qFormCategory">
                            <option value="technical" ${q && q.category === 'technical' ? 'selected' : ''}>Technical</option>
                            <option value="soft" ${q && q.category === 'soft' ? 'selected' : ''}>Soft Skills</option>
                            <option value="behavioral" ${q && q.category === 'behavioral' ? 'selected' : ''}>Behavioral</option>
                            <option value="hr" ${q && q.category === 'hr' ? 'selected' : ''}>HR</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Difficulty</label>
                        <select id="qFormDifficulty">
                            <option value="easy" ${q && q.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
                            <option value="medium" ${q && q.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
                            <option value="hard" ${q && q.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
                        </select>
                    </div>
                </div>
                <div class="form-group">
                    <label>Skill</label>
                    <input type="text" id="qFormSkill" value="${q && q.skill ? q.skill : ''}" placeholder="e.g., JavaScript, Communication">
                </div>
                <div id="assessmentFields" style="display:${isInterview ? 'none' : 'block'};">
                    <div class="form-group">
                        <label>Options (one per line)</label>
                        <textarea id="qFormOptions" rows="4" placeholder="Option A&#10;Option B&#10;Option C&#10;Option D" oninput="updateCorrectAnswerDropdown()">${optionsStr}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Correct Answer</label>
                        <select id="qFormCorrect">
                            ${(() => {
                                const opts = optionsStr.split('\n').filter(l => l.trim());
                                if (opts.length === 0) return '<option value="0">Enter options first</option>';
                                return opts.map((o, i) => `<option value="${i}" ${q && q.correct_index === i ? 'selected' : ''}>${String.fromCharCode(65 + i)}) ${o.trim()}</option>`).join('');
                            })()}
                        </select>
                    </div>
                </div>
                <div id="interviewFields" style="display:${isInterview ? 'block' : 'none'};">
                    <div class="form-group">
                        <label>Expected Key Points</label>
                        <textarea id="qFormExpected" rows="3" placeholder="Key points the answer should cover">${q && q.expected_points ? q.expected_points : ''}</textarea>
                    </div>
                </div>
                <div class="admin-form-actions">
                    <button type="button" class="btn btn-outline" onclick="closeQuestionForm()">Cancel</button>
                    <button type="submit" class="btn btn-primary">${isEdit ? 'Update Question' : 'Add Question'}</button>
                </div>
            </form>
        </div>`;

    document.body.appendChild(overlay);
}

function updateCorrectAnswerDropdown() {
    const optLines = document.getElementById('qFormOptions').value.split('\n').filter(l => l.trim());
    const select = document.getElementById('qFormCorrect');
    const currentVal = select.value;
    select.innerHTML = optLines.length === 0
        ? '<option value="0">Enter options first</option>'
        : optLines.map((o, i) => `<option value="${i}" ${parseInt(currentVal) === i ? 'selected' : ''}>${String.fromCharCode(65 + i)}) ${o.trim()}</option>`).join('');
}

function toggleQuestionTypeFields() {
    const type = document.getElementById('qFormType').value;
    document.getElementById('assessmentFields').style.display = type === 'interview' ? 'none' : 'block';
    document.getElementById('interviewFields').style.display = type === 'interview' ? 'block' : 'none';
}

function closeQuestionForm() {
    const overlay = document.getElementById('questionFormOverlay');
    if (overlay) overlay.remove();
}

async function saveQuestion(event, editId) {
    event.preventDefault();

    const id = document.getElementById('qFormId').value.trim();
    const text = document.getElementById('qFormText').value.trim();
    const questionType = document.getElementById('qFormType').value;
    const category = document.getElementById('qFormCategory').value;
    const difficulty = document.getElementById('qFormDifficulty').value;
    const skill = document.getElementById('qFormSkill').value.trim() || null;

    if (!id || !text) {
        showToast('ID and Question Text are required', 'error');
        return;
    }

    let options = null;
    let correctIndex = null;
    let expectedPoints = null;

    if (questionType === 'assessment') {
        const optLines = document.getElementById('qFormOptions').value.trim().split('\n').filter(l => l.trim());
        if (optLines.length < 2) {
            showToast('Assessment questions need at least 2 options', 'error');
            return;
        }
        options = optLines.map(t => ({ text: t.trim() }));
        correctIndex = parseInt(document.getElementById('qFormCorrect').value) || 0;
    } else {
        expectedPoints = document.getElementById('qFormExpected').value.trim() || null;
    }

    const questionData = {
        id,
        text,
        options,
        correct_index: correctIndex,
        skill,
        difficulty,
        question_type: questionType,
        category,
        expected_points: expectedPoints,
        active: true
    };

    const result = await SupabaseClient.upsertQuestion(questionData, !!editId);

    if (result) {
        showToast(editId ? 'Question updated successfully' : 'Question added successfully', 'success');
        closeQuestionForm();
        renderAdminQuestions(document.getElementById('adminContent'));
    } else {
        showToast('Failed to save question', 'error');
    }
}
