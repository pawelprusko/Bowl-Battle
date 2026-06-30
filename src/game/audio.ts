import { AUDIO_PATHS } from './constants';

const sounds: Record<string, HTMLAudioElement> = {};
let currentBGM: HTMLAudioElement | null = null;
let currentBGMKey: string | null = null;

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

export function playSFX(id: string) {
    const soundKey = `sfx.${id}`;
    const audio = sounds[soundKey];
    if (audio) {
        // Clone node so we can play overlapping sounds (e.g. multiple hits)
        const clone = audio.cloneNode() as HTMLAudioElement;
        clone.volume = 0.7; // Optional: set SFX volume
        clone.play().catch(e => console.warn('SFX play failed', e));
    }
}

export function setBGM(type: 'board' | 'scrum') {
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
        currentBGM.volume = 0.4;
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
