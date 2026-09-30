/**
 * SafePath AI - Audio & Siren Synthesizer
 * Uses Web Audio API & SpeechSynthesis with graceful fallback
 */

class SafeAudioEngine {
    constructor() {
        this.audioCtx = null;
        this.sirenOsc1 = null;
        this.sirenInterval = null;
        this.isSirenPlaying = false;

        this.ringtoneInterval = null;
        this.isRingtonePlaying = false;

        this.customAudio = null;
        this.isCustomAudioPlaying = false;
    }

    _initContext() {
        try {
            if (!this.audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    this.audioCtx = new AudioContext();
                }
            }
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
        } catch (e) {
            console.warn("Web Audio Init warning:", e);
        }
    }

    // 🚨 1. EMERGENCY SOS SIREN
    startSiren() {
        if (this.isSirenPlaying) return;
        this._initContext();
        if (!this.audioCtx) return;

        try {
            this.isSirenPlaying = true;
            const gainNode = this.audioCtx.createGain();
            gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
            gainNode.connect(this.audioCtx.destination);

            this.sirenOsc1 = this.audioCtx.createOscillator();
            this.sirenOsc1.type = 'sawtooth';
            this.sirenOsc1.frequency.setValueAtTime(650, this.audioCtx.currentTime);
            this.sirenOsc1.connect(gainNode);
            this.sirenOsc1.start();

            let rising = true;
            this.sirenInterval = setInterval(() => {
                if (!this.audioCtx || !this.sirenOsc1) return;
                try {
                    const targetFreq = rising ? 950 : 650;
                    this.sirenOsc1.frequency.exponentialRampToValueAtTime(
                        targetFreq,
                        this.audioCtx.currentTime + 0.35
                    );
                    rising = !rising;
                } catch(e) {}
            }, 400);
        } catch (e) {
            console.warn("Siren audio error:", e);
        }
    }

    stopSiren() {
        this.isSirenPlaying = false;
        if (this.sirenInterval) clearInterval(this.sirenInterval);
        if (this.sirenOsc1) {
            try {
                this.sirenOsc1.stop();
                this.sirenOsc1.disconnect();
            } catch (e) {}
            this.sirenOsc1 = null;
        }
    }

    // 📞 2. INCOMING CALL RINGTONE
    startRingtone() {
        if (this.isRingtonePlaying) return;
        this._initContext();
        if (!this.audioCtx) return;

        try {
            this.isRingtonePlaying = true;

            const playRingBurst = () => {
                if (!this.isRingtonePlaying || !this.audioCtx) return;
                try {
                    const osc = this.audioCtx.createOscillator();
                    const gain = this.audioCtx.createGain();
                    
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(440, this.audioCtx.currentTime);
                    
                    gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
                    gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 1.2);

                    osc.connect(gain);
                    gain.connect(this.audioCtx.destination);

                    osc.start();
                    osc.stop(this.audioCtx.currentTime + 1.2);
                } catch (e) {}
            };

            playRingBurst();
            this.ringtoneInterval = setInterval(() => {
                playRingBurst();
            }, 2200);
        } catch (e) {
            console.warn("Ringtone error:", e);
        }
    }

    stopRingtone() {
        this.isRingtonePlaying = false;
        if (this.ringtoneInterval) clearInterval(this.ringtoneInterval);
    }

    // 🎙️ 2b. CUSTOM AUDIO RECORDING PLAYBACK
    playCustomAudio(dataUrl, onComplete, onTimeUpdate) {
        this.stopCustomAudio();
        this.stopSpeech();
        if (!dataUrl) {
            if (onComplete) onComplete();
            return;
        }

        try {
            this.customAudio = new Audio(dataUrl);
            this.isCustomAudioPlaying = true;

            this.customAudio.onended = () => {
                this.isCustomAudioPlaying = false;
                if (onComplete) onComplete();
            };

            this.customAudio.ontimeupdate = () => {
                if (onTimeUpdate && this.customAudio) {
                    onTimeUpdate(this.customAudio.currentTime, this.customAudio.duration);
                }
            };

            this.customAudio.onerror = (e) => {
                console.warn("Custom audio playback error:", e);
                this.isCustomAudioPlaying = false;
                if (onComplete) onComplete();
            };

            const playPromise = this.customAudio.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => {
                    console.warn("Custom audio play prevented by browser policy:", e);
                    this.isCustomAudioPlaying = false;
                    if (onComplete) onComplete();
                });
            }
        } catch (e) {
            console.warn("Failed to initialize custom audio:", e);
            this.isCustomAudioPlaying = false;
            if (onComplete) onComplete();
        }
    }

    stopCustomAudio() {
        if (this.customAudio) {
            try {
                this.customAudio.pause();
                this.customAudio.currentTime = 0;
            } catch (e) {}
            this.customAudio = null;
        }
        this.isCustomAudioPlaying = false;
    }

    // 🗣️ 3. FAKE CALL VOICE DIALOGUE (Dad's Protective Deterrent)
    speakCallerScript(onComplete, callerName = "Dad") {
        if (!('speechSynthesis' in window)) {
            console.warn("SpeechSynthesis not supported in this browser.");
            if (onComplete) onComplete();
            return;
        }

        try {
            // Cancel any stuck previous speech
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                window.speechSynthesis.cancel();
            }
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }

            const cleanName = callerName.replace(/[\u{1F300}-\u{1F9FF}]/gu, '').trim() || "Dad";
            const script = `Hey! It's ${cleanName}. I am standing right near the well-lit junction in Thillai Nagar. Where are you? Stay on the main road, I can see the streetlights. Keep walking towards me, I'm waiting outside for you!`;
            
            // Critical fix: Store reference on instance and window to prevent V8 garbage collection
            this.activeUtterance = new SpeechSynthesisUtterance(script);
            window._safepathVoiceUtterance = this.activeUtterance;

            this.activeUtterance.rate = 0.95;
            this.activeUtterance.pitch = 0.88; // Lower masculine pitch for Dad
            this.activeUtterance.volume = 1.0;

            const executeSpeak = () => {
                const voices = window.speechSynthesis.getVoices();
                if (voices && voices.length > 0) {
                    // Search for male or deep English voices
                    const maleVoice = voices.find(v => 
                        (v.lang === 'en-US' || v.lang === 'en-IN' || v.lang === 'en-GB' || v.lang.startsWith('en')) &&
                        (v.name.includes('David') || v.name.includes('Mark') || v.name.includes('Guy') || 
                         v.name.includes('George') || v.name.includes('Male') || v.name.includes('Rishi') ||
                         v.name.includes('Google UK English Male') || v.name.includes('Natural'))
                    );
                    const fallbackVoice = voices.find(v => 
                        (v.lang === 'en-US' || v.lang === 'en-IN' || v.lang.startsWith('en'))
                    );
                    if (maleVoice) {
                        this.activeUtterance.voice = maleVoice;
                    } else if (fallbackVoice) {
                        this.activeUtterance.voice = fallbackVoice;
                    }
                }

                this.activeUtterance.onend = () => {
                    console.log("Fake call voice completed successfully.");
                    if (onComplete) onComplete();
                };

                this.activeUtterance.onerror = (e) => {
                    console.warn("SpeechSynthesis notice/error:", e.error);
                    // Do NOT abort if simply canceled/interrupted by user hangup
                    if (e.error === 'interrupted' || e.error === 'canceled') {
                        return;
                    }
                    if (onComplete) onComplete();
                };

                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                }
                window.speechSynthesis.speak(this.activeUtterance);
            };

            // Small 80ms timeout prevents Chromium from discarding the speech after cancel()
            setTimeout(executeSpeak, 80);

        } catch (e) {
            console.warn("Speech error:", e);
            if (onComplete) onComplete();
        }
    }

    // 🔔 GOOGLE MAPS NAVIGATION CHIME (Pleasant two-tone prompt)
    playNavChime(onDone) {
        this._initContext();
        if (!this.audioCtx) {
            if (onDone) onDone();
            return;
        }
        try {
            const ctx = this.audioCtx;
            if (ctx.state === 'suspended') {
                ctx.resume();
            }
            const now = ctx.currentTime;
            
            // Soft Two-Tone Google Maps Bell (587.3Hz D5 -> 880Hz A5)
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.001, now);
            gain1.gain.linearRampToValueAtTime(0.3, now + 0.02);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880.00, now + 0.08);
            gain2.gain.setValueAtTime(0.001, now + 0.08);
            gain2.gain.linearRampToValueAtTime(0.35, now + 0.10);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.30);

            if (onDone) {
                setTimeout(onDone, 240);
            }
        } catch (e) {
            console.warn("Nav chime error:", e);
            if (onDone) onDone();
        }
    }

    // 🧭 GOOGLE MAPS STYLE TURN-BY-TURN VOICE GUIDANCE
    speakNav(text, playChime = true) {
        if (!('speechSynthesis' in window) || !text) return;
        
        try {
            // Un-suspend AudioContext
            this._initContext();

            // Play the two-tone Google Maps chime immediately
            if (playChime) {
                this.playNavChime();
            }

            // Cancel any previous speech if currently speaking
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }

            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = 'en-US';
            utter.rate = 1.0;
            utter.pitch = 1.0;
            utter.volume = 1.0;

            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length > 0) {
                // Search for natural female or clear guidance voice
                const preferred = voices.find(v => 
                    (v.lang === 'en-US' || v.lang === 'en-IN' || v.lang === 'en-GB' || v.lang.startsWith('en')) &&
                    (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Zira') || 
                     v.name.includes('Jenny') || v.name.includes('Samantha') || v.name.includes('Aria') ||
                     v.name.includes('Female'))
                ) || voices.find(v => (v.lang === 'en-US' || v.lang === 'en-IN' || v.lang.startsWith('en')));
                
                if (preferred) utter.voice = preferred;
            }

            // CRITICAL: Retain reference in window array to prevent Chromium Garbage Collection from aborting speech mid-sentence
            if (!window._safepathUtterances) window._safepathUtterances = [];
            window._safepathUtterances.push(utter);
            this.navUtterance = utter;
            window._safepathNavUtterance = utter;

            utter.onend = () => {
                this.navUtterance = null;
                const idx = window._safepathUtterances.indexOf(utter);
                if (idx > -1) window._safepathUtterances.splice(idx, 1);
            };

            utter.onerror = (e) => {
                if (e.error !== 'interrupted' && e.error !== 'canceled') {
                    console.warn("Nav voice notice:", e.error);
                }
                this.navUtterance = null;
                const idx = window._safepathUtterances.indexOf(utter);
                if (idx > -1) window._safepathUtterances.splice(idx, 1);
            };

            // Short 50ms timeout ensures cancel() cleanly completes and lets chime ring first
            setTimeout(() => {
                try {
                    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
                    window.speechSynthesis.speak(utter);
                    console.log("🔊 SafePath Nav Spoken:", text);
                } catch (e) {
                    console.warn("SpeechSynthesis speak exception:", e);
                }
            }, 50);

        } catch (e) {
            console.warn("Audio speakNav warning:", e);
        }
    }

    speak(text) {
        this.speakNav(text, false);
    }

    stopSpeech() {
        try {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
            this.activeUtterance = null;
            this.navUtterance = null;
            window._safepathVoiceUtterance = null;
            window._safepathNavUtterance = null;
            if (window._safepathUtterances) {
                window._safepathUtterances.length = 0;
            }
        } catch (e) {}
    }

    stopAllCallAudio() {
        this.stopRingtone();
        this.stopCustomAudio();
        this.stopSpeech();
    }
}

// Global Singleton Instance & Global Window Export
const safeAudio = new SafeAudioEngine();
window.safeAudio = safeAudio;

// Pre-load voices on browser startup
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
    };
    window.speechSynthesis.getVoices();
}

// User-gesture unlock for Web Audio Context & SpeechSynthesis
const unlockSafeAudioGesture = () => {
    if (window.safeAudio) {
        window.safeAudio._initContext();
        if ('speechSynthesis' in window && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
    }
    document.removeEventListener('click', unlockSafeAudioGesture);
    document.removeEventListener('touchstart', unlockSafeAudioGesture);
};
document.addEventListener('click', unlockSafeAudioGesture);
document.addEventListener('touchstart', unlockSafeAudioGesture);


