/* ============================================
   PrepNow Training Plan Module
   All resources loaded from Supabase training_resources table
   ============================================ */

// In-memory maps populated once per session from Supabase
let _resourcesBySkill = null;        // { 'Database': [...], 'Communication': [...] }
let _resourcesGeneral = null;        // { 'Interview Preparation': [...], 'Career Readiness': [...] }

const techSkillIcons = {
    'Database': '🗄️',
    'Web Development': '🌐',
    'Programming Concepts': '💻',
    'Data Structures': '🏗️',
    'Algorithms': '⚙️',
    'Networking': '🔌',
    'Software Engineering': '🛠️',
    'Operating Systems': '🖥️',
    'Cybersecurity': '🔒',
    'Security': '🔒',
    'Cloud Computing': '☁️',
    'DevOps': '♾️'
};

const softSkillIcons = {
    'Communication': '🗣️',
    'Teamwork': '🤝',
    'Leadership': '👑',
    'Problem Solving': '🧩',
    'Time Management': '⏰',
    'Emotional Intelligence': '🧠',
    'Conflict Resolution': '🕊️',
    'Adaptability': '🔄',
    'Interview Skills': '🎤',
    'Stress Management': '🧘',
    'Networking (Professional)': '🔗'
};

async function loadTrainingResources() {
    if (_resourcesBySkill && _resourcesGeneral) return;

    _resourcesBySkill = {};
    _resourcesGeneral = {};

    if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isConnected()) {
        console.warn('[Training] Supabase not connected — no resources available');
        return;
    }

    const rows = await SupabaseClient.getTrainingResources();
    if (!rows || rows.length === 0) {
        console.warn('[Training] No training resources found in database');
        return;
    }

    rows.forEach(r => {
        const item = {
            name: r.resource_name,
            type: r.resource_type,
            format: r.format,
            platform: r.platform,
            duration: r.duration,
            url: r.url
        };
        if (r.skill_category === 'general') {
            if (!_resourcesGeneral[r.skill_name]) _resourcesGeneral[r.skill_name] = [];
            _resourcesGeneral[r.skill_name].push(item);
        } else {
            if (!_resourcesBySkill[r.skill_name]) _resourcesBySkill[r.skill_name] = [];
            _resourcesBySkill[r.skill_name].push(item);
        }
    });

    console.log(`[Training] Loaded ${rows.length} training resources from Supabase`);
}

async function renderTrainingPage() {
    const main = document.getElementById('mainContent');
    const latestTech = Store.getLatestAssessment('technical');
    const latestSoft = Store.getLatestAssessment('soft');

    if (!latestTech && !latestSoft) {
        main.innerHTML = `
            <div class="page-header fade-in">
                <h1>Training Plan</h1>
                <p>Your personalized development plan based on assessment results</p>
            </div>
            <div class="empty-state fade-in">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                <h3>No Training Plan Yet</h3>
                <p>Complete a skill assessment first to generate your personalized training plan.</p>
                <button class="btn btn-primary" onclick="navigate('assessment')">Take Assessment</button>
            </div>
        `;
        return;
    }

    // Show loading state while fetching resources
    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>Training Plan</h1>
            <p>Loading recommended resources...</p>
        </div>
    `;

    await loadTrainingResources();
    const plan = await generateTrainingPlan(latestTech, latestSoft);

    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>Training Plan</h1>
            <p>Recommended courses and resources based on your latest assessment results</p>
        </div>

        <div style="max-width:800px;">
            ${plan.map((section, sIdx) => {
                return `
                    <div class="training-plan-card fade-in stagger-${sIdx + 1}">
                        <div class="training-plan-header" onclick="toggleTrainingSection(${sIdx})">
                            <div style="display:flex; align-items:center; gap:12px;">
                                <span style="font-size:1.3rem">${section.icon}</span>
                                <div>
                                    <h3 style="font-size:0.95rem">${section.title}</h3>
                                    <span style="font-size:0.75rem; color:var(--text-muted)">${section.items.length} resources</span>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:12px;">
                                <span class="badge badge-${section.priority === 'high' ? 'danger' : section.priority === 'medium' ? 'warning' : 'success'}">${section.priority}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" id="chevron-${sIdx}" style="transition: transform 0.2s"><path d="M6 9l6 6 6-6"/></svg>
                            </div>
                        </div>
                        <div class="training-plan-body" id="section-${sIdx}">
                            <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:16px; padding-top:4px;">${section.description}</p>
                            ${section.items.map(item => renderCourseItem(item)).join('')}
                        </div>
                    </div>
                `;
            }).join('')}

            <div style="margin-top:24px; display:flex; gap:12px;">
                <button class="btn btn-primary" onclick="navigate('interview')">Practice Interview</button>
                <button class="btn btn-secondary" onclick="navigate('assessment')">Retake Assessment</button>
            </div>
        </div>
    `;
}

function renderCourseItem(item) {
    const iconMap = {
        'video': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
        'article': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        'practice': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
        'course': '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>'
    };

    const icon = iconMap[item.format] || iconMap['article'];
    const typeClass = item.type === 'study' ? 'study' : item.type === 'practice' ? 'practice' : 'action';

    const linkHtml = item.url
        ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="course-link">
               Open Resource <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
           </a>`
        : '';

    return `
        <div class="course-item">
            <div class="course-icon ${typeClass}">${icon}</div>
            <div class="course-details">
                <div class="course-title">${item.name}</div>
                <div class="course-meta">
                    <span>${item.platform || 'Self-study'}</span>
                    <span>${item.format || 'Resource'}</span>
                    ${item.duration ? `<span>${item.duration}</span>` : ''}
                </div>
                ${linkHtml}
            </div>
            <span class="course-badge ${typeClass}">${item.type}</span>
        </div>
    `;
}

async function generateTrainingPlan(tech, soft) {
    const plan = [];

    // --- Individual tech skill sections, sorted worst-first ---
    if (tech) {
        const weakSkills = tech.weaknesses || [];
        const skillScores = tech.skillScores || {};

        const sortedWeak = [...weakSkills].sort((a, b) => {
            const scoreA = skillScores[a] ? (skillScores[a].correct / skillScores[a].total) * 100 : 0;
            const scoreB = skillScores[b] ? (skillScores[b].correct / skillScores[b].total) * 100 : 0;
            return scoreA - scoreB;
        });

        sortedWeak.forEach(skill => {
            const score = skillScores[skill] ? Math.round((skillScores[skill].correct / skillScores[skill].total) * 100) : 0;
            const priority = score < 40 ? 'high' : score < 70 ? 'medium' : 'low';
            const resources = (_resourcesBySkill && _resourcesBySkill[skill]) || [];
            if (resources.length > 0) {
                plan.push({
                    icon: techSkillIcons[skill] || '📘',
                    title: skill + ' \u2014 ' + score + '% Score',
                    priority: priority,
                    description: `You scored ${score}% in ${skill}. ${priority === 'high' ? 'This needs immediate attention and focused study.' : priority === 'medium' ? 'Good foundation, but there is room to improve.' : 'Almost there! Polish your knowledge with practice.'}`,
                    items: resources
                });
            }
        });
    }

    // --- Individual soft skill sections, sorted worst-first ---
    if (soft) {
        const weakSkills = soft.weaknesses || [];
        const skillScores = soft.skillScores || {};

        const sortedWeak = [...weakSkills].sort((a, b) => {
            const scoreA = skillScores[a] ? (skillScores[a].correct / skillScores[a].total) * 100 : 0;
            const scoreB = skillScores[b] ? (skillScores[b].correct / skillScores[b].total) * 100 : 0;
            return scoreA - scoreB;
        });

        sortedWeak.forEach(skill => {
            const score = skillScores[skill] ? Math.round((skillScores[skill].correct / skillScores[skill].total) * 100) : 0;
            const priority = score < 40 ? 'high' : score < 70 ? 'medium' : 'low';
            const resources = (_resourcesBySkill && _resourcesBySkill[skill]) || [];
            if (resources.length > 0) {
                plan.push({
                    icon: softSkillIcons[skill] || '💡',
                    title: skill + ' \u2014 ' + score + '% Score',
                    priority: priority,
                    description: `You scored ${score}% in ${skill}. ${priority === 'high' ? 'This is a critical area to develop before interviews.' : priority === 'medium' ? 'You have a decent base — these resources will help you level up.' : 'Nearly there! A little more practice will solidify this skill.'}`,
                    items: resources
                });
            }
        });
    }

    // --- Interview Preparation (general) ---
    const interviewPrep = (_resourcesGeneral && _resourcesGeneral['Interview Preparation']) || [];
    if (interviewPrep.length > 0) {
        plan.push({
            icon: '🎤',
            title: 'Interview Preparation',
            priority: 'high',
            description: 'Courses and guides to sharpen your interview skills and boost confidence.',
            items: interviewPrep
        });
    }

    // --- Career Readiness (general) ---
    const careerPrep = (_resourcesGeneral && _resourcesGeneral['Career Readiness']) || [];
    if (careerPrep.length > 0) {
        plan.push({
            icon: '🚀',
            title: 'Career Readiness Essentials',
            priority: 'medium',
            description: 'Essential resources for building your professional presence and landing your first role.',
            items: careerPrep
        });
    }

    // Save training plan to database if user is authenticated
    const user = Store.getUser();
    if (user && !user.isGuest && typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        const focusAreas = plan.filter(s => s.priority === 'high').map(s => s.title).join(', ') || 'General';
        const allItems = plan.flatMap(section =>
            section.items.map(item => ({
                platform: item.platform || 'Self-study',
                course_name: item.name,
                course_link: item.url || null
            }))
        );
        SupabaseClient.saveTrainingPlan(user.id, 'Training Plan', focusAreas, allItems)
            .then(result => { if (result) console.log('[Training] Plan saved to database'); })
            .catch(err => console.warn('[Training] Failed to save plan:', err));
    }

    return plan;
}

function toggleTrainingSection(index) {
    const body = document.getElementById(`section-${index}`);
    const chevron = document.getElementById(`chevron-${index}`);
    body.classList.toggle('open');
    chevron.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
}
