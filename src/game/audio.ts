import { AUDIO_PATHS } from './constants';

// Magazyny na załadowane assety audio
const sfxBuffers: Record<string, AudioBuffer> = {};
const bgmElements: Record<string, HTMLAudioElement> = {};

let currentBGM: HTMLAudioElement | null = null;
let currentBGMKey: string | null = null;

let audioCtx: AudioContext | null = null;

// Referencje dla pętli kroków opartej na czystym Web Audio API
let stepSource: AudioBufferSourceNode | null = null;
let stepGainNode: GainNode | null = null;
let isStepActive: boolean = false;
let stepFadeInterval: NodeJS.Timeout | null = null;
let currentStepVolume: number = 0;

function getAudioContext(): AudioContext | null {
    if (!audioCtx && typeof window !== 'undefined') {
        // @ts-ignore
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContextClass();
        }
    }
    return audioCtx;
}

// Funkcja wywoływana przy kliknięciu przycisków w menu - zdejmuje blokadę mobilną
export function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(e => console.warn("AudioContext unlock failed", e));
    }
    if (currentBGM && currentBGM.paused) {
        currentBGM.play().catch(e => console.warn("BGM unlock force-play failed", e));
    }
}

// HYBRYDOWY LOADER: Ładuje muzykę klasycznie, a efekty jako binarne bufory do pamięci RAM
export function loadAudio(): Promise<void> {
    const ctx = getAudioContext();
    const promises: Promise<void>[] = [];

    // 1. Ładowanie podkładów muzycznych (BGM) - bezpieczne strumieniowanie HTML5
    Object.entries(AUDIO_PATHS.bgm).forEach(([key, path]) => {
        promises.push(new Promise((resolve) => {
            const audio = new Audio();
            audio.src = path;
            audio.preload = 'auto';
            audio.loop = true;
            bgmElements[`bgm.${key}`] = audio;
            resolve();
        }));
    });

    // 2. Ładowanie efektów (SFX) - Fetch plików i dekodowanie do pamięci karty dźwiękowej
    Object.entries(AUDIO_PATHS.sfx).forEach(([key, path]) => {
        promises.push(
            fetch(path)
                .then(res => res.arrayBuffer())
                .then(arrayBuffer => {
                    if (ctx) {
                        return ctx.decodeAudioData(arrayBuffer);
                    }
                    throw new Error("AudioContext not initialized");
                })
                .then(audioBuffer => {
                    sfxBuffers[`sfx.${key}`] = audioBuffer;
                })
                .catch(e => {
                    console.warn(`Failed to compile binary buffer for SFX: ${key}`, e);
                    // Fallback pustego promisu, aby zagubiony plik nie zawiesił ładowania gry
                })
        );
    });

    return Promise.all(promises).then(() => {});
}

export function setBGM(type: 'board' | 'scrum' | 'menu' | 'gameover') {
    const soundKey = `bgm.${type}`;
    
    if (currentBGMKey === soundKey && currentBGM) {
        if (currentBGM.paused) {
            currentBGM.play().catch(e => console.warn('BGM play retry failed', e));
        }
        return;
    }

    if (currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
    }

    const nextBGM = bgmElements[soundKey];
    if (nextBGM) {
        currentBGM = nextBGM;
        currentBGMKey = soundKey;
        currentBGM.volume = 0.4; // Zbalansowana, stabilna głośność muzyki w tle
        currentBGM.play().catch(e => console.warn('BGM autoplay blocked by mobile policy', e));
    }
}

export function stopBGM() {
    if (currentBGM) {
        currentBGM.pause();
    }
}

export function playSFX(id: string, volumeScale: number = 1.0) {
    const soundKey = `sfx.${id}`;
    const ctx = getAudioContext();
    const buffer = sfxBuffers[soundKey];

    // Odtwarzanie bezpośrednio z AudioBuffer - wolne od lagów i blokad sprzętowych telefonu
    if (ctx && buffer) {
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const gainNode = ctx.createGain();

        let baseVol = 0.7; 
        let boostGain = 1.0; 

        // Przypisanie dedykowanych głośności i cyfrowych dopalaczy
        if (id === 'special_attack') {
            baseVol = 1.0; 
            boostGain = 2.6; // Wzmocnienie o 260%
        } else if (id === 'bounce') {
            baseVol = 1.0; 
            boostGain = 2.4; // Wzmocnienie o 240%
        } else if (id === 'catch') {
            baseVol = 1.0; 
            boostGain = 2.4; // Wzmocnienie o 240%
        } else if (id === 'step') {
            baseVol = 1.0;
        } else {
            baseVol = 0.8; 
        }

        gainNode.gain.value = baseVol * volumeScale * boostGain;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0);
    }
}

export function setStepSoundActive(active: boolean) {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (isStepActive === active && stepSource) return;
    isStepActive = active;

    if (stepFadeInterval) clearInterval(stepFadeInterval);

    if (active) {
        const buffer = sfxBuffers['sfx.step'];
        if (!buffer) return;

        if (stepSource) {
            try { stepSource.stop(); } catch(e) {}
        }

        // Tworzenie natywnego, zapętlonego strumienia kroków Web Audio API
        stepSource = ctx.createBufferSource();
        stepSource.buffer = buffer;
        stepSource.loop = true;

        if (!stepGainNode) {
            stepGainNode = ctx.createGain();
            stepGainNode.connect(ctx.destination);
        }

        // Ustawienie głośności początkowej z uwzględnieniem wzmocnienia 2.4x
        stepGainNode.gain.value = currentStepVolume * 2.4;

        stepSource.connect(stepGainNode);
        stepSource.start(0);

        stepFadeInterval = setInterval(() => {
            if (currentStepVolume < 1.0) {
                currentStepVolume = Math.min(1.0, currentStepVolume + 0.1);
                if (stepGainNode) stepGainNode.gain.value = currentStepVolume * 2.4;
            } else {
                if (stepFadeInterval) clearInterval(stepFadeInterval);
            }
        }, 50);
    } else {
        stepFadeInterval = setInterval(() => {
            if (currentStepVolume > 0) {
                currentStepVolume = Math.max(0, currentStepVolume - 0.1);
                if (stepGainNode) stepGainNode.gain.value = currentStepVolume * 2.4;
            } else {
                if (stepSource) {
                    try { stepSource.stop(); } catch(e) {}
                    stepSource = null;
                }
                if (stepFadeInterval) clearInterval(stepFadeInterval);
            }
        }, 50);
    }
}