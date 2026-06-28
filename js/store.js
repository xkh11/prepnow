/* ============================================
   PrepNow Data Store (localStorage-based)
   ============================================ */

const Store = {
    _prefix: 'prepnow_',

    get(key) {
        try {
            const data = localStorage.getItem(this._prefix + key);
            return data ? JSON.parse(data) : null;
        } catch { return null; }
    },

    set(key, value) {
        try {
            localStorage.setItem(this._prefix + key, JSON.stringify(value));
        } catch (e) {
            console.warn('Storage full or unavailable:', e);
        }
    },

    remove(key) {
        localStorage.removeItem(this._prefix + key);
    },

    clear() {
        Object.keys(localStorage)
            .filter(k => k.startsWith(this._prefix))
            .forEach(k => localStorage.removeItem(k));
    },

    // User management
    getUser() {
        return this.get('current_user');
    },

    setUser(user) {
        this.set('current_user', user);
    },

    clearUser() {
        this.remove('current_user');
    },

    // Assessment results
    getAssessments() {
        return this.get('assessments') || [];
    },

    addAssessment(result) {
        const assessments = this.getAssessments();
        result.id = Date.now().toString();
        result.completed_at = new Date().toISOString();
        assessments.push(result);
        this.set('assessments', assessments);
        return result;
    },

    // Interview attempts
    getInterviews() {
        return this.get('interviews') || [];
    },

    addInterview(attempt) {
        const interviews = this.getInterviews();
        attempt.id = Date.now().toString();
        attempt.created_at = new Date().toISOString();
        interviews.push(attempt);
        this.set('interviews', interviews);
        return attempt;
    },

    // Get latest assessment for a type
    getLatestAssessment(type) {
        const all = this.getAssessments().filter(a => a.type === type);
        return all.length > 0 ? all[all.length - 1] : null;
    },

    // Get overall stats
    getStats() {
        const assessments = this.getAssessments();
        const interviews = this.getInterviews();
        const latestTech = this.getLatestAssessment('technical');
        const latestSoft = this.getLatestAssessment('soft');

        const avgInterviewScore = interviews.length > 0
            ? Math.round(interviews.reduce((sum, i) => sum + (i.score || 0), 0) / interviews.length)
            : 0;

        return {
            totalAssessments: assessments.length,
            totalInterviews: interviews.length,
            technicalScore: latestTech ? latestTech.score : null,
            softSkillScore: latestSoft ? latestSoft.score : null,
            avgInterviewScore,
            readinessScore: this._calcReadiness(latestTech, latestSoft, avgInterviewScore, interviews.length)
        };
    },

    _calcReadiness(tech, soft, avgInterview, interviewCount) {
        let score = 0;
        let factors = 0;
        if (tech) { score += tech.score; factors++; }
        if (soft) { score += soft.score; factors++; }
        if (interviewCount > 0) { score += avgInterview; factors++; }
        return factors > 0 ? Math.round(score / factors) : 0;
    }
};
