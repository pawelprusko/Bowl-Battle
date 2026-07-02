import { AUDIO_PATHS } from './constants';

const sounds: Record<string, HTMLAudioElement> = {};
let currentBGM: HTMLAudioElement | null = null;
let currentBGMKey: string | null = null;
let stepAudio: HTMLAudioElement | null = null;
let isStepActive: boolean = false;
let stepFadeInterval: NodeJS.Timeout | null = null;

export async function loadAudio() {
    const promises: Promise<void>[] = [];

    // Load BGM
    for (const [key, path] of Object.entries(AUDIO_PATHS.bgm)) {
        promises.push(loadSound(`bgm.${key}`, path));
    }
    // Load SFX
    for (const [key, path] of Object.entries(AUDIO_PATHS.sfx)) {
        promises.push(loadSound(`sfx.${key}`, path));
    }

    await Promise.all(promises);
}

function loadSound(id: string, path: string): Promise<void> {
    return new Promise((resolve) => {
        const audio = new Audio();
        audio.src = path;
        // Don't wait for full load, just register it so we don't hang
        sounds[id] = audio;
        
        // Try to preload but don't block
        audio.load();
        
        // We resolve immediately so the game doesn't hang on slow/missing audio
        resolve();
    });
}

let audioCtx: AudioContext | null = null;

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

// NOWOŚĆ: Funkcja-klucz dla PWA i urządzeń mobilnych. 
// Wywołana RAZ wewnątrz obsługi kliknięcia użytkownika, zdejmuje blokadę Safari/Chrome na zawsze.
export function unlockAudio() {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(e => console.warn("AudioContext unlock failed", e));
    }
}

export function playSFX(id: string, volumeScale: number = 1.0) {
    const soundKey = `sfx.${id}`;
    const audio = sounds[soundKey];
    if (audio) {
        const clone = audio.cloneNode() as HTMLAudioElement;
        
        let baseVol = 0.7; 
        let boostGain = 1.0; // Domyślny mnożnik głośności dla standardowych dźwięków

        if (id === 'special_attack') {
            baseVol = 1.0; 
            boostGain = 2.6; // Nasze sprawdzone podbicie cyfrowe
        } else if (id === 'step') {
            baseVol = 1.0; 
        } else if (id === 'bounce') {
            baseVol = 1.0; 
            boostGain = 2.4; // Nasze sprawdzone podbicie cyfrowe
        } else if (id === 'catch') {
            baseVol = 1.0; 
            boostGain = 2.4; // Nasze sprawdzone podbicie cyfrowe
        } else {
            baseVol = 0.8; 
        }
        
        clone.volume = Math.min(1.0, baseVol * volumeScale);
        
        // POPRAWKA DLA SMARTFONÓW: Wszystkie dźwięki bez wyjątku wpinamy pod AudioContext.
        // To gwarantuje, że kickoff odtworzy się bez problemu po zakończeniu 3-sekundowego countdownu!
        const ctx = getAudioContext();
        if (ctx) {
            try {
                const source = ctx.createMediaElementSource(clone);
                const gainNode = ctx.createGain();
                
                gainNode.gain.value = boostGain;
                
                source.connect(gainNode);
                gainNode.connect(ctx.destination);
                
                // KRYTYCZNE CZYSZCZENIE DLA PWA / MOBILE:
                // Gdy dźwięk dobiegnie końca, natychmiast odpinamy kable w mikserze telefonu.
                // To zapobiega wyciszaniu gry z powodu przepełnienia limitu otwartych ścieżek audio!
                clone.onended = () => {
                    source.disconnect();
                    gainNode.disconnect();
                };
            } catch (e) {
                console.warn('Web Audio Node linking bypassed safely', e);
            }
        }
        
        clone.play().catch(e => console.warn('SFX play failed', e));
    }
}

export function setBGM(type: 'board' | 'scrum' | 'menu' | 'gameover') {
    const soundKey = `bgm.${type}`;
    
    // POPRAWKA BOMBODODPORNA: Jeśli dany utwór jest już wybrany jako obecny podkład, 
    // ale z powodu restrykcji przeglądarki (Autoplay Policy) lub minimalizacji okna jest w stanie wstrzymania (paused),
    // wymuszamy ponowną próbę odtworzenia (.play()) przy najbliższej interakcji użytkownika!
    if (currentBGMKey === soundKey && currentBGM) {
        if (currentBGM.paused) {
            currentBGM.play().catch(e => console.warn('BGM autoplay retry failed', e));
        }
        return; 
    }

    if (currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
    }

    const audio = sounds[soundKey];
    if (audio) {
        currentBGM = audio;
        currentBGMKey = soundKey;
        currentBGM.loop = true;
        
        if (type === 'menu' || type === 'gameover') {
            currentBGM.volume = 0.8; // Głośniej dla menu i game over
        } else {
            currentBGM.volume = 0.25; // Zmniejszono z 0.4 na 0.25
        }
        
        currentBGM.play().catch(e => console.warn('BGM play failed', e));
    }
}

export function stopBGM() {
    if (currentBGM) {
        currentBGM.pause();
        currentBGM.currentTime = 0;
        currentBGM = null;
        currentBGMKey = null;
    }
}

export function setStepSoundActive(active: boolean) {
    if (isStepActive === active && stepAudio) return;

    if (!stepAudio) {
        const audio = sounds['sfx.step'];
        if (audio) {
            stepAudio = audio.cloneNode() as HTMLAudioElement;
            stepAudio.loop = true;
            stepAudio.volume = 0;

            // DOKŁADNIE TEN SAM WARUNEK I PODBICIE, KTÓRE POMOGŁO DLA CATCH I BOUNCE:
            const ctx = getAudioContext();
            if (ctx && ctx.state === 'running') {
                try {
                    const source = ctx.createMediaElementSource(stepAudio);
                    const gainNode = ctx.createGain();
                    gainNode.gain.value = 2.4; // Dokładnie takie samo mocne podbicie o 240%
                    
                    source.connect(gainNode);
                    gainNode.connect(ctx.destination);
                } catch (e) {
                    console.warn('Web Audio for steps bypassed safely', e);
                }
            }
        } else {
            return; // Not loaded yet, don't set isStepActive
        }
    }

    isStepActive = active;
    if (stepFadeInterval) clearInterval(stepFadeInterval);

    if (active) {
        stepAudio.play().catch(e => console.warn('Step play failed', e));
        stepFadeInterval = setInterval(() => {
            // Zmieniamy limit z 0.6 na 1.0, żeby odtwarzacz nie przyciszał sztucznie dźwięku
            if (stepAudio && stepAudio.volume < 1.0) {
                stepAudio.volume = Math.min(1.0, stepAudio.volume + 0.1);
            } else {
                if (stepFadeInterval) clearInterval(stepFadeInterval);
            }
        }, 50);
    } else {
        stepFadeInterval = setInterval(() => {
            if (stepAudio && stepAudio.volume > 0) {
                stepAudio.volume = Math.max(0, stepAudio.volume - 0.1);
            } else {
                if (stepAudio) {
                    stepAudio.pause();
                }
                if (stepFadeInterval) clearInterval(stepFadeInterval);
            }
        }, 50);
    }
}
