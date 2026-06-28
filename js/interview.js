/* ============================================
   PrepNow Voice Interview Module
   Web Speech API + AI-powered Feedback
   Real-time AudioContext Waveform & Mic Level
   ============================================ */

let interviewState = {
    active: false,
    category: 'mixed',
    currentQuestion: null,
    questionNumber: 0,
    totalQuestions: 5,
    transcript: '',
    isRecording: false,
    recognition: null,
    attempts: [],
    useManualInput: false
};

// Silence detection
let _silenceTimer = null;
let _lastSpeechTime = 0;
const SILENCE_ALERT_MS = 8000;

// Audio analysis (real microphone levels)
let _audioContext = null;
let _audioAnalyser = null;
let _audioStream = null;
let _animationFrame = null;

function renderInterviewPage() {
    const main = document.getElementById('mainContent');

    if (interviewState.active) {
        renderInterviewSession();
        return;
    }

    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>Voice Interview Practice</h1>
            <p>Practice realistic interviews with voice input and receive AI-powered feedback</p>
        </div>
        <div class="interview-container">
            <div class="interview-setup card fade-in">
                <div class="setup-icon">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </div>
                <h2>Start Interview Practice</h2>
                <p>Select a category and answer questions using your voice. You'll receive detailed feedback on each response.</p>
                <div style="margin-bottom:24px;">
                    <label style="display:block; font-size:0.78rem; font-weight:600; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:10px;">Interview Category</label>
                    <div class="interview-categories">
                        <button class="category-btn active" onclick="selectCategory('mixed', this)">Mixed</button>
                        <button class="category-btn" onclick="selectCategory('technical', this)">Technical</button>
                        <button class="category-btn" onclick="selectCategory('behavioral', this)">Behavioral</button>
                        <button class="category-btn" onclick="selectCategory('hr', this)">HR</button>
                    </div>
                </div>
                <button class="btn btn-primary btn-lg" onclick="beginInterview()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/></svg>
                    Start Interview
                </button>
                <div style="margin-top:16px;">
                    <label style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:0.8rem; color:var(--text-muted); cursor:pointer;">
                        <input type="checkbox" id="manualToggle" onchange="interviewState.useManualInput = this.checked" ${interviewState.useManualInput ? 'checked' : ''}>
                        Use text input instead of voice (if microphone unavailable)
                    </label>
                </div>
            </div>
        </div>
    `;
}

function selectCategory(cat, btn) {
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    interviewState.category = cat;
}

function beginInterview() {
    interviewState.active = true;
    interviewState.questionNumber = 0;
    interviewState.attempts = [];
    interviewState.transcript = '';
    nextInterviewQuestion();
}

async function nextInterviewQuestion() {
    interviewState.questionNumber++;
    interviewState.transcript = '';

    // Show loading while fetching from Supabase
    const main = document.getElementById('mainContent');
    main.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 20px; gap:16px;">
            <div class="spinner"></div>
            <p style="color:var(--text-muted); font-size:0.9rem;">Loading question ${interviewState.questionNumber}...</p>
        </div>
    `;

    interviewState.currentQuestion = await QuestionBank.getRandomInterviewQuestion(interviewState.category);
    renderInterviewSession();
}

function renderInterviewSession() {
    const main = document.getElementById('mainContent');
    const q = interviewState.currentQuestion;
    const num = interviewState.questionNumber;

    main.innerHTML = `
        <div class="page-header fade-in">
            <div style="display:flex; align-items:center; justify-content:space-between;">
                <div>
                    <h1>Interview Session</h1>
                    <p>Question ${num} of ${interviewState.totalQuestions}</p>
                </div>
                <button class="btn btn-danger btn-sm" onclick="endInterview()">End Interview</button>
            </div>
        </div>
        <div class="interview-container">
            <div class="quiz-progress fade-in" style="margin-bottom:24px;">
                <span class="quiz-progress-text">${num}/${interviewState.totalQuestions}</span>
                <div class="progress-bar" style="flex:1">
                    <div class="progress-fill" style="width:${(num / interviewState.totalQuestions) * 100}%"></div>
                </div>
                <span class="badge badge-info">${q.category}</span>
            </div>
            <div class="interview-question-display fade-in">
                <div class="q-number">Question ${num}</div>
                <div class="q-text">${q.text}</div>
            </div>
            <div class="voice-controls fade-in">
                ${interviewState.useManualInput ? renderManualInput() : renderVoiceInput()}
            </div>
            <div class="transcript-box fade-in">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <div class="label">Your Response</div>
                    <button id="editTranscriptBtn" class="btn btn-sm btn-outline" style="padding:3px 10px; font-size:0.7rem; display:${interviewState.transcript && !interviewState.isRecording ? 'inline-flex' : 'none'};" onclick="enableTranscriptEdit()">Edit</button>
                </div>
                <div class="content ${interviewState.transcript ? '' : 'placeholder'}" id="transcriptDisplay">
                    ${interviewState.transcript || 'Your response will appear here...'}
                </div>
                <textarea id="transcriptEditor" style="display:none; width:100%; min-height:80px; padding:10px; background:rgba(6,8,15,0.5); border:1px solid var(--accent); border-radius:var(--radius-md); color:var(--text-primary); font-family:var(--font-primary); font-size:0.9rem; resize:vertical; margin-top:4px;"></textarea>
                <div id="confidenceDisplay" style="margin-top:8px; font-size:0.72rem; color:var(--text-muted); display:none;"></div>
            </div>
            <!-- Mic level meter -->
            <div id="micLevelContainer" style="display:none; margin-top:12px; text-align:center;">
                <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">Microphone Input Level</div>
                <div style="width:100%; height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden;">
                    <div id="micLevelBar" style="height:100%; width:0%; border-radius:10px; transition: width 0.05s, background 0.3s; background:var(--accent);"></div>
                </div>
                <div id="micLevelText" style="font-size:0.68rem; color:var(--text-muted); margin-top:4px; font-family:var(--font-mono);">0%</div>
            </div>
            <div id="silenceAlert" style="display:none; text-align:center; margin-top:12px; padding:10px 16px; background:var(--warning-subtle); border:1px solid rgba(251,191,36,0.2); border-radius:var(--radius-md); font-size:0.82rem; color:var(--warning); animation: fadeIn 0.3s ease;">
                No speech detected for 8 seconds — are you still there? Speak or click stop.
            </div>
            <div style="display:flex; justify-content:center; gap:12px; margin-top:20px;" class="fade-in">
                <button class="btn btn-primary btn-lg" id="submitAnswerBtn" onclick="submitAnswer()" ${!interviewState.transcript ? 'disabled' : ''}>
                    Submit Answer & Get Feedback
                </button>
            </div>
            <div id="feedbackArea"></div>
        </div>
    `;
}

function renderVoiceInput() {
    return `
        <div class="voice-recorder-container">
            <div class="mic-pulse-ring ${interviewState.isRecording ? 'active' : ''}" id="pulseRing">
                <div class="pulse-ring ring-1"></div>
                <div class="pulse-ring ring-2"></div>
                <div class="pulse-ring ring-3"></div>
                <button class="mic-button ${interviewState.isRecording ? 'recording' : ''}" id="micBtn" onclick="toggleRecording()">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${interviewState.isRecording
                            ? '<rect x="6" y="6" width="12" height="12" rx="2"/>'
                            : '<path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>'}
                    </svg>
                </button>
            </div>
            <!-- Real-time waveform driven by AudioContext -->
            <div class="waveform-container ${interviewState.isRecording ? 'active' : ''}" id="waveform">
                ${Array.from({length: 32}, (_, i) => `<div class="waveform-bar" id="wb${i}"></div>`).join('')}
            </div>
        </div>
        <div class="mic-status" id="micStatus">
            ${interviewState.isRecording ? 'Recording... Speak now (click to stop)' : 'Click the microphone to start speaking'}
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
            <label style="cursor:pointer;">
                <input type="checkbox" onchange="switchToManual(this.checked)"> Switch to text input
            </label>
        </div>
    `;
}

function renderManualInput() {
    return `
        <div class="manual-input-area" style="width:100%;">
            <textarea id="manualAnswer" placeholder="Type your answer here..." rows="5"
                oninput="updateManualTranscript(this.value)">${interviewState.transcript}</textarea>
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
            <label style="cursor:pointer;">
                <input type="checkbox" onchange="switchToVoice(this.checked)"> Switch to voice input
            </label>
        </div>
    `;
}

function switchToManual(checked) {
    if (checked) {
        interviewState.useManualInput = true;
        if (interviewState.isRecording) stopRecording();
        renderInterviewSession();
    }
}

function switchToVoice(checked) {
    if (checked) {
        interviewState.useManualInput = false;
        renderInterviewSession();
    }
}

function updateManualTranscript(text) {
    interviewState.transcript = text;
    document.getElementById('transcriptDisplay').textContent = text || 'Your response will appear here...';
    document.getElementById('transcriptDisplay').classList.toggle('placeholder', !text);
    const btn = document.getElementById('submitAnswerBtn');
    if (btn) btn.disabled = !text.trim();
}

// ============================================
// Editable Transcript
// ============================================
function enableTranscriptEdit() {
    const display = document.getElementById('transcriptDisplay');
    const editor = document.getElementById('transcriptEditor');
    const editBtn = document.getElementById('editTranscriptBtn');
    if (!display || !editor) return;

    editor.value = interviewState.transcript;
    display.style.display = 'none';
    editor.style.display = 'block';
    editor.focus();
    editBtn.textContent = 'Done';
    editBtn.onclick = () => finishTranscriptEdit();
}

function finishTranscriptEdit() {
    const display = document.getElementById('transcriptDisplay');
    const editor = document.getElementById('transcriptEditor');
    const editBtn = document.getElementById('editTranscriptBtn');
    if (!display || !editor) return;

    interviewState.transcript = editor.value.trim();
    display.textContent = interviewState.transcript || 'Your response will appear here...';
    display.classList.toggle('placeholder', !interviewState.transcript);
    display.style.display = 'block';
    editor.style.display = 'none';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => enableTranscriptEdit();

    const btn = document.getElementById('submitAnswerBtn');
    if (btn) btn.disabled = !interviewState.transcript;
}

// ============================================
// AudioContext - Real Mic Level & Waveform
// ============================================
async function startAudioAnalysis() {
    try {
        // Request mic with optimal constraints for speech recognition
        _audioStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: { ideal: 48000 },
                sampleSize: { ideal: 16 }
            }
        });

        _audioContext = new (window.AudioContext || window.webkitAudioContext)();
        _audioAnalyser = _audioContext.createAnalyser();
        _audioAnalyser.fftSize = 256;
        _audioAnalyser.smoothingTimeConstant = 0.6;
        _audioAnalyser.minDecibels = -90;
        _audioAnalyser.maxDecibels = -10;

        const source = _audioContext.createMediaStreamSource(_audioStream);
        source.connect(_audioAnalyser);

        // Show mic level container
        const micContainer = document.getElementById('micLevelContainer');
        if (micContainer) micContainer.style.display = 'block';

        // Start the animation loop
        drawWaveform();
    } catch (err) {
        console.warn('[Audio] Could not start audio analysis:', err);
    }
}

function drawWaveform() {
    if (!interviewState.isRecording || !_audioAnalyser) return;

    const bufferLength = _audioAnalyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    const timeData = new Uint8Array(bufferLength);
    _audioAnalyser.getByteFrequencyData(freqData);
    _audioAnalyser.getByteTimeDomainData(timeData);

    // RMS volume from time-domain data (more accurate than frequency average)
    let rmsSum = 0;
    for (let i = 0; i < bufferLength; i++) {
        const normalized = (timeData[i] - 128) / 128;
        rmsSum += normalized * normalized;
    }
    const rms = Math.sqrt(rmsSum / bufferLength);
    const volumePct = Math.min(100, Math.round(rms * 300));

    // Audio-based speech activity detection (supplements Web Speech API)
    if (volumePct > 8) {
        _lastSpeechTime = Date.now();
        hideSilenceAlert();
    }

    // Update mic level bar
    const levelBar = document.getElementById('micLevelBar');
    const levelText = document.getElementById('micLevelText');
    if (levelBar) {
        levelBar.style.width = volumePct + '%';
        levelBar.style.background = volumePct > 50 ? 'var(--accent)' : volumePct > 15 ? 'var(--warning)' : 'var(--danger)';
    }
    if (levelText) {
        levelText.textContent = volumePct + '%' + (volumePct < 3 ? ' — too quiet, speak louder or move closer to the mic' : '');
    }

    // Waveform bars focused on speech frequencies (85-4000 Hz)
    const barCount = 32;
    const sampleRate = _audioContext.sampleRate || 48000;
    const binHz = sampleRate / _audioAnalyser.fftSize;
    const speechStart = Math.max(0, Math.floor(85 / binHz));
    const speechEnd = Math.min(bufferLength, Math.floor(4000 / binHz));
    const speechRange = Math.max(1, speechEnd - speechStart);
    const step = Math.max(1, Math.floor(speechRange / barCount));

    for (let i = 0; i < barCount; i++) {
        const bar = document.getElementById('wb' + i);
        if (bar) {
            const idx = speechStart + i * step;
            const value = idx < bufferLength ? freqData[idx] : 0;
            const height = Math.max(3, (value / 255) * 40);
            bar.style.height = height + 'px';
            bar.style.background = value > 150 ? 'var(--accent)' : value > 60 ? 'var(--warning)' : 'rgba(248,113,113,0.5)';
        }
    }

    _animationFrame = requestAnimationFrame(drawWaveform);
}

function stopAudioAnalysis() {
    if (_animationFrame) {
        cancelAnimationFrame(_animationFrame);
        _animationFrame = null;
    }
    if (_audioStream) {
        _audioStream.getTracks().forEach(track => track.stop());
        _audioStream = null;
    }
    if (_audioContext && _audioContext.state !== 'closed') {
        _audioContext.close().catch(() => {});
        _audioContext = null;
    }
    _audioAnalyser = null;

    // Reset waveform bars
    for (let i = 0; i < 32; i++) {
        const bar = document.getElementById('wb' + i);
        if (bar) {
            bar.style.height = '3px';
            bar.style.background = 'rgba(248,113,113,0.5)';
        }
    }

    // Hide mic level
    const micContainer = document.getElementById('micLevelContainer');
    if (micContainer) micContainer.style.display = 'none';
}

// ============================================
// Web Speech API Integration - English Only
// ============================================
let _restartCount = 0;
const MAX_RESTARTS = 50;
let _restartTimer = null;
let _finalTranscript = '';

function toggleRecording() {
    if (interviewState.isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        showToast('Speech recognition is not supported in this browser. Please use Chrome or Edge, or switch to text input.', 'error');
        return;
    }

    _restartCount = 0;
    // Seed with existing transcript and ensure trailing space so new speech doesn't merge with last word
    const existing = (interviewState.transcript || '').trim();
    _finalTranscript = existing ? existing + ' ' : '';
    _lastSpeechTime = Date.now();

    interviewState.isRecording = true;
    updateRecordingUI(true);
    startSilenceDetection();
    startAudioAnalysis();

    _createAndStartRecognition();
}

function _createAndStartRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognition();
    interviewState.recognition = recog;

    // English-only config for best accuracy
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = 'en-US';
    recog.maxAlternatives = 5;

    // Add speech grammar hints for interview context (if supported)
    if (window.SpeechGrammarList || window.webkitSpeechGrammarList) {
        try {
            const SpeechGrammarList = window.SpeechGrammarList || window.webkitSpeechGrammarList;
            const grammarList = new SpeechGrammarList();
            const keywords = 'experience team project leadership communication problem solving technical skills development collaboration initiative responsibility deadline management analysis design implementation testing deployment database algorithm';
            const grammar = '#JSGF V1.0; grammar interview; public <interview> = ' + keywords.split(' ').join(' | ') + ' ;';
            grammarList.addFromString(grammar, 1);
            recog.grammars = grammarList;
        } catch(e) { /* grammar not supported, ignore */ }
    }

    recog.onstart = () => {
        console.log('[Speech] Recognition started (English only)');
    };

    recog.onresult = (event) => {
        let interim = '';
        _lastSpeechTime = Date.now();
        hideSilenceAlert();

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const result = event.results[i];
            // Pick best alternative (highest confidence) from up to 5
            let bestAlt = result[0];
            for (let a = 1; a < result.length; a++) {
                if (result[a].confidence > bestAlt.confidence) bestAlt = result[a];
            }
            const transcript = bestAlt.transcript;
            const confidence = bestAlt.confidence;

            if (result.isFinal) {
                // Accept anything with confidence > 0.1 or unknown confidence (0)
                if (confidence >= 0.1 || confidence === 0) {
                    _finalTranscript += transcript + ' ';
                }
                showConfidence(confidence, transcript);
                console.log('[Speech] Final:', transcript, 'Confidence:', (confidence * 100).toFixed(1) + '%');
            } else {
                interim += transcript;
                showConfidence(confidence, transcript, true);
            }
        }
        interviewState.transcript = _finalTranscript.trim();

        const display = document.getElementById('transcriptDisplay');
        if (display) {
            const fullText = (_finalTranscript + interim).trim();
            display.textContent = fullText || 'Listening...';
            display.classList.remove('placeholder');
        }
        const btn = document.getElementById('submitAnswerBtn');
        if (btn) btn.disabled = !_finalTranscript.trim();
    };

    recog.onerror = (event) => {
        console.warn('[Speech] Error:', event.error);

        if (event.error === 'no-speech' || event.error === 'aborted') {
            return;
        }

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            showToast('Microphone access denied. Please allow microphone permission in your browser, or switch to text input.', 'error');
            stopRecording();
            return;
        }

        if (event.error === 'network') {
            showToast('Network error with speech service. Check your internet connection.', 'error');
            stopRecording();
            return;
        }

        if (event.error === 'language-not-supported') {
            showToast('English speech recognition is not supported. Please switch to text input.', 'error');
            stopRecording();
            return;
        }

        console.warn('[Speech] Unhandled error, will attempt restart:', event.error);
    };

    recog.onend = () => {
        console.log('[Speech] Recognition ended. isRecording:', interviewState.isRecording);
        if (!interviewState.isRecording) return;

        _restartCount++;
        if (_restartCount > MAX_RESTARTS) {
            console.warn('[Speech] Max restarts reached, stopping');
            showToast('Recording session ended. Click the microphone to start again.', 'info');
            stopRecording();
            return;
        }

        _restartTimer = setTimeout(() => {
            if (interviewState.isRecording) {
                console.log('[Speech] Restarting... (attempt ' + _restartCount + ')');
                _createAndStartRecognition();
            }
        }, 100);
    };

    try {
        recog.start();
    } catch (e) {
        console.error('[Speech] Failed to start:', e);
        if (_restartCount > 0 && interviewState.isRecording) {
            _restartTimer = setTimeout(() => {
                if (interviewState.isRecording) {
                    _createAndStartRecognition();
                }
            }, 1000);
        } else {
            showToast('Could not start speech recognition. Try refreshing the page.', 'error');
            stopRecording();
        }
    }
}

function stopRecording() {
    console.log('[Speech] Stopping recording');
    interviewState.isRecording = false;

    if (_restartTimer) {
        clearTimeout(_restartTimer);
        _restartTimer = null;
    }

    if (interviewState.recognition) {
        try { interviewState.recognition.stop(); } catch(e) {}
        try { interviewState.recognition.abort(); } catch(e) {}
        interviewState.recognition = null;
    }

    _restartCount = 0;
    stopSilenceDetection();
    stopAudioAnalysis();
    updateRecordingUI(false);
}

// ============================================
// Confidence Display
// ============================================
function showConfidence(confidence, text, isInterim = false) {
    const el = document.getElementById('confidenceDisplay');
    if (!el) return;

    const pct = confidence === 0 ? '--' : (confidence * 100).toFixed(0) + '%';
    const color = confidence >= 0.8 ? 'var(--accent)' : confidence >= 0.5 ? 'var(--warning)' : 'var(--danger)';
    const shortText = text.length > 50 ? text.substring(0, 50) + '...' : text;

    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '8px';
    el.innerHTML = `
        <span style="font-weight:600; color:${color}; font-family:var(--font-mono); font-size:0.75rem;">${pct}</span>
        <span style="color:var(--text-muted); font-size:0.72rem;">${isInterim ? 'hearing: ' : 'recognized: '}"${shortText}"</span>
        ${confidence > 0 ? `<div style="flex:1; max-width:80px; height:4px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden;">
            <div style="height:100%; width:${confidence * 100}%; background:${color}; border-radius:2px; transition: width 0.2s;"></div>
        </div>` : ''}
    `;
}

// ============================================
// Silence Detection
// ============================================
function startSilenceDetection() {
    stopSilenceDetection();
    _lastSpeechTime = Date.now();
    _silenceTimer = setInterval(() => {
        if (!interviewState.isRecording) {
            stopSilenceDetection();
            return;
        }
        const elapsed = Date.now() - _lastSpeechTime;
        if (elapsed >= SILENCE_ALERT_MS) {
            showSilenceAlert();
        }
    }, 1000);
}

function stopSilenceDetection() {
    if (_silenceTimer) {
        clearInterval(_silenceTimer);
        _silenceTimer = null;
    }
    hideSilenceAlert();
}

function showSilenceAlert() {
    const el = document.getElementById('silenceAlert');
    if (el) el.style.display = 'block';
}

function hideSilenceAlert() {
    const el = document.getElementById('silenceAlert');
    if (el) el.style.display = 'none';
}

// ============================================
// Recording UI Updates
// ============================================
function updateRecordingUI(recording) {
    const btn = document.getElementById('micBtn');
    const status = document.getElementById('micStatus');
    const pulseRing = document.getElementById('pulseRing');
    const waveform = document.getElementById('waveform');
    const editBtn = document.getElementById('editTranscriptBtn');

    if (btn) {
        btn.classList.toggle('recording', recording);
        btn.innerHTML = recording
            ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'
            : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
    }
    if (status) {
        status.textContent = recording
            ? 'Recording... Speak now (click to stop)'
            : 'Click the microphone to start speaking';
    }
    if (pulseRing) pulseRing.classList.toggle('active', recording);
    if (waveform) waveform.classList.toggle('active', recording);

    // Show/hide edit button and confidence
    if (!recording) {
        const conf = document.getElementById('confidenceDisplay');
        if (conf) conf.style.display = 'none';
        if (editBtn && interviewState.transcript) editBtn.style.display = 'inline-flex';
    } else {
        if (editBtn) editBtn.style.display = 'none';
    }
}

// ============================================
// Answer Evaluation
// ============================================
async function submitAnswer() {
    // Finish any edit in progress
    const editor = document.getElementById('transcriptEditor');
    if (editor && editor.style.display !== 'none') {
        finishTranscriptEdit();
    }

    if (!interviewState.transcript.trim()) {
        showToast('Please provide an answer first', 'warning');
        return;
    }

    if (interviewState.isRecording) stopRecording();

    const btn = document.getElementById('submitAnswerBtn');
    btn.disabled = true;
    btn.innerHTML = '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Analyzing...';

    const feedbackArea = document.getElementById('feedbackArea');
    feedbackArea.innerHTML = '<div class="loading-overlay"><div class="spinner"></div><span>Generating feedback...</span></div>';

    // GPT-only mode — feedback comes from the Supabase Edge Function proxy
    const feedback = await getAIFeedback(interviewState.currentQuestion, interviewState.transcript);

    const attempt = {
        question: interviewState.currentQuestion.text,
        category: interviewState.currentQuestion.category,
        transcript: interviewState.transcript,
        feedback: feedback,
        score: feedback.score
    };
    interviewState.attempts.push(attempt);

    // Save to Supabase if user is authenticated (not guest)
    const user = Store.getUser();
    if (user && !user.isGuest && typeof SupabaseClient !== 'undefined' && SupabaseClient.isConnected()) {
        const feedbackStr = typeof feedback === 'object' ? JSON.stringify(feedback) : String(feedback);
        await SupabaseClient.saveInterviewAttempt(
            user.id,
            interviewState.currentQuestion.id,
            interviewState.transcript,
            feedbackStr,
            feedback.score || 0
        );
        console.log('[Interview] Attempt saved to database');
    }

    renderFeedback(feedbackArea, feedback);

    btn.innerHTML = interviewState.questionNumber < interviewState.totalQuestions
        ? 'Next Question'
        : 'Finish Interview';
    btn.disabled = false;
    btn.onclick = () => {
        if (interviewState.questionNumber < interviewState.totalQuestions) {
            nextInterviewQuestion();
        } else {
            finishInterview();
        }
    };
}

async function getAIFeedback(question, transcript) {
    try {
        // The OpenAI key is NOT in the browser. We call the Supabase Edge
        // Function "openai-proxy", which holds the key as a server secret and
        // forwards the request. invoke() attaches the logged-in user's token
        // automatically; the proxy rejects anonymous (not signed-in) callers.
        const client = (typeof SupabaseClient !== 'undefined') ? SupabaseClient.getClient() : null;
        if (!client || !client.functions) {
            showToast('Supabase not connected — cannot run AI interview', 'error');
            return { score: 0, overall: 'Supabase not connected', strengths: [], improvements: [], missingPoints: [], exampleAnswer: '', tips: [] };
        }

        const { data, error } = await client.functions.invoke('openai-proxy', {
            body: {
                question: { text: question.text, expected_points: question.expected_points },
                transcript: transcript
            }
        });

        if (error) {
            console.error('[Proxy] invoke error:', error);
            showToast('Sign in to use the AI interview (or the AI service is busy)', 'warning');
            return { score: 0, overall: 'AI feedback unavailable: ' + (error.message || 'error'), strengths: [], improvements: [], missingPoints: [], exampleAnswer: '', tips: [] };
        }

        // Extract text from Responses API: output_text (convenience) or output array
        let content = data.output_text;
        if (!content && data.output) {
            for (const item of data.output) {
                if (item.type === 'message' && item.content) {
                    for (const block of item.content) {
                        if (block.type === 'output_text' && block.text) {
                            content = block.text;
                            break;
                        }
                    }
                }
                if (content) break;
            }
        }

        if (!content) {
            console.error('[OpenAI] Could not extract text from response:', data);
            showToast('GPT returned empty response', 'error');
            return { score: 0, overall: 'No response from GPT', strengths: [], improvements: [], missingPoints: [], exampleAnswer: '', tips: [] };
        }

        try {
            const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            return JSON.parse(cleaned);
        } catch {
            console.error('[OpenAI] Failed to parse JSON response:', content);
            showToast('GPT returned invalid format — raw response logged to console', 'error');
            return { score: 0, overall: content, strengths: [], improvements: [], missingPoints: [], exampleAnswer: '', tips: [] };
        }
    } catch (error) {
        console.error('AI feedback error:', error);
        showToast('GPT API call failed: ' + error.message, 'error');
        return { score: 0, overall: 'GPT API error: ' + error.message, strengths: [], improvements: [], missingPoints: [], exampleAnswer: '', tips: [] };
    }
}

function getRuleBasedFeedback(question, transcript) {
    const words = transcript.split(/\s+/).length;
    const expectedPoints = (question.expected_points || '').toLowerCase().split(/[,.;]+/).map(s => s.trim()).filter(Boolean);
    const lowerTranscript = transcript.toLowerCase();

    let lengthScore = 0;
    if (words < 20) lengthScore = 20;
    else if (words < 40) lengthScore = 40;
    else if (words < 80) lengthScore = 60;
    else if (words < 200) lengthScore = 80;
    else lengthScore = 70;

    let keywordHits = 0;
    const allKeywords = expectedPoints.join(' ').split(/\s+/).filter(w => w.length > 4);
    const uniqueKeywords = [...new Set(allKeywords)];
    uniqueKeywords.forEach(kw => {
        if (lowerTranscript.includes(kw)) keywordHits++;
    });
    const keywordScore = uniqueKeywords.length > 0
        ? Math.min(100, (keywordHits / uniqueKeywords.length) * 100)
        : 50;

    let structureScore = 50;
    if (lowerTranscript.includes('for example') || lowerTranscript.includes('for instance')) structureScore += 10;
    if (lowerTranscript.includes('first') || lowerTranscript.includes('second')) structureScore += 10;
    if (lowerTranscript.includes('because') || lowerTranscript.includes('therefore')) structureScore += 10;
    if (lowerTranscript.includes('in conclusion') || lowerTranscript.includes('to summarize')) structureScore += 10;
    structureScore = Math.min(100, structureScore);

    const score = Math.round((lengthScore * 0.25 + keywordScore * 0.45 + structureScore * 0.3));

    const strengths = [];
    const improvements = [];
    const tips = [];

    if (words >= 40) strengths.push('Good response length with adequate detail');
    else improvements.push('Try to provide more detail and examples in your answer');

    if (keywordScore >= 50) strengths.push('Your answer covers some key points relevant to the question');
    else improvements.push('Consider addressing more of the expected topics: ' + question.expected_points);

    if (structureScore >= 60) strengths.push('Your answer has good structure and logical flow');
    else improvements.push('Structure your answer with a clear beginning, middle, and end');

    if (words < 20) tips.push('Aim for at least 30-60 seconds of speaking time');
    if (keywordScore < 30) tips.push('Review the key concepts related to this topic');
    tips.push('Practice using the STAR method for behavioral questions');
    tips.push('Include specific examples to strengthen your answers');

    return {
        score,
        overall: score >= 70 ? 'Good answer with solid content coverage.'
            : score >= 50 ? 'Decent attempt but could use more depth and specific examples.'
            : 'Your answer needs more development. Focus on the key points and provide examples.',
        strengths: strengths.length > 0 ? strengths : ['You attempted to answer the question'],
        improvements,
        missingPoints: keywordScore < 60 ? ['Consider addressing: ' + question.expected_points] : [],
        exampleAnswer: 'A strong answer would cover: ' + question.expected_points,
        tips
    };
}

function renderFeedback(container, feedback) {
    const scoreClass = feedback.score >= 70 ? 'high' : feedback.score >= 50 ? 'medium' : 'low';

    container.innerHTML = `
        <div class="feedback-card" style="margin-top:24px;">
            <div class="feedback-header">
                <div class="feedback-score ${scoreClass}">${feedback.score}</div>
                <div>
                    <h3 style="font-size:1rem;">AI Feedback</h3>
                    <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:2px;">${feedback.overall}</p>
                </div>
            </div>

            ${feedback.strengths && feedback.strengths.length > 0 ? `
                <div class="feedback-section">
                    <h4>Strengths</h4>
                    ${feedback.strengths.map(s => `<p style="margin-bottom:4px;">+ ${s}</p>`).join('')}
                </div>
            ` : ''}

            ${feedback.improvements && feedback.improvements.length > 0 ? `
                <div class="feedback-section">
                    <h4>Areas for Improvement</h4>
                    ${feedback.improvements.map(s => `<p style="margin-bottom:4px;">- ${s}</p>`).join('')}
                </div>
            ` : ''}

            ${feedback.missingPoints && feedback.missingPoints.length > 0 ? `
                <div class="feedback-section">
                    <h4>Missing Points</h4>
                    ${feedback.missingPoints.map(s => `<p style="margin-bottom:4px;">- ${s}</p>`).join('')}
                </div>
            ` : ''}

            ${feedback.exampleAnswer ? `
                <div class="feedback-section">
                    <h4>Example Answer</h4>
                    <p>${feedback.exampleAnswer}</p>
                </div>
            ` : ''}

            ${feedback.tips && feedback.tips.length > 0 ? `
                <div class="feedback-section">
                    <h4>Tips</h4>
                    ${feedback.tips.map(s => `<p style="margin-bottom:4px;">- ${s}</p>`).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

function finishInterview() {
    const avgScore = interviewState.attempts.length > 0
        ? Math.round(interviewState.attempts.reduce((s, a) => s + a.score, 0) / interviewState.attempts.length)
        : 0;

    const record = Store.addInterview({
        category: interviewState.category,
        questions: interviewState.attempts.length,
        score: avgScore,
        attempts: interviewState.attempts
    });

    interviewState.active = false;
    interviewState.questionNumber = 0;

    const main = document.getElementById('mainContent');
    const circumference = 2 * Math.PI * 50;
    const offset = circumference - (avgScore / 100) * circumference;
    const scoreColor = avgScore >= 70 ? 'var(--accent)' : avgScore >= 50 ? 'var(--warning)' : 'var(--danger)';

    main.innerHTML = `
        <div class="page-header fade-in">
            <h1>Interview Complete!</h1>
            <p>Here's your session summary</p>
        </div>
        <div class="results-container">
            <div class="results-hero fade-in">
                <div class="score-ring">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle class="ring-bg" cx="60" cy="60" r="50"/>
                        <circle class="ring-fill" cx="60" cy="60" r="50"
                            stroke="${scoreColor}"
                            stroke-dasharray="${circumference}"
                            stroke-dashoffset="${offset}"/>
                    </svg>
                    <div class="ring-text">
                        <span class="ring-value" style="color:${scoreColor}">${avgScore}</span>
                        <span class="ring-label">Average</span>
                    </div>
                </div>
                <h2>${avgScore >= 70 ? 'Excellent Performance!' : avgScore >= 50 ? 'Good Progress!' : 'Keep Practicing!'}</h2>
                <p>${interviewState.attempts.length} questions answered in this session</p>
            </div>

            <h3 style="margin:24px 0 16px">Question Breakdown</h3>
            ${interviewState.attempts.map((a, i) => `
                <div class="history-item fade-in stagger-${i + 1}">
                    <div class="history-icon" style="background:${a.score >= 70 ? 'var(--accent-subtle)' : a.score >= 50 ? 'var(--warning-subtle)' : 'var(--danger-subtle)'}">
                        ${a.score >= 70 ? 'A' : a.score >= 50 ? 'B' : 'C'}
                    </div>
                    <div class="history-details">
                        <div class="history-title">${a.question.substring(0, 80)}${a.question.length > 80 ? '...' : ''}</div>
                        <div class="history-meta">${a.category} | ${a.transcript.split(/\s+/).length} words</div>
                    </div>
                    <div class="history-score" style="color:${a.score >= 70 ? 'var(--accent)' : a.score >= 50 ? 'var(--warning)' : 'var(--danger)'}">${a.score}%</div>
                </div>
            `).join('')}

            <div style="display:flex; gap:12px; margin-top:24px;">
                <button class="btn btn-primary" onclick="renderInterviewPage()">Practice Again</button>
                <button class="btn btn-secondary" onclick="navigate('history')">View History</button>
                <button class="btn btn-secondary" onclick="navigate('dashboard')">Dashboard</button>
            </div>
        </div>
    `;
}

function endInterview() {
    if (interviewState.attempts.length > 0) {
        finishInterview();
    } else {
        interviewState.active = false;
        if (interviewState.isRecording) stopRecording();
        renderInterviewPage();
    }
}
