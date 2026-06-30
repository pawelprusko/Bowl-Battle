export enum GameState {
    SPLASH = 'SPLASH',
    LOADING = 'LOADING',
    PLAYING = 'PLAYING',
    EXTRA_POINT = 'EXTRA_POINT',
    GAME_OVER = 'GAME_OVER',
    REMATCH_LOADING = 'REMATCH_LOADING'
}

export enum PlayerRole {
    ATTACKER = 'ATTACKER', // has the ball
    DEFENDER = 'DEFENDER',
    NEUTRAL = 'NEUTRAL' // free ball
}

export enum GameSubState {
    COUNTDOWN = 'COUNTDOWN',
    KICKOFF_LAUNCH = 'KICKOFF_LAUNCH',
    THE_SNAP = 'THE_SNAP',      // Racing for the ball
    FREE_BALL = 'FREE_BALL',    // Ball is loose (fumble/block)
    BALL_ACQUIRED = 'BALL_ACQUIRED', // Paused to show acquired message
    REGULAR = 'REGULAR',        // Someone has the ball
    SCRUM_MATRIX = 'SCRUM_MATRIX', // Slow-mo clinch
    TACKLE_RESOLVE = 'TACKLE_RESOLVE', // Animation pausing after tackle
    KICKING = 'KICKING',        // Attacker is holding kick
    BALL_IN_AIR = 'BALL_IN_AIR',// Ball kicked, defender can dive
    CELEBRATION = 'CELEBRATION' // Scored
}
