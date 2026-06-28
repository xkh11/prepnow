/* ============================================
   PrepNow Dashboard Module
   ============================================ */

async function renderDashboard() {
    const main = document.getElementById('mainContent');
    const user = Store.getUser() || { full_name: 'Guest' };
    const stats = Store.getStats();

    // Override with database stats if authenticated
    let dbStats = null;
    if (user && !user.isGuest && typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        dbStats = await SupabaseClient.getDashboardStats(user.id);
    }
    const finalStats = dbStats ? {
        totalAssessments: dbStats.totalAssessments,
        totalInterviews: dbStats.totalInterviews,
        technicalScore: dbStats.technicalScore !== null ? Math.round(dbStats.technicalScore) : stats.technicalScore,
        softSkillScore: dbStats.softSkillScore !== null ? Math.round(dbStats.softSkillScore) : stats.softSkillScore,
        avgInterviewScore: dbStats.avgInterviewScore || stats.avgInterviewScore,
        readinessScore: (() => {
            let s = 0, f = 0;
            if (dbStats.technicalScore !== null) { s += dbStats.technicalScore; f++; }
            if (dbStats.softSkillScore !== null) { s += dbStats.softSkillScore; f++; }
            if (dbStats.totalInterviews > 0) { s += dbStats.avgInterviewScore; f++; }
            return f > 0 ? Math.round(s / f) : stats.readinessScore;
        })()
    } : stats;

    const interviews = dbStats ? dbStats.interviews.map(i => ({
        score: Math.round(i.score || 0),
        category: 'interview',
        created_at: i.created_at,
        questions: 1
    })) : Store.getInterviews();
    const recentInterviews = interviews.slice(-5).reverse();

    const firstName = user.full_name.split(' ')[0];

    main.innerHTML = `
        <!-- Welcome Banner -->
        <div class="welcome-banner fade-in">
            <h1>Welcome back, ${firstName}! 👋</h1>
            <p>Track your progress, practice interviews, and improve your career readiness.</p>
            <div class="actions">
                <button class="btn btn-primary" onclick="navigate('interview')">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                    Start Interview
                </button>
                <button class="btn btn-secondary" onclick="navigate('assessment')">Take Assessment</button>
            </div>
        </div>

        <!-- Stats -->
        <div class="grid-4 fade-in stagger-1" style="margin-bottom:28px;">
            <div class="stat-card">
                <div class="stat-icon green">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                </div>
                <div class="stat-content">
                    <div class="stat-label">Readiness Score</div>
                    <div class="stat-value">${finalStats.readinessScore}%</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon blue">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                </div>
                <div class="stat-content">
                    <div class="stat-label">Assessments</div>
                    <div class="stat-value">${finalStats.totalAssessments}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon yellow">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                </div>
                <div class="stat-content">
                    <div class="stat-label">Interviews</div>
                    <div class="stat-value">${finalStats.totalInterviews}</div>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon red">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="stat-content">
                    <div class="stat-label">Avg Interview</div>
                    <div class="stat-value">${finalStats.avgInterviewScore}%</div>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <h3 style="margin-bottom:16px;" class="fade-in stagger-2">Quick Actions</h3>
        <div class="quick-actions fade-in stagger-2">
            <div class="quick-action" onclick="navigate('assessment')">
                <div class="qa-icon" style="background:var(--info-subtle)">📋</div>
                <h3>Skill Assessment</h3>
                <p>Evaluate your technical and soft skills</p>
            </div>
            <div class="quick-action" onclick="navigate('interview')">
                <div class="qa-icon" style="background:var(--accent-subtle)">🎤</div>
                <h3>Voice Interview</h3>
                <p>Practice with AI-powered feedback</p>
            </div>
            <div class="quick-action" onclick="navigate('training')">
                <div class="qa-icon" style="background:var(--warning-subtle)">📚</div>
                <h3>Training Plan</h3>
                <p>Your personalized development path</p>
            </div>
        </div>

        <!-- Charts and Recent Activity -->
        <div class="grid-2 fade-in stagger-3" style="margin-top:28px;">
            <!-- Performance Chart -->
            <div class="chart-card">
                <div class="chart-header">
                    <h3 style="font-size:0.95rem;">Interview Scores</h3>
                    <span class="badge badge-info">${interviews.length} sessions</span>
                </div>
                ${interviews.length > 0 ? renderScoreChart(interviews) : '<div class="empty-state" style="padding:30px 10px"><p style="font-size:0.85rem">Complete interviews to see your progress chart</p></div>'}
            </div>

            <!-- Recent Activity -->
            <div class="chart-card">
                <div class="chart-header">
                    <h3 style="font-size:0.95rem;">Recent Activity</h3>
                    ${recentInterviews.length > 0 ? `<a href="#" onclick="navigate('history')" style="font-size:0.8rem; color:var(--accent); text-decoration:none;">View All →</a>` : ''}
                </div>
                ${recentInterviews.length > 0 ? recentInterviews.map(i => `
                    <div style="display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border);">
                        <div style="width:32px; height:32px; border-radius:8px; background:${i.score >= 70 ? 'var(--accent-subtle)' : 'var(--warning-subtle)'}; display:flex; align-items:center; justify-content:center; font-size:0.9rem;">🎤</div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-size:0.8rem; font-weight:600;">${i.category} Interview</div>
                            <div style="font-size:0.7rem; color:var(--text-muted);">${new Date(i.created_at).toLocaleDateString()} • ${i.questions} questions</div>
                        </div>
                        <span style="font-weight:700; color:${i.score >= 70 ? 'var(--accent)' : i.score >= 50 ? 'var(--warning)' : 'var(--danger)'}">${i.score}%</span>
                    </div>
                `).join('') : '<div class="empty-state" style="padding:30px 10px"><p style="font-size:0.85rem">No recent activity. Start practicing!</p></div>'}
            </div>
        </div>

        <!-- Skill Overview -->
        ${finalStats.technicalScore !== null || finalStats.softSkillScore !== null ? `
            <h3 style="margin:28px 0 16px" class="fade-in stagger-4">Skill Overview</h3>
            <div class="grid-2 fade-in stagger-4">
                ${finalStats.technicalScore !== null ? `
                    <div class="card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                            <span style="font-weight:600;">Technical Skills</span>
                            <span class="badge badge-${finalStats.technicalScore >= 70 ? 'success' : finalStats.technicalScore >= 50 ? 'warning' : 'danger'}">${finalStats.technicalScore}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill ${finalStats.technicalScore < 50 ? 'danger' : finalStats.technicalScore < 70 ? 'warning' : ''}" style="width:${finalStats.technicalScore}%"></div>
                        </div>
                    </div>
                ` : ''}
                ${finalStats.softSkillScore !== null ? `
                    <div class="card">
                        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
                            <span style="font-weight:600;">Soft Skills</span>
                            <span class="badge badge-${finalStats.softSkillScore >= 70 ? 'success' : finalStats.softSkillScore >= 50 ? 'warning' : 'danger'}">${finalStats.softSkillScore}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill ${finalStats.softSkillScore < 50 ? 'danger' : finalStats.softSkillScore < 70 ? 'warning' : ''}" style="width:${finalStats.softSkillScore}%"></div>
                        </div>
                    </div>
                ` : ''}
            </div>
        ` : ''}
    `;
}

function renderScoreChart(interviews) {
    const recent = interviews.slice(-8);
    const maxScore = 100;

    return `
        <div class="mini-chart">
            ${recent.map((i, idx) => {
                const height = Math.max(4, (i.score / maxScore) * 100);
                const color = i.score >= 70 ? 'var(--accent)' : i.score >= 50 ? 'var(--warning)' : 'var(--danger)';
                return `
                    <div class="chart-bar" style="height:${height}%; background:${color}; opacity:${0.5 + (idx / recent.length) * 0.5}">
                        <div class="bar-tooltip">${i.score}% • ${i.category}</div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="chart-labels">
            ${recent.map((i, idx) => `<span>#${interviews.length - recent.length + idx + 1}</span>`).join('')}
        </div>
    `;
}
