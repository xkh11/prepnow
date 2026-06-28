/* ============================================
   PrepNow Question Bank
   All questions loaded from Supabase (questions table).
   No local fallback — Supabase is required.
   ============================================ */

const QuestionBank = {

    async getAssessmentQuestions(type, count = 10) {
        if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isConnected()) {
            console.warn('[Questions] Supabase not connected');
            return [];
        }
        const questions = await SupabaseClient.getAssessmentQuestions(type, count);
        if (questions && questions.length > 0) {
            console.log(`[Questions] Loaded ${questions.length} ${type} questions from Supabase`);
            return questions;
        }
        console.warn(`[Questions] No ${type} questions returned from Supabase`);
        return [];
    },

    async getInterviewQuestions(category, count = 5) {
        if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isConnected()) {
            console.warn('[Questions] Supabase not connected');
            return [];
        }
        const questions = await SupabaseClient.getInterviewQuestions(category, count);
        if (questions && questions.length > 0) {
            console.log(`[Questions] Loaded ${questions.length} ${category} interview questions from Supabase`);
            return questions;
        }
        console.warn(`[Questions] No ${category} interview questions returned from Supabase`);
        return [];
    },

    async getRandomInterviewQuestion(category) {
        if (typeof SupabaseClient === 'undefined' || !SupabaseClient.isConnected()) {
            console.warn('[Questions] Supabase not connected');
            return null;
        }
        const q = await SupabaseClient.getRandomInterviewQuestion(category);
        if (q) {
            console.log(`[Questions] Loaded interview question from Supabase: ${q.id}`);
            return q;
        }
        console.warn(`[Questions] No random ${category} interview question returned`);
        return null;
    }
};
