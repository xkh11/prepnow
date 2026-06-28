/* ============================================
   PrepNow Supabase Client
   Handles connection + question fetching
   Falls back to local QuestionBank if offline
   ============================================ */

const SupabaseClient = (() => {
    let _client = null;
    let _connected = false;

    // Initialize Supabase connection
    function init() {
        const url = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_URL) || '';
        const key = (typeof CONFIG !== 'undefined' && CONFIG.SUPABASE_ANON_KEY) || '';

        if (!url || !key) {
            console.log('[Supabase] No credentials in config.js — using local questions');
            _connected = false;
            return false;
        }

        try {
            // supabase global comes from the CDN script
            if (typeof supabase !== 'undefined' && supabase.createClient) {
                _client = supabase.createClient(url, key);
                _connected = true;
                console.log('[Supabase] Connected successfully');
                return true;
            } else {
                console.warn('[Supabase] SDK not loaded — using local questions');
                _connected = false;
                return false;
            }
        } catch (err) {
            console.error('[Supabase] Connection failed:', err);
            _connected = false;
            return false;
        }
    }

    // Check if connected
    function isConnected() {
        return _connected && _client !== null;
    }

    // Fetch random assessment questions from Supabase
    async function getAssessmentQuestions(category, count = 10) {
        if (!isConnected()) return null; // null = use local fallback

        try {
            const { data, error } = await _client.rpc('get_random_questions', {
                p_category: category,
                p_question_type: 'assessment',
                p_count: count
            });

            if (error) throw error;
            if (!data || data.length === 0) return null;

            // Transform Supabase rows → format matching local QuestionBank
            return data.map(row => ({
                id: row.id,
                text: row.text,
                options: row.options.map(o => o.text),
                correct: row.correct_index,
                skill: row.skill,
                difficulty: row.difficulty
            }));
        } catch (err) {
            console.warn('[Supabase] Failed to fetch assessment questions:', err.message);
            return null;
        }
    }

    // Fetch random interview questions from Supabase
    async function getInterviewQuestions(category, count = 5) {
        if (!isConnected()) return null;

        try {
            const { data, error } = await _client.rpc('get_random_interview_questions', {
                p_category: category === 'mixed' ? 'mixed' : category,
                p_count: count
            });

            if (error) throw error;
            if (!data || data.length === 0) return null;

            return data.map(row => ({
                id: row.id,
                text: row.text,
                category: row.category,
                difficulty: row.difficulty,
                expected_points: row.expected_points
            }));
        } catch (err) {
            console.warn('[Supabase] Failed to fetch interview questions:', err.message);
            return null;
        }
    }

    // Fetch a single random interview question
    async function getRandomInterviewQuestion(category) {
        const questions = await getInterviewQuestions(category, 1);
        return questions ? questions[0] : null;
    }

    // Test connection (for debugging)
    async function testConnection(url, key) {
        try {
            if (typeof supabase === 'undefined' || !supabase.createClient) {
                return { success: false, message: 'Supabase SDK not loaded. Refresh the page.' };
            }

            const testClient = supabase.createClient(url, key);
            const { data, error } = await testClient
                .from('questions')
                .select('id')
                .limit(1);

            if (error) {
                return { success: false, message: error.message };
            }

            return { success: true, message: `Connected! Found questions table.` };
        } catch (err) {
            return { success: false, message: err.message };
        }
    }

    // Get question count from Supabase (for display)
    async function getQuestionCounts() {
        if (!isConnected()) return null;

        try {
            const { data, error } = await _client
                .from('questions')
                .select('question_type, category')
                .eq('active', true);

            if (error) throw error;

            const counts = {
                technical: 0,
                soft: 0,
                interview_technical: 0,
                interview_behavioral: 0,
                interview_hr: 0
            };

            data.forEach(row => {
                if (row.question_type === 'assessment' && row.category === 'technical') counts.technical++;
                else if (row.question_type === 'assessment' && row.category === 'soft') counts.soft++;
                else if (row.question_type === 'interview' && row.category === 'technical') counts.interview_technical++;
                else if (row.question_type === 'interview' && row.category === 'behavioral') counts.interview_behavioral++;
                else if (row.question_type === 'interview' && row.category === 'hr') counts.interview_hr++;
            });

            return counts;
        } catch (err) {
            console.warn('[Supabase] Could not get counts:', err.message);
            return null;
        }
    }

    // === Get raw client (for auth operations) ===
    function getClient() {
        return _client;
    }

    // === Users ===
    async function getUserRecord(userId) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] getUserRecord failed:', err.message);
            return null;
        }
    }

    async function updateUserRecord(userId, updates) {
        // updates is an object like { full_name: '...', target_role: '...' }
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('users')
                .update(updates)
                .eq('id', userId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] updateUserRecord failed:', err.message);
            return null;
        }
    }

    // === Student Profile ===
    async function getStudentProfile(userId) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('student_profile')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (err) {
            console.warn('[Supabase] getStudentProfile failed:', err.message);
            return null;
        }
    }

    async function upsertStudentProfile(userId, profileData) {
        // profileData: { university, college, major, gpa, graduation_year }
        if (!isConnected()) return null;
        try {
            // Check if profile exists
            const existing = await getStudentProfile(userId);
            if (existing) {
                const { data, error } = await _client
                    .from('student_profile')
                    .update(profileData)
                    .eq('user_id', userId)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            } else {
                const { data, error } = await _client
                    .from('student_profile')
                    .insert({ user_id: userId, ...profileData })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }
        } catch (err) {
            console.warn('[Supabase] upsertStudentProfile failed:', err.message);
            return null;
        }
    }

    // === Login History ===
    async function recordLogin(userId) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('login_history')
                .insert({
                    user_id: userId,
                    ip_address: 'web-client',
                    status: 'success'
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] recordLogin failed:', err.message);
            return null;
        }
    }

    // === Assessments ===
    // Atomic save: assessment + per-skill breakdown in ONE round-trip via RPC.
    // skillScoresByName: array of { skill_name, skill_score }
    async function saveAssessmentWithSkills(userId, type, totalScore, summary, skillScoresByName) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client.rpc('save_assessment_with_skills', {
                p_user_id: userId,
                p_type: type,
                p_total_score: totalScore,
                p_summary: summary,
                p_skill_scores: skillScoresByName || []
            });
            if (error) throw error;
            console.log('[Supabase] Assessment saved with id:', data, '— skills saved:', (skillScoresByName || []).length);
            return data; // assessment_id
        } catch (err) {
            console.error('[Supabase] saveAssessmentWithSkills failed:', err.message);
            return null;
        }
    }

    async function getAssessmentHistory(userId) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('assessments')
                .select('*')
                .eq('user_id', userId)
                .order('completed_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] getAssessmentHistory failed:', err.message);
            return null;
        }
    }

    // === Interview Attempts ===
    async function saveInterviewAttempt(userId, questionId, transcript, aiFeedback, score) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('interview_attempts')
                .insert({
                    user_id: userId,
                    question_id: questionId,
                    transcript: transcript,
                    ai_feedback: aiFeedback,
                    score: score
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] saveInterviewAttempt failed:', err.message);
            return null;
        }
    }

    async function getInterviewHistory(userId) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('interview_attempts')
                .select('*, questions(text, category)')
                .eq('user_id', userId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] getInterviewHistory failed:', err.message);
            return null;
        }
    }

    // === Training Plans ===
    async function saveTrainingPlan(userId, title, focusArea, items) {
        // items: array of { skill_id (optional), platform, course_name, course_link }
        if (!isConnected()) return null;
        try {
            const { data: plan, error: planError } = await _client
                .from('training_plans')
                .insert({
                    user_id: userId,
                    plan_title: title,
                    focus_area: focusArea
                })
                .select()
                .single();
            if (planError) throw planError;

            if (items && items.length > 0) {
                const itemRows = items.map(item => ({
                    plan_id: plan.plan_id,
                    skill_id: item.skill_id || null,
                    platform: item.platform || null,
                    course_name: item.course_name,
                    course_link: item.course_link || null
                }));
                const { error: itemsError } = await _client
                    .from('training_items')
                    .insert(itemRows);
                if (itemsError) throw itemsError;
            }

            return plan;
        } catch (err) {
            console.warn('[Supabase] saveTrainingPlan failed:', err.message);
            return null;
        }
    }

    async function getTrainingPlans(userId) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('training_plans')
                .select('*, training_items(*)')
                .eq('user_id', userId)
                .order('date_generated_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] getTrainingPlans failed:', err.message);
            return null;
        }
    }

    // === Dashboard Stats ===
    async function getDashboardStats(userId) {
        if (!isConnected()) return null;
        try {
            const [assessRes, interviewRes] = await Promise.all([
                _client.from('assessments').select('*').eq('user_id', userId),
                _client.from('interview_attempts').select('*').eq('user_id', userId)
            ]);

            const assessments = assessRes.data || [];
            const interviews = interviewRes.data || [];

            // Latest assessment scores by type
            const techAssessments = assessments.filter(a => a.type === 'skill').sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
            const softAssessments = assessments.filter(a => a.type === 'personal').sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));

            const latestTechScore = techAssessments.length > 0 ? techAssessments[0].total_score : null;
            const latestSoftScore = softAssessments.length > 0 ? softAssessments[0].total_score : null;

            const avgInterviewScore = interviews.length > 0
                ? Math.round(interviews.reduce((sum, i) => sum + (i.score || 0), 0) / interviews.length)
                : 0;

            return {
                totalAssessments: assessments.length,
                totalInterviews: interviews.length,
                technicalScore: latestTechScore,
                softSkillScore: latestSoftScore,
                avgInterviewScore,
                assessments,
                interviews
            };
        } catch (err) {
            console.warn('[Supabase] getDashboardStats failed:', err.message);
            return null;
        }
    }

    // === Admin Methods ===
    async function getAllUsers() {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('users')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] getAllUsers failed:', err.message);
            return null;
        }
    }

    async function getAllQuestions() {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('questions')
                .select('*')
                .order('question_type', { ascending: true });
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] getAllQuestions failed:', err.message);
            return null;
        }
    }

    async function toggleQuestionActive(questionId, active) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('questions')
                .update({ active })
                .eq('id', questionId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] toggleQuestionActive failed:', err.message);
            return null;
        }
    }

    async function updateUserRole(userId, role) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('users')
                .update({ role })
                .eq('id', userId)
                .select()
                .single();
            if (error) throw error;
            return data;
        } catch (err) {
            console.warn('[Supabase] updateUserRole failed:', err.message);
            return null;
        }
    }

    async function upsertQuestion(questionData, isEdit) {
        if (!isConnected()) return null;
        try {
            if (isEdit) {
                const { data, error } = await _client
                    .from('questions')
                    .update(questionData)
                    .eq('id', questionData.id)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            } else {
                const { data, error } = await _client
                    .from('questions')
                    .insert(questionData)
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }
        } catch (err) {
            console.warn('[Supabase] upsertQuestion failed:', err.message);
            return null;
        }
    }

    async function getAdminStats() {
        if (!isConnected()) return null;
        try {
            const safeCount = async (table) => {
                try {
                    const res = await _client.from(table).select('*', { count: 'exact', head: true });
                    return res.error ? 0 : (res.count || 0);
                } catch { return 0; }
            };

            const [totalUsers, totalQuestions, totalAssessments, totalInterviews, totalTrainingPlans, totalLogins] = await Promise.all([
                safeCount('users'),
                safeCount('questions'),
                safeCount('assessments'),
                safeCount('interview_attempts'),
                safeCount('training_plans'),
                safeCount('login_history')
            ]);

            return { totalUsers, totalQuestions, totalAssessments, totalInterviews, totalTrainingPlans, totalLogins };
        } catch (err) {
            console.warn('[Supabase] getAdminStats failed:', err.message);
            return null;
        }
    }

    // === Assessment Skills (per-skill breakdown for one assessment) ===
    async function getAssessmentSkillBreakdown(assessmentId) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('assessment_skills')
                .select('skill_score, skills(name, category)')
                .eq('assessment_id', assessmentId);
            if (error) throw error;
            return (data || []).map(row => ({
                skill_name: row.skills?.name || 'Unknown',
                skill_category: row.skills?.category || 'unknown',
                skill_score: row.skill_score
            }));
        } catch (err) {
            console.warn('[Supabase] getAssessmentSkillBreakdown failed:', err.message);
            return null;
        }
    }

    // === Platform-wide skill performance (admin analytics) ===
    async function getSkillAnalytics() {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('assessment_skills')
                .select('skill_score, skills(name, category)');
            if (error) throw error;
            // Aggregate: average score per skill
            const agg = {};
            (data || []).forEach(row => {
                const name = row.skills?.name || 'Unknown';
                const category = row.skills?.category || 'unknown';
                if (!agg[name]) agg[name] = { name, category, total: 0, count: 0 };
                agg[name].total += (row.skill_score || 0);
                agg[name].count += 1;
            });
            return Object.values(agg).map(s => ({
                skill_name: s.name,
                skill_category: s.category,
                avg_score: s.count > 0 ? Math.round(s.total / s.count) : 0,
                attempts: s.count
            })).sort((a, b) => a.avg_score - b.avg_score); // worst first
        } catch (err) {
            console.warn('[Supabase] getSkillAnalytics failed:', err.message);
            return null;
        }
    }

    // === Recent assessments across all users (admin) ===
    async function getRecentAssessments(limit = 20) {
        if (!isConnected()) return null;
        try {
            const { data, error } = await _client
                .from('assessments')
                .select('assessment_id, type, total_score, completed_at, user_id, users(full_name, email)')
                .order('completed_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return data || [];
        } catch (err) {
            console.warn('[Supabase] getRecentAssessments failed:', err.message);
            return null;
        }
    }

    // === Training Resources (master list) ===
    let _trainingResourcesCache = null;
    async function getTrainingResources() {
        if (!isConnected()) return null;
        if (_trainingResourcesCache) return _trainingResourcesCache;
        try {
            const { data, error } = await _client
                .from('training_resources')
                .select('*')
                .eq('active', true);
            if (error) throw error;
            _trainingResourcesCache = data || [];
            return _trainingResourcesCache;
        } catch (err) {
            console.warn('[Supabase] getTrainingResources failed:', err.message);
            return null;
        }
    }

    return {
        // Connection
        init,
        isConnected,
        testConnection,
        getClient,
        // Questions
        getAssessmentQuestions,
        getInterviewQuestions,
        getRandomInterviewQuestion,
        getQuestionCounts,
        // User
        getUserRecord,
        updateUserRecord,
        getStudentProfile,
        upsertStudentProfile,
        recordLogin,
        // Assessments + Skills
        saveAssessmentWithSkills,
        getAssessmentHistory,
        getAssessmentSkillBreakdown,
        // Interviews
        saveInterviewAttempt,
        getInterviewHistory,
        // Training
        saveTrainingPlan,
        getTrainingPlans,
        getTrainingResources,
        // Dashboard
        getDashboardStats,
        // Admin
        getAllUsers,
        getAllQuestions,
        toggleQuestionActive,
        updateUserRole,
        upsertQuestion,
        getAdminStats,
        getSkillAnalytics,
        getRecentAssessments
    };
})();
