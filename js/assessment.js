/* ============================================
   PrepNow Assessment Module
   ============================================ */

let currentAssessment = {
    type: null,
    questions: [],
    currentIndex: 0,
    answers: [],
    startTime: null
};

async function renderAssessmentPage() {
    const main = document.getElementById('mainContent');
    const latestTech = Store.getLatestAssessment('technical');
    const latestSoft = Store.getLatestAssessment('soft');

    // Get question counts from Supabase
    let techCount = 0;
    let softCount = 0;
    let sourceLabel = '';

    if (typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        const counts = await SupabaseClient.getQuestionCounts();
        if (counts) {
            techCount = counts.technical || 0;
            softCount = counts.soft || 0;
            sourceLabel = '<span style="font-size:0.65rem; color:var(--accent); margin-left:6px;">SUPABASE</span>';
        }
    }

    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>Skill Assessment</h1>
            <p>Evaluate your technical and soft skills to identify strengths and areas for improvement</p>
        </div>

        <div id="assessmentContent">
            ${latestTech || latestSoft ? renderPreviousResults(latestTech, latestSoft) : ''}

            <h3 style="margin-bottom:16px; margin-top: ${latestTech || latestSoft ? '32px' : '0'}">Choose Assessment Type</h3>
            <div class="assessment-types">
                <div class="assessment-type-card fade-in stagger-1" onclick="startAssessment('technical')">
                    <div class="type-icon">💻</div>
                    <h3>Technical Skills</h3>
                    <p>Database, programming, web development, networking, and software engineering concepts</p>
                    <div class="question-count">${techCount} questions available${sourceLabel}</div>
                    ${latestTech ? `<div style="margin-top:8px"><span class="badge badge-${latestTech.score >= 70 ? 'success' : latestTech.score >= 50 ? 'warning' : 'danger'}">Last: ${latestTech.score}%</span></div>` : ''}
                </div>
                <div class="assessment-type-card fade-in stagger-2" onclick="startAssessment('soft')">
                    <div class="type-icon">🤝</div>
                    <h3>Soft Skills</h3>
                    <p>Communication, teamwork, leadership, problem-solving, and emotional intelligence</p>
                    <div class="question-count">${softCount} questions available${sourceLabel}</div>
                    ${latestSoft ? `<div style="margin-top:8px"><span class="badge badge-${latestSoft.score >= 70 ? 'success' : latestSoft.score >= 50 ? 'warning' : 'danger'}">Last: ${latestSoft.score}%</span></div>` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderPreviousResults(tech, soft) {
    return `
        <div class="grid-2 fade-in" style="margin-bottom:8px;">
            ${tech ? `
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Technical Skills</span>
                        <span class="badge badge-${tech.score >= 70 ? 'success' : tech.score >= 50 ? 'warning' : 'danger'}">${tech.score}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${tech.score < 50 ? 'danger' : tech.score < 70 ? 'warning' : ''}" style="width:${tech.score}%"></div>
                    </div>
                    <div style="margin-top:12px; font-size:0.8rem; color:var(--text-muted)">
                        ${tech.correct}/${tech.total} correct • ${new Date(tech.completed_at).toLocaleDateString()}
                    </div>
                </div>
            ` : ''}
            ${soft ? `
                <div class="card">
                    <div class="card-header">
                        <span class="card-title">Soft Skills</span>
                        <span class="badge badge-${soft.score >= 70 ? 'success' : soft.score >= 50 ? 'warning' : 'danger'}">${soft.score}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill ${soft.score < 50 ? 'danger' : soft.score < 70 ? 'warning' : ''}" style="width:${soft.score}%"></div>
                    </div>
                    <div style="margin-top:12px; font-size:0.8rem; color:var(--text-muted)">
                        ${soft.correct}/${soft.total} correct • ${new Date(soft.completed_at).toLocaleDateString()}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

async function startAssessment(type) {
    const count = 10;

    // Show loading state while fetching questions
    const content = document.getElementById('assessmentContent');
    content.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; gap:16px;">
            <div class="spinner"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Loading questions...</p>
        </div>
    `;

    const questions = await QuestionBank.getAssessmentQuestions(type, count);

    currentAssessment = {
        type,
        questions,
        currentIndex: 0,
        answers: [],
        startTime: Date.now()
    };
    renderQuestion();
}

function renderQuestion() {
    const { questions, currentIndex } = currentAssessment;
    const q = questions[currentIndex];
    const total = questions.length;
    const progress = ((currentIndex) / total) * 100;

    const content = document.getElementById('assessmentContent');
    content.innerHTML = `
        <div class="quiz-container fade-in">
            <div class="quiz-progress">
                <span class="quiz-progress-text">${currentIndex + 1} / ${total}</span>
                <div class="progress-bar" style="flex:1">
                    <div class="progress-fill" style="width:${progress}%"></div>
                </div>
                <span class="badge badge-info">${q.difficulty}</span>
            </div>

            <div class="question-card">
                <div class="question-badge">
                    <span class="badge badge-${currentAssessment.type === 'technical' ? 'info' : 'success'}">${q.skill}</span>
                </div>
                <div class="question-text">${q.text}</div>
                <div class="options-list">
                    ${q.options.map((opt, i) => `
                        <button class="option-btn" onclick="selectOption(${i})" id="opt-${i}">
                            <span class="option-letter">${String.fromCharCode(65 + i)}</span>
                            <span>${opt}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="quiz-actions">
                    <button class="btn btn-secondary" onclick="renderAssessmentPage()">Quit</button>
                    <button class="btn btn-primary" id="nextBtn" onclick="nextQuestion()" disabled>
                        ${currentIndex === total - 1 ? 'Finish' : 'Next →'}
                    </button>
                </div>
            </div>
        </div>
    `;
}

function selectOption(index) {
    // Deselect all
    document.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
    // Select clicked
    document.getElementById(`opt-${index}`).classList.add('selected');
    currentAssessment.answers[currentAssessment.currentIndex] = index;
    document.getElementById('nextBtn').disabled = false;
}

function nextQuestion() {
    const { questions, currentIndex } = currentAssessment;

    if (currentIndex < questions.length - 1) {
        currentAssessment.currentIndex++;
        renderQuestion();
        // Restore previous answer if going back
        const prev = currentAssessment.answers[currentAssessment.currentIndex];
        if (prev !== undefined) {
            document.getElementById(`opt-${prev}`).classList.add('selected');
            document.getElementById('nextBtn').disabled = false;
        }
    } else {
        finishAssessment();
    }
}

async function finishAssessment() {
    const { type, questions, answers, startTime } = currentAssessment;

    let correct = 0;
    const skillScores = {};

    questions.forEach((q, i) => {
        const isCorrect = answers[i] === q.correct;
        if (isCorrect) correct++;

        if (!skillScores[q.skill]) skillScores[q.skill] = { correct: 0, total: 0 };
        skillScores[q.skill].total++;
        if (isCorrect) skillScores[q.skill].correct++;
    });

    const score = Math.round((correct / questions.length) * 100);
    const duration = Math.round((Date.now() - startTime) / 1000);

    // Determine strengths and weaknesses
    const strengths = [];
    const weaknesses = [];
    Object.entries(skillScores).forEach(([skill, data]) => {
        const pct = (data.correct / data.total) * 100;
        if (pct >= 70) strengths.push(skill);
        else weaknesses.push(skill);
    });

    const result = Store.addAssessment({
        type,
        score,
        correct,
        total: questions.length,
        duration,
        skillScores,
        strengths,
        weaknesses
    });

    // Save to Supabase if user is authenticated (not guest)
    const user = Store.getUser();
    if (user && !user.isGuest && typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        // Map assessment type to DB type: 'technical' → 'skill', 'soft' → 'personal'
        const dbType = type === 'technical' ? 'skill' : 'personal';
        const summary = JSON.stringify({ correct, total: questions.length, duration, skillScores, strengths, weaknesses });

        // Build skill scores array for atomic RPC save
        const skillScoresByName = Object.entries(skillScores).map(([skillName, data]) => ({
            skill_name: skillName,
            skill_score: Math.round((data.correct / data.total) * 100)
        }));

        const assessmentId = await SupabaseClient.saveAssessmentWithSkills(
            user.id, dbType, score, summary, skillScoresByName
        );

        if (assessmentId) {
            console.log(`[Assessment] Saved to database — assessment_id=${assessmentId}, skills=${skillScoresByName.length}`);
            if (typeof showToast === 'function') {
                showToast(`Assessment saved! ${skillScoresByName.length} skills tracked.`, 'success');
            }
        } else {
            console.warn('[Assessment] Failed to save to database — check RLS policies and RPC');
            if (typeof showToast === 'function') {
                showToast('Could not save to your account. Check console.', 'warning');
            }
        }
    }

    renderAssessmentResults(result, skillScores);
}

function renderAssessmentResults(result, skillScores) {
    const content = document.getElementById('assessmentContent');
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - (result.score / 100) * circumference;
    const scoreColor = result.score >= 70 ? 'var(--accent)' : result.score >= 50 ? 'var(--warning)' : 'var(--danger)';

    content.innerHTML = `
        <div class="results-container">
            <div class="results-hero">
                <div class="score-ring">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle class="ring-bg" cx="60" cy="60" r="50"/>
                        <circle class="ring-fill" cx="60" cy="60" r="50"
                            stroke="${scoreColor}"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <div class="ring-text">
                        <span class="ring-value" style="color:${scoreColor}">${result.score}%</span>
                        <span class="ring-label">Score</span>
                    </div>
                </div>
                <h2>${result.score >= 70 ? 'Great Job!' : result.score >= 50 ? 'Good Effort!' : 'Keep Practicing!'}</h2>
                <p>You got ${result.correct} out of ${result.total} questions correct in ${formatDuration(result.duration)}</p>
            </div>

            <h3 style="margin:24px 0 16px">Skill Breakdown</h3>
            <div class="results-breakdown">
                ${Object.entries(skillScores).map(([skill, data]) => {
                    const pct = Math.round((data.correct / data.total) * 100);
                    return `
                        <div class="breakdown-item">
                            <div class="skill-name">${skill}</div>
                            <div class="skill-score" style="color:${pct >= 70 ? 'var(--accent)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'}">${pct}%</div>
                            <div class="progress-bar">
                                <div class="progress-fill ${pct < 50 ? 'danger' : pct < 70 ? 'warning' : ''}" style="width:${pct}%"></div>
                            </div>
                            <div class="skill-level" style="color:${pct >= 70 ? 'var(--accent)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)'}; margin-top:4px">
                                ${data.correct}/${data.total} correct
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>

            ${result.strengths.length > 0 ? `
                <div class="card" style="margin-bottom:16px">
                    <h4 style="color:var(--accent); margin-bottom:8px">✅ Strengths</h4>
                    <p style="font-size:0.9rem; color:var(--text-secondary)">${result.strengths.join(', ')}</p>
                </div>
            ` : ''}

            ${result.weaknesses.length > 0 ? `
                <div class="card" style="margin-bottom:16px">
                    <h4 style="color:var(--warning); margin-bottom:8px">⚠️ Areas for Improvement</h4>
                    <p style="font-size:0.9rem; color:var(--text-secondary)">${result.weaknesses.join(', ')}</p>
                </div>
            ` : ''}

            <div style="display:flex; gap:12px; margin-top:24px">
                <button class="btn btn-primary" onclick="navigate('training')">View Training Plan →</button>
                <button class="btn btn-secondary" onclick="renderAssessmentPage()">Take Another Assessment</button>
            </div>
        </div>
    `;
}

function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}
