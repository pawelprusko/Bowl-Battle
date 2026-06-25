import { ASSET_PATHS } from './constants';

const images: Record<string, HTMLImageElement> = {};
const fallbacks: Record<string, boolean> = {};

export async function loadAssets() {
    const promises: Promise<void>[] = [];
    
    for (const [category, items] of Object.entries(ASSET_PATHS)) {
        for (const [key, path] of Object.entries(items)) {
            const id = `${category}.${key}`;
            promises.push(
                new Promise((resolve) => {
                    const img = new Image();
                    img.src = path;
                    img.onload = () => {
                        images[id] = img;
                        fallbacks[id] = false;
                        resolve();
                    };
                    img.onerror = () => {
                        fallbacks[id] = true;
                        resolve();
                    };
                })
            );
        }
    }
    await Promise.all(promises);
}

export function getImage(id: string): HTMLImageElement | null {
    if (fallbacks[id]) return null;
    return images[id] || null;
}

export function isFallback(id: string): boolean {
    return fallbacks[id] || false;
}
