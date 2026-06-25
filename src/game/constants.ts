export let GAME_WIDTH = 800;
export let GAME_HEIGHT = 450;
export let GROUND_Y = 330; // 120px buffer at bottom

export function updateGameDimensions(width: number, height: number) {
    GAME_WIDTH = width;
    GAME_HEIGHT = height;
    GROUND_Y = height - 120;
}

export const ASSET_PATHS = {
    sprites: {
        player: '/assets/sprites/player.png',
        bot: '/assets/sprites/bot.png',
        ball: '/assets/sprites/ball.png'
    },
    backgrounds: {
        arena: '/assets/backgrounds/arena.png'
    }
};

export const PHYSICS = {
    gravity: 600, // pt per sec^2
    maxRunSpeed: 160,
    runAcceleration: 640,
    friction: 0.9, // damping
    decay: 1200, // active damping when not pressing keys
    wallBounce: 0.5,
};
