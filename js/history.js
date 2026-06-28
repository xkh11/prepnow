/* ============================================
   PrepNow History Module
   ============================================ */

async function renderHistoryPage() {
    const main = document.getElementById('mainContent');
    const user = Store.getUser();

    let assessments = Store.getAssessments();
    let interviews = Store.getInterviews();

    // Load from database if authenticated
    if (user && !user.isGuest && typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        const dbAssessments = await SupabaseClient.getAssessmentHistory(user.id);
        if (dbAssessments && dbAssessments.length > 0) {
            assessments = dbAssessments.map(a => ({
                id: String(a.assessment_id),
                type: a.type === 'skill' ? 'technical' : 'soft',
                score: Math.round(a.total_score),
                correct: 0,
                total: 0,
                duration: 0,
                completed_at: a.completed_at,
                ...(() => {
                    try {
                        const s = JSON.parse(a.summary);
                        return { correct: s.correct || 0, total: s.total || 0, duration: s.duration || 0, skillScores: s.skillScores, strengths: s.strengths, weaknesses: s.weaknesses };
                    } catch { return {}; }
                })()
            }));
        }

        const dbInterviews = await SupabaseClient.getInterviewHistory(user.id);
        if (dbInterviews && dbInterviews.length > 0) {
            // Group interview attempts by session (same created_at within 1 hour)
            // For now, show each attempt individually
            interviews = dbInterviews.map(a => ({
                id: String(a.attempt_id),
                category: a.questions?.category || 'mixed',
                score: Math.round(a.score || 0),
                questions: 1,
                created_at: a.created_at,
                attempts: [{
                    question: a.questions?.text || 'Question',
                    transcript: a.transcript,
                    feedback: (() => { try { return JSON.parse(a.ai_feedback); } catch { return { overall: a.ai_feedback }; } })(),
                    score: Math.round(a.score || 0)
                }]
            }));
        }
    }

    // Combine and sort by date
    const allHistory = [
        ...assessments.map(a => ({ ...a, historyType: 'assessment', date: a.completed_at })),
        ...interviews.map(i => ({ ...i, historyType: 'interview', date: i.created_at }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>History</h1>
            <p>View your past assessments and interview practice sessions</p>
        </div>

        <div style="display:flex; gap:12px; margin-bottom:24px;" class="fade-in">
            <button class="btn btn-sm ${true ? 'btn-primary' : 'btn-secondary'}" onclick="filterHistory('all')" id="filterAll">All (${allHistory.length})</button>
            <button class="btn btn-sm btn-secondary" onclick="filterHistory('assessment')" id="filterAssessment">Assessments (${assessments.length})</button>
            <button class="btn btn-sm btn-secondary" onclick="filterHistory('interview')" id="filterInterview">Interviews (${interviews.length})</button>
        </div>

        <div id="historyList">
            ${allHistory.length > 0 ? allHistory.map((item, idx) => renderHistoryItem(item, idx)).join('') : `
                <div class="empty-state">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <h3>No History Yet</h3>
                    <p>Complete assessments or interview practice sessions to see your history here.</p>
                    <div style="display:flex; gap:12px; justify-content:center;">
                        <button class="btn btn-primary" onclick="navigate('assessment')">Take Assessment</button>
                        <button class="btn btn-secondary" onclick="navigate('interview')">Practice Interview</button>
                    </div>
                </div>
            `}
        </div>
    `;

    // Store for filtering
    window._historyData = allHistory;
}

function renderHistoryItem(item, idx) {
    const isAssessment = item.historyType === 'assessment';
    const icon = isAssessment ? '📋' : '🎤';
    const bgColor = isAssessment
        ? (item.type === 'technical' ? 'var(--info-subtle)' : 'var(--accent-subtle)')
        : 'var(--warning-subtle)';

    const title = isAssessment
        ? `${item.type === 'technical' ? 'Technical' : 'Soft Skills'} Assessment`
        : `${item.category || 'Mixed'} Interview`;

    const meta = isAssessment
        ? `${item.correct}/${item.total} correct • ${formatDuration(item.duration)}`
        : `${item.questions || item.attempts?.length || 0} questions answered`;

    const scoreColor = item.score >= 70 ? 'var(--accent)' : item.score >= 50 ? 'var(--warning)' : 'var(--danger)';
    const date = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return `
        <div class="history-item fade-in stagger-${Math.min(idx + 1, 4)}" data-type="${item.historyType}" onclick="showHistoryDetail('${item.id}', '${item.historyType}')">
            <div class="history-icon" style="background:${bgColor}">${icon}</div>
            <div class="history-details">
                <div class="history-title">${title}</div>
                <div class="history-meta">${date} • ${meta}</div>
            </div>
            <div class="history-score" style="color:${scoreColor}">${item.score}%</div>
        </div>
    `;
}

function filterHistory(type) {
    // Update buttons
    document.querySelectorAll('[id^="filter"]').forEach(btn => {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
    });
    document.getElementById(`filter${type.charAt(0).toUpperCase() + type.slice(1)}`).classList.remove('btn-secondary');
    document.getElementById(`filter${type.charAt(0).toUpperCase() + type.slice(1)}`).classList.add('btn-primary');

    // Filter items
    const items = document.querySelectorAll('.history-item');
    items.forEach(item => {
        if (type === 'all' || item.dataset.type === type) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

async function showHistoryDetail(id, type) {
    if (type === 'assessment') {
        await showAssessmentDetail(id);
        return;
    }
    if (type === 'interview') {
        const interviews = Store.getInterviews();
        const interview = interviews.find(i => i.id === id);
        if (!interview || !interview.attempts) return;

        const overlay = document.createElement('div');
        overlay.className = 'feedback-detail-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        overlay.innerHTML = `
            <div class="feedback-detail-modal">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                    <h2>${interview.category || 'Mixed'} Interview</h2>
                    <button class="btn btn-sm btn-secondary" onclick="this.closest('.feedback-detail-overlay').remove()">✕ Close</button>
                </div>
                <div style="display:flex; gap:16px; margin-bottom:20px;">
                    <div style="text-align:center;">
                        <div style="font-size:2rem; font-weight:800; color:${interview.score >= 70 ? 'var(--accent)' : interview.score >= 50 ? 'var(--warning)' : 'var(--danger)'}">${interview.score}%</div>
                        <div style="font-size:0.75rem; color:var(--text-muted)">Average Score</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:2rem; font-weight:800">${interview.attempts.length}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted)">Questions</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:0.8rem; color:var(--text-muted)">${new Date(interview.created_at).toLocaleString()}</div>
                    </div>
                </div>
                ${interview.attempts.map((a, i) => `
                    <div style="border:1px solid var(--border); border-radius:var(--radius-md); padding:16px; margin-bottom:12px;">
                        <div style="font-weight:600; margin-bottom:8px; font-size:0.9rem;">Q${i + 1}: ${a.question}</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary); margin-bottom:8px; padding:10px; background:var(--bg-input); border-radius:var(--radius-sm);">
                            <strong>Your Answer:</strong> ${a.transcript.substring(0, 300)}${a.transcript.length > 300 ? '...' : ''}
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-weight:700; color:${a.score >= 70 ? 'var(--accent)' : a.score >= 50 ? 'var(--warning)' : 'var(--danger)'}">${a.score}%</span>
                            <span style="font-size:0.75rem; color:var(--text-muted)">${a.feedback?.overall || ''}</span>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        document.body.appendChild(overlay);
    }
}

async function showAssessmentDetail(assessmentId) {
    // Find assessment from history data
    const item = window._historyData?.find(h => String(h.id) === String(assessmentId) && h.historyType === 'assessment');
    if (!item) return;

    const overlay = document.createElement('div');
    overlay.className = 'feedback-detail-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // Try to fetch per-skill breakdown from assessment_skills table
    let skillBreakdown = null;
    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected() && !isNaN(parseInt(assessmentId))) {
        skillBreakdown = await SupabaseClient.getAssessmentSkillBreakdown(parseInt(assessmentId));
    }

    // Fallback to local skillScores if DB breakdown not available
    if (!skillBreakdown || skillBreakdown.length === 0) {
        if (item.skillScores) {
            skillBreakdown = Object.entries(item.skillScores).map(([name, data]) => ({
                skill_name: name,
                skill_category: item.type === 'technical' ? 'technical' : 'soft',
                skill_score: Math.round((data.correct / data.total) * 100)
            }));
        }
    }

    const scoreColor = (s) => s >= 70 ? 'var(--accent)' : s >= 50 ? 'var(--warning)' : 'var(--danger)';
    const title = item.type === 'technical' ? 'Technical Skills Assessment' : 'Soft Skills Assessment';

    overlay.innerHTML = `
        <div class="feedback-detail-modal">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h2>${title}</h2>
                <button class="btn btn-sm btn-secondary" onclick="this.closest('.feedback-detail-overlay').remove()">✕ Close</button>
            </div>
            <div style="display:flex; gap:24px; margin-bottom:24px; flex-wrap:wrap;">
                <div style="text-align:center;">
                    <div style="font-size:2rem; font-weight:800; color:${scoreColor(item.score)}">${item.score}%</div>
                    <div style="font-size:0.75rem; color:var(--text-muted)">Overall Score</div>
                </div>
                ${item.correct && item.total ? `
                <div style="text-align:center;">
                    <div style="font-size:2rem; font-weight:800">${item.correct}/${item.total}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted)">Correct</div>
                </div>
                ` : ''}
                <div style="text-align:center;">
                    <div style="font-size:0.85rem; color:var(--text-muted); padding-top:6px;">${new Date(item.date).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                </div>
            </div>

            ${skillBreakdown && skillBreakdown.length > 0 ? `
                <h3 style="font-size:0.95rem; margin-bottom:12px;">Skill Breakdown</h3>
                <div style="display:flex; flex-direction:column; gap:10px;">
                    ${skillBreakdown.sort((a, b) => a.skill_score - b.skill_score).map(s => `
                        <div style="border:1px solid var(--border); border-radius:var(--radius-md); padding:12px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <span style="font-weight:600; font-size:0.9rem;">${s.skill_name}</span>
                                <span style="font-weight:700; color:${scoreColor(s.skill_score)}">${s.skill_score}%</span>
                            </div>
                            <div class="progress-bar" style="height:6px;">
                                <div class="progress-fill ${s.skill_score < 50 ? 'danger' : s.skill_score < 70 ? 'warning' : ''}" style="width:${s.skill_score}%"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            ` : '<p style="color:var(--text-muted); font-size:0.85rem;">No skill breakdown available.</p>'}

            ${item.strengths && item.strengths.length > 0 ? `
                <div style="margin-top:20px;">
                    <h4 style="font-size:0.85rem; color:var(--accent); margin-bottom:8px;">✓ Strengths</h4>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${item.strengths.map(s => `<span class="badge badge-success">${s}</span>`).join('')}
                    </div>
                </div>
            ` : ''}

            ${item.weaknesses && item.weaknesses.length > 0 ? `
                <div style="margin-top:16px;">
                    <h4 style="font-size:0.85rem; color:var(--danger); margin-bottom:8px;">⚠ Needs Improvement</h4>
                    <div style="display:flex; gap:6px; flex-wrap:wrap;">
                        ${item.weaknesses.map(s => `<span class="badge badge-danger">${s}</span>`).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(overlay);
}
