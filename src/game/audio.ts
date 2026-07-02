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

export function playSFX(id: string, volumeScale: number = 1.0) {
    const soundKey = `sfx.${id}`;
    const audio = sounds[soundKey];
    if (audio) {
        // Clone node so we can play overlapping sounds (e.g. multiple hits)
        const clone = audio.cloneNode() as HTMLAudioElement;
        
        // Zwiększamy głośność wszystkich nowych i starych dźwięków do poziomu 1.0 (lub prawie 1.0)
        let baseVol = 0.7; 
        
        if (id === 'special_attack') {
            baseVol = 1.0; 
        } else if (id === 'step') {
            baseVol = 0.6; // Kroki głośniej (wcześniej 0.15)
        } else if (id === 'bounce') {
            baseVol = 1.0; // Odbicie na pełnej głośności
        } else if (id === 'catch') {
            baseVol = 1.0; // Złapanie piłki na pełnej głośności
        } else {
            baseVol = 0.8; // Przywracamy kick i hit do ich oryginalnej mocy
        }
        
        clone.volume = Math.min(1.0, baseVol * volumeScale);
        
        clone.play().catch(e => console.warn('SFX play failed', e));
    }
}

export function setBGM(type: 'board' | 'scrum' | 'menu' | 'gameover') {
    const soundKey = `bgm.${type}`;
    if (currentBGMKey === soundKey && currentBGM) {
        return; // Already playing this bgm
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
        } else {
            return; // Not loaded yet, don't set isStepActive
        }
    }

    isStepActive = active;
    if (stepFadeInterval) clearInterval(stepFadeInterval);

    if (active) {
        stepAudio.play().catch(e => console.warn('Step play failed', e));
        stepFadeInterval = setInterval(() => {
            if (stepAudio && stepAudio.volume < 0.6) {
                stepAudio.volume = Math.min(0.6, stepAudio.volume + 0.1);
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
