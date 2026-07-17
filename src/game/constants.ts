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
        player_head: '/assets/sprites/p1_head.png',
        player_body: '/assets/sprites/p1_body.png',
        player_arm_front: '/assets/sprites/p1_hand_front.png',
        player_arm_back: '/assets/sprites/p1_hand_back.png',
        player_leg_front: '/assets/sprites/p1_leg_front.png',
        player_leg_back: '/assets/sprites/p1_leg_back.png',
        bot_head: '/assets/sprites/p2_head.png',
        bot_body: '/assets/sprites/p2_body.png',
        bot_arm_front: '/assets/sprites/p2_hand_front.png',
        bot_arm_back: '/assets/sprites/p2_hand_back.png',
        bot_leg_front: '/assets/sprites/p2_leg_front.png',
        bot_leg_back: '/assets/sprites/p2_leg_back.png',
        ball: '/assets/sprites/ball.png',
        drop_time: '/assets/sprites/drop_time.png',
        drop_star: '/assets/sprites/drop_star.png'
    },
    backgrounds: {
        arena: '/assets/images/background.jpg'
    },
    ui: {
        splashscreen: '/assets/images/splashscreen.jpg',
        loader: '/assets/images/loader.png',
        matchover: '/assets/images/matchover.jpg'
    }
};

export const AUDIO_PATHS = {
    bgm: {
        board: '/assets/audio/bgm_board.mp3',
        scrum: '/assets/audio/bgm_scrum.mp3',
        menu: '/assets/audio/bgm_menu.mp3',
        gameover: '/assets/audio/bgm_gameover.mp3',
        cheer: '/assets/audio/sfx_cheer.mp3'
    },
    sfx: {
        grunt: '/assets/audio/sfx_grunt.mp3',
        whistle: '/assets/audio/sfx_whistle.mp3',
        countdown: '/assets/audio/sfx_countdown.mp3',
        kickoff: '/assets/audio/sfx_kickoff.mp3',
        hit: '/assets/audio/sfx_hit.mp3',
        kick: '/assets/audio/sfx_kick.mp3',
        cheer: '/assets/audio/sfx_cheer.mp3',
        boo: '/assets/audio/sfx_boo.mp3',
        special_attack: '/assets/audio/sfx_special_attack.mp3',
        step: '/assets/audio/sfx_step.mp3',
        bounce: '/assets/audio/sfx_bounce.mp3',
        catch: '/assets/audio/sfx_catch.mp3',
        button_click: '/assets/audio/sfx_button_click.mp3'
    }
};

export const PHYSICS = {
    gravity: 2400, // pt per sec^2
    maxRunSpeed: 160,
    runAcceleration: 640,
    friction: 0.9, // damping
    decay: 1200, // active damping when not pressing keys
    wallBounce: 0.5,
};
