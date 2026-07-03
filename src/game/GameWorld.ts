import { GAME_WIDTH, GAME_HEIGHT, GROUND_Y, PHYSICS } from './constants';
import { PlayerRole, GameSubState } from './Types';
import { playSFX, setBGM, setStepSoundActive, setGruntSoundActive } from './audio';

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
        if (this.pos.y >= GROUND_Y - this.size.y) {
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
    stepTimer: number = 0;
    
  stats = { power: 100, speed: 100, defense: 100 };
    debuffTimer: number = 0; // Keeping if needed for future skills
    stunTimer: number = 0;
    isWaitingForScrumRecovery: boolean = false;
    scrumPushTimer: number = 0; // Nowy licznik czasu wyświetlania smug pędu przy parciu w przód
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
        
        if (this.scrumPushTimer > 0) {
            this.scrumPushTimer -= dt;
            if (this.scrumPushTimer < 0) this.scrumPushTimer = 0;
        }
        
if (this.stunTimer > 0 || this.isWaitingForScrumRecovery) {
            if (this.stunTimer > 0) {
                this.stunTimer -= dt;
                if (this.stunTimer <= 0) {
                    this.stunTimer = 0;
                    this.isWaitingForScrumRecovery = false; // Recovered!
                }
            }
            // USUNIĘTO: else if (this.knockbackTimer <= 0) { this.isWaitingForScrumRecovery = false; }
            // Usunięcie tej blokady sprawia, że zawodnik będzie leżał na ziemi tak długo,
            // aż ktoś złapie wolną piłkę i uruchomi metodę assignBall(), która go zresetuje.
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
            
            if (Math.abs(this.pos.x - homeX) < 15) {
                this.isAtRetreatPos = true;
                this.pos.x = homeX; // ANCHOR SNAP: Blokujemy postać idealnie na punkcie docelowym
                this.vel.x = 0;     // ANCHOR BRAKE: Całkowicie zerujemy pęd, eliminując wariowanie i drgania pędu
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
        // USUNIĘTO BLOKADĘ KIERUNKU: Teraz odległość ciągłego biegu nalicza się zawsze, 
        // również gdy zawodnik wycofuje się / ucieka w stronę własnej połowy boiska.
        if (effectiveDirX !== 0 && effectiveDirX === this.lastEffectiveDirX && !this.isTackling && this.onGround) {
            this.continuousRunDistance += Math.abs(this.vel.x * dt);
        } else {
            this.continuousRunDistance = 0;
        }
        this.lastEffectiveDirX = effectiveDirX;
        
        // ZMIANA PROGU NA 7%: Zawodnik odpala turbo-sprint błyskawicznie, 
        // już po przebiegnięciu zaledwie 7% szerokości planszy (zamiast dotychczasowych 20%).
        this.isBoosting = this.continuousRunDistance > GAME_WIDTH * 0.06;
        
        const speedMultiplier = (this.stats.speed / 100);
        const acc = PHYSICS.runAcceleration * speedMultiplier * 1.5; // Slightly faster acceleration
        let maxS = (this.debuffTimer > 0 ? PHYSICS.maxRunSpeed * 0.5 : PHYSICS.maxRunSpeed) * speedMultiplier * 0.7;
        
        if (this.isBoosting) {
            maxS *= 2.0;
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
        
        // Usunięto lokalne odtwarzanie kroku - przeniesiono do GameWorld.update
        
     // Wall boundaries (Wprowadzenie marginesu 40px od krawędzi ekranu, aby postać nie znikała za ramą)
        const screenMargin = 40;
        if (this.pos.x < screenMargin) { this.pos.x = screenMargin; this.vel.x = 0; }
        if (this.pos.x > GAME_WIDTH - this.size.x - screenMargin) { this.pos.x = GAME_WIDTH - this.size.x - screenMargin; this.vel.x = 0; }
    }
}

export class Ball extends PhysicalBody {
    allowCeilingBounce: boolean = false;
    ignoreWalls: boolean = false;
    bounciness: number = 0.75;
    flameColor: 'PURPLE' | 'BLUE' | 'NONE' = 'NONE'; // Zarządzanie kolorem płomienia komety
    
    constructor() {
        super();
        this.size.set(20, 14); // make ball visible
    }
    
updatePhysics(dt: number, players: Player[] = []) {
        if (!this.onGround) {
            this.vel.y += PHYSICS.gravity * dt;
        }

        this.pos.add(this.vel.clone().scale(dt));
        
        if (this.pos.y >= GROUND_Y - this.size.y) {
            this.pos.y = GROUND_Y - this.size.y;
            if (this.vel.y >= 0) {
                if (this.vel.y > 20) {
                    this.vel.y *= -this.bounciness; // Bounce!
                    
                    // Skalowanie głośności odbicia na podstawie prędkości piłki (max 1.0)
                    const bounceVol = Math.min(1.0, Math.abs(this.vel.y) / 400);
                    playSFX('bounce', bounceVol);
                    
                    // Płynna zmiana koloru ognia przy odbiciu od murawy boiska
                    if (this.flameColor !== 'NONE') {
                        this.flameColor = this.flameColor === 'PURPLE' ? 'BLUE' : 'PURPLE';
                    }

                    if (this.bounciness > 0.6) {
                        const factor = (this.bounciness - 0.6) / 0.4; // 0 to 1
                        
                        let avoidForceX = 0;
                        if (players.length > 0) {
                            for (const p of players) {
                                const distToPlayer = Math.abs((p.pos.x + p.size.x/2) - (this.pos.x + this.size.x/2));
                                if (distToPlayer < 350) {
                                    // Push away from player so it doesn't land exactly on them
                                    avoidForceX += (this.pos.x > p.pos.x ? 1 : -1) * (350 - distToPlayer) * 4;
                                }
                            }
                        }

                        // Apply avoiding force and a little randomness
                        this.vel.x = (this.vel.x * 0.7) + avoidForceX * factor + (Math.random() - 0.5) * 600 * factor;
                        
                        // Limit bounce height so it doesn't fly endlessly
                        if (this.vel.y < -800) this.vel.y = -800;
                    } else {
                        this.vel.x *= 0.8; // Friction when bouncing normally
                    }
                } else {
                    this.vel.y = 0;
                    this.onGround = true;
                    this.vel.x *= Math.pow(0.5, dt * 5); // Rolling friction
                    this.flameColor = 'NONE'; // CAŁKOWITE ZGASZENIE ognia po całkowitym zatrzymaniu na ziemi
                }
            }
        } else {
            this.onGround = false;
        }
        
        // INTELIGENTNE ŚCIANY: Piłka odbija się od samych krawędzi ekranu (0) w locie, 
        // ale na ziemi (gdy się toczy lub zatrzymuje) jej margines to automatycznie 40px!
        if (!this.ignoreWalls) {
            const margin = this.onGround ? 40 : 0;
            if (this.pos.x < margin) {
                this.pos.x = margin;
                const bounceVol = Math.min(1.0, Math.abs(this.vel.x) / 400);
                if (bounceVol > 0.1) playSFX('bounce', bounceVol);
                this.vel.x *= -0.8; 
                // Zmiana koloru ognia przy uderzeniu w lewą krawędź boiska
                if (this.flameColor !== 'NONE') {
                    this.flameColor = this.flameColor === 'PURPLE' ? 'BLUE' : 'PURPLE';
                }
            } else if (this.pos.x > GAME_WIDTH - this.size.x - margin) {
                this.pos.x = GAME_WIDTH - this.size.x - margin;
                const bounceVol = Math.min(1.0, Math.abs(this.vel.x) / 400);
                if (bounceVol > 0.1) playSFX('bounce', bounceVol);
                this.vel.x *= -0.8; 
                // Zmiana koloru ognia przy uderzeniu w prawą krawędź boiska
                if (this.flameColor !== 'NONE') {
                    this.flameColor = this.flameColor === 'PURPLE' ? 'BLUE' : 'PURPLE';
                }
            }
        }
        
        if (this.allowCeilingBounce && this.pos.y < 0) {
            this.pos.y = 0;
            const bounceVol = Math.min(1.0, Math.abs(this.vel.y) / 400);
            if (bounceVol > 0.1) playSFX('bounce', bounceVol);
            this.vel.y *= -0.8;
            // Zmiana koloru ognia przy uderzeniu w sufit
            if (this.flameColor !== 'NONE') {
                this.flameColor = this.flameColor === 'PURPLE' ? 'BLUE' : 'PURPLE';
            }
        }
    }
}

export class GameWorld {
    player = new Player(false);
    bot = new Player(true);
    ball = new Ball();
    
 subState = GameSubState.COUNTDOWN;
    timeLeft = 120; // POPRAWKA: Wydłużono bazowy czas rozgrywki do idealnych 120 sekund (2 minuty pełnej akcji!)
    playerScore = 0;
    botScore = 0;
    
    // Camera
    cameraZoom = 1.0;
    cameraX = GAME_WIDTH / 2;
    cameraY = GAME_HEIGHT / 2;
    
    // Scrum State
    scrumTimer = 0;
    scrumDuration = 1.5; // used for kick charge meter max time now
    scrumPrompt: 'PUSH' | 'HOLD' | null = null;
scrumPromptTimer = 0;
    scrumOffset = 0;
    scrumWinOffset = 175; // Zmniejszono z 250 na 175. Dzięki temu próg wygranej kończy się idealnie przed krawędzią zoomu, zachowując czysty margines na animację upadku!
    scrumStartX = 0;
    scrumCameraStartX = 400;
    scrumCameraStartY = 400;
    scrumBotPressDelay = 0;
    scrumBotReleaseDelay = 0;
    
  kickPower = 0;
    kickDir = 1;
    kickHoldTimer = 0;
    isChargingKick = false;
    isPerfectKick = false; // Nowa flaga zapamiętująca czy aktualny lot piłki to udany, wysoki łuk
    
    countdownTimer = 3;
    lastCountdownSecond = 3;
    
    celebrationMessage = '';
    acquiredMessage: string | null = null;
    acquiredMessage2: string | null = null;
    botAvoidTimer: number = 0;
    
    particles: Array<{pos: Vector2, vel: Vector2, life: number, type: string}> = [];
    screenShake = 0;
    
 ballOscillateCenter = 0;
    ballOscillatePhase = 0;
    // Nowe zmienne przechowujące losowy modyfikator lotu dla danej rundy:
    kickoffAmps = [1, 1, 1];
    kickoffFreqs = [1.7, 0.8];

isExtraPointAttempt = false;
    bigTackleTimer = 0;
    fumbleProtectTimer = 0;
freeBallTimer = 0;
    showRunArrow = false; // Flaga dla renderera informująca o rysowaniu strzałki touchdownu
    showPlayerArrow = false; // Flaga dla strzałki wskazującej gracza na samym początku meczu
scrumSlowMoTimer = 0; // Licznik kontrolujący kinowe, widowiskowe spowolnienie czasu na finiszu walki
    pendingRunArrow = false; // Nowa flaga oczekiwania na zakończenie slow-motion przed pokazaniem strzałki TD
    kickInputLockout = 0;    // Absolutna blokada chroniąca przed accidental-touch, ghost-clickami lub hoverem z UI
  scrumComboCount = 0;          // Licznik udanych kliknięć z rzędu pod Special Attack (0 do 5)
    scrumSpecialFlashTimer = 0;   // Timer rozbłysku białych płomieni na pasku Special Attack
scrumSpecialTextTimer = 0;    // Timer wyświetlania wielkiego napisu SPECIAL! na środku ekranu
    scrumSpecialSlowMoTimer = 0;  // NOWOŚĆ: Licznik slow-motion dedykowany dla wybuchowego momentu Special Attack
   scrumTargetOffset = 0;        // NOWOŚĆ: Cel do którego postacie płynnie zmierzają (eliminuje szarpanie i skoki)
    isSpecialAttackWinning = false; // Flaga zabezpieczająca płynne przejście finału szarży specjalnej
    
    // NOWOŚĆ: Zaawansowane zmienne fizyczne i sprężynowe dla elastycznego paska Special Attack
    scrumVisualProgress = 0.1;    // Płynny wskaźnik postępu (zaczyna od bazowych 10%)
    scrumBarBounceY = 0;          // Amplituda sprężynowania pionowego (kompresja)
    scrumBarBounceVelY = 0;       // Prędkość sprężynowania pionowego
    scrumBarBounceAngle = 0;      // Kąt wychylenia wahadłowego (pendulum wobble)
 scrumBarBounceVelAngle = 0;   // Prędkość kątowa wahadła
    scrumBarErrorTimer = 0;       // Czas trwania alarmowej czerwieni paska po błądzie
    
 // NOWOŚĆ: Zarządzanie bezpieczną, płynną procedurą końca meczu po zoom-outu kamery
    matchFinished = false;        // Flaga informująca, czy mecz został oficjalnie zakończony na planszy
    matchFreezeTimer = 0;         // Odliczanie czasu zamrożenia zawodników w miejscu przed wejściem ekranu końcowego
    isWhistlePlayed = false;      // Blokada jednokrotnego odtworzenia dźwięku syreny końcowej
    
    // NOWOŚĆ: Synchronizacja komunikatów TD oraz opóźnienia startu bota po zoom-outu
    pendingAcquiredMessage: string | null = null; // Bufor przechowujący komunikat TD do momentu ukończenia zoom-outu
    botTouchdownDelayTimer = 0;                  // Licznik 1-sekundowego zatrzymania bota po wygranej w klinczu

    celebrationTimeoutId: any = null;

  constructor() {
        this.resetToSnap();
        this.showPlayerArrow = true; // Włączamy strzałkę identyfikującą gracza TYLKO na początku pierwszej rundy
    }
    
    resetToSnap() {
        this.scrumVisualProgress = 0.1;
this.scrumBarBounceY = 0;
this.scrumBarBounceVelY = 0;
this.scrumBarBounceAngle = 0;
this.scrumBarBounceVelAngle = 0;
this.scrumBarErrorTimer = 0;
        this.isSpecialAttackWinning = false;
        this.scrumSpecialSlowMoTimer = 0;
        this.scrumComboCount = 0;
this.scrumSpecialFlashTimer = 0;
this.scrumSpecialTextTimer = 0;
        this.acquiredMessage = null;
        this.botAvoidTimer = 0;
        if (this.celebrationTimeoutId) {
            clearTimeout(this.celebrationTimeoutId);
            this.celebrationTimeoutId = null;
        }
        this.ball.ignoreWalls = false;
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
        
       this.ball.pos.set(GAME_WIDTH/2 - this.ball.size.x/2, GROUND_Y - this.ball.size.y);
        this.ball.vel.set(0,0);
        this.ball.bounciness = 0.75;
        this.ball.onGround = true;
        this.ball.flameColor = 'NONE'; // Gasi ogień komety przy restarcie snapu
        
this.subState = GameSubState.COUNTDOWN;
        this.countdownTimer = 3;
        this.lastCountdownSecond = 3;
this.isChargingKick = false;
        this.kickPower = 0;
        this.kickDir = 1;
        this.kickHoldTimer = 0;
this.isExtraPointAttempt = false;
        this.isPerfectKick = false; // Resetowanie pamięci strzału przy nowej rundzie
this.showRunArrow = false;  // Schowanie strzałki przy restarcie
        this.pendingRunArrow = false;
        this.kickInputLockout = 0;
this.matchFinished = false;
        this.matchFreezeTimer = 0;
        this.isWhistlePlayed = false;
        this.pendingAcquiredMessage = null;
        this.botTouchdownDelayTimer = 0;
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
    
    lastGameWidth: number = GAME_WIDTH;
    
    handleResize(oldWidth: number, newWidth: number) {
        // Adjust bot position if it's anchored to the right side
        if (this.bot.pos.x > oldWidth / 2) {
            const distanceFromRight = oldWidth - this.bot.pos.x;
            this.bot.pos.x = newWidth - distanceFromRight;
        }
        if (this.player.pos.x > oldWidth / 2) {
            const distanceFromRight = oldWidth - this.player.pos.x;
            this.player.pos.x = newWidth - distanceFromRight;
        }
        if (this.ball.pos.x > oldWidth / 2) {
            const distanceFromRight = oldWidth - this.ball.pos.x;
            this.ball.pos.x = newWidth - distanceFromRight;
        }
    }
    
update(dt: number) {
        const realDt = dt; // Zapisujemy czysty, rzeczywisty upływ sekundy przed jakimkolwiek spowolnieniem

        // POPRAWKA CZASU: Standardowe zwalnianie klatek klinczu (0.3) przenosimy bezpośrednio do wnętrza świata gry, by nie zniekształcać realDt zegara!
        if (this.subState === GameSubState.SCRUM_MATRIX && this.scrumSpecialSlowMoTimer <= 0) {
            dt *= 0.3;
        }

// ========================================================================
        // POPRAWKA: ULTRA-PŁYNNE ZAKOŃCZENIE PLANSZY (Smooth Match End Transition)
        // Zawodnicy nie przeskakują już skokowo – płynnie odsuwają się od siebie do pozycji pionowej stojącej!
        // ========================================================================
        const isAnimationActive = this.scrumSpecialSlowMoTimer > 0 || this.scrumSlowMoTimer > 0 || this.subState === GameSubState.CELEBRATION;
        if (this.timeLeft <= 0 && !isAnimationActive && !this.matchFinished) {
            if (this.subState === GameSubState.SCRUM_MATRIX) {
                this.subState = GameSubState.REGULAR;
                // Wykorzystujemy punkt zderzenia klinczu jako kotwicę do płynnego rozsunięcia
            } else {
                // Jeśli byli na otwartej planszy, zapisujemy ich obecny środek geometryczny
                this.scrumStartX = (this.player.pos.x + this.bot.pos.x + this.player.size.x) / 2;
            }
            this.matchFinished = true;
            this.matchFreezeTimer = 2.5; // Zamrożenie akcji na boisku na dokładnie 2.5 sekundy czasu rzeczywistego
            this.ball.flameColor = 'NONE'; // Natychmiastowe zgaszenie aury ognia na piłce
        }

        if (this.matchFinished) {
            if (!this.isWhistlePlayed) {
                playSFX('kickoff'); // Odpalenie dźwięku syreny końcowej
                this.isWhistlePlayed = true;
            }
            this.matchFreezeTimer -= realDt;
            if (this.matchFreezeTimer < 0) this.matchFreezeTimer = 0;

            // INŻYNIERIA WYJŚCIA Z KLINCZU: Obaj zawodnicy z maślaną płynnością odsuwają się od siebie o bezpieczny dystans
            const targetPlayerX = this.scrumStartX - this.player.size.x - 24;
            const targetBotX = this.scrumStartX + 24;
            this.player.pos.x += (targetPlayerX - this.player.pos.x) * realDt * 7.5;
            this.bot.pos.x += (targetBotX - this.bot.pos.x) * realDt * 7.5;

            // Piłka płynnie i naturalnie opada/centruje się na murawie boiska pomiędzy nimi
            const targetBallX = this.scrumStartX - this.ball.size.x / 2;
            this.ball.pos.x += (targetBallX - this.ball.pos.x) * realDt * 7.5;
            if (this.ball.pos.y < GROUND_Y - this.ball.size.y) {
                this.ball.pos.y += (GROUND_Y - this.ball.size.y - this.ball.pos.y) * realDt * 7.5;
            }

            // Pełna blokada sterowania i pędów wejściowych
            this.player.dirX = 0;
            this.bot.dirX = 0;
            this.player.vel.set(0, 0);
            this.bot.vel.set(0, 0);
            this.ball.vel.set(0, 0);

            // Aktualizacja klatek szkieletu postaci bez nakładania pędu przemieszczenia
            this.player.updatePhysics(realDt);
            this.bot.updatePhysics(realDt);
            return; // Zawieszenie pętli świata na czas trwania stop-klatki meczu
        }

        // POPRAWKA CZASU I WSTAWANIA: Wydłużono czas szarży do 0.75s, aby bot w pełni wylądował, eliminując bezczynne leżenie na trawie!
        if (this.scrumSpecialSlowMoTimer > 0) {
            this.scrumSpecialSlowMoTimer -= dt; // Odliczamy w zwolnionym czasie gry, by zsynchronizować fizykę bota
            
            this.player.scrumPushTimer = this.scrumSpecialSlowMoTimer;
            this.bot.knockbackTimer = this.scrumSpecialSlowMoTimer;
            this.bot.isWaitingForScrumRecovery = true; 

            if (this.scrumSpecialSlowMoTimer <= 0) {
                this.scrumSpecialSlowMoTimer = 0;
                this.scrumSpecialTextTimer = 0;
                
                // POPRAWKA FINISZU: Inteligentna weryfikacja roli zawodnika przed aktywacją strzałki naprowadzającej TD
                if (this.isSpecialAttackWinning) {
                    this.isSpecialAttackWinning = false;
                    const isPlayerAttacker = this.player.role === PlayerRole.ATTACKER;
                    
                    this.resolveScrumWinner(true, true); // Oficjalne zwycięstwo gracza w minigrze QTE
                    this.scrumSlowMoTimer = 0;     // Zerujemy standardowe slow-mo finiszu, aby od razu wyjść do zoom-outu
                    
                    if (isPlayerAttacker) {
                        this.bot.knockbackTimer = 0;
                        this.bot.isWaitingForScrumRecovery = true; // Bot zostaje powalony na ziemi
                        this.showRunArrow = true;                  // Włączamy strzałkę biegu TYLKO jeśli gracz był Atakującym!
                    } else {
                        this.showRunArrow = false;                 // Jeśli gracz bronił – brak strzałki TD, zbieramy wolną piłkę z powietrza
                    }
                    this.pendingRunArrow = false;
                } else {
                    // POPRAWKA UX: Efekty znikają dokładnie w momencie uderzenia bota o ziemię, a on od razu płynnie wstaje (animacja 0.3s)!
                    this.bot.stunTimer = 0.3; 
                    this.bot.isWaitingForScrumRecovery = false;
                    this.bot.knockbackTimer = 0;
                }
            }
            dt *= 0.20; // Aplikacja 5-krotnego kinowego zwolnienia klatek
        }

        // Odliczanie timerów HUD w czasie rzeczywistym
        if (this.scrumSpecialTextTimer > 0 && this.scrumSpecialSlowMoTimer <= 0) this.scrumSpecialTextTimer -= realDt;
        if (this.scrumSpecialFlashTimer > 0) this.scrumSpecialFlashTimer -= realDt;

        // ========================================================================
        // NOWOŚĆ: AKTUALIZACJA SPRĘŻYNOWANIA I PŁYNNEGO POSTĘPU PASKA SPECIAL ATTACK
        // ========================================================================
        let targetProgress = 0.1 + (this.scrumComboCount / 5) * 0.9; // Skalowanie 10% - 100%
        if (this.scrumSpecialSlowMoTimer > 0) {
            targetProgress = 1.0; // Trzymaj pełny stan podczas szarży specjalnej
        }
        if (this.scrumBarErrorTimer > 0) {
            this.scrumBarErrorTimer -= realDt;
            targetProgress = 0.1; // Dąż do bazy 10% podczas kary
        }
        // Płynna, organiczna interpolacja postępu
        this.scrumVisualProgress += (targetProgress - this.scrumVisualProgress) * realDt * 7.5;

        // 1. Fizyka wahadła (Tłumione drgania obrotowe paska)
        const kAngle = 190; // Sztywność sprężyny wahadła
        const dAngle = 11;  // Współczynnik tłumienia drgań
        const accAngle = -kAngle * this.scrumBarBounceAngle - dAngle * this.scrumBarBounceVelAngle;
        this.scrumBarBounceVelAngle += accAngle * realDt;
        this.scrumBarBounceAngle += this.scrumBarBounceVelAngle * realDt;

        // 2. Fizyka kompresji pionowej (Elastyczny skok góra/dół)
        const kY = 170;     // Sztywność pionowa
        const dY = 13;      // Tłumienie pionowe
        const accY = -kY * this.scrumBarBounceY - dY * this.scrumBarBounceVelY;
        this.scrumBarBounceVelY += accY * realDt;
        this.scrumBarBounceY += this.scrumBarBounceVelY * realDt;

// FINAŁOWE SLOW MOTION: Jeśli walka w klinczu właśnie się zakończyła,
        // drastycznie spowolniamy upływ czasu (ok. 8-krotnie), aby pokazać epickie uderzenie i bezwładny upadek postaci.
        if (this.scrumSlowMoTimer > 0) {
            dt *= 0.12; // Mnożnik spowolnienia (0.12). Fizyka i cząsteczki poruszają się jak w gęstym syropie!
            this.scrumSlowMoTimer -= dt;
            if (this.scrumSlowMoTimer <= 0) {
                this.scrumSlowMoTimer = 0;
                // POPRAWKA: Aktywację strzałki i tekstu delegujemy niżej, do klatki pełnego zoom-outu kamery!
            }
        }

        // Aktualizacja timera bezpieczeństwa dla paska wykopu
        if (this.kickInputLockout > 0) {
            this.kickInputLockout -= dt;
            if (this.kickInputLockout < 0) this.kickInputLockout = 0;
        }

        if (this.lastGameWidth !== GAME_WIDTH) {
            this.handleResize(this.lastGameWidth, GAME_WIDTH);
            this.lastGameWidth = GAME_WIDTH;
        }

        // POPRAWKA CZASU: Używamy czystego realDt do odejmowania czasu meczu, dzięki czemu zegar płynie równomiernie niezależnie od klinczów i slow-motion!
        if (this.timeLeft > 0 && this.subState !== GameSubState.CELEBRATION && this.subState !== GameSubState.COUNTDOWN) {
            this.timeLeft -= realDt;
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

        // GENEROWANIE SMUGI KOMETY (Dynamiczne uwalnianie cząsteczek ognia za piłką)
        if (this.ball.flameColor !== 'NONE') {
            for (let i = 0; i < 3; i++) { // Spawnuje 3 cząsteczki na klatkę, tworząc gęsty ogon komety
                this.particles.push({
                    pos: new Vector2(
                        this.ball.pos.x + this.ball.size.x / 2 + (Math.random() - 0.5) * 12,
                        this.ball.pos.y + this.ball.size.y / 2 + (Math.random() - 0.5) * 12
                    ),
                    // Nadajemy cząsteczkom pęd przeciwny do kierunku lotu piłki
                    vel: new Vector2(
                        -this.ball.vel.x * 0.2 + (Math.random() - 0.5) * 120,
                        -this.ball.vel.y * 0.2 + (Math.random() - 0.5) * 120
                    ),
                    life: 0.22 + Math.random() * 0.28,
                    type: this.ball.flameColor === 'PURPLE' ? 'flame_purple' : 'flame_blue'
                });
            }
        }
        
        if (this.fumbleProtectTimer > 0) {
            this.fumbleProtectTimer -= dt;
        }

        if (this.subState === GameSubState.COUNTDOWN) {
            if (this.countdownTimer === 3 && this.lastCountdownSecond === 3) {
                playSFX('countdown');
            }
            
            this.countdownTimer -= dt;
            
            const currentSecond = Math.ceil(this.countdownTimer);
            if (currentSecond < this.lastCountdownSecond && currentSecond > 0) {
                playSFX('countdown');
                this.lastCountdownSecond = currentSecond;
            }

            this.ball.updatePhysics(dt, [this.player, this.bot]);
            if (this.countdownTimer <= 0) {
                this.showPlayerArrow = false; // Strzałka nad graczem znika bezpowrotnie w ułamku sekundy wystrzału piłki
                playSFX('kickoff');
                this.subState = GameSubState.KICKOFF_LAUNCH;
                this.ball.allowCeilingBounce = false;
                this.ball.vel.y = -800; // Launch high
                this.ball.onGround = false;
                this.ballOscillateCenter = GAME_WIDTH / 2 - this.ball.size.x / 2;
                this.ballOscillatePhase = 0; // Gwarantuje start od 0 (brak teleportacji)
                
                // LOSOWANIE KIERUNKÓW (lewo/prawo dla każdej z sub-fal)
                this.kickoffAmps = [
                    Math.random() > 0.5 ? 1 : -1,
                    Math.random() > 0.5 ? 1 : -1,
                    Math.random() > 0.5 ? 1 : -1
                ];
                
                // LOSOWANIE CZĘSTOTLIWOŚCI (zmienny chaos ruchu)
                this.kickoffFreqs = [
                    1.2 + Math.random() * 1.0, // Zamiast sztywnego 1.7
                    0.5 + Math.random() * 0.6  // Zamiast sztywnego 0.8
                ];

                this.ball.flameColor = 'PURPLE'; // ZAPALENIE FIOLETOWEGO OGNIA tuż przed wystrzałem
                this.acquiredMessage = "CATCH THE BALL";
            }
            // Ensure characters are locked
            this.player.dirX = 0;
            this.bot.dirX = 0;
            this.player.vel.x = 0;
            this.bot.vel.x = 0;
        } else if (this.subState === GameSubState.CELEBRATION) {
            // Player and bot shouldn't move
            this.player.dirX = 0;
            this.bot.dirX = 0;
            this.player.vel.x = 0;
            this.bot.vel.x = 0;
            this.ball.updatePhysics(dt, [this.player, this.bot]);
            this.updateBot(dt); // bot needs to evaluate CELEBRATION internally to stop
        } else if (this.subState === GameSubState.BALL_ACQUIRED) {
            // Both are retreating to positions
            if (this.player.isAtRetreatPos && this.bot.isAtRetreatPos) {
                 this.player.dirX = 0;
                 this.bot.dirX = 0;
                 this.player.vel.x = 0;
                 this.bot.vel.x = 0;
                 
                 if (this.freeBallTimer === 0) {
                     playSFX('whistle');
                 }
                 
                 this.freeBallTimer += dt;
                 
                 if (this.freeBallTimer > 1.0) {
                     this.subState = GameSubState.REGULAR;
                     this.player.isRetreating = false;
                     this.bot.isRetreating = false;
                     this.botAvoidTimer = 0.2; // slight delay before engaging
                     this.acquiredMessage = null; // Clear
                     this.acquiredMessage2 = null;
                 } else if (this.freeBallTimer > 0.0) {
                     this.acquiredMessage = "HIT OPPONENT!"; // Jasny, bojowy komunikat dla graczy
                     this.acquiredMessage2 = null;
                     
                     // GWARANTOWANA BLOKADA UCIECZKI: Gracz na tym etapie zmierza w prawo. 
                     // Jeśli próbuje wciskać strzałkę w lewo (w tył) – zerujemy jego intencję i pęd.
                     if (this.player.dirX < 0) {
                         this.player.dirX = 0;
                     }
                     if (this.player.vel.x < 0) {
                         this.player.vel.x = 0;
                     }
                 }
            }
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
        
        // Determine facing directions
        if (this.subState === GameSubState.REGULAR || this.subState === GameSubState.KICKING || this.subState === GameSubState.COUNTDOWN || this.subState === GameSubState.CELEBRATION || this.subState === GameSubState.BALL_ACQUIRED || this.subState === GameSubState.SCRUM_MATRIX || this.subState === GameSubState.FREE_BALL) {
            
            // Attacker always faces their goal. Defender always faces attacker.
            if (this.player.role === PlayerRole.ATTACKER) {
                if (this.player.stunTimer <= 0 && !this.player.isWaitingForScrumRecovery && (!this.player.isRetreating || this.player.isAtRetreatPos)) {
                    // POPRAWKA: Jeśli gracz wygrał klincz i zawraca (biegnie w lewo), obracamy jego grafikę zgodnie z wcisków klawiszy!
                    this.player.facingX = this.player.dirX !== 0 ? this.player.dirX : 1; 
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
        
        // Handle SCRUM_MATRIX state (Dynamiczna, sportowa walka QTE o wysokiej intensywności)
        if (this.subState === GameSubState.SCRUM_MATRIX) {
            this.scrumTimer += dt;
            
            // POPRAWKA: Przeciwnik wykonuje teraz potężny atak cyklicznie co 1.2 sekundy (zamiast 2.0s), zwiększając wyzwanie!
            const lastInterval = Math.floor((this.scrumTimer - dt) / 1.2);
            const currentInterval = Math.floor(this.scrumTimer / 1.2);
            if (currentInterval > lastInterval && this.scrumTimer > 0.5) {
                this.scrumTargetOffset -= 80; 
                this.bot.scrumPushTimer = 0.35; 
                this.spawnParticles(this.bot.pos.x + this.bot.size.x/2, this.bot.pos.y, 'miss', 15);
                this.screenShake = 0.4;
                playSFX('hit');
                
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate([160, 60, 100]);
                }
            }

            // POPRAWKA UX: Podczas trwania szarży Special Attack oraz gdy bot leży powalony na ziemi,
            // całkowicie wyłączamy i ukrywamy prompte QTE oraz strzałki, dając czas na odtworzenie animacji leżenia i wstawania.
            if (this.scrumSpecialSlowMoTimer > 0 || this.bot.stunTimer > 0) {
                this.scrumPrompt = null;
                this.scrumPromptTimer = 0.2; 
            } else {
                // Minigame logic
                this.scrumPromptTimer -= dt;
                if (this.scrumPrompt === null) {
                    if (this.scrumPromptTimer <= 0) {
                        this.scrumPrompt = Math.random() > 0.5 ? 'PUSH' : 'HOLD';
                        this.scrumPromptTimer = 0.48; 
                        this.scrumBotPressDelay = 0.16 + Math.random() * 0.18; 
                        this.player.scrumCharging = false; 
                        this.bot.scrumCharging = false;
                    }
                } else {
                    // Bot podejmuje działanie, jeśli gracz go nie wyprzedził
                    if (!this.bot.scrumCharging && this.scrumPromptTimer <= 0.48 - this.scrumBotPressDelay) {
                        this.bot.scrumCharging = true;
                        if (Math.random() > 0.25) { 
                            this.resolveScrumAction(this.bot, this.scrumPrompt, true);
                        } else {
                            this.resolveScrumAction(this.bot, this.scrumPrompt === 'PUSH' ? 'HOLD' : 'PUSH', true);
                        }
                    }
                    
                    // TIMEOUT / KARA ZA BEZCZYNNOŚĆ
                    if (this.scrumPromptTimer <= 0) {
                        this.scrumTargetOffset -= 46; 
                        this.spawnParticles(this.player.pos.x + this.player.size.x/2, this.player.pos.y, 'miss', 5);
                        this.scrumPrompt = null;
                        this.scrumPromptTimer = 0.15; 
                    }
                }
            }
            
            // ========================================================================
            // REWOLUCJA: INŻYNIERIA PŁYNNEGO RUCHU (Smooth Linear Interpolation)
            // ========================================================================
            const slideVelocity = this.scrumSpecialSlowMoTimer > 0 ? 5.5 : 8.5;
            this.scrumOffset += (this.scrumTargetOffset - this.scrumOffset) * realDt * slideVelocity;

            // Wiggle players and apply offset
            const pushWiggle = Math.sin(this.scrumTimer * 20) * 5;
            const playerIsLeft = this.player.pos.x < this.bot.pos.x;
            const actualOffset = playerIsLeft ? this.scrumOffset : -this.scrumOffset;
            
            const targetMidX = this.scrumStartX + actualOffset;
            
            this.player.pos.x = targetMidX - (playerIsLeft ? this.player.size.x/2 + 15 : -this.player.size.x/2 - 15) + pushWiggle;
            this.bot.pos.x = targetMidX - (!playerIsLeft ? this.bot.size.x/2 + 15 : -this.bot.size.x/2 - 15) - pushWiggle;
            
            // POPRAWKA INTERPOLACJI I SYLWETEK: Gdy bot leży lub trwa atut specjalny, wyłączamy drgania struggleWobble
            // oraz całkowicie zerujemy prędkość podczas leżenia/wstawania, aby updatePhysics nie powodował przeskakiwania pozycji!
            const isSpecialOrStunned = this.scrumSpecialSlowMoTimer > 0 || this.bot.stunTimer > 0;
            const struggleWobble = isSpecialOrStunned ? 0 : Math.sin(this.scrumTimer * 28) * 90;
            this.player.vel.x = ((this.scrumTargetOffset - this.scrumOffset) * slideVelocity) + struggleWobble;
            
            if (this.scrumSpecialSlowMoTimer > 0) {
                this.bot.vel.x = 280; // Stabilna dodatnia prędkość w trakcie lotu w tył
            } else if (this.bot.stunTimer > 0) {
                this.bot.vel.x = 0;   // POPRAWKA: Trzymamy bota idealnie w punkcie zderzenia bez dryfowania fizyki klatek!
            } else {
                this.bot.vel.x = -(this.scrumTargetOffset - this.scrumOffset) * slideVelocity - struggleWobble;
            }
            
            // POPRAWKA: Blokujemy automatyczne, standardowe wywołanie końca klinczu w trakcie trwania Special Attack,
            // zapobiegając ucinaniu animacji, teleportacji bota oraz niespodziewanemu upuszczaniu piłki na ziemię.
            if (this.scrumSpecialSlowMoTimer <= 0) {
                if (Math.abs(this.scrumOffset) >= this.scrumWinOffset) {
                    const playerWon = this.scrumOffset > 0;
                    this.resolveScrumWinner(playerWon);
                }
            }
        } // To zamyka blok SCRUM_MATRIX
        
        if (this.subState === GameSubState.THE_SNAP || this.subState === GameSubState.FREE_BALL || this.subState === GameSubState.KICKOFF_LAUNCH) {
            if (this.subState === GameSubState.KICKOFF_LAUNCH) {
                this.ballOscillatePhase += dt * 4.0;
                this.ball.updatePhysics(dt, [this.player, this.bot]); 
                
                let chaoticX = this.ballOscillateCenter 
                    + Math.sin(this.ballOscillatePhase) * (GAME_WIDTH * 0.25) * this.kickoffAmps[0]
                    + Math.sin(this.ballOscillatePhase * this.kickoffFreqs[0]) * (GAME_WIDTH * 0.15) * this.kickoffAmps[1]
                    + Math.sin(this.ballOscillatePhase * this.kickoffFreqs[1]) * (GAME_WIDTH * 0.1) * this.kickoffAmps[2];
                
                this.ball.pos.x = Math.max(0, Math.min(GAME_WIDTH - this.ball.size.x, chaoticX));
                
                if (this.ball.pos.y >= GROUND_Y - this.ball.size.y) {
                    this.freeBallTimer = 0;
                    this.subState = GameSubState.FREE_BALL; 
                    this.fumbleProtectTimer = 0.35; 
                    this.ball.allowCeilingBounce = true;
                    this.ball.vel.y = -675; 
                    
                    let dynamicXShot = (Math.random() - 0.5) * 900;
                    const pDist = Math.abs((this.player.pos.x + this.player.size.x/2) - (this.ball.pos.x + this.ball.size.x/2));
                    const bDist = Math.abs((this.bot.pos.x + this.bot.size.x/2) - (this.ball.pos.x + this.ball.size.x/2));
                    
                    if (pDist < bDist && pDist < 200) {
                        dynamicXShot = (this.ball.pos.x > this.player.pos.x ? 1 : -1) * (400 + Math.random() * 400);
                    } else if (bDist < pDist && bDist < 200) {
                        dynamicXShot = (this.ball.pos.x > this.bot.pos.x ? 1 : -1) * (400 + Math.random() * 400);
                    }
                    
                    this.ball.vel.x = dynamicXShot;
                }
            } else {
                if (this.subState === GameSubState.FREE_BALL) {
                    this.freeBallTimer += dt;
                    if (this.freeBallTimer > 8.0) {
                        this.ball.bounciness = 0.0;
                    } else {
                        this.ball.bounciness = 1.0 - (this.freeBallTimer / 8.0) * 0.6;
                    }
                }
                this.ball.updatePhysics(dt, [this.player, this.bot]);
            }
            
            const canCatch = this.subState !== GameSubState.KICKOFF_LAUNCH && this.fumbleProtectTimer <= 0;
            const pTouch = canCatch && this.player.stunTimer <= 0 && !this.player.isWaitingForScrumRecovery && this.checkAABB(this.player, this.ball);
            const bTouch = canCatch && this.bot.stunTimer <= 0 && !this.bot.isWaitingForScrumRecovery && this.checkAABB(this.bot, this.ball);
            
            if (pTouch || bTouch) {
                if (this.subState === GameSubState.KICKOFF_LAUNCH) {
                    this.subState = GameSubState.REGULAR;
                }
                if (pTouch && bTouch) {
                    this.assignBall(this.player, this.bot);
                } else if (pTouch) {
                    this.assignBall(this.player, this.bot);
                } else if (bTouch) {
                    this.assignBall(this.bot, this.player);
                }
            }
        } else if (this.subState === GameSubState.REGULAR || this.subState === GameSubState.KICKING || this.subState === GameSubState.BALL_ACQUIRED || this.subState === GameSubState.SCRUM_MATRIX || this.subState === GameSubState.TACKLE_RESOLVE || (this.subState === GameSubState.CELEBRATION && this.celebrationMessage.includes("TOUCHDOWN"))) {
            const attacker = this.player.role === PlayerRole.ATTACKER ? this.player : this.bot;
            
            if (this.isExtraPointAttempt && this.subState === GameSubState.KICKING) {
                this.ball.pos.set(
                    attacker.pos.x + (attacker.facingX > 0 ? attacker.size.x + 5 : -this.ball.size.x - 5),
                    GROUND_Y - this.ball.size.y
                );
            } else {
                this.ball.pos.set(
                    attacker.pos.x + (attacker.facingX > 0 ? attacker.size.x * 0.6 : -this.ball.size.x * 0.1),
                    attacker.pos.y + 10
                );
            }

            if (this.isChargingKick) {
                this.kickHoldTimer += dt;
                this.kickPower += this.kickDir * dt * (100 / 0.8); 
                if (this.kickPower > 100) { 
                    this.kickPower = 100;
                    this.kickDir = -1; 
                } else if (this.kickPower < 0) {
                    this.kickPower = 0;
                    this.kickDir = 1; 
                }
            }

    // POPRAWKA: Ograniczamy detekcję strefy punktowej ściśle do stanu REGULAR. 
            // Zapobiega to natychmiastowemu zaliczeniu przyłożenia w momencie podniesienia z ziemi upuszczonej piłki (fumble) bezpośrednio w endzone.
            if (this.subState === GameSubState.REGULAR) {
                if (attacker === this.player && attacker.pos.x + attacker.size.x >= GAME_WIDTH - 42) {
                    this.scoreTouchdown(this.player);
                } else if (attacker === this.bot && attacker.pos.x <= 42) {
                    this.scoreTouchdown(this.bot);
                }
            }

        } else if (this.subState === GameSubState.BALL_IN_AIR) {
            this.ball.updatePhysics(dt, [this.player, this.bot]);
            
            if (this.ball.pos.y >= GROUND_Y - this.ball.size.y) {
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
        
        if (this.subState === GameSubState.SCRUM_MATRIX) {
            const zoomProgress = Math.min(1.0, this.scrumTimer / 0.3);
            const ease = 1 - Math.pow(1 - zoomProgress, 3); 
            const targetScale = 1.25;
            this.cameraZoom = 1.0 + (targetScale - 1.0) * ease;
            
            let targetCenterX = this.scrumStartX;
            const targetCenterY = GROUND_Y - 50;
            
            const halfW = (GAME_WIDTH / 2) / targetScale;
            if (targetCenterX < halfW) targetCenterX = halfW;
            if (targetCenterX > GAME_WIDTH - halfW) targetCenterX = GAME_WIDTH - halfW;
            
            this.cameraX = this.scrumCameraStartX + (targetCenterX - this.scrumCameraStartX) * ease;
            this.cameraY = this.scrumCameraStartY + (targetCenterY - this.scrumCameraStartY) * ease;
        } else if (this.scrumSlowMoTimer > 0) {
            const targetScale = 1.25;
            this.cameraZoom = targetScale;
            
            let targetCenterX = (this.player.pos.x + this.bot.pos.x + this.player.size.x) / 2;
            const targetCenterY = GROUND_Y - 50;
            
            const halfW = (GAME_WIDTH / 2) / targetScale;
            if (targetCenterX < halfW) targetCenterX = halfW;
            if (targetCenterX > GAME_WIDTH - halfW) targetCenterX = GAME_WIDTH - halfW;
            
            this.cameraX = targetCenterX;
            this.cameraY = targetCenterY;
    } else {
            if (this.cameraZoom > 1.0) {
                this.cameraZoom -= dt * 2.0;
                if (this.cameraZoom < 1.0) {
                    this.cameraZoom = 1.0;
                    
                    // POPRAWKA: W ułamku sekundy, w którym kamera kończy zoom-out boiska, aktywujemy buforowane napisy i strzałki TD!
                    setBGM('board');
                    if (this.pendingAcquiredMessage) {
                        this.acquiredMessage = this.pendingAcquiredMessage;
                        this.pendingAcquiredMessage = null;
                    }
                    if (this.pendingRunArrow) {
                        this.showRunArrow = true;
                        this.pendingRunArrow = false;
                    }
                    // Jeśli to bot wygrał starcie jako Atakujący, odpalamy mu 1-sekundowy licznik zamrożenia pozycji
                    if (this.bot.role === PlayerRole.ATTACKER && this.subState === GameSubState.REGULAR && !this.matchFinished) {
                        this.botTouchdownDelayTimer = 1.0;
                    }
                }
                
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
        
        // Zmiana logiki kroku na ciągłą ocenę prędkości (Global Step Sound)
        const isPlayerRunning = this.player.onGround && Math.abs(this.player.vel.x) > 20 && !this.player.isTackling;
        const isBotRunning = this.bot.onGround && Math.abs(this.bot.vel.x) > 20 && !this.bot.isTackling;
        
        const validRunningStates = [
            GameSubState.REGULAR, 
            GameSubState.THE_SNAP, 
            GameSubState.FREE_BALL, 
            GameSubState.BALL_IN_AIR, 
            GameSubState.KICKING
        ];
        const shouldPlayStep = (isPlayerRunning || isBotRunning) && validRunningStates.includes(this.subState) && !this.matchFinished;
        setStepSoundActive(shouldPlayStep);

        const shouldPlayGrunt = (isPlayerRunning || isBotRunning) && this.subState === GameSubState.KICKOFF_LAUNCH && !this.matchFinished;
        setGruntSoundActive(shouldPlayGrunt);
    }
    
   updateBot(dt: number) {
        if (this.bot.stunTimer > 0 || this.bot.isRetreating) return;
        
        // POPRAWKA: Bezwzględne zatrzymanie i zerowanie pędów bota przez 1 sekundę po zoom-outu, dające graczowi pełny czas na reakcję!
        if (this.botTouchdownDelayTimer > 0) {
            this.botTouchdownDelayTimer -= dt;
            if (this.botTouchdownDelayTimer < 0) this.botTouchdownDelayTimer = 0;
            this.bot.dirX = 0;
            this.bot.vel.x = 0;
            return;
        }

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
        this.subState = GameSubState.BALL_ACQUIRED;
        this.freeBallTimer = 0; // Use as wait timer during retreat
        this.ball.bounciness = 0.75; // reset
        
        // NATYCHMIASTOWE WYGASZENIE: Wyłączamy ogień oraz smugę komety w ułamku sekundy,
        // w którym jakikolwiek zawodnik przejmie posiadanie nad piłką.
        this.ball.flameColor = 'NONE'; 
        
        this.spawnParticles(attacker.pos.x, attacker.pos.y, 'pickup');
        playSFX('catch');
        
        defender.isWaitingForScrumRecovery = false;
        defender.stunTimer = 0;
        defender.isRetreating = true;
        
        attacker.isWaitingForScrumRecovery = false;
        attacker.stunTimer = 0;
        attacker.isRetreating = true;

this.acquiredMessage = "Prepare for the clash";
        this.acquiredMessage2 = null;
        this.botAvoidTimer = 1.0; // Wait a moment before chasing
        this.showRunArrow = false; // Strzałka znika, gdy wracamy do standardowej rozgrywki
    }
    
startScrum() {
    this.scrumVisualProgress = 0.1;
this.scrumBarBounceY = 0;
this.scrumBarBounceVelY = 0;
this.scrumBarBounceAngle = 0;
this.scrumBarBounceVelAngle = 0;
this.scrumBarErrorTimer = 0;
    this.isSpecialAttackWinning = false;
    this.scrumSpecialSlowMoTimer = 0;
    this.scrumComboCount = 0;
this.scrumSpecialFlashTimer = 0;
this.scrumSpecialTextTimer = 0;
        this.subState = GameSubState.SCRUM_MATRIX;
        setBGM('scrum');
        playSFX('hit');
        this.acquiredMessage = null; // Clear message
        this.scrumTimer = 0;
        
        // MOMENT 1: Potężne tąpnięcie silniczka wibracji w klatce, w której zawodnicy wpadają na siebie
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(250); 
        }
        this.scrumPromptTimer = 0.4; // Krótka pauza (0.4s) na ustabilizowanie kamery zoom-in przed pierwszym promptem
        this.scrumPrompt = null;
        this.scrumCameraStartX = this.cameraX;
        this.scrumCameraStartY = this.cameraY;
        
        // Let them stay right where they collided!
        const leftPlayer = this.player.pos.x < this.bot.pos.x ? this.player : this.bot;
        const rightPlayer = leftPlayer === this.player ? this.bot : this.player;
        
        const midX = (leftPlayer.pos.x + rightPlayer.pos.x + rightPlayer.size.x) / 2;
        this.scrumStartX = midX;
        
        // ODWZOROWANIE STANU PLANSZY: Obliczamy przewagę pozycyjną na bazie odległości punktu zderzenia od środka pola.
        // Jeśli zderzenie nastąpiło na Twojej połowie (midX < środek), wystartujesz z ujemnym offsetem (bliżej przegranej).
        const fieldCenter = GAME_WIDTH / 2;
        const positionAdvantage = (midX - fieldCenter) * 0.55; // Przelicznik odległości
        
      // Clampujemy przewagę do max -120 lub +120 (próg wygranej to 250), aby słabsza pozycja dawała znaczący debuff, ale NIGDY insta-win dla bota.
        this.scrumOffset = Math.max(-120, Math.min(120, positionAdvantage));
        this.scrumTargetOffset = this.scrumOffset; // POPRAWKA: Stabilizacja celu na starcie klinczu
        
        // Just neatly pack them at the collision point
        leftPlayer.pos.x = midX - leftPlayer.size.x/2 - 15;
        rightPlayer.pos.x = midX - rightPlayer.size.x/2 + 15;
        
        this.player.vel.set(0, 0);
        this.bot.vel.set(0, 0);
        
        // Czyścimy flagi akcji (używamy nieużywanych pól do kontrolowania jednorazowego kliknięcia na dany prompt)
        this.player.scrumCharging = false;
        this.bot.scrumCharging = false;
    }
    
resolveScrumAction(actingPlayer: Player, action: 'PUSH' | 'HOLD', isBot: boolean = false): boolean | void {
        // ANTIDOTUM NA INPUT BLEED: Jeśli nie ma wyświetlonego napiszu na ekranie, całkowicie ignorujemy wszelkie kliknięcia/strzałki
        if (this.subState !== GameSubState.SCRUM_MATRIX || this.scrumPrompt === null) return;
        
        // Zapamiętujemy czy ruch był poprawny przed skasowaniem promptu
        const isActionCorrect = this.scrumPrompt === action;
        
        // SFX: 'hit' for player action (correct or incorrect) or any bot action
        playSFX('hit');

        // Zabezpieczenie przed spamowaniem i przytrzymywaniem: jeden zawodnik może wykonać tylko JEDNĄ akcję na jedno okienko promptu
        if (actingPlayer.scrumCharging) return;
        actingPlayer.scrumCharging = true; 
        
        const pushAmount = 32; 
        
if (isActionCorrect) {
            // Prawidłowy refleks!
            actingPlayer.scrumPushTimer = 0.35; 
            if (actingPlayer === this.player) {
                this.scrumComboCount++;
                let finalPush = pushAmount;

                // NALICZENIE IMPULSU DRGAŃ DLA POPRAWNEGO KLIKNIĘCIA (Mały, sprężysty bounce i wahadło)
                this.scrumBarBounceVelY = 24;       
                this.scrumBarBounceVelAngle = 1;    

                if (this.scrumComboCount >= 5) {
                    this.scrumComboCount = 0;
                    finalPush = pushAmount * 3.6;        
                    this.scrumSpecialFlashTimer = 1.0;   
                    this.scrumSpecialTextTimer = 0.75;   
                    this.scrumSpecialSlowMoTimer = 0.75; 
                    
                    // POTĘŻNY IMPULS ELASTYCZNEJ EKSPLOZJI (Kolosalna kompresja i zwrot wahadłowy paska przy 100%)
                    this.scrumBarBounceVelY = 80;       
                    this.scrumBarBounceVelAngle = 8;    
                    
                    this.bot.vel.x = 280; 
                    
                    if (Math.abs(this.scrumTargetOffset + finalPush) >= this.scrumWinOffset) {
                        this.isSpecialAttackWinning = true;
                    }
                    
                    playSFX('special_attack', 2);
                    playSFX('cheer');
                    this.screenShake = 0.8;
                    
                    // Optymalizacja cząsteczek: wybuch płomieni idealnie wokół geometrycznych granic nowego paska!
                    this.spawnParticles(actingPlayer.pos.x + actingPlayer.size.x/2, actingPlayer.pos.y, 'touchdown', 20);
                    this.spawnParticles(GAME_WIDTH / 2 - 140, GAME_HEIGHT - 48, 'touchdown', 15);
                    this.spawnParticles(GAME_WIDTH / 2 + 140, GAME_HEIGHT - 48, 'touchdown', 15);
                }

                this.scrumTargetOffset += finalPush; 
                this.spawnParticles(actingPlayer.pos.x + actingPlayer.size.x/2, actingPlayer.pos.y, 'perfect', 10);
            } else {
                this.scrumTargetOffset -= pushAmount;
                this.spawnParticles(actingPlayer.pos.x + actingPlayer.size.x/2, actingPlayer.pos.y, 'miss', 10);
            }
        } else {
            // Pudło / Zły przycisk!
            if (actingPlayer === this.player) {
                // IMPULS KARY (Aktywacja czerwieni i silne, szarpnięte, negatywne odbicie paska w górę i w lewo)
                this.scrumBarErrorTimer = 0.65;      
                this.scrumBarBounceVelY = -340;      
                this.scrumBarBounceVelAngle = -35;   
                
                this.scrumComboCount = 0; 
                this.scrumTargetOffset -= pushAmount; 
                this.bot.scrumPushTimer = 0.35; 
                this.spawnParticles(actingPlayer.pos.x + actingPlayer.size.x/2, actingPlayer.pos.y, 'miss', 10);
                this.spawnParticles(GAME_WIDTH / 2, GAME_HEIGHT - 48, 'miss', 15); // Rozbłysk błędu na pasku
                
                if (typeof navigator !== 'undefined' && navigator.vibrate) {
                    navigator.vibrate(140);
                }
            } else {
                // Bot popełnił błąd – nagroda dla gracza: popychasz bota do przodu!
                this.scrumTargetOffset += pushAmount;
                this.player.scrumPushTimer = 0.35; 
                this.spawnParticles(actingPlayer.pos.x + actingPlayer.size.x/2, actingPlayer.pos.y, 'hit', 10);
            }
        }
        
        // NATYCHMIASTOWE ZNIKNIĘCIE I REFRESH: Czyścimy aktualny prompt natychmiast po wykonaniu akcji
        this.scrumPrompt = null;
        this.scrumPromptTimer = 0.16; // Bardzo krótka, dynamiczna przerwa (160ms) przed wylosowaniem nowego napisu
        
        return isActionCorrect;
    }
    
resolveScrumWinner(playerWon: boolean, isFromSpecialAttack: boolean = false) {
        if (this.subState !== GameSubState.SCRUM_MATRIX) return;
        this.subState = GameSubState.REGULAR;
        this.scrumSlowMoTimer = 0.4; // Ładujemy 0.4 sekundy czasu gry w zwolnionym tempie (co przełoży się na ok. 3.5 realnych sekund)
        
        if (!isFromSpecialAttack) {
            playSFX('special_attack', 1.0);
        }
        
        const attacker = this.player.role === PlayerRole.ATTACKER ? this.player : this.bot;
        const defender = this.player.role === PlayerRole.DEFENDER ? this.player : this.bot;
        
        const attackerWon = (playerWon && this.player === attacker) || (!playerWon && this.bot === attacker);
        
if (attackerWon) {
            // Attacker wins! Przegrany leży bezwzględnie dopóki touchdown nie zresetuje planszy
            defender.knockbackTimer = 0.4;
            defender.isWaitingForScrumRecovery = true; // Zamiast czasowego stunTimer, blokujemy go flagą recovery na stałe do momentu snap resetu
            defender.stunTimer = 0;
            defender.vel.y = -150; // Bigger bump
            defender.onGround = false;
            defender.vel.x = (defender.pos.x > attacker.pos.x) ? 300 : -300; // Stronger push
            
            attacker.vel.y = -50;
            attacker.onGround = false;
            attacker.vel.x = (attacker.pos.x < defender.pos.x) ? 100 : -100;
            
            // ZABEZPIECZENIE PRZED INSTANT-TOUCHDOWNEM Z TELEPORTACJI
            // Jeśli walka zakończyła się blisko strefy punktowej, odsuwamy zwycięzcę na bezpieczną odległość (150px),
            // dając mu miejsce na wykonanie fizycznego biegu, a graczowi czas na zobaczenie komunikatu ostrzegawczego!
            const runSafetyMargin = 150;
            if (attacker === this.player) {
                if (attacker.pos.x + attacker.size.x > GAME_WIDTH - runSafetyMargin) {
                    attacker.pos.x = GAME_WIDTH - runSafetyMargin - attacker.size.x;
                }
            } else if (attacker === this.bot) {
                if (attacker.pos.x < runSafetyMargin) {
                    attacker.pos.x = runSafetyMargin;
                }
            }
            
this.screenShake = 0.5;
            this.spawnParticles(defender.pos.x, defender.pos.y, 'hit', 20);
            this.botAvoidTimer = 6.0; // Prevent immediate re-tackle after waking up

// POPRAWKA: Komunikaty i intencje strzałek TD przekazujemy do bezpiecznych buforów oczekujących na pełne oddalenie obiektywu boiska
            if (attacker === this.player) {
                this.pendingAcquiredMessage = "GET THE TOUCHDOWN!";
                this.pendingRunArrow = true; 
                this.acquiredMessage = null; // Czyszczenie kadru planszy na czas trwania efektów i slow-motion
            } else {
                this.pendingAcquiredMessage = "OPPONENT GOT TOUCHDOWN";
                this.showRunArrow = false;
                this.pendingRunArrow = false; // POPRAWKA: Całkowicie wyłączamy bufor strzałki – to bot atakuje, gracz ma się bronić!
                this.acquiredMessage = null; // Czyszczenie kadru planszy na czas trwania efektów i slow-motion
            }
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
                    this.ball.vel.y = -675; // Popped out in an arc UP very high
                    this.ball.bounciness = 1.0; // Act like a rubber ball
                    
                    const dirToDefenderHalf = defender === this.player ? -1 : 1;
                    this.ball.vel.x = dirToDefenderHalf * 335 + (Math.random() - 0.5) * 450; 
                    
                    // Wygrana obrońcy (Piłka wystrzeliwuje wysoko w powietrze)
                    if (defender === this.player) {
                        this.acquiredMessage = "CATCH THE BALL";
                    } else {
                        this.acquiredMessage = "OPPONENT CATCHING THE BALL";
                    }
                    this.showRunArrow = false; // Piłka jest wolna, brak strzałki naprowadzającej
                }
    }


    
scoreTouchdown(player: Player) {
        if (player === this.player) {
            this.playerScore += 6;
            this.celebrationMessage = "P1 TOUCHDOWN!";
            playSFX('cheer');
        } else {
            this.botScore += 6;
            this.celebrationMessage = "SWEATYSTEVE TOUCHDOWN!";
            playSFX('boo');
        }
        
        this.subState = GameSubState.CELEBRATION;
        this.acquiredMessage = null;
        this.showRunArrow = false; // NATYCHMIASTOWE UKRYCIE STRZAŁKI PO ZDOBYCIU TOUCHDOWNU (Rozwiązuje problem ze screena)
        this.spawnParticles(player.pos.x, player.pos.y, 'touchdown', 30);
        
        // POPRAWKA HUD: Soczysty wystrzał białych płomieni bezpośrednio wokół właściwej ramki punktowej na górze UI
        const hudX = player === this.player ? 290 : 510;
        this.spawnParticles(hudX, 45, 'touchdown', 40);
        
        if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
        this.celebrationTimeoutId = setTimeout(() => {
            this.isExtraPointAttempt = true;
            this.setupExtraPoint(player);
        }, 3000);
    }

    setupExtraPoint(scoringPlayer: Player) {
        this.subState = GameSubState.KICKING;
        this.ball.onGround = true;
        playSFX('whistle');
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
        attacker.stunTimer = 0; // Attacker needs to kick
        attacker.momentum = 0;
        
        // REGENERACJA PO TOUCHDOWNIE: Bezwzględnie stawiamy obu zawodników na nogi 
        // przed rozpoczęciem procedury rzutu wolnego (extrapoint), aby nikt nie leżał w trakcie wykopu.
        this.player.isWaitingForScrumRecovery = false;
        this.bot.isWaitingForScrumRecovery = false;
        
// AUTOMATYCZNY START PASKA OD RAZU: Kulka w pasku lata sama od pierwszej sekundy
        this.isChargingKick = true;
        this.kickPower = 0;
        this.kickDir = 1;
        this.kickHoldTimer = 0;
        this.kickInputLockout = 0.5; // POPRAWKA: Pół sekundy pancernej blokady przed hoverami i ghost-clickami!
    }
    
scoreFieldGoal(player: Player) {
        // Wyliczamy pozycję ramki UI dla gracza, który właśnie podwyższył wynik
        const hudX = player === this.player ? 290 : 510;

        if (this.isExtraPointAttempt) {
             if (player === this.player) {
                 this.playerScore += 1;
                 this.celebrationMessage = "P1 EXTRA POINT!";
                 playSFX('cheer');
             } else {
                 this.botScore += 1;
                 this.celebrationMessage = "SWEATYSTEVE EXTRA POINT!";
                 playSFX('boo');
             }
             this.spawnParticles(this.ball.pos.x, this.ball.pos.y, 'perfect', 50);
             
             // POPRAWKA HUD: Wystrzał cząsteczek na tablicy wyników po udanym Extra Point (Kick)
             this.spawnParticles(hudX, 45, 'touchdown', 40);

             this.subState = GameSubState.CELEBRATION;
             if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
             this.celebrationTimeoutId = setTimeout(() => this.resetToSnap(), 3000);
             return;
        }
        
        if (player === this.player) {
            this.playerScore += 3;
            this.celebrationMessage = "P1 FIELD GOAL!";
            playSFX('cheer');
        } else {
            this.botScore += 3;
            this.celebrationMessage = "SWEATYSTEVE FIELD GOAL!";
            playSFX('boo');
        }
        
        this.subState = GameSubState.CELEBRATION;
        this.spawnParticles(this.ball.pos.x, this.ball.pos.y, 'fieldgoal', 30);
        
        // POPRAWKA HUD: Wystrzał cząsteczek na tablicy wyników po udanym Field Goal z gry
        this.spawnParticles(hudX, 45, 'touchdown', 40);

        if (this.celebrationTimeoutId) clearTimeout(this.celebrationTimeoutId);
        this.celebrationTimeoutId = setTimeout(() => this.resetToSnap(), 3000);
    }
    
startKick() {
        if (this.player.role !== PlayerRole.ATTACKER || this.player.stunTimer > 0) return;
        if (this.kickInputLockout > 0) return; // OCHRONA: Ignoruj kliknięcia przez pierwsze 500ms

        // KRYTYCZNA POPRAWKA DESKTOP HOVER: Jeśli subState to już KICKING i pasek ładuje się automatycznie,
        // pozwalamy na strzał z przycisku HUD tylko wtedy, gdy kickHoldTimer przekroczy minimalny próg (0.15s).
        // Zapobiega to sytuacjom, w których zwykłe najechanie myszką na desktopie symuluje fałszywy, natychmiastowy klik!
        if (this.subState === GameSubState.KICKING && this.isChargingKick) {
            if (this.kickHoldTimer > 0.15) {
                this.releaseKick();
            }
            return;
        }

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
        // MECHANIKA ONE-CLICK KICK: Pojedyncze naciśnięcie Tackle podczas wykopu natychmiast blokuje moc i odpala piłkę
        if (this.subState === GameSubState.KICKING && this.player.role === PlayerRole.ATTACKER && this.isChargingKick) {
            if (this.kickInputLockout > 0) return; // OCHRONA: Ignoruj kliknięcia przez pierwsze 500ms
            this.releaseKick();
            return;
        }

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
        if (this.kickInputLockout > 0) return; // OCHRONA: Ignoruj kliknięcia przez pierwsze 500ms
        
        // POPRAWKA BEZPIECZEŃSTWA: Jeśli pasek ładował się krócej niż 0.15 sekundy, całkowicie odrzucamy strzał!
        // Zapobiega to automatycznemu, natychmiastowemu "wstrzeleniu" piłki na poziomie 0% mocy przez lingering-input.
        if (this.kickHoldTimer < 0.15) return;

        this.isChargingKick = false;
        playSFX('kick');
        
        // Okienko tolerancji zielonej strefy
        const isPerfect = this.kickPower >= 65 && this.kickPower <= 93;
        this.isPerfectKick = isPerfect;
        
        this.ball.onGround = false;
        this.ball.ignoreWalls = true;
        
        const isPlayer = this.player.role === PlayerRole.ATTACKER;
        const dir = isPlayer ? 1 : -1;
        const startX = isPlayer ? this.player.pos.x : this.bot.pos.x;
        const startY = isPlayer ? this.player.pos.y : this.bot.pos.y;

        if (isPerfect) {
            // Piłka leci wysokim łukiem do bramki, ale bez uderzania w sufit
            this.ball.vel.set(dir * 600, -550); 
            this.spawnParticles(startX, startY, 'perfect', 20);

            // NATYCHMIASTOWE NALICZENIE: +1 punkt, dźwięk cheer i białe płomienie wokół tablicy wyników
            this.scoreFieldGoal(isPlayer ? this.player : this.bot);
        } else {
            // Pudło: brak punktów, piłka turla się po ziemi / krótki lot
            this.subState = GameSubState.BALL_IN_AIR; 
            this.ball.vel.set(dir * 250, -150); 
            this.spawnParticles(startX, startY, 'miss', 10);
        }
    }
    
    popBall() {
        if (this.player.role !== PlayerRole.ATTACKER) return;
        this.player.role = PlayerRole.NEUTRAL;
        this.bot.role = PlayerRole.NEUTRAL;
        
        this.subState = GameSubState.KICKOFF_LAUNCH;
        this.ball.allowCeilingBounce = false;
        this.ball.vel.y = -787; // Launch high
        this.ball.vel.x = 0;
        this.ball.onGround = false;
        this.ballOscillateCenter = this.ball.pos.x;
        this.ballOscillatePhase = Math.random() * Math.PI * 2;
        this.spawnParticles(this.ball.pos.x, this.ball.pos.y, 'pickup', 10);
    }
}

