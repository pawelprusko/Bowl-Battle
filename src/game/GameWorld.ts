import { GAME_WIDTH, GAME_HEIGHT, GROUND_Y, PHYSICS } from './constants';
import { PlayerRole, GameSubState } from './Types';

export class Vector2 {
    constructor(public x: number, public y: number) {}
    set(x: number, y: number) { this.x = x; this.y = y; return this; }
    add(v: Vector2) { this.x += v.x; this.y += v.y; return this; }
    sub(v: Vector2) { this.x -= v.x; this.y -= v.y; return this; }
    scale(s: number) { this.x *= s; this.y *= s; return this; }
    clone() { return new Vector2(this.x, this.y); }
    dist(v: Vector2) { const dx = this.x - v.x; const dy = this.y - v.y; return Math.sqrt(dx*dx + dy*dy); }
}

export class PhysicalBody {
    pos = new Vector2(0, 0);
    vel = new Vector2(0, 0);
    size = new Vector2(40, 80);
    onGround = true;
    
    updatePhysics(dt: number) {
        if (!this.onGround) {
            this.vel.y += PHYSICS.gravity * dt;
        }
        this.pos.add(this.vel.clone().scale(dt));
        
        // Floor constraints
        if (this.pos.y > GROUND_Y - this.size.y) {
            this.pos.y = GROUND_Y - this.size.y;
            this.vel.y = 0;
            if (this.vel.y >= 0) { // Fix bouncing logic if needed
                this.onGround = true;
            }
        }
    }
}

export class Player extends PhysicalBody {
    role: PlayerRole = PlayerRole.NEUTRAL;
    isBot: boolean = false;
    dirX: number = 0; // -1, 0, 1
    facingX: number = 1; // Tracks last movement direction
    isTackling: boolean = false;
    isDiving: boolean = false;
    tackleTimer: number = 0;
    momentum: number = 0;
    
    // Scrum state
    scrumCharging: boolean = false;
    scrumReleased: boolean = false;
    scrumPower: number = 0; // 0 to 100
    scrumChargeTimer: number = 0;
    
    // Sprint mechanic
    lastEffectiveDirX: number = 0;
    continuousRunDistance: number = 0;
    isBoosting: boolean = false;
    
    knockbackTimer: number = 0;
    
    stats = { power: 100, speed: 100, defense: 100 };
    debuffTimer: number = 0; // Keeping if needed for future skills
    stunTimer: number = 0;
    isWaitingForScrumRecovery: boolean = false;
    isRetreating: boolean = false;
    isAtRetreatPos: boolean = false;
    
    constructor(isBot: boolean) {
        super();
        this.isBot = isBot;
        this.facingX = isBot ? -1 : 1;
        this.size.set(18, 36); // Increased character size 
    }
    
    update(dt: number) {
        if (this.knockbackTimer > 0) {
            this.knockbackTimer -= dt;
            if (this.knockbackTimer < 0) this.knockbackTimer = 0;
        }
        
        if (this.stunTimer > 0 || this.isWaitingForScrumRecovery) {
            if (this.stunTimer > 0) this.stunTimer -= dt;
            if (this.onGround) {
                if (this.vel.x > 0) {
                    this.vel.x -= PHYSICS.decay * dt;
                    if (this.vel.x < 0) this.vel.x = 0;
                } else if (this.vel.x < 0) {
                    this.vel.x += PHYSICS.decay * dt;
                    if (this.vel.x > 0) this.vel.x = 0;
                }
            }
            this.updatePhysics(dt); // Keep falling/sliding when stunned
            // Wall boundaries
            if (this.pos.x < 0) { this.pos.x = 0; this.vel.x = 0; }
            if (this.pos.x > GAME_WIDTH - this.size.x) { this.pos.x = GAME_WIDTH - this.size.x; this.vel.x = 0; }
            return; // Cannot move
        }
        
        let effectiveDirX = this.dirX;
        
        if (this.isRetreating) {
            const startX = this.isBot ? GAME_WIDTH - 50 - this.size.x : 50;
            const centerX = GAME_WIDTH / 2;
            const homeX = startX + (centerX - startX) * 0.5;
            
            const isSafelyRetreated = this.isBot ? (this.pos.x >= homeX) : (this.pos.x <= homeX);
            
            if (isSafelyRetreated || Math.abs(this.pos.x - homeX) < 10) {
                this.isAtRetreatPos = true;
                effectiveDirX = 0;
            } else {
                this.isAtRetreatPos = false;
                effectiveDirX = this.pos.x < homeX ? 1 : -1;
            }
        } else {
            this.isAtRetreatPos = false;
        }
        
        if (this.tackleTimer > 0) {
            this.tackleTimer -= dt;
            if (this.tackleTimer <= 0) {
                this.isTackling = false;
            }
        }
        
        // Update facing ONLY if moving and not tackling
        if (effectiveDirX !== 0 && !this.isTackling) {
            this.facingX = effectiveDirX;
        }
        
        if (this.debuffTimer > 0) {
            this.debuffTimer -= dt;
        }
        
        // Sprint mechanic logic
        const isMovingForward = this.isBot ? effectiveDirX === -1 : effectiveDirX === 1;
        if (effectiveDirX !== 0 && effectiveDirX === this.lastEffectiveDirX && !this.isTackling && this.onGround && isMovingForward) {
            this.continuousRunDistance += Math.abs(this.vel.x * dt);
        } else {
            this.continuousRunDistance = 0;
        }
        this.lastEffectiveDirX = effectiveDirX;
        
        this.isBoosting = this.continuousRunDistance > GAME_WIDTH * 0.2;
        
        const speedMultiplier = (this.stats.speed / 100);
        const acc = PHYSICS.runAcceleration * speedMultiplier * 1.5; // Slightly faster acceleration
        let maxS = (this.debuffTimer > 0 ? PHYSICS.maxRunSpeed * 0.5 : PHYSICS.maxRunSpeed) * speedMultiplier;
        
        if (this.isBoosting) {
            maxS *= 1.3;
        }
        
        if (this.isTackling) {
            maxS = PHYSICS.maxRunSpeed * 3; // Dash speed limit
        }
        
        if (effectiveDirX !== 0 && this.onGround && !this.isTackling) {
            this.vel.x += effectiveDirX * acc * dt;
        } else if (this.onGround) {
            if (this.vel.x > 0) {
                this.vel.x -= PHYSICS.decay * dt;
                if (this.vel.x < 0) this.vel.x = 0;
            } else if (this.vel.x < 0) {
                this.vel.x += PHYSICS.decay * dt;
                if (this.vel.x > 0) this.vel.x = 0;
            }
        }
        
        if (this.vel.x > maxS) this.vel.x = maxS;
        if (this.vel.x < -maxS) this.vel.x = -maxS;
        
        this.updatePhysics(dt);
        
        // Wall boundaries
        if (this.pos.x < 0) { this.pos.x = 0; this.vel.x = 0; }
        if (this.pos.x > GAME_WIDTH - this.size.x) { this.pos.x = GAME_WIDTH - this.size.x; this.vel.x = 0; }
    }
}

export class Ball extends PhysicalBody {
    allowCeilingBounce: boolean = false;
    bounciness: number = 0.75;
    
    constructor() {
        super();
        this.size.set(20, 14); // make ball visible
    }
    
    updatePhysics(dt: number) {
        if (!this.onGround) {
            this.vel.y += PHYSICS.gravity * dt;
        }

        this.pos.add(this.vel.clone().scale(dt));
        
        if (this.pos.y > GROUND_Y - this.size.y) {
            this.pos.y = GROUND_Y - this.size.y;
            if (this.vel.y >= 0) {
                if (this.vel.y > 20) {
                    this.vel.y *= -this.bounciness; // Bounce!
                    this.vel.x *= (this.bounciness > 0.8 ? 0.95 : 0.8); // Friction when bouncing
                } else {
                    this.vel.y = 0;
                    this.onGround = true;
                    this.vel.x *= Math.pow(0.5, dt * 5); // Rolling friction
                }
            }
        } else {
            this.onGround = false;
        }
        
        if (this.pos.x < 0) {
            this.pos.x = 0;
            this.vel.x *= -0.8;
        } else if (this.pos.x > GAME_WIDTH - this.size.x) {
            this.pos.x = GAME_WIDTH - this.size.x;
            this.vel.x *= -0.8;
        }
        
        if (this.allowCeilingBounce && this.pos.y < 0) {
            this.pos.y = 0;
            this.vel.y *= -0.8;
        }
    }
}

export class GameWorld {
    player = new Player(false);
    bot = new Player(true);
    ball = new Ball();
    
    subState = GameSubState.COUNTDOWN;
    timeLeft = 45;
    playerScore = 0;
    botScore = 0;
    
    // Camera
    cameraZoom = 1.0;
    cameraX = GAME_WIDTH / 2;
    cameraY = GAME_HEIGHT / 2;
    
    // Scrum State
    scrumTimer = 0;
    scrumDuration = 1.5; // seconds
    scrumBotPressDelay = 0;
    scrumBotReleaseDelay = 0;
    
    kickPower = 0;
    kickDir = 1;
    kickHoldTimer = 0;
    isChargingKick = false;
    
    countdownTimer = 3;
    
    celebrationMessage = '';
    acquiredMessage: string | null = null;
    botAvoidTimer: number = 0;
    
    particles: Array<{pos: Vector2, vel: Vector2, life: number, type: string}> = [];
    screenShake = 0;
    
    ballOscillateCenter = 0;
    ballOscillatePhase = 0;

    isExtraPointAttempt = false;
    bigTackleTimer = 0;
    fumbleProtectTimer = 0;
    freeBallTimer = 0;

    celebrationTimeoutId: any = null;

    constructor() {
        this.resetToSnap();
    }
    
    resetToSnap() {
        this.acquiredMessage = null;
        this.botAvoidTimer = 0;
        if (this.celebrationTimeoutId) {
            clearTimeout(this.celebrationTimeoutId);
            this.celebrationTimeoutId = null;
        }
        this.player.pos.set(50, GROUND_Y - this.player.size.y);
        this.player.vel.set(0,0);
        this.player.role = PlayerRole.NEUTRAL;
        this.player.stunTimer = 0;
        this.player.isWaitingForScrumRecovery = false;
        this.player.isRetreating = false;
        this.player.isAtRetreatPos = false;
        
        this.bot.pos.set(GAME_WIDTH - 50 - this.bot.size.x, GROUND_Y - this.bot.size.y);
        this.bot.vel.set(0,0);
        this.bot.role = PlayerRole.NEUTRAL;
        this.bot.stunTimer = 0;
        this.bot.isWaitingForScrumRecovery = false;
        this.bot.isRetreating = false;
        this.bot.isAtRetreatPos = false;
        
        this.ball.pos.set(GAME_WIDTH/2 - this.ball.size.x/2, GROUND_Y - this.ball.size.y - 100);
        this.ball.vel.set(0,0);
        this.ball.bounciness = 0.75;
        
        this.subState = GameSubState.COUNTDOWN;
        this.countdownTimer = 3;
        this.isChargingKick = false;
        this.kickPower = 0;
        this.kickDir = 1;
        this.kickHoldTimer = 0;
        this.isExtraPointAttempt = false;
    }
    
    spawnParticles(x: number, y: number, type: string, count: number = 10) {
        for(let i=0; i<count; i++) {
            this.particles.push({
                pos: new Vector2(x, y),
                vel: new Vector2((Math.random()-0.5)*400, -Math.random()*400),
                life: 0.5 + Math.random()*0.5,
                type
            });
        }
    }
    
    update(dt: number) {
        if (this.timeLeft > 0 && this.subState !== GameSubState.CELEBRATION) {
            this.timeLeft -= dt;
            if (this.timeLeft < 0) this.timeLeft = 0;
        }
        
        if (this.screenShake > 0) {
            this.screenShake -= dt * 5;
            if (this.screenShake < 0) this.screenShake = 0;
        }
        
        if (this.bigTackleTimer > 0) {
            this.bigTackleTimer -= dt;
            if (this.bigTackleTimer < 0) this.bigTackleTimer = 0;
        }

        // Particle update
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            p.pos.add(p.vel.clone().scale(dt));
            p.vel.y += PHYSICS.gravity * dt;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        
        if (this.fumbleProtectTimer > 0) {
            this.fumbleProtectTimer -= dt;
        }

        if (this.subState === GameSubState.COUNTDOWN) {
            this.countdownTimer -= dt;
            this.ball.updatePhysics(dt);
            if (this.ball.onGround) {
                this.ball.vel.y = -200;
                this.ball.onGround = false;
            }
            if (this.countdownTimer <= 0) {
                this.subState = GameSubState.KICKOFF_LAUNCH;
                this.ball.allowCeilingBounce = false;
                this.ball.vel.y = -900; // Launch high
                this.ball.onGround = false;
                this.ballOscillateCenter = GAME_WIDTH / 2 - this.ball.size.x / 2;
                this.ballOscillatePhase = Math.random() * Math.PI * 2;
            }
            // Ensure characters are locked
            this.player.dirX = 0;
            this.bot.dirX = 0;
            this.player.vel.x = 0;
            this.bot.vel.x = 0;
        } else if (this.subState === GameSubState.CELEBRATION || this.subState === GameSubState.BALL_ACQUIRED) {
            // Player and bot shouldn't move
            this.player.dirX = 0;
            this.bot.dirX = 0;
            this.player.vel.x = 0;
            this.bot.vel.x = 0;
            this.updateBot(dt); // bot needs to evaluate CELEBRATION internally to stop
        } else {
            // Force freeze horizontal movement during extra point setup
            if (this.isExtraPointAttempt && this.subState === GameSubState.KICKING) {
                this.player.dirX = 0;
                this.player.vel.x = 0;
                if (this.bot.role === PlayerRole.ATTACKER) {
                    this.bot.dirX = 0;
                    this.bot.vel.x = 0;
                }
            }
            // Handle Bot AI only if not in countdown/frozen
            this.updateBot(dt);
        }
        
        if (this.subState === GameSubState.SCRUM_MATRIX) {
            this.player.dirX = 0;
            this.bot.dirX = 0;
        }

        this.player.update(dt);
        this.bot.update(dt);
        
        if (this.player.isRetreating && this.bot.isRetreating) {
            if (this.player.isAtRetreatPos && this.bot.isAtRetreatPos) {
                this.player.isRetreating = false;
                this.bot.isRetreating = false;
                this.botAvoidTimer = 0.2; // slight delay before engaging
            }
        } else {
            // Failsafe if one somehow got stuck or is retreating alone
            if (this.player.isRetreating && this.player.isAtRetreatPos) this.player.isRetreating = false;
            if (this.bot.isRetreating && this.bot.isAtRetreatPos) this.bot.isRetreating = false;
        }
        
        // Determine facing directions
        if (this.subState === GameSubState.REGULAR || this.subState === GameSubState.KICKING || this.subState === GameSubState.COUNTDOWN || this.subState === GameSubState.CELEBRATION || this.subState === GameSubState.BALL_ACQUIRED || this.subState === GameSubState.SCRUM_MATRIX || this.subState === GameSubState.FREE_BALL) {
            
            // Attacker always faces their goal. Defender always faces attacker.
            if (this.player.role === PlayerRole.ATTACKER) {
                if (this.player.stunTimer <= 0 && !this.player.isWaitingForScrumRecovery && (!this.player.isRetreating || this.player.isAtRetreatPos)) {
                    this.player.facingX = 1; // P1 goal is right
                }
                if (this.bot.stunTimer <= 0 && !this.bot.isWaitingForScrumRecovery && (!this.bot.isRetreating || this.bot.isAtRetreatPos)) {
                    this.bot.facingX = (this.bot.pos.x > this.player.pos.x) ? -1 : 1; 
                }
            } else if (this.bot.role === PlayerRole.ATTACKER) {
                if (this.bot.stunTimer <= 0 && !this.bot.isWaitingForScrumRecovery && (!this.bot.isRetreating || this.bot.isAtRetreatPos)) {
                    this.bot.facingX = -1; // Bot goal is left
                }
                if (this.player.stunTimer <= 0 && !this.player.isWaitingForScrumRecovery && (!this.player.isRetreating || this.player.isAtRetreatPos)) {
                    this.player.facingX = (this.player.pos.x < this.bot.pos.x) ? 1 : -1;
                }
            } else {
                // Neutral (free ball) - face each other or face movement
                if (this.player.dirX !== 0 && this.player.stunTimer <= 0 && !this.player.isWaitingForScrumRecovery && (!this.player.isRetreating || this.player.isAtRetreatPos)) this.player.facingX = this.player.dirX;
                if (this.bot.dirX !== 0 && this.bot.stunTimer <= 0 && !this.bot.isWaitingForScrumRecovery && (!this.bot.isRetreating || this.bot.isAtRetreatPos)) this.bot.facingX = this.bot.dirX;
            }
        }
        
        // Solid wall collision globally in REGULAR state
        if (this.subState === GameSubState.REGULAR && this.player.stunTimer <= 0 && this.bot.stunTimer <= 0 && !this.player.isWaitingForScrumRecovery && !this.bot.isWaitingForScrumRecovery && !this.player.isRetreating && !this.bot.isRetreating) {
            const pCenter = this.player.pos.x + this.player.size.x / 2;
            const bCenter = this.bot.pos.x + this.bot.size.x / 2;
            const dist = Math.abs(pCenter - bCenter);
            
            // Adjust to their actual sizes since they are rects
            const combinedHalfWidths = (this.player.size.x + this.bot.size.x) / 2;
            
            if (dist < combinedHalfWidths) {
                const overlap = combinedHalfWidths - dist;
                if (pCenter < bCenter) {
                    this.player.pos.x -= overlap / 2;
                    this.bot.pos.x += overlap / 2;
                    if (this.player.vel.x > 0) this.player.vel.x = 0;
                    if (this.bot.vel.x < 0) this.bot.vel.x = 0;
                } else {
                    this.player.pos.x += overlap / 2;
                    this.bot.pos.x -= overlap / 2;
                    if (this.player.vel.x < 0) this.player.vel.x = 0;
                    if (this.bot.vel.x > 0) this.bot.vel.x = 0;
                }
                
                // Trigger scrum automatically on collision in REGULAR state
                if (this.subState === GameSubState.REGULAR && !this.isExtraPointAttempt) {
                    this.startScrum();
                }
            }
        }
        
        // No longer automatically trigger scrum here. It's triggered by playerTackle() or bot logic.
        
        // Handle SCRUM_MATRIX state
        if (this.subState === GameSubState.SCRUM_MATRIX) {
            this.scrumTimer += dt;
            
            if (this.player.scrumCharging) this.player.scrumChargeTimer += dt;
            if (this.bot.scrumCharging) this.bot.scrumChargeTimer += dt;
            
            // Bot logic
            if (!this.bot.scrumCharging && !this.bot.scrumReleased && this.scrumTimer >= this.scrumBotPressDelay) {
                this.bot.scrumCharging = true;
                this.bot.scrumChargeTimer = 0;
            }
            if (this.bot.scrumCharging && this.bot.scrumChargeTimer >= this.scrumBotReleaseDelay) {
                this.bot.scrumCharging = false;
                this.bot.scrumReleased = true;
                this.bot.scrumPower = this.calculateScrumPower(this.bot.scrumChargeTimer);
            }
            
            // Auto-fail for holding too long
            const maxCharge = this.scrumDuration * 0.88;
            if (this.player.scrumCharging && this.player.scrumChargeTimer >= maxCharge) {
                this.player.scrumCharging = false;
                this.player.scrumReleased = true;
                this.player.scrumPower = 0;
            }
            if (this.bot.scrumCharging && this.bot.scrumChargeTimer >= maxCharge) {
                this.bot.scrumCharging = false;
                this.bot.scrumReleased = true;
                this.bot.scrumPower = 0;
            }
            
            // Wiggle players to look like they are struggling
            const pushDir = Math.sin(this.scrumTimer * 10) > 0 ? 1 : -1;
            this.player.vel.x = pushDir * 15;
            this.bot.vel.x = pushDir * 15;
            
            // Global window to START charging
            const windowClosed = this.scrumTimer >= this.scrumDuration;
            
            const playerResolved = this.player.scrumReleased || (windowClosed && !this.player.scrumCharging);
            const botResolved = this.bot.scrumReleased || (windowClosed && !this.bot.scrumCharging);
            
            if (playerResolved && botResolved) {
                // If not released, power is 0
                if (!this.player.scrumReleased) {
                    this.player.scrumCharging = false;
                    this.player.scrumReleased = true;
                    this.player.scrumPower = 0;
                }
                if (!this.bot.scrumReleased) {
                    this.bot.scrumCharging = false;
                    this.bot.scrumReleased = true;
                    this.bot.scrumPower = 0;
                }
                
                const pPower = this.player.scrumPower;
                const bPower = this.bot.scrumPower;
                
                const attacker = this.player.role === PlayerRole.ATTACKER ? this.player : this.bot;
                const defender = this.player.role === PlayerRole.DEFENDER ? this.player : this.bot;
                
                const attackerPower = attacker === this.player ? pPower : bPower;
                const defenderPower = defender === this.player ? pPower : bPower;
                
                this.subState = GameSubState.REGULAR;
                
                if (attackerPower >= defenderPower) {
                    // Attacker wins!
                    defender.knockbackTimer = 0.4;
                    defender.stunTimer = 5.0;
                    defender.vel.y = -150; // Bigger bump
                    defender.onGround = false;
                    defender.vel.x = (defender.pos.x > attacker.pos.x) ? 300 : -300; // Stronger push
                    
                    attacker.vel.y = -50;
                    attacker.onGround = false;
                    attacker.vel.x = (attacker.pos.x < defender.pos.x) ? 100 : -100;
                    
                    this.screenShake = 0.5;
                    this.spawnParticles(defender.pos.x, defender.pos.y, 'hit', 20);
                    this.botAvoidTimer = 6.0; // Prevent immediate re-tackle after waking up
                } else {
                    // Defender wins!
                    attacker.knockbackTimer = 0.4;
                    attacker.isWaitingForScrumRecovery = true;
                    attacker.vel.y = -150; // Bigger bump
                    attacker.onGround = false;
                    attacker.vel.x = (attacker.pos.x > defender.pos.x) ? 300 : -300; // Stronger push
                    
                    defender.vel.y = -50;
                    defender.onGround = false;
                    defender.vel.x = (defender.pos.x < attacker.pos.x) ? 100 : -100;
                    
                    this.screenShake = 0.8;
                    this.spawnParticles(attacker.pos.x, attacker.pos.y, 'miss', 20);
                    
                    // Ball pops out logically
                    attacker.role = PlayerRole.NEUTRAL;
                    defender.role = PlayerRole.NEUTRAL;
                    this.fumbleProtectTimer = 0.5;
                    this.freeBallTimer = 0;
                    this.subState = GameSubState.FREE_BALL;
                    this.ball.allowCeilingBounce = true;
                    this.ball.pos.y = GROUND_Y - this.ball.size.y - 40; // Start higher to ensure clear arc
                    this.ball.onGround = false;
                    this.ball.vel.y = -800; // Popped out in an arc UP
                    this.ball.bounciness = 0.95; // Act like a rubber ball
                    
                    const dirToDefenderHalf = defender === this.player ? -1 : 1;
                    this.ball.vel.x = dirToDefenderHalf * 400; 
                }
            }
        }
        
        if (this.subState === GameSubState.THE_SNAP || this.subState === GameSubState.FREE_BALL || this.subState === GameSubState.KICKOFF_LAUNCH) {
            if (this.subState === GameSubState.KICKOFF_LAUNCH) {
                this.ballOscillatePhase += dt * 3.0;
                this.ball.updatePhysics(dt); // gravity happens
                
                // Override X with sine wave ONLY while falling initially
                this.ball.pos.x = this.ballOscillateCenter + Math.sin(this.ballOscillatePhase) * (GAME_WIDTH * 0.15);
                
                if (this.ball.pos.y >= GROUND_Y - this.ball.size.y) {
                    this.subState = GameSubState.FREE_BALL; // bounces
                    this.ball.allowCeilingBounce = true;
                    this.ball.vel.y = -600; // force a strong first bounce up
                    this.ball.vel.x = (Math.random() - 0.5) * 800; // random shoot out
                }
            } else {
                if (this.subState === GameSubState.FREE_BALL) {
                    this.freeBallTimer += dt;
                    if (this.freeBallTimer > 3.0) {
                        this.ball.bounciness = 0.0;
                    }
                }
                this.ball.updatePhysics(dt);
            }
            
            // Check ball touch
            const pTouch = this.player.stunTimer <= 0 && !this.player.isWaitingForScrumRecovery && this.fumbleProtectTimer <= 0 && this.checkAABB(this.player, this.ball);
            const bTouch = this.bot.stunTimer <= 0 && !this.bot.isWaitingForScrumRecovery && this.fumbleProtectTimer <= 0 && this.checkAABB(this.bot, this.ball);
            
            if (pTouch || bTouch) {
                // If popping / kickoff, possessing the ball resumes REGULAR state.
                if (this.subState === GameSubState.KICKOFF_LAUNCH) {
                    this.subState = GameSubState.REGULAR;
                }
                
                if (pTouch && bTouch) {
                    // Tie goes to player for fun
                    this.assignBall(this.player, this.bot);
                } else if (pTouch) {
                    this.assignBall(this.player, this.bot);
                } else if (bTouch) {
                    this.assignBall(this.bot, this.player);
                }
            }
        } else if (this.subState === GameSubState.REGULAR || this.subState === GameSubState.KICKING || this.subState === GameSubState.BALL_ACQUIRED || this.subState === GameSubState.SCRUM_MATRIX || this.subState === GameSubState.TACKLE_RESOLVE) {
            // Ball attached to attacker
            const attacker = this.player.role === PlayerRole.ATTACKER ? this.player : this.bot;
            const defender = this.player.role === PlayerRole.DEFENDER ? this.player : this.bot;
            
            this.ball.pos.set(
                attacker.pos.x + (attacker === this.player ? this.player.size.x : -this.ball.size.x/2),
                attacker.pos.y + 30
            );

            // Kicking logic
            if (this.isChargingKick) {
                this.kickHoldTimer += dt;
                if (this.isExtraPointAttempt) {
                    this.kickPower += dt * (100 / 1.2); // 1.2 sekundy do 100%
                    if (this.kickPower > 100) { 
                        this.kickPower = 100; // Stop at 100
                    }
                } else {
                    if (this.kickHoldTimer >= 0.4) {
                        this.kickPower = 80; // Ensure perfect kick
                        this.releaseKick();
                    }
                }
            }

            // Check Endzone
            if (attacker === this.player && attacker.pos.x + attacker.size.x >= GAME_WIDTH - 2) {
                this.scoreTouchdown(this.player);
            } else if (attacker === this.bot && attacker.pos.x <= 2) {
                this.scoreTouchdown(this.bot);
            }

        } else if (this.subState === GameSubState.BALL_IN_AIR) {
            this.ball.updatePhysics(dt);
            
            // Check crossbar goals (Y < 150, appropriate X)
            if (this.ball.pos.y < 150) {
                if (this.player.role === PlayerRole.ATTACKER && this.ball.pos.x > GAME_WIDTH - 50) {
                    this.scoreFieldGoal(this.player);
                } else if (this.bot.role === PlayerRole.ATTACKER && this.ball.pos.x < 50) {
                    this.scoreFieldGoal(this.bot);
                }
            }
            
            if (this.ball.pos.y >= GROUND_Y - this.ball.size.y) {
                // Ball hits ground - fumble if not goal
                if (this.isExtraPointAttempt) {
                    this.isExtraPointAttempt = false;
                    this.subState = GameSubState.CELEBRATION;
                    this.celebrationMessage = "NO GOOD!";
                    if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
                    this.celebrationTimeoutId = setTimeout(() => this.resetToSnap(), 3000);
                } else {
                    this.subState = GameSubState.FREE_BALL;
                }
            }

            // Defender diving block not applicable in fast mode
            const defender = this.player.role === PlayerRole.DEFENDER ? this.player : this.bot;
            if (defender.isDiving && this.checkAABB(defender, this.ball)) {
                this.ball.vel.x = -this.ball.vel.x;
                this.ball.vel.y = -200;
                this.ball.allowCeilingBounce = true;
                this.spawnParticles(this.ball.pos.x, this.ball.pos.y, 'block', 15);
                this.screenShake = 0.5;

                if (this.isExtraPointAttempt) {
                    this.isExtraPointAttempt = false;
                    this.subState = GameSubState.CELEBRATION;
                    this.celebrationMessage = "BLOCKED!";
                    if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
                    this.celebrationTimeoutId = setTimeout(() => this.resetToSnap(), 3000);
                } else {
                    this.subState = GameSubState.FREE_BALL;
                }
            }
        }
        
        // Update camera
        if (this.subState === GameSubState.SCRUM_MATRIX) {
            // Zoom in over 0.3 seconds
            const zoomProgress = Math.min(1.0, this.scrumTimer / 0.3);
            const ease = 1 - Math.pow(1 - zoomProgress, 3); // easeOutCubic
            
            const targetScale = 1.5;
            this.cameraZoom = 1.0 + (targetScale - 1.0) * ease;
            
            let targetCenterX = (this.player.pos.x + this.bot.pos.x + this.bot.size.x) / 2;
            const targetCenterY = GROUND_Y - 50;
            
            // Clamp camera to avoid background clipping
            const halfW = (GAME_WIDTH / 2) / targetScale;
            if (targetCenterX < halfW) targetCenterX = halfW;
            if (targetCenterX > GAME_WIDTH - halfW) targetCenterX = GAME_WIDTH - halfW;
            
            const defaultCenterX = GAME_WIDTH / 2;
            const defaultCenterY = GAME_HEIGHT / 2;
            
            this.cameraX = defaultCenterX + (targetCenterX - defaultCenterX) * ease;
            this.cameraY = defaultCenterY + (targetCenterY - defaultCenterY) * ease;
        } else {
            // Zoom out quickly if we exit scrum state
            if (this.cameraZoom > 1.0) {
                this.cameraZoom -= dt * 2.0;
                if (this.cameraZoom < 1.0) this.cameraZoom = 1.0;
                
                // Return to center
                const easeOut = (this.cameraZoom - 1.0) / 0.5;
                const defaultCenterX = GAME_WIDTH / 2;
                const defaultCenterY = GAME_HEIGHT / 2;
                
                this.cameraX = defaultCenterX + (this.cameraX - defaultCenterX) * easeOut;
                this.cameraY = defaultCenterY + (this.cameraY - defaultCenterY) * easeOut;
            } else {
                this.cameraZoom = 1.0;
                this.cameraX = GAME_WIDTH / 2;
                this.cameraY = GAME_HEIGHT / 2;
            }
        }
    }
    
    updateBot(dt: number) {
        if (this.bot.stunTimer > 0 || this.bot.isRetreating) return;
        if (this.subState === GameSubState.CELEBRATION) {
             this.bot.dirX = 0;
             return;
        }
        
        if (this.botAvoidTimer > 0) {
            this.botAvoidTimer -= dt;
        }

        if (this.isExtraPointAttempt && this.bot.role === PlayerRole.DEFENDER) {
             // Stand still waiting for opponent's kick, cannot do anything
             this.bot.dirX = 0;
             return;
        }
        if (this.subState === GameSubState.KICKING && this.bot.role === PlayerRole.ATTACKER) {
             this.bot.dirX = 0;
             if (this.isChargingKick && this.isExtraPointAttempt && this.kickPower > 70 + Math.random() * 15) {
                 this.releaseKick();
             }
             return;
        }
        
        let targetX = this.bot.pos.x;
        
        if (this.subState === GameSubState.THE_SNAP || this.subState === GameSubState.FREE_BALL || this.subState === GameSubState.KICKOFF_LAUNCH) {
            // Chase ball
            targetX = this.ball.pos.x;
        } else if (this.bot.role === PlayerRole.ATTACKER) {
            // Run to left endzone
            targetX = -100;
        } else if (this.bot.role === PlayerRole.DEFENDER) {
            if (this.subState === GameSubState.REGULAR && this.botAvoidTimer > 0) {
                if (this.botAvoidTimer > 1.5) {
                    // Run away from player
                    targetX = this.player.pos.x < this.bot.pos.x ? GAME_WIDTH : 0;
                } else {
                    // Wait before chasing
                    targetX = this.bot.pos.x;
                }
            } else {
                // Chase attacker
                targetX = this.player.pos.x;
            }
        }

        // Apply bot movement
        if (targetX < this.bot.pos.x - 10) {
            this.bot.dirX = -1;
        } else if (targetX > this.bot.pos.x + 10) {
            this.bot.dirX = 1;
        } else {
            this.bot.dirX = 0;
        }
        
        // Bot tackle logic is handled by collision above
    }

    checkAABB(a: PhysicalBody, b: PhysicalBody) {
        // Effective sizes for tackling players (they crouch/slide so their height is smaller)
        const aTackling = (a as Player).isTackling;
        const bTackling = (b as Player).isTackling;
        const aHeight = aTackling ? a.size.y * 0.6 : a.size.y;
        const bHeight = bTackling ? b.size.y * 0.6 : b.size.y;

        const aY = a.pos.y + (a.size.y - aHeight); // Align to bottom when crouching
        const bY = b.pos.y + (b.size.y - bHeight);

        return a.pos.x < b.pos.x + b.size.x &&
               a.pos.x + a.size.x > b.pos.x &&
               aY < bY + bHeight &&
               aY + aHeight > bY;
    }
    
    assignBall(attacker: Player, defender: Player) {
        attacker.role = PlayerRole.ATTACKER;
        defender.role = PlayerRole.DEFENDER;
        this.subState = GameSubState.REGULAR;
        this.ball.bounciness = 0.75; // reset
        this.spawnParticles(attacker.pos.x, attacker.pos.y, 'pickup');
        
        defender.isWaitingForScrumRecovery = false;
        defender.stunTimer = 0;
        defender.isRetreating = true;
        
        attacker.isWaitingForScrumRecovery = false;
        attacker.stunTimer = 0;
        attacker.isRetreating = true;

        // Show message without pausing
        this.acquiredMessage = attacker === this.player ? "P1 GOT THE BALL!" : "BOT GOT THE BALL!";
        this.botAvoidTimer = 1.0; // Wait a moment before chasing
    }
    
    startScrum() {
        this.subState = GameSubState.SCRUM_MATRIX;
        this.acquiredMessage = null; // Clear message
        this.scrumTimer = 0;
        this.player.scrumCharging = false;
        this.player.scrumReleased = false;
        this.player.scrumPower = 0;
        this.player.scrumChargeTimer = 0;
        this.bot.scrumCharging = false;
        this.bot.scrumReleased = false;
        this.bot.scrumPower = 0;
        this.bot.scrumChargeTimer = 0;
        
        // Force them tightly together to avoid hovering
        const leftPlayer = this.player.pos.x < this.bot.pos.x ? this.player : this.bot;
        const rightPlayer = leftPlayer === this.player ? this.bot : this.player;
        
        const midX = (this.player.pos.x + this.bot.pos.x) / 2;
        leftPlayer.pos.x = midX - leftPlayer.size.x/2 - 5;
        rightPlayer.pos.x = midX - rightPlayer.size.x/2 + 5;
        this.player.vel.set(0, 0);
        this.bot.vel.set(0, 0);
        
        // Bot decides when to press and release
        this.scrumBotPressDelay = Math.random() * 0.3; // 0 to 0.3s
        // Bot target holds duration. Good bots aim for ~1.2s to 1.3s (0.80 to 0.86)
        const rng = Math.random();
        if (rng < 0.3) {
            this.scrumBotReleaseDelay = 1.0 + Math.random() * 0.2; // early
        } else if (rng < 0.8) {
            this.scrumBotReleaseDelay = 1.22 + Math.random() * 0.08; // perfect
        } else {
            this.scrumBotReleaseDelay = 1.35 + Math.random() * 0.2; // very late, might fail
        }
    }


    
    scoreTouchdown(player: Player) {
        if (player === this.player) {
            this.playerScore += 6;
            this.celebrationMessage = "P1 TOUCHDOWN!";
        } else {
            this.botScore += 6;
            this.celebrationMessage = "BOT TOUCHDOWN!";
        }
        
        this.subState = GameSubState.CELEBRATION;
        this.acquiredMessage = null;
        this.spawnParticles(player.pos.x, player.pos.y, 'touchdown', 30);
        
        if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
        this.celebrationTimeoutId = setTimeout(() => {
            this.isExtraPointAttempt = true;
            this.setupExtraPoint(player);
        }, 3000);
    }

    setupExtraPoint(scoringPlayer: Player) {
        this.subState = GameSubState.KICKING;
        this.ball.onGround = true;
        this.player.role = scoringPlayer === this.player ? PlayerRole.ATTACKER : PlayerRole.DEFENDER;
        this.bot.role = scoringPlayer === this.bot ? PlayerRole.ATTACKER : PlayerRole.DEFENDER;
        
        // Attacker on the left, Defender on the bottom/away
        const attacker = this.player.role === PlayerRole.ATTACKER ? this.player : this.bot;
        const defender = this.player.role === PlayerRole.DEFENDER ? this.player : this.bot;
        
        if (scoringPlayer === this.player) {
            attacker.pos.set(100, GROUND_Y - attacker.size.y);
            defender.pos.set(GAME_WIDTH - 150, GROUND_Y - defender.size.y);
            this.ball.pos.set(100 + attacker.size.x, GROUND_Y - this.ball.size.y);
        } else {
            attacker.pos.set(GAME_WIDTH - 100 - attacker.size.x, GROUND_Y - attacker.size.y);
            defender.pos.set(150, GROUND_Y - defender.size.y);
            this.ball.pos.set(GAME_WIDTH - 100 - attacker.size.x - this.ball.size.x, GROUND_Y - this.ball.size.y);
        }
        
        defender.stunTimer = 0; // Defender does not act in mini-game, but is not stunned
        defender.momentum = 0;
        
        // Auto-start kick
        if (this.bot.role === PlayerRole.ATTACKER) {
            this.isChargingKick = false;
            if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
            this.celebrationTimeoutId = setTimeout(() => {
                this.isChargingKick = true;
                this.kickPower = 0;
                this.kickDir = -1; // Bot is on right, kicks left
                this.kickHoldTimer = 0;
            }, 1000);
        } else {
            // Player is attacker, start kick setup but wait for input
            this.isChargingKick = false;
            this.kickPower = 0;
            this.kickDir = 1;
            this.kickHoldTimer = 0;
        }
    }
    
    scoreFieldGoal(player: Player) {
        if (this.isExtraPointAttempt) {
             if (player === this.player) {
                 this.playerScore += 1;
                 this.celebrationMessage = "P1 EXTRA POINT!";
             } else {
                 this.botScore += 1;
                 this.celebrationMessage = "BOT EXTRA POINT!";
             }
             this.spawnParticles(this.ball.pos.x, this.ball.pos.y, 'perfect', 50);
             this.subState = GameSubState.CELEBRATION;
             if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
             this.celebrationTimeoutId = setTimeout(() => this.resetToSnap(), 3000);
             return;
        }
        
        if (player === this.player) {
            this.playerScore += 3;
            this.celebrationMessage = "P1 FIELD GOAL!";
        } else {
            this.botScore += 3;
            this.celebrationMessage = "BOT FIELD GOAL!";
        }
        
        this.subState = GameSubState.CELEBRATION;
        this.spawnParticles(this.ball.pos.x, this.ball.pos.y, 'fieldgoal', 30);
        if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
        this.celebrationTimeoutId = setTimeout(() => this.resetToSnap(), 3000);
    }
    
    startKick() {
        if (this.player.role !== PlayerRole.ATTACKER || this.player.stunTimer > 0) return;
        this.subState = GameSubState.KICKING;
        this.isChargingKick = true;
        this.kickPower = 0;
        this.kickDir = 1;
        this.kickHoldTimer = 0;
        this.player.vel.x = 0;
        this.player.dirX = 0;
    }

    calculateScrumPower(time: number): number {
        const percent = time / this.scrumDuration;
        if (percent > 0.88) return 0; // LATE (Instant Fail)
        if (percent >= 0.80) return 100; // PERFECT
        // EARLY
        return 10 + (percent / 0.80) * 70;
    }

    playerTackle() {
        if (this.subState === GameSubState.SCRUM_MATRIX) {
            if (!this.player.scrumCharging && !this.player.scrumReleased) {
                this.player.scrumCharging = true;
                this.player.scrumChargeTimer = 0;
            }
        }
    }
    
    releaseTackle() {
        if (this.subState === GameSubState.SCRUM_MATRIX && this.player.scrumCharging) {
            this.player.scrumCharging = false;
            this.player.scrumReleased = true;
            this.player.scrumPower = this.calculateScrumPower(this.player.scrumChargeTimer);
        }
    }

    releaseKick() {
        if (this.subState !== GameSubState.KICKING) return;
        if (!this.isExtraPointAttempt && this.kickHoldTimer < 0.4) return; // Auto kick enforces 0.4s hold

        this.isChargingKick = false;
        
        // Perfect zone is 70 to 90
        const isPerfect = this.kickPower >= 70 && this.kickPower <= 90;
        
        this.subState = GameSubState.BALL_IN_AIR;
        this.ball.onGround = false;
        
        const isPlayer = this.player.role === PlayerRole.ATTACKER;
        const dir = isPlayer ? 1 : -1;
        const startX = isPlayer ? this.player.pos.x : this.bot.pos.x;
        const startY = isPlayer ? this.player.pos.y : this.bot.pos.y;

        if (isPerfect) {
            this.ball.vel.set(dir * 800, -600); // Perfect arc
            this.spawnParticles(startX, startY, 'perfect', 20);
        } else {
            this.ball.vel.set(dir * 200, -100); // Bad kick
            this.spawnParticles(startX, startY, 'miss', 10);
        }
    }
    
    popBall() {
        if (this.player.role !== PlayerRole.ATTACKER) return;
        this.player.role = PlayerRole.NEUTRAL;
        this.bot.role = PlayerRole.NEUTRAL;
        
        this.subState = GameSubState.KICKOFF_LAUNCH;
        this.ball.allowCeilingBounce = false;
        this.ball.vel.y = -900; // Launch high
        this.ball.vel.x = 0;
        this.ball.onGround = false;
        this.ballOscillateCenter = GAME_WIDTH / 2 - this.ball.size.x / 2;
        this.ballOscillatePhase = Math.random() * Math.PI * 2;
        this.spawnParticles(this.ball.pos.x, this.ball.pos.y, 'pickup', 10);
    }
}

