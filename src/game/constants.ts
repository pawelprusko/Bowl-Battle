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
        player_head: '/assets/sprites/p1_head.jpg',
        player_body: '/assets/sprites/p1_body.jpg',
        player_arm: '/assets/sprites/p1_arm.jpg',
        player_leg: '/assets/sprites/p1_leg.jpg',
        bot_head: '/assets/sprites/bot_head.jpg',
        bot_body: '/assets/sprites/bot_body.jpg',
        bot_arm: '/assets/sprites/bot_arm.jpg',
        bot_leg: '/assets/sprites/bot_leg.jpg',
        ball: '/assets/sprites/ball.jpg'
    },
    backgrounds: {
        arena: '/assets/images/background.jpg'
    },
    ui: {
        splashscreen: '/assets/images/splashscreen.jpg'
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
