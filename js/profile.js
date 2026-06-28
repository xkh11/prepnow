/* ============================================
   PrepNow Profile Module
   ============================================ */

async function renderProfilePage() {
    const main = document.getElementById('mainContent');
    const user = Store.getUser() || {};
    const stats = Store.getStats();

    // Load student profile from database if authenticated
    let studentProfile = null;
    if (user && !user.isGuest && typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        studentProfile = await SupabaseClient.getStudentProfile(user.id);
    }

    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>Profile</h1>
            <p>Manage your account and view your progress summary</p>
        </div>

        <div class="profile-grid fade-in">
            <div>
                <div class="card" style="text-align:center; margin-bottom:16px;">
                    <div class="profile-avatar-large">${(user.full_name || 'G').charAt(0).toUpperCase()}</div>
                    <div class="profile-name">${user.full_name || 'Guest User'}</div>
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-bottom:16px">${user.email || 'guest@prepnow.local'}</div>
                    <span class="badge badge-success">${user.role || 'Student'}</span>
                </div>

                <div class="card">
                    <h4 style="margin-bottom:12px; font-size:0.85rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">Information</h4>
                    <div class="profile-info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                        <span>Major: <strong>${user.major || 'Not specified'}</strong></span>
                    </div>
                    <div class="profile-info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 00-8 0v2"/></svg>
                        <span>Target Role: <strong>${user.target_role || 'Not specified'}</strong></span>
                    </div>
                    ${studentProfile && studentProfile.university ? `
                    <div class="profile-info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 7l10-5 10 5-10 5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                        <span>University: <strong>${studentProfile.university}</strong></span>
                    </div>
                    ` : ''}
                    ${studentProfile && studentProfile.gpa ? `
                    <div class="profile-info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        <span>GPA: <strong>${studentProfile.gpa}</strong></span>
                    </div>
                    ` : ''}
                    <div class="profile-info-item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                        <span>Joined: <strong>${user.created_at ? new Date(user.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'N/A'}</strong></span>
                    </div>
                </div>
            </div>

            <div>
                <!-- Edit Profile -->
                <div class="card" style="margin-bottom:16px;">
                    <h3 style="margin-bottom:16px;">Edit Profile</h3>
                    <form onsubmit="updateProfile(event)">
                        <div class="form-group">
                            <label for="editName">Full Name</label>
                            <input type="text" id="editName" value="${user.full_name || ''}" placeholder="Your full name">
                        </div>
                        <div class="form-group">
                            <label for="editMajor">Major</label>
                            <select id="editMajor">
                                <option value="">Select your major</option>
                                ${['Information Systems', 'Computer Science', 'Software Engineering', 'Cybersecurity', 'Data Science', 'Business Administration', 'Other'].map(m =>
                                    `<option value="${m}" ${user.major === m ? 'selected' : ''}>${m}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="editTargetRole">Target Job Role</label>
                            <input type="text" id="editTargetRole" value="${user.target_role || ''}" placeholder="e.g., Software Developer">
                        </div>
                        <div class="form-group">
                            <label for="editUniversity">University</label>
                            <input type="text" id="editUniversity" value="${studentProfile?.university || ''}" placeholder="Your university">
                        </div>
                        <div class="form-group">
                            <label for="editGPA">GPA</label>
                            <input type="number" id="editGPA" step="0.01" min="0" max="5" value="${studentProfile?.gpa || ''}" placeholder="e.g., 3.5">
                        </div>
                        <div class="form-group">
                            <label for="editGradYear">Graduation Year</label>
                            <input type="number" id="editGradYear" value="${studentProfile?.graduation_year || ''}" placeholder="e.g., 2026">
                        </div>
                        <button type="submit" class="btn btn-primary">Save Changes</button>
                    </form>
                </div>

                <!-- Stats Summary -->
                <div class="card" style="margin-bottom:16px;">
                    <h3 style="margin-bottom:16px;">Progress Summary</h3>
                    <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:12px;">
                        <div style="text-align:center; padding:16px; background:var(--bg-input); border-radius:var(--radius-md);">
                            <div style="font-size:1.5rem; font-weight:800; color:var(--accent)">${stats.readinessScore}%</div>
                            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Readiness</div>
                        </div>
                        <div style="text-align:center; padding:16px; background:var(--bg-input); border-radius:var(--radius-md);">
                            <div style="font-size:1.5rem; font-weight:800; color:var(--info)">${stats.totalAssessments}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Assessments</div>
                        </div>
                        <div style="text-align:center; padding:16px; background:var(--bg-input); border-radius:var(--radius-md);">
                            <div style="font-size:1.5rem; font-weight:800; color:var(--warning)">${stats.totalInterviews}</div>
                            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Interviews</div>
                        </div>
                        <div style="text-align:center; padding:16px; background:var(--bg-input); border-radius:var(--radius-md);">
                            <div style="font-size:1.5rem; font-weight:800; color:${stats.avgInterviewScore >= 70 ? 'var(--accent)' : 'var(--warning)'}">${stats.avgInterviewScore}%</div>
                            <div style="font-size:0.7rem; color:var(--text-muted); text-transform:uppercase;">Avg Score</div>
                        </div>
                    </div>
                </div>

                <!-- Danger Zone -->
                <div class="card" style="border-color: rgba(239,68,68,0.2);">
                    <h3 style="color:var(--danger); margin-bottom:8px;">Danger Zone</h3>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">These actions are irreversible. Be careful.</p>
                    <div style="display:flex; gap:12px;">
                        <button class="btn btn-danger btn-sm" onclick="clearAllData()">Clear All Data</button>
                        <button class="btn btn-outline btn-sm" onclick="logout()">Sign Out</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function updateProfile(event) {
    event.preventDefault();
    const user = Store.getUser();
    if (!user) return;

    user.full_name = document.getElementById('editName').value || user.full_name;
    user.major = document.getElementById('editMajor').value || user.major;
    user.target_role = document.getElementById('editTargetRole').value || user.target_role;

    Store.setUser(user);
    updateUserUI();

    // Save to database if authenticated
    if (user && !user.isGuest && typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        // Update users table
        await SupabaseClient.updateUserRecord(user.id, {
            full_name: user.full_name,
            target_role: user.target_role
        });
        // Update student profile
        await SupabaseClient.upsertStudentProfile(user.id, {
            university: document.getElementById('editUniversity')?.value || null,
            major: user.major,
            gpa: parseFloat(document.getElementById('editGPA')?.value) || null,
            graduation_year: parseInt(document.getElementById('editGradYear')?.value) || null
        });
    }

    // Also update in users list if registered
    const users = Store.get('users') || [];
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
        users[idx] = { ...users[idx], ...user };
        Store.set('users', users);
    }

    showToast('Profile updated successfully!', 'success');
    renderProfilePage();
}

function clearAllData() {
    if (confirm('Are you sure you want to clear all your data? This includes assessments, interviews, and training progress. This cannot be undone.')) {
        const user = Store.getUser();
        Store.remove('assessments');
        Store.remove('interviews');
        Store.remove('training_progress');
        showToast('All data cleared', 'info');
        renderProfilePage();
    }
}
