import { GameWorld, PhysicalBody, Player, Vector2 } from './GameWorld';
import { GAME_WIDTH, GAME_HEIGHT, GROUND_Y } from './constants';
import { getImage, isFallback } from './assets';
import { GameSubState, PlayerRole } from './Types';

export class Renderer {
    ctx: CanvasRenderingContext2D;
    
    constructor(private canvas: HTMLCanvasElement) {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not get 2d context");
        this.ctx = ctx;
        canvas.width = GAME_WIDTH;
        canvas.height = GAME_HEIGHT;
    }
    
    render(world: GameWorld) {
        const { ctx } = this;
        if (ctx.canvas.width !== GAME_WIDTH || ctx.canvas.height !== GAME_HEIGHT) {
            ctx.canvas.width = GAME_WIDTH;
            ctx.canvas.height = GAME_HEIGHT;
            ctx.imageSmoothingEnabled = false; // ensure it stays pixelated if needed
        }
     const now = Date.now();
        
        ctx.save();

 // POPRAWKA BOMBODODPORNA DLA PWA/MOBILE: Wymuszone sprzętowe oczyszczenie rejestrów cieni 
        // na samym starcie klatki. Gwarantuje, że poświata z HUD nie wycieknie do elementów boiska.
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent'; // POPRAWKA: 'transparent' zamiast rgba resetuje bufor sprzętowy GPU na iOS
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.globalCompositeOperation = 'source-over';
        
        // Handle Camera zoom and continuous shake
        if (world.cameraZoom > 1.0) {
            ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
            ctx.scale(world.cameraZoom, world.cameraZoom);
            ctx.translate(-world.cameraX, -world.cameraY);
            
            // Continuous heavy shake during SCRUM_MATRIX
            if (world.subState === 'SCRUM_MATRIX') {
                const mag = 8;
                ctx.translate((Math.random()-0.5)*mag, (Math.random()-0.5)*mag);
            }
        }
        
        if (world.screenShake > 0) {
            const mag = world.screenShake * 10;
            ctx.translate((Math.random()-0.5)*mag, (Math.random()-0.5)*mag);
        }
        
        this.drawStadiumBackground(world);
        
        // Helper to draw Headball stylized player
const drawHeadballPlayer = (
            x: number, y: number, w: number, h: number, 
            primaryColor: string, skinColor: string, 
            stunTimer: number, isDebuff: boolean, 
            isTackling: boolean, isKicking: boolean,
            dirX: number, velX: number,
            onGround: boolean, velY: number,
            knockbackTimer: number = 0,
            spritePrefix: string = ''
        ) => {
            ctx.save();
            
            const scale = w / 40; // Base width was 40
            const isStunned = stunTimer > 0;
            
            // POPRAWKA BEZPIECZEŃSTWA TS: Przenosimy wyliczenie kierunku na samą górę, 
            // dzięki czemu bodyRot widzi zmienną faceDir bez wywoływania błędów kompilacji!
            const faceDir = dirX !== 0 ? dirX : 1;

            let cx = x + w/2;
            let cy = y + h;
            
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            
            let bodyRot = 0;
            if (knockbackTimer > 0) {
                // POPRAWKA MATEMATYCZNA: Dynamicznie dopasowujemy maksymalny czas trwania upadku.
                const maxDuration = world.scrumSpecialSlowMoTimer > 0 ? 0.6 : 0.4;
                let progress = 1.0 - (knockbackTimer / maxDuration);
                if (progress < 0) progress = 0;
                if (progress > 1) progress = 1;

                let rot = (Math.PI / 2) * progress; 
                bodyRot = (velX < 0 ? -rot : rot) * (faceDir >= 0 ? 1 : -1);
                ctx.rotate(bodyRot);
                
                ctx.translate(0, -5 * progress); 
            } else if (isStunned) {
                // Animate get up in the last 0.3 seconds
                let rot = Math.PI/2;
                let progress = 1;
                if (stunTimer < 0.3) {
                    progress = stunTimer / 0.3;
                    rot = (Math.PI/2) * progress;
                }
                bodyRot = rot * (dirX >= 0 ? 1 : -1);
                ctx.rotate(bodyRot);
                ctx.translate(0, -35 * Math.min(1, stunTimer > 0.3 ? 1 : (stunTimer / 0.3) * 3)); 
            } else if (isTackling) {
                bodyRot = (-Math.PI/2.2) * (velX >= 0 ? 1 : -1);
                ctx.rotate(bodyRot);
                ctx.translate(0, -10); // slightly lift body so it doesn't clip into ground
            }
            
            // Override cx and cy for drawing logic since we already translated
            cx = 0;
            cy = 0;
            
 if (isDebuff) {
                ctx.globalAlpha = 0.6;
            }
        
            const runSpeed = isStunned ? 0 : Math.abs(velX);
            const isRunning = runSpeed > 10;
            
            // POPRAWKA: Jeśli rysujemy dużego bota tarana (w > 25), hamujemy ułamkowy licznik cyklu animacji rąk i nóg.
            // Bot zachowa swoją dużą prędkość poziomą na planszy, ale same kończyny będą poruszać się dostojniej i wolniej!
let animSpeedDampen = 1.0;
            if (spritePrefix === 'bot' && w > 25) {
                animSpeedDampen = 0.30; 
            }
            
            let runCycle = 0;
            let idleCycle = 0;
            
            if (world.isGroupQTEActive) {
                runCycle = now * 0.002;
                idleCycle = now * 0.001;
            } else if (world.newPlayerTransitionTimer > 0) {
                if (isRunning) {
                    runCycle = now * 0.002;
                    idleCycle = 0;
                } else {
                    runCycle = 0;
                    idleCycle = now * 0.001;
                }
            } else {
                runCycle = isRunning ? now * 0.015 * (runSpeed / 100) * animSpeedDampen : 0;
                idleCycle = isRunning ? 0 : now * 0.003;
            }
            
            const bounceY = isRunning && !isTackling ? Math.abs(Math.sin(runCycle)) * 12 : Math.sin(idleCycle) * 3;
            
            const headS = 45; 
            const torsoW = 35;
            const torsoH = 40;
            const shoeS = 22;
            const handS = 12;
            const drawH = 80;
            
            const imgHead = spritePrefix ? getImage('sprites.' + spritePrefix + '_head') : null;
            const imgBody = spritePrefix ? getImage('sprites.' + spritePrefix + '_body') : null;
            const imgArmFront = spritePrefix ? getImage('sprites.' + spritePrefix + '_arm_front') : null;
            const imgArmBack = spritePrefix ? getImage('sprites.' + spritePrefix + '_arm_back') : null;
            const imgLegFront = spritePrefix ? getImage('sprites.' + spritePrefix + '_leg_front') : null;
            const imgLegBack = spritePrefix ? getImage('sprites.' + spritePrefix + '_leg_back') : null;

            const drawPart = (img: HTMLImageElement | null, px: number, py: number, defaultSize: number, rotation: number = 0) => {
                if (!img) return false;
                ctx.save();
                ctx.translate(px, py);
                if (faceDir < 0) ctx.scale(-1, 1);
                if (rotation !== 0) {
                    ctx.rotate(rotation * (faceDir < 0 ? -1 : 1));
                }
                const aspect = img.width / img.height;
                ctx.drawImage(img, -defaultSize*aspect/2, -defaultSize/2, defaultSize*aspect, defaultSize);
                ctx.restore();
                return true;
            };
            
            // Legs
            let bLegY = cy - 3 - (isRunning ? Math.max(0, -Math.sin(runCycle) * 8) : 0);
            let bLegX = cx + faceDir * 15 + (isRunning ? faceDir * Math.cos(runCycle) * 10 : 0);
            let bLegRot = isRunning ? Math.cos(runCycle) * Math.PI/8 : 0;
            
            let fLegY = cy - 0 - (isRunning ? Math.max(0, Math.sin(runCycle) * 8) : 0);
            let fLegX = cx + faceDir * -5 + (isRunning ? faceDir * -Math.cos(runCycle) * 10 : 0);
            let fLegRot = isRunning ? -Math.cos(runCycle) * Math.PI/8 : 0;
            
            // Arms
            let bArmY = cy - 30 + bounceY;
            let bArmX = cx + faceDir * 45 + (isRunning ? faceDir * -Math.cos(runCycle) * 10 : 0);
            let bArmRot = isRunning ? -Math.cos(runCycle) * Math.PI/8 : Math.sin(idleCycle) * 0.1;
            
            let fArmY = cy - 25 + bounceY;
            let fArmX = cx + faceDir * -45 + (isRunning ? faceDir * Math.cos(runCycle) * 10 : 0);
            let fArmRot = isRunning ? Math.cos(runCycle) * Math.PI/8 : -Math.sin(idleCycle) * 0.1;
            
            if (isTackling) {
                bLegX = cx + faceDir * 10; bLegY = cy - 3; bLegRot = Math.PI/8;
                fLegX = cx + faceDir * 20; fLegY = cy; fLegRot = -Math.PI/8;
                bArmX = cx + faceDir * 50; bArmY = cy - 25; bArmRot = -Math.PI/4;
                fArmX = cx + faceDir * -10; fArmY = cy - 20; fArmRot = -Math.PI/6;
            } else if (isKicking) {
                fLegX = cx + faceDir * 30; fLegY = cy - 15; fLegRot = -Math.PI/4;
                bArmX = cx + faceDir * 20; bArmRot = Math.PI/6;
                fArmX = cx + faceDir * -60; fArmRot = -Math.PI/6;
            } else if (knockbackTimer > 0 || isStunned) {
                bLegX = cx + faceDir * -10; bLegY = cy - 10; bLegRot = Math.PI/4;
                fLegX = cx + faceDir * 15; fLegY = cy - 5; fLegRot = -Math.PI/6;
                bArmX = cx + faceDir * 10; bArmY = cy - 70; bArmRot = Math.PI/2;
                fArmX = cx + faceDir * -20; fArmY = cy - 15; fArmRot = -Math.PI/2;
            }

            // Back Leg (Shoe) - drawn in front of torso
            if (!drawPart(imgLegBack, bLegX, bLegY, 40, bLegRot)) {
                ctx.fillStyle = '#222'; 
                ctx.beginPath(); ctx.ellipse(bLegX, bLegY, shoeS, shoeS/1.5, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#0ff'; // Neon laces
                ctx.fillRect(bLegX + (faceDir * shoeS*0.3), bLegY - 4, 4, 8);
            }
            
            // Front Leg (Shoe) - drawn in front of back leg
            if (!drawPart(imgLegFront, fLegX, fLegY, 40, fLegRot)) {
                ctx.fillStyle = primaryColor; 
                ctx.beginPath(); ctx.ellipse(fLegX, fLegY, shoeS, shoeS/1.5, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; 
                ctx.fillRect(fLegX - shoeS + 5, fLegY + shoeS/2 - 2, shoeS*2 - 10, 4);
            }

            // Back Arm (drawn behind torso)
            if (!drawPart(imgArmBack, bArmX, bArmY, 40, bArmRot)) {
                ctx.fillStyle = skinColor;
                ctx.beginPath(); ctx.arc(bArmX, bArmY, handS, 0, Math.PI*2); ctx.fill();
            }

            // Torso
            const torsoY = cy - 40 + bounceY * 0.8;
            if (!drawPart(imgBody, cx, torsoY, 75)) {
                ctx.fillStyle = primaryColor;
                ctx.beginPath();
                ctx.roundRect(cx - torsoW/2, cy - drawH + headS + bounceY, torsoW, torsoH, 10);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillRect(cx - torsoW/2 + 5, cy - drawH + headS + 15 + bounceY, torsoW - 10, 8); // Stripe
            }
            
            // Head / Helmet
            const headY = cy - 100 + bounceY;
            const headX = cx + (faceDir * 2); 
            let targetHeadRot = -bodyRot * 0.8 * (faceDir < 0 ? -1 : 1);
            if (isTackling) {
                // TUTAJSZĄ WARTOŚCIĄ (np. 80, 90, etc.) MOŻESZ MANUALNIE USTAWIAĆ ROTACJĘ GŁOWY PRZY WŚLIZGU:
                const manualHeadRotationDegrees = 80;
                
                // Konwersja na radiany (nie ruszaj tego):
                const manualRotRads = manualHeadRotationDegrees * (Math.PI / 180);
                
                // Przypisanie w odpowiednim kierunku:
                targetHeadRot = manualRotRads * (faceDir < 0 ? -1 : 1);
            }
            
            if (!drawPart(imgHead, headX, headY, 85, targetHeadRot)) {
                ctx.save();
                ctx.translate(headX, headY);
                ctx.rotate(targetHeadRot * (faceDir < 0 ? -1 : 1));
                
                ctx.fillStyle = primaryColor; 
                ctx.beginPath(); ctx.arc(0, 0, headS, 0, Math.PI*2); ctx.fill();
                
                // Visor / Face cut
                ctx.fillStyle = skinColor;
                ctx.beginPath(); ctx.arc(faceDir*10, 8, headS - 15, 0, Math.PI*2); ctx.fill();
                
                // Helmet grill
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(faceDir*20, 0);
                ctx.lineTo(faceDir*45, 20);
                ctx.moveTo(faceDir*15, 10);
                ctx.lineTo(faceDir*35, 30);
                ctx.stroke();
                
                // Eye
                ctx.fillStyle = isStunned ? '#ff0000' : '#fff';
                if(isStunned) {
                    ctx.strokeStyle = '#800'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(faceDir*20 - 6, -6); ctx.lineTo(faceDir*20 + 6, 6); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(faceDir*20 + 6, -6); ctx.lineTo(faceDir*20 - 6, 6); ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.arc(faceDir*20, -5, 8, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.beginPath(); ctx.arc(faceDir*(20 + (velX*faceDir>10?3:0)), -5, 3, 0, Math.PI*2); ctx.fill();
                    // Eyebrow
                    ctx.strokeStyle = '#222';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(faceDir*10, - 15);
                    ctx.lineTo(faceDir*28, - 8 + (isTackling?5:0)); // Angrier if tackling
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Front Arm (drawn in front of everything)
            if (!drawPart(imgArmFront, fArmX, fArmY, 40, fArmRot)) {
                ctx.fillStyle = skinColor;
                ctx.beginPath(); ctx.arc(fArmX, fArmY, handS, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; // Sweatband
                ctx.fillRect(fArmX - handS, fArmY - 2, handS*2, 4);
            }
        
            ctx.restore();
        };
        // Draw Player Shadows
  const drawPlayerShadow = (p: Player, stunTimer: number) => {
             let isLaying = p.knockbackTimer > 0 || stunTimer > 0;
             let shadowW = 30; // Blokada powiększania: stały, estetyczny rozmiar cienia
             let shadowH = 7;
             // If jumping, make shadow smaller
             let heightOffGround = Math.max(0, GROUND_Y - (p.pos.y + p.size.y));
             shadowW = Math.max(15, shadowW - heightOffGround / 5);
             shadowH = Math.max(3, shadowH - heightOffGround / 10);
             
     ctx.save();
             ctx.globalCompositeOperation = 'source-over';
             ctx.shadowBlur = 0;
             ctx.shadowOffsetX = 0; 
             ctx.shadowOffsetY = 0; 
             ctx.shadowColor = 'transparent'; // POPRAWKA: Siłowe odpięcie warstwy cieniowania na smartfonach
             
             ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'; // Przyciemniony, prześwitujący cień (zgodnie z prośbą)
             ctx.beginPath();
             ctx.ellipse(p.pos.x + p.size.x/2, GROUND_Y + 6, shadowW, shadowH, 0, 0, Math.PI*2);
             ctx.fill();
             ctx.restore();
        };

 const botEffectiveStun = world.bot.isWaitingForScrumRecovery ? 1.0 : world.bot.stunTimer;
        const pEffectiveStun = world.player.isWaitingForScrumRecovery ? 1.0 : world.player.stunTimer;
        
        // POPRAWKA BOMBODODPORNA: Dodanie weryfikacji współrzędnej Y (> 0) całkowicie eliminuje ghost-cienie ukrytych postaci pod planszą
if (world.bot.pos.x > -100 && world.bot.pos.x < GAME_WIDTH + 100 && world.bot.pos.y > 0) {
            drawPlayerShadow(world.bot, botEffectiveStun);
        }
        if (world.player.pos.x > -100 && world.player.pos.x < GAME_WIDTH + 100 && world.player.pos.y > 0) {
            drawPlayerShadow(world.player, pEffectiveStun);
        }

        // Deklarujemy zmienną bezpiecznie tylko RAZ na samym szczycie
        const frenzyBots: Player[] = (world as any).frenzyBots || [];
        for (const fBot of frenzyBots) {
            if (fBot.pos.x > -100 && fBot.pos.x < GAME_WIDTH + 100 && fBot.pos.y > 0) {
                const fStun = fBot.isWaitingForScrumRecovery ? 1.0 : fBot.stunTimer;
                drawPlayerShadow(fBot, fStun);
            }
        }

// Rysowanie dynamicznej kolekcji niezależnych botów trybu szału gwiazdki
        for (const fBot of frenzyBots) {
            ctx.save();
            const fDir = fBot.facingX;
            const fType = fBot.frenzyBotType;
            const fStun = fBot.isWaitingForScrumRecovery ? 1.0 : fBot.stunTimer;
            const botFrenzyImg = getImage('sprites.bot');

            if (fBot.isTackling || fBot.isBoosting) {
                this.drawTrail(fBot, fDir, '#fbc4ab', '#e63946', botFrenzyImg, true, fBot.isTackling);
            }

     if (fType === 'GROUP') {
                const sizes = [new Vector2(18, 36), new Vector2(18 * 1.3, 36 * 1.3), new Vector2(18 * 1.15, 36 * 1.15)];
                const offsetsX = [0, 35, 70];
                for (let i = 0; i < 3; i++) {
                    const bx = fBot.pos.x + offsetsX[i];
                    // POPRAWKA: Dynamicznie uwzględniamy współrzędną pos.y, by cała formacja mogła lecieć w powietrzu
                    const by = fBot.pos.y + (fBot.size.y - sizes[i].y);
                    if (botFrenzyImg) {
                        ctx.save(); ctx.translate(bx + sizes[i].x / 2, by + sizes[i].y / 2); if (fDir < 0) ctx.scale(-1, 1);
                        ctx.drawImage(botFrenzyImg, -sizes[i].x / 2, -sizes[i].y / 2, sizes[i].x, sizes[i].y); ctx.restore();
                    } else {
                        drawHeadballPlayer(bx, by, sizes[i].x, sizes[i].y, '#e63946', '#fbc4ab', fStun, fBot.debuffTimer > 0, fBot.isTackling, false, fDir, fBot.vel.x, fBot.onGround, fBot.vel.y, fBot.knockbackTimer, 'bot');
                    }
                }
            } else {
                if (botFrenzyImg) {
                    ctx.save();
                    let cx = fBot.pos.x + fBot.size.x/2; let cy = fBot.pos.y + fBot.size.y/2;
                    ctx.translate(cx, cy); if (fDir < 0) ctx.scale(-1, 1);
                    if (fBot.knockbackTimer > 0) {
                        let progress = 1.0 - (fBot.knockbackTimer / 0.4);
                        ctx.rotate(fBot.vel.x < 0 ? -(Math.PI/2) * progress : (Math.PI/2) * progress);
                    } else if (fStun > 0) {
                        ctx.rotate(fStun < 0.3 ? (Math.PI/2) * (fStun / 0.3) : Math.PI/2);
                    } else if (fBot.isTackling) {
                        ctx.translate(0, fBot.size.y/2 - fBot.size.x/2); ctx.rotate(Math.PI/2);
                    }
                    ctx.drawImage(botFrenzyImg, -fBot.size.x/2, -fBot.size.y/2, fBot.size.x, fBot.size.y);
                    ctx.restore();
                } else {
                    drawHeadballPlayer(fBot.pos.x, fBot.pos.y, fBot.size.x, fBot.size.y, '#e63946', '#fbc4ab', fStun, fBot.debuffTimer > 0, fBot.isTackling, false, fDir, fBot.vel.x, fBot.onGround, fBot.vel.y, fBot.knockbackTimer, 'bot');
                }
            }
            ctx.restore();
        }

        // Draw Bot
        const botDir = world.bot.facingX;
        const botImg = getImage('sprites.bot');
        
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowColor = 'transparent';

        ctx.save();

        // NOWOŚĆ: Rysowanie grupy 3 botów idących obok siebie, z zachowaniem skali wysokości i tempa biegu
        if ((world as any).botType === 'GROUP') {
            const sizes = [
                new Vector2(18, 36),            // Bot 1: Baza wielkości SLIDE
                new Vector2(18 * 1.3, 36 * 1.3), // Bot 2: +30% wysokości
                new Vector2(18 * 1.15, 36 * 1.15) // Bot 3: +15% wysokości
            ];
            const offsetsX = [0, 35, 70]; // Rozstawienie poziome formacji obronnej
            
            for (let i = 0; i < 3; i++) {
                const bx = world.bot.pos.x + offsetsX[i];
                const by = GROUND_Y - sizes[i].y;
                
                if (botImg) {
                    ctx.save();
                    ctx.translate(bx + sizes[i].x / 2, by + sizes[i].y / 2);
                    if (botDir < 0) ctx.scale(-1, 1);
                    ctx.drawImage(botImg, -sizes[i].x / 2, -sizes[i].y / 2, sizes[i].x, sizes[i].y);
                    ctx.restore();
                } else {
                    drawHeadballPlayer(bx, by, sizes[i].x, sizes[i].y, 
                        '#e63946', '#fbc4ab', botEffectiveStun, world.bot.debuffTimer > 0, 
                        world.bot.isTackling || world.bot.isDiving, false, botDir, world.bot.vel.x, world.bot.onGround, world.bot.vel.y, world.bot.knockbackTimer, 'bot');
                }
            }
        } else {
            // Klasyczne renderowanie pojedynczych botów (SLIDE oraz CLINCH)
            if (world.bot.isTackling || world.bot.isBoosting || (world.subState === 'SCRUM_MATRIX' && world.bot.scrumPushTimer > 0)) {
                 this.drawTrail(world.bot, botDir, '#fbc4ab', '#e63946', botImg, world.bot.isBoosting || world.subState === 'SCRUM_MATRIX', world.bot.isTackling);
            }
            if (botImg) {
                ctx.save();
                let cx = world.bot.pos.x + world.bot.size.x/2;
                let cy = world.bot.pos.y + world.bot.size.y/2;
                ctx.translate(cx, cy);
                if (botDir < 0) ctx.scale(-1, 1);
                
                if (world.bot.knockbackTimer > 0) {
                    let progress = 1.0 - (world.bot.knockbackTimer / 0.4);
                    let rot = (Math.PI/2) * progress;
                    ctx.rotate(world.bot.vel.x < 0 ? -rot : rot);
                } else if (botEffectiveStun > 0) {
                    let rot = Math.PI/2;
                    if (botEffectiveStun < 0.3) rot = (Math.PI/2) * (botEffectiveStun / 0.3);
                    ctx.rotate(rot);
                } else if (world.bot.isTackling) {
                    ctx.translate(0, world.bot.size.y/2 - world.bot.size.x/2);
                    ctx.rotate(Math.PI/2);
                }
                
                ctx.drawImage(botImg, -world.bot.size.x/2, -world.bot.size.y/2, world.bot.size.x, world.bot.size.y);
                ctx.restore();
            } else {
                drawHeadballPlayer(world.bot.pos.x, world.bot.pos.y, world.bot.size.x, world.bot.size.y, 
                    '#e63946', '#fbc4ab', botEffectiveStun, world.bot.debuffTimer > 0, 
                    world.bot.isTackling || world.bot.isDiving, world.subState === GameSubState.KICKING && world.bot.role === PlayerRole.ATTACKER, botDir, world.bot.vel.x, world.bot.onGround, world.bot.vel.y, world.bot.knockbackTimer, 'bot');
            }
        }
        
        // NOWOŚĆ: Rysowanie tymczasowego czerwonego zawodnika (Receivera) z przerwą za ścianą obrony
        if ((world as any).teammateActive) {
            const tx = (world as any).teammateBotX;
            const ty = GROUND_Y - world.player.size.y;
            const playerImg = getImage('sprites.player');
            if (playerImg) {
                ctx.save();
                ctx.translate(tx + world.player.size.x / 2, ty + world.player.size.y / 2);
                ctx.drawImage(playerImg, -world.player.size.x / 2, -world.player.size.y / 2, world.player.size.x, world.player.size.y);
                ctx.restore();
            } else {
                // Rysujemy biegnącego w slow-mo nowego zawodnika (velX = 120)
                drawHeadballPlayer(tx, ty, world.player.size.x, world.player.size.y, 
                    '#4361ee', '#ffcab0', 0, false, false, false, 1, 120, true, 0, 0, 'player');
            }
        }
        
        ctx.restore();
        
        // Draw Drops
        for (const drop of (world as any).drops || []) {
            if (drop.collected) continue;
            
            const dropScreenX = drop.worldX - world.bgScrollX;
            // Tylko dropy w granicach ekranu rysujemy
            if (dropScreenX > -100 && dropScreenX < 900) {
                ctx.save();
                ctx.translate(dropScreenX + 20, GROUND_Y - 40 + drop.yOff);
                
                // Shadow for drop
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.beginPath();
                ctx.ellipse(0, 40 - drop.yOff, 15, 6, 0, 0, Math.PI * 2);
                ctx.fill();

if (drop.type === 'TIME') {
                    const img = getImage('sprites.drop_time');
                    if (img) {
                        ctx.drawImage(img, -28, -28, 56, 56);
                    } else {
                        // Kształt klepsydry
                        ctx.fillStyle = '#06d6a0'; // green
                        ctx.beginPath();
                        ctx.moveTo(-15, -15);
                        ctx.lineTo(15, -15);
                        ctx.lineTo(0, 0);
                        ctx.lineTo(15, 15);
                        ctx.lineTo(-15, 15);
                        ctx.lineTo(0, 0);
                        ctx.closePath();
                        ctx.fill();
                        
                        ctx.fillStyle = 'white';
                        ctx.font = 'bold 12px "JetBrains Mono"';
                        ctx.textAlign = 'center';
                        ctx.fillText('+10s', 0, 4);
                    }
} else if (drop.type === 'STAR') {
                    const img = getImage('sprites.drop_star');
                    if (img) {
                        ctx.drawImage(img, -28, -28, 56, 56);
                    } else {
                        // Kształt gwiazdy
                        ctx.fillStyle = '#ffd166'; // gold
                        ctx.beginPath();
                        for (let i = 0; i < 5; i++) {
                            ctx.lineTo(Math.cos( (18 + i * 72) * Math.PI / 180 ) * 20,
                                       -Math.sin( (18 + i * 72) * Math.PI / 180 ) * 20);
                            ctx.lineTo(Math.cos( (54 + i * 72) * Math.PI / 180 ) * 10,
                                       -Math.sin( (54 + i * 72) * Math.PI / 180 ) * 10);
                        }
                        ctx.closePath();
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
        }

// Draw Player
        const pDir = world.player.facingX;
        const playerImg = getImage('sprites.player');
        
        // NOWOŚĆ: Aplikacja mignięcia starej postaci po udanym przekazaniu piłki
        if ((world as any).oldPlayerDisappearTimer > 0) {
            ctx.globalAlpha = (Math.floor(now / 100) % 2 === 0) ? 0.2 : 0.9;
        }
        
        // POPRAWKA BOMBODODPORNA: Siłowo oczyszczamy rejestry cieni GPU przed renderem gracza
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowColor = 'transparent';

        // POPRAWKA: Renderujemy smugi gracza również wtedy, kiedy jego licznik parcia w przód w klinczu jest aktywny
        if (world.player.isTackling || world.player.isBoosting || (world.subState === 'SCRUM_MATRIX' && world.player.scrumPushTimer > 0)) {
             this.drawTrail(world.player, pDir, '#ffcab0', '#4361ee', playerImg, world.player.isBoosting || world.subState === 'SCRUM_MATRIX', world.player.isTackling);
        }
let simulatedVelX = world.player.vel.x;
        if (world.subState === GameSubState.REGULAR && world.isScrolling) {
            simulatedVelX = (world as any).invincibilityTimer > 0 ? 240 : 120; // Przyspieszony bieg gdy invincibility
        }
        
        // Aura invincibility (Star powerup)
        if ((world as any).invincibilityTimer > 0 && world.subState === GameSubState.REGULAR) {
            ctx.save();
            ctx.shadowBlur = 30;
            ctx.shadowColor = '#ffd166';
            ctx.fillStyle = 'rgba(255, 209, 102, 0.4)';
            ctx.beginPath();
            ctx.ellipse(world.player.pos.x + world.player.size.x/2, world.player.pos.y + world.player.size.y/2, world.player.size.x * 0.8, world.player.size.y * 0.8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            
            // Wymuszone silniejsze smugi
            this.drawTrail(world.player, pDir, '#ffcab0', '#ffd166', playerImg, true, true);
        }
        
        // Blink if stunned
        if (pEffectiveStun > 0) {
            ctx.globalAlpha = (Math.floor(now / 150) % 2 === 0) ? 0.3 : 1.0;
        }

        if (playerImg) {
            ctx.save();
            let cx = world.player.pos.x + world.player.size.x/2;
            let cy = world.player.pos.y + world.player.size.y/2;
            ctx.translate(cx, cy);
            if (pDir < 0) ctx.scale(-1, 1);
            
            if (world.player.knockbackTimer > 0) {
                let progress = 1.0 - (world.player.knockbackTimer / 0.4);
                let rot = (Math.PI/2) * progress;
                ctx.rotate(world.player.vel.x < 0 ? -rot : rot);
            } else if (pEffectiveStun > 0) {
                let rot = Math.PI/2;
                if (pEffectiveStun < 0.3) rot = (Math.PI/2) * (pEffectiveStun / 0.3);
                ctx.rotate(rot);
                ctx.translate(0, world.player.size.x/2); // Adjust position when rotated
            } else if (world.player.isTackling) {
                ctx.translate(0, world.player.size.y/2 - world.player.size.x/2);
                ctx.rotate(-Math.PI/2);
            }
            
            // To animate the image bouncing while running
            if (world.subState === GameSubState.REGULAR && world.isScrolling && pEffectiveStun <= 0) {
                const runCycle = now * 0.015 * (160 / 100);
                const bounceY = Math.abs(Math.sin(runCycle)) * 12;
                ctx.translate(0, -bounceY * 0.5);
            }
            
            ctx.drawImage(playerImg, -world.player.size.x/2, -world.player.size.y/2, world.player.size.x, world.player.size.y);
            ctx.restore();
} else {
            // POPRAWKA: Usunięto flagę SCRUM_MATRIX z warunków tackle gracza – Sam stoi prosto przez cały klincz!
            drawHeadballPlayer(world.player.pos.x, world.player.pos.y, world.player.size.x, world.player.size.y, 
                '#4361ee', '#ffcab0', pEffectiveStun, world.player.debuffTimer > 0, 
                world.player.isTackling || world.player.isDiving, world.subState === GameSubState.KICKING && world.player.role === PlayerRole.ATTACKER, 
                pDir, simulatedVelX, world.player.onGround, world.player.vel.y, world.player.knockbackTimer, 'player');
        }
        
        ctx.globalAlpha = 1.0;
         

      // Draw Ball Shadow
        let isBallHeld = (world.subState === GameSubState.REGULAR || world.subState === GameSubState.COUNTDOWN || world.subState === GameSubState.KICKING || world.subState === GameSubState.BALL_ACQUIRED || world.subState === GameSubState.SCRUM_MATRIX || world.subState === GameSubState.TACKLE_RESOLVE) && world.newPlayerTransitionTimer <= 0;
        
        const attacker = world.player.role === PlayerRole.ATTACKER ? world.player : world.bot;
        if (attacker.stunTimer > 0) {
            isBallHeld = false;
        }

        // ABSOLUTE FORCE for COUNTDOWN to prevent shadow bug
        if (world.subState === GameSubState.COUNTDOWN) {
            isBallHeld = true;
        }

    // Show ball
    if (!isBallHeld && world.ball.pos.y + world.ball.size.y <= GROUND_Y) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.beginPath();
        const shadowX = world.ball.pos.x + world.ball.size.x / 2;
        const shadowY = GROUND_Y + 6;
        const height = Math.max(0, GROUND_Y - (world.ball.pos.y + world.ball.size.y));
        const shadowW = Math.max(world.ball.size.x * 0.3, world.ball.size.x * 0.7 - height * 0.05);
        const shadowH = Math.max(world.ball.size.y * 0.15, world.ball.size.y * 0.35 - height * 0.02);
        ctx.ellipse(shadowX, shadowY, shadowW, shadowH, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
        
    // Draw Ball
        let ballVisX = world.ball.pos.x;
        let ballVisY = world.ball.pos.y;
        
        let ballSpin = 0;
        if (!isBallHeld) {
            if (world.newPlayerTransitionTimer > 0) {
                const totalTime = 3.0;
                let progress = 1.0 - (Math.max(0, world.newPlayerTransitionTimer) / totalTime);
                if (progress > 1) progress = 1;
                ballSpin = (progress - 0.5) * (Math.PI * 0.5);
            } else if (!world.ball.onGround && (world.ball.vel.x !== 0 || world.ball.vel.y !== 0)) {
                ballSpin = Math.atan2(world.ball.vel.y, world.ball.vel.x);
            } else if (world.ball.vel.x !== 0) {
                ballSpin = (now / 100) * (world.ball.vel.x > 0 ? 1 : -1);
            }
        }
        
        if (isBallHeld) {
            const faceDir = attacker.facingX;
            
            // TUTAJSZYMI WARTOŚCIAMI MOŻESZ MANUALNIE PRZESUWAĆ PIŁKĘ W RĘKACH:
            // offset X (przód/tył). Im więcej tym bardziej do przodu
            const manualBallOffsetX = 15; 
            // offset Y (góra/dół). Mniej (ujemne) to wyżej.
            const manualBallOffsetY = -10; 
            
            ballVisX = attacker.pos.x + attacker.size.x/2 + (faceDir * manualBallOffsetX) - world.ball.size.x/2;
            ballVisY = attacker.pos.y + attacker.size.y/2 + manualBallOffsetY - world.ball.size.y/2;
            
            if (world.subState === GameSubState.SCRUM_MATRIX) {
                // SCRUM lean offset
                ballVisX += faceDir * 10;
                ballVisY += 10;
                const runCycle = now * 0.002;
                const bounceY = Math.abs(Math.sin(runCycle)) * 12;
                ballVisY += bounceY * 0.8;
            } else if (attacker.onGround) {
                const simulatedAttackerVelX = (world.subState === GameSubState.REGULAR && world.isScrolling && attacker.stunTimer <= 0) ? 120 : attacker.vel.x;
                const runSpeed = Math.abs(simulatedAttackerVelX);
                const isRunning = runSpeed > 10;
                
                let runCycle = 0;
                let idleCycle = 0;
                
                if (world.isGroupQTEActive) {
                    runCycle = now * 0.002;
                    idleCycle = now * 0.001;
                } else if (world.newPlayerTransitionTimer > 0) {
                    if (isRunning) {
                        runCycle = now * 0.002;
                        idleCycle = 0;
                    } else {
                        runCycle = 0;
                        idleCycle = now * 0.001;
                    }
                } else {
                    runCycle = isRunning ? now * 0.015 * (runSpeed / 100) : 0;
                    idleCycle = isRunning ? 0 : now * 0.003;
                }
                
                const bounceY = isRunning ? Math.abs(Math.sin(runCycle)) * 12 : Math.sin(idleCycle) * 3;
                ballVisY += bounceY * 0.8; // Torso bounce offset
            }
            ballSpin = 0; // Don't spin when held
        }

        // POPRAWKA KORONNA: To to miejsce powodowało wybielenie piłki i przeskakiwanie cienia!
        // Wyłączamy sprzętowy cień bezpośrednio przed przejściem do sekcji rysowania / wypełniania kolorem piłki.
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
        ctx.shadowColor = 'transparent';

        const ballImg = getImage('sprites.ball');
        
        // Aktywacja neonowej poświaty wokół tekstury lub kształtu piłki na bazie koloru ognia
        if (world.ball.flameColor !== 'NONE' && !world.isExtraPointAttempt) {
            ctx.save();
            ctx.shadowBlur = 25;
            ctx.shadowColor = world.ball.flameColor === 'PURPLE' ? '#EC0DE3' : '#6BBED9';
        }

        if (ballImg) {
             ctx.save(); ctx.translate(ballVisX + world.ball.size.x/2, ballVisY + world.ball.size.y/2); ctx.rotate(ballSpin); ctx.drawImage(ballImg, -world.ball.size.x/2, -world.ball.size.y/2, world.ball.size.x, world.ball.size.y); ctx.restore();
        } else {
             ctx.save();
             ctx.translate(ballVisX + world.ball.size.x/2, ballVisY + world.ball.size.y/2);
             ctx.rotate(ballSpin);
             
             ctx.fillStyle = '#a0522d';
             ctx.strokeStyle = '#fff';
             ctx.lineWidth = 2;
             ctx.beginPath();
             ctx.ellipse(0, 0, world.ball.size.x/2, world.ball.size.y/2, 0, 0, Math.PI*2);
             ctx.fill();
             ctx.stroke();
             
             // Laces
             ctx.fillStyle = '#fff';
             ctx.fillRect(-10, -8, 20, 2);
             ctx.fillRect(-10, -4, 20, 2);
             ctx.fillRect(-10, 0, 20, 2);
             ctx.fillRect(-2, -10, 4, 15);
             ctx.restore();
        }

   if (world.ball.flameColor !== 'NONE' && !world.isExtraPointAttempt) {
            // POPRAWKA BOMBODODPORNA: Czyścimy rejestry ognia komety przed przywróceniem stanu,
            // dzięki czemu rozświetlenie nie ma prawa przeskoczyć na żaden inny element w kolejnej klatce.
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowColor = 'transparent';
            ctx.restore();
        }

        // Draw Particles
        for (const p of world.particles) {
            ctx.fillStyle = p.type === 'hit' ? '#ff9f1c' : 
                            p.type === 'perfect' ? '#2ec4b6' : 
                            p.type === 'miss' ? '#e63946' : 
                            p.type === 'flame_purple' ? '#EC0DE3' : 
                            p.type === 'flame_blue' ? '#6BBED9' : 
                            p.type === 'confetti_green' ? '#4ade80' : 
                            p.type === 'confetti_red' ? '#f87171' : 
                            p.type === 'confetti_white' ? '#ffffff' : '#fff';
            ctx.globalAlpha = Math.min(1, p.life * 2);
            
if (p.type === 'touchdown' || p.type === 'fieldgoal' || p.type === 'perfect') {
                 // Confetti
                 ctx.save();
                 ctx.translate(p.pos.x, p.pos.y);
                 ctx.rotate(p.life * 10);
                 
                 // POPRAWKA: Jeśli cząsteczka ma flagę isBigConfetti, rysujemy ją 2x większą (16x16px zamiast bazy 8x8px)
                 // @ts-ignore
                 const size = p.isBigConfetti ? 16 : 8;
                 ctx.fillRect(-size / 2, -size / 2, size, size);
                 
                 ctx.restore();
            } else {
                 ctx.beginPath();
                 ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI*2);
                 ctx.fill();
            }
            ctx.globalAlpha = 1.0;
        }

        // Wyświetlanie modyfikatora czasu (+5s / -5s) nad graczem
        const timeWorld = world as any;
        if (timeWorld.timeModifierTimer > 0 && timeWorld.timeModifierMessage) {
            ctx.save();
            ctx.fillStyle = timeWorld.timeModifierColor;
            ctx.font = 'bold 36px Impact, sans-serif';
            ctx.textAlign = 'center';
            // Unosi się do góry w czasie trwania
            const floatY = timeWorld.timeModifierPlayerY - 40 - ((2.0 - timeWorld.timeModifierTimer) * 30);
            ctx.globalAlpha = Math.min(1.0, timeWorld.timeModifierTimer);
            ctx.fillText(timeWorld.timeModifierMessage, world.player.pos.x + world.player.size.x / 2, floatY);
            

            ctx.restore();
        }

        // TACKLE Telegraphs
        if (world.player.isTackling && world.player.tackleTimer > 0.1) {
            ctx.fillStyle = '#e63946';
            ctx.font = 'bold 32px Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("TACKLE", world.player.pos.x + world.player.size.x/2, world.player.pos.y - 20);
        }
        if (world.bot.isTackling && world.bot.tackleTimer > 0.1) {
            ctx.fillStyle = '#e63946';
            ctx.font = 'bold 32px Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("TACKLE", world.bot.pos.x + world.bot.size.x/2, world.bot.pos.y - 20);
        }

// --- END CAMERA TRANSFORM ---
        ctx.restore();
        
// ========================================================================
        // POPRAWKA: ZUNIFIKOWANE PASY KINOWE, LINIE PRĘDKOŚCI ORAZ PASEK POSTĘPU TUG-OF-WAR
        // ========================================================================
        const isClinchSubState = world.subState === GameSubState.SCRUM_MATRIX || world.scrumSlowMoTimer > 0;
        if (world.slideJumpTransition > 0 || isClinchSubState) {
            ctx.save();
            const barFactor = isClinchSubState ? 1 : world.slideJumpTransition;
            const barHeight = 85 * barFactor; 
            
            // Czarne pasy filmowe (Letterbox top & bottom) - stale widoczne przez cały klincz!
            ctx.fillStyle = '#05020d';
            ctx.fillRect(0, 0, GAME_WIDTH, barHeight);
            ctx.fillRect(0, GAME_HEIGHT - barHeight, GAME_WIDTH, barHeight);
            
            if (isClinchSubState) {
                // Poziome linie pędu laserowego dla klinczu
                ctx.globalCompositeOperation = 'lighter';
                const lineCount = 6;
                for (let i = 0; i < lineCount; i++) {
                    const y = barHeight + 25 + (i * (GAME_HEIGHT - barHeight * 2 - 50) / (lineCount - 1));
                    const direction = (i % 2 === 0) ? 1 : -1;
                    const speedMultiplier = 3.2 + (i % 3) * 1.5;
                    const segmentLen = 160 + (i * 45) % 140;
                    
                    let x = (now * speedMultiplier * direction) % (GAME_WIDTH + segmentLen * 2);
                    if (direction === -1) {
                        x = GAME_WIDTH + segmentLen - ((now * speedMultiplier) % (GAME_WIDTH + segmentLen * 2));
                    } else {
                        x = x - segmentLen;
                    }

                    const streakGrad = ctx.createLinearGradient(x, y, x + segmentLen, y);
                    streakGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                    streakGrad.addColorStop(0.5, 'rgba(168, 85, 247, 0.45)');
                    streakGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

                    ctx.strokeStyle = streakGrad;
                    ctx.lineWidth = 1.5 + (i % 2);
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + segmentLen, y);
                    ctx.stroke();
                }

// POPRAWKA: Górna przestrzeń paska kinowego zostaje całkowicie czysta i pozbawiona elementów HUD
            }
            ctx.restore();
        }
        
// ========================================================================
        // POPRAWKA: KINOWY GRADIENT PIONOWY Z SYMETRYCZNYM WSUWANIEM I WYSUWANIEM (In/Out Smooth Transitions)
        // Współczynnik combinedFactor eliminuje nagły przeskok, płynnie renderując efekty przez pierwsze i ostatnie 150ms!
        // ========================================================================
        if (world.subState === GameSubState.SCRUM_MATRIX && world.scrumSpecialSlowMoTimer > 0) {
            ctx.save();
            
            // Obliczanie płynnego wejścia (od 0.75 do 0.60) oraz płynnego wyjścia (od 0.15 do 0.0)
            const totalDuration = 0.75;
            const transitionTime = 0.15;
            const entryFactor = Math.min(1, (totalDuration - world.scrumSpecialSlowMoTimer) / transitionTime);
            const exitFactor = Math.min(1, world.scrumSpecialSlowMoTimer / transitionTime);
            const combinedFactor = Math.max(0, Math.min(entryFactor, exitFactor));

            // 1. Definiujemy potężny liniowy gradient pionowy z płynną animacją przezroczystości (alpha-fade)
            const linearGrad = ctx.createLinearGradient(0, 0, 0, GAME_HEIGHT);
            linearGrad.addColorStop(0, `rgba(12, 4, 28, ${0.96 * combinedFactor})`);       
            linearGrad.addColorStop(0.20, `rgba(168, 85, 247, ${0.42 * combinedFactor})`);  
            linearGrad.addColorStop(0.38, 'rgba(0, 0, 0, 0)');          
            linearGrad.addColorStop(0.62, 'rgba(0, 0, 0, 0)');          
            linearGrad.addColorStop(0.80, `rgba(168, 85, 247, ${0.42 * combinedFactor})`);  
            linearGrad.addColorStop(1, `rgba(12, 4, 28, ${0.96 * combinedFactor})`);       
            
            ctx.fillStyle = linearGrad;
            ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // 2. Płynnie wsuwające i wysuwające się panoramiczne pasy filmowe (Ultra-Letterbox)
            const barHeight = 85 * combinedFactor; // Przywrócono idealne 85px!
            ctx.fillStyle = '#05020d';
            ctx.fillRect(0, 0, GAME_WIDTH, barHeight);
            ctx.fillRect(0, GAME_HEIGHT - barHeight, GAME_WIDTH, barHeight);

            // 3. NOWOŚĆ: Nieustannie płynące, poziome paski prędkości (Continuous Laser Streaks)
            ctx.globalCompositeOperation = 'lighter';
            const lineCount = 6;
            for (let i = 0; i < lineCount; i++) {
                // Rozmieszczamy paski na zdefiniowanych wysokościach wewnątrz wolnego kadru gry
                const y = barHeight + 25 + (i * (GAME_HEIGHT - barHeight * 2 - 50) / (lineCount - 1));
                const direction = (i % 2 === 0) ? 1 : -1;
                const speedMultiplier = 3.2 + (i % 3) * 1.5;
                const segmentLen = 160 + (i * 45) % 140;
                
                // Obliczanie płynnego ruchu przewijania smug z krawędzi do krawędzi ekranu
                let x = (now * speedMultiplier * direction) % (GAME_WIDTH + segmentLen * 2);
                if (direction === -1) {
                    x = GAME_WIDTH + segmentLen - ((now * speedMultiplier) % (GAME_WIDTH + segmentLen * 2));
                } else {
                    x = x - segmentLen;
                }

                // Tworzenie neonowego, zanikającego na końcach gradientowego paska prędkości
                const streakGrad = ctx.createLinearGradient(x, y, x + segmentLen, y);
                streakGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                streakGrad.addColorStop(0.5, 'rgba(238, 214, 255, 0.85)'); // Jasny fioletowy błysk w środku linii
                streakGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.strokeStyle = streakGrad;
                ctx.lineWidth = 1.5 + (i % 2); // Zróżnicowana grubość pasów 1.5px lub 2.5px
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + segmentLen, y);
                ctx.stroke();
            }

            // 4. NOWOŚĆ: Szybkie, migające losowo paski tła (Transient Anime Jitter) potęgujące agresywny charakter ataku
            const jitterSeed = Math.floor(now / 45); // Zmiana pozycji co 45ms dla efektu "szorstkiego" migania
            for (let j = 0; j < 3; j++) {
                const jitterY = barHeight + 15 + ((jitterSeed * (j + 13) * 97) % (GAME_HEIGHT - barHeight * 2 - 30));
                const jitterX = (jitterSeed * (j + 7) * 53) % (GAME_WIDTH - 220);
                const jitterW = 90 + ((jitterSeed + j) % 3) * 60;
                
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + (j % 2) * 0.15})`;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(jitterX, jitterY);
                ctx.lineTo(jitterX + jitterW, jitterY);
                ctx.stroke();
            }

            ctx.restore();
        }

        // --- BEGIN FIXED ON-SCREEN HUD ---
        ctx.save();
        
const drawStylishText = (text: string, x: number, y: number, fontSize: number, gradColors: string[]) => {
            const upperText = text.toUpperCase();
            ctx.save();
            ctx.translate(x, y);
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = `900 ${fontSize}px "Arial Black", Impact, sans-serif`;
            
            const scaleFactor = fontSize / 180;
            const visualScale = Math.max(0.6, scaleFactor);
            
            // Lekki rozmyty podkład pod napisem dla lepszego kontrastu z tłumem
            ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = 8 * visualScale;
            ctx.shadowOffsetY = 6 * visualScale;
            
            // WARSTWA 1 (Cień 3D): Czyste, ciemnofioletowe wypełnienie przesunięte w dół i prawo (+X, +Y).
            const offsetX = 6 * visualScale;
            const offsetY = 8 * visualScale;
            ctx.fillStyle = '#2e1065';
            ctx.fillText(upperText, offsetX, offsetY);
            
   // Całkowicie wyłączamy rozmycie cienia przed nałożeniem frontu, by zachować idealną ostrość
            ctx.shadowBlur = 0; 
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.shadowColor = 'transparent'; // POPRAWKA: Zmiana na transparent odcina wycieki z napisów HUD
            
            // NOWY ULTRA-JASNY GRADIENT (Zgodny z Twoim screenem): 
            // Górna połowa litery lśni jasną bielą i pastelowym fioletem, dolna schodzi do żywego, nasyconego fioletu.
            // Eliminujemy ciemne kolory, by zachować maksymalną czytelność.
            const grad = ctx.createLinearGradient(0, -fontSize/2, 0, fontSize/2);
            grad.addColorStop(0, '#F3E8FF');       // Czysta, rozświetlona biel na samym czubku
            grad.addColorStop(0.25, '#E9D5FF');    // Bardzo jasny lawendowy pastel
            grad.addColorStop(0.65, '#d8b4fe');    // Świeży, wyraźny jasny fiolet
            grad.addColorStop(1, '#a855f7');       // Żywy, nasycony fiolet na dole (doskonale kontrastuje z ramką #2e1065)
            
            // WARSTWA 2 (Główne lico): Ostra, ciemna ramka komiksowa + nowy, super jasny gradient
            ctx.strokeStyle = '#2e1065';
            ctx.lineWidth = 10 * scaleFactor + 1.5; 
            ctx.strokeText(upperText, 0, 0);
            
            ctx.fillStyle = grad;
            ctx.fillText(upperText, 0, 0);
            
            ctx.restore();
        };

const fioletColors = ['#d8b4fe', '#a855f7', '#7e22ce', '#3b0764'];

// Draw Scrum PUSH / JUMP / KICK Prompts
        if (world.subState === GameSubState.SCRUM_MATRIX) {
            if (world.scrumSpecialTextTimer > 0 || world.scrumSpecialSlowMoTimer > 0) {
                 const scale = 1.1 + Math.sin(now / 100) * 0.06;
                 ctx.save();
                 ctx.translate(GAME_WIDTH / 2, 160);
                 ctx.scale(scale, scale);
                 drawStylishText("SPECIAL ATTACK!", 0, 0, 35, fioletColors); 
                 ctx.restore();
            } else if (world.scrumPrompt) {
                 const scale = 1.0 + Math.sin(now / 180) * 0.05;
                 ctx.save();
                 ctx.translate(GAME_WIDTH / 2, 160);
                 ctx.scale(scale, scale);
                 drawStylishText("MASH PUSH!", 0, 0, 35, fioletColors); 
                 ctx.restore();
            }
} else if ((world.isSlideJumpActive || world.slideJumpTransition > 0) && world.invincibilityTimer <= 0) {
            const scale = 1.0 + Math.sin(now / 180) * 0.05;
            ctx.save();
            ctx.translate(GAME_WIDTH / 2, 160);
            ctx.scale(scale, scale);
            // POPRAWKA: Zmieniono nazwę komunikatu instrukcji na PRESS THROW! (Wciśnij rzut)
            if (world.botType === 'GROUP') {
                drawStylishText("PRESS THROW!", 0, 0, 35, fioletColors); 
            } else if (world.botType === 'SLIDE') {
                drawStylishText("PRESS JUMP!", 0, 0, 35, fioletColors); 
            }
            ctx.restore();
        }
        
        // NOWOŚĆ: Wyświetlanie stylizowanego i ostrygowanego napisu CATCHED! na środku ekranu przez dokładnie 2 sekundy po udanym przechwycie
        if ((world as any).groupSuccessMessageTimer > 0) {
            const scale = 1.0 + Math.sin(now / 120) * 0.04;
            ctx.save();
            ctx.translate(GAME_WIDTH / 2, 160);
            ctx.scale(scale, scale);
            drawStylishText("CATCHED!", 0, 0, 35, fioletColors);
            ctx.restore();
        }

// NOWOŚĆ: Reużycie ramy paska wykopu jako poziomego wskaźnika QTE podania dla grupy botów na dolnej flance!
        if ((world as any).isGroupQTEActive) {
            ctx.save();
            // POPRAWKA: Pasek postępu zielonej strefy został powiększony o 100% (szerokość 440px zamiast 220px, wysokość 28px zamiast 14px) dla idealnej, klarownej czytelności!
            const barW = 440; 
            const barH = 28;  
            const barX = 24; 
            const barY = GAME_HEIGHT - 42.5 - barH / 2;
            
            // Szklany, mleczny kontener
            ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 6);
            ctx.fill();
            ctx.stroke();
            
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 6);
            ctx.clip();
            
            // Reużycie struktury i przedziałów tolerancji kolorów z paska wykopu rzutu wolnego
            ctx.fillStyle = 'rgba(168, 85, 247, 0.4)';
            ctx.fillRect(barX, barY, barW, barH);
            
   ctx.fillStyle = 'rgba(30, 25, 40, 0.85)'; // Ciemne tło paska (Za wcześnie: 0 - 65%)
            ctx.fillRect(barX, barY, barW * 0.65, barH);
            
            ctx.fillStyle = 'rgba(46, 196, 182, 0.9)'; // Zielony (Idealny punkt podania: 65% - 93%)
            ctx.fillRect(barX + barW * 0.65, barY, barW * (0.93 - 0.65), barH);
            
            ctx.fillStyle = 'rgba(30, 25, 40, 0.85)'; // Ciemne tło paska (Spóźnienie: 93% - 100%)
            ctx.fillRect(barX + barW * 0.93, barY, barW * (1.0 - 0.93), barH);
            ctx.restore();
            
// Piłka jako wskaźnik pozycji poruszający się horyzontalnie po siatce
            const markerX = barX + (barW * (world as any).groupKickPower / 100);
            const ballImg = getImage('sprites.ball');
            if (ballImg) {
                // POPRAWKA: Wycentrowano pozycję osi Y (barY - 2), dzięki czemu marker idealnie pokrywa wysokość 28px rury postępu!
                ctx.drawImage(ballImg, markerX - 24, barY - 2, 48, 32);
            } else {
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(markerX, barY + barH / 2, 12, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }

// POPRAWKA UI: Wycięto centralny pasek ładowania Special Attack. W jego miejsce wchodzi zaawansowany pasek przeciągania liny (Tug-of-War) ulokowany po lewej stronie dolnego pasa kinowego!
        if (world.subState === GameSubState.SCRUM_MATRIX || world.scrumSlowMoTimer > 0) {
            ctx.save();
            const barW = 220; 
            const barH = 14;  
            const barX = 24; // Lewy margines identyczny z bocznym odsetkiem przycisku
            const barY = GAME_HEIGHT - 42.5 - barH / 2; // Perfekcyjne wyśrodkowanie w pionie na dolnym pasie 85px

            // Szklana, mleczna rama paska postępu siłowania
            ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 6);
            ctx.fill();
            ctx.stroke();
            
            // Maska przycinająca zaokrąglenia wnętrza
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(barX, barY, barW, barH, 6);
            ctx.clip();
            
            const pct = world.scrumOffset / world.scrumWinOffset; // Od -1.0 do +1.0
            const midX = barX + barW / 2;
            
            if (pct > 0) {
                // Gracz zyskuje przewagę -> Wypełnienie seledynowo-zielone w prawo
                ctx.fillStyle = '#2ec4b6';
                ctx.fillRect(midX, barY, (pct * barW / 2), barH);
            } else if (pct < 0) {
                // Bot zyskuje przewagę -> Wypełnienie czerwone w lewo
                ctx.fillStyle = '#e63946';
                ctx.fillRect(midX + (pct * barW / 2), barY, Math.abs(pct * barW / 2), barH);
            }
            ctx.restore();
            
            // Ostra, biała linia punktu zero (balans idealnego środka)
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(midX, barY - 3);
            ctx.lineTo(midX, barY + barH + 3);
            ctx.stroke();
            
            ctx.restore();
        }
        
if (world.acquiredMessage) {
             const scale = 1.0 + Math.sin(now / 180) * 0.05; // same bounce for everything
             ctx.save();
             ctx.translate(GAME_WIDTH/2, 160); // slightly lower
             ctx.scale(scale, scale);
             drawStylishText(world.acquiredMessage, 0, 0, 35, fioletColors); // fiolet and smaller
             if (world.acquiredMessage2) {
                 drawStylishText(world.acquiredMessage2, 0, 40, 21, fioletColors); // smaller
             }
             ctx.restore();
        }

        // RYSOWANIE STRZAŁEK STARCIOWYCH (CLASH ARROWS) W TRWANIU STANU BALL_ACQUIRED
        if (world.subState === GameSubState.BALL_ACQUIRED) {
            ctx.save();
            
            // Dynamiczny, zsynchronizowany ruch napierania grotami na siebie (lewa w prawo, prawa w lewo)
            const clashBounce = Math.sin(now * 0.008) * 12;
            const centerY = 215; // Pozycja pionowa idealnie wpasowana pomiędzy komunikat tekstowy a zawodników
            
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            ctx.strokeStyle = '#FFFFFF'; // Biały outline ramy strzałek
            ctx.fillStyle = '#AF5BF4';     // Czysty fiolet gry

            // 1. Lewa strzałka celująca grotem w prawą stronę (➔)
            ctx.save();
            ctx.translate(GAME_WIDTH / 2 - 45 + clashBounce, centerY);
            ctx.beginPath();
            ctx.moveTo(-18, -6);
            ctx.lineTo(0, -6);
            ctx.lineTo(0, -14);
            ctx.lineTo(16, 0);
            ctx.lineTo(0, 14);
            ctx.lineTo(0, 6);
            ctx.lineTo(-18, 6);
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
            ctx.restore();

            // 2. Prawa strzałka celująca grotem w lewą stronę (⬅)
            ctx.save();
            ctx.translate(GAME_WIDTH / 2 + 45 - clashBounce, centerY);
            ctx.beginPath();
            ctx.moveTo(18, -6);
            ctx.lineTo(0, -6);
            ctx.lineTo(0, -14);
            ctx.lineTo(-16, 0);
            ctx.lineTo(0, 14);
            ctx.lineTo(0, 6);
            ctx.lineTo(18, 6);
            ctx.closePath();
            ctx.stroke();
            ctx.fill();
            ctx.restore();

            ctx.restore();
        }

// RYSOWANIE STRZAŁKI NAPROWADZAJĄCEJ DO PRZYŁOŻENIA
        if (world.showRunArrow) {
            ctx.save();
            
            // --- TUTAJ REGULUJESZ ANIMACJĘ I POZYCJĘ STRZAŁKI ---
            const bounceX = Math.sin(now * 0.005) * 7;   // 0.005 = wolniejsza prędkość, 7 = krótszy/delikatniejszy skok
            const arrowX = GAME_WIDTH - 85 + bounceX;    // Zmniejszone do 85, aby strzałka była tuż przy marginesie krawędzi
            const arrowY = GROUND_Y - 75;                // Zmienione ze 110 na 75, aby strzałka wisiała wyraźnie niżej
            // ----------------------------------------------------

            ctx.translate(arrowX, arrowY);

            // Tworzenie ścieżki wektorowej dla ostrej, komiksowej strzałki w prawo (➔)
            ctx.beginPath();
            ctx.moveTo(-35, -12); // Góra ogona strzałki
            ctx.lineTo(0, -12);   // Łączenie ogona z grotem
            ctx.lineTo(0, -26);   // Tył grota góra
            ctx.lineTo(32, 0);    // Sam czubek (grot skierowany w prawo)
            ctx.lineTo(0, 26);    // Tył grota dół
            ctx.lineTo(0, 12);    // Łączenie dolne
            ctx.lineTo(-35, 12);  // Dół ogona strzałki
            ctx.closePath();

            // 1. Renderowanie grubego, białego outline'u pod spodem
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 7;
            ctx.lineJoin = 'round';
            ctx.stroke();

         // 2. Wypełnienie wnętrza fioletem zdefiniowanym w grze (#AF5BF4)
            ctx.fillStyle = '#AF5BF4';
            ctx.fill();

            ctx.restore();
        }

// RYSOWANIE PIONOWEJ STRZAŁKI WSKAZUJĄCEJ ZAWODNIKA GRACZA (NA START MECZU)
        if (world.showPlayerArrow) {
            ctx.save();
            
            // Delikatny, płynny pionowy skok (bounce) nad głową postaci
            const bounceY = Math.sin(now * 0.005) * 7;
            const arrowX = world.player.pos.x + world.player.size.x / 2;
            const arrowY = world.player.pos.y - 65 + bounceY; // Bezpieczny punkt zawieszenia nad kaskiem

            ctx.translate(arrowX, arrowY);

// Ścieżka wektorowa ostrej strzałki skierowanej grotem idealnie w dół (⬇)
            ctx.beginPath();
            ctx.moveTo(-12, -35); // Lewy górny róg ogona
            ctx.lineTo(-12, 0);   // Spadek ogona do linii grota
            ctx.lineTo(-26, 0);   // Lewe skrzydełko rozszerzenia grota
            ctx.lineTo(0, 26);    // Sam szpiczasty czubek grota wskazujący zawodnika
            ctx.lineTo(26, 0);    // Prawe skrzydełko rozszerzenia grota
            ctx.lineTo(12, 0);    // Powrót grota do prawej krawędzi ogona
            ctx.lineTo(12, -35);  // Prawy górny róg ogona
            ctx.closePath();

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 7;
            ctx.lineJoin = 'round';
            ctx.stroke();

            // 2. Wypełnienie wnętrza fioletem gry (#AF5BF4)
            ctx.fillStyle = '#AF5BF4';
            ctx.fill();

            ctx.restore();
        }

// RYSOWANIE POZIOMEJ FIOLETOWEJ STRZAŁKI FINISZU (NA OSTATNIEJ PROSTEJ)
        if ((world as any).finalStretchActive && !world.matchFinished) {
            ctx.save();
            const bounceX = Math.sin(now * 0.005) * 7;
            const arrowX = GAME_WIDTH - 85 + bounceX;
            const arrowY = GROUND_Y - 50; 

            ctx.translate(arrowX, arrowY);

            // Reużycie identycznych wymiarów i proporcji strzałki startowej, skierowanej w prawo (➔)
            ctx.beginPath();
            ctx.moveTo(-35, -12);
            ctx.lineTo(0, -12);
            ctx.lineTo(0, -26);
            ctx.lineTo(26, 0);
            ctx.lineTo(0, 26);
            ctx.lineTo(0, 12);
            ctx.lineTo(-35, 12);
            ctx.closePath();

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 7;
            ctx.lineJoin = 'round';
            ctx.stroke();

            ctx.fillStyle = '#AF5BF4';
            ctx.fill();

            ctx.restore();
        }

        // Draw Kick meter depending on if it's Extra Point time
        if (world.isExtraPointAttempt) {
            const kw = 333; // 1/3 of GAME_WIDTH
            const kh = 20;  // h-5
            const kx = GAME_WIDTH / 2 - kw / 2;
            const ky = 140; // moved down, slightly higher than messages at 160
            
            // White outline
            ctx.fillStyle = '#fff';
            ctx.roundRect(kx - 2, ky - 2, kw + 4, kh + 4, 8);
            ctx.fill();
            
            // Inner background mask
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(kx, ky, kw, kh, 6);
            ctx.clip();

   // Background (purple-ish like splash screen)
            ctx.fillStyle = 'rgba(168,85,247,0.4)';
            ctx.fillRect(kx, ky, kw, kh);

            // Ciemne tło paska (too early) 0-70
            ctx.fillStyle = 'rgba(30, 25, 40, 0.85)'; 
            ctx.fillRect(kx, ky, kw * 0.7, kh);
            
            // Green (perfect) 70-90
            ctx.fillStyle = world.isChargingKick ? 'rgba(46, 196, 182, 0.9)' : 'rgba(27, 112, 104, 0.7)';
            ctx.fillRect(kx + kw * 0.7, ky, kw * 0.2, kh);
            
            // Ciemne tło paska (too late) 90-100
            ctx.fillStyle = 'rgba(30, 25, 40, 0.85)'; 
            ctx.fillRect(kx + kw * 0.9, ky, kw * 0.1, kh);
            
            ctx.restore(); // remove clip

            // Show 'KICK THE BALL!' if it's the player's turn to kick, so they know what to do!
            const scale = 1.0 + Math.sin(now / 180) * 0.05;
            ctx.save();
            ctx.translate(GAME_WIDTH / 2, ky - 20); // Moved down to avoid overlapping the score UI
            ctx.scale(scale, scale);
            if (world.player.role === 'ATTACKER') {
                drawStylishText("KICK THE BALL!", 0, 0, 24, fioletColors);
            } else {
                drawStylishText("OPPONENT KICKING!", 0, 0, 24, ['#ef233c', '#d90429']);
            }
            ctx.restore();

            if (world.isChargingKick) {
                // Ball Marker
                const ballImg = getImage('sprites.ball');
                const markerX = kx + (kw * world.kickPower/100);
                const markerSize = 32; // w-8 h-8
                if (ballImg) {
                    ctx.save();
                    // No shadows here either as requested
                    // Draw ball centered horizontally, resting on the bottom of the bar
                    ctx.drawImage(ballImg, markerX - markerSize / 2, ky + kh - markerSize + 4, markerSize, markerSize);
                    ctx.restore();
                } else {
                    ctx.fillStyle = '#fff';
                    ctx.beginPath();
                    ctx.arc(markerX, ky + kh / 2, 8, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        if (world.bigTackleTimer > 0) {
            ctx.fillStyle = '#c084fc';
            ctx.font = 'bold 80px Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.globalAlpha = world.bigTackleTimer;
            ctx.fillText("TACKLE!", GAME_WIDTH / 2, GAME_HEIGHT / 2);
            ctx.globalAlpha = 1.0;
        }

        if (world.subState === GameSubState.COUNTDOWN) {
            const count = Math.ceil(world.countdownTimer);
            const rawScale = (world.countdownTimer % 1.0); // 0.0 to 1.0
            const scale = 1.0 + Math.pow(rawScale, 3) * 0.4; // Pop animation

            ctx.save();
            ctx.translate(GAME_WIDTH / 2, GAME_HEIGHT / 2);
            ctx.scale(scale, scale);
            
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            
            ctx.font = '900 180px "Arial Black", Impact, sans-serif';
            
            // Text Stroke (Outline)
            ctx.strokeStyle = '#2e1065';
            ctx.lineWidth = 18;
            ctx.strokeText(count.toString(), 0, 0);
            
            // Text Fill with Gradient
            const grad = ctx.createLinearGradient(0, -90, 0, 90);
            grad.addColorStop(0, '#d8b4fe'); // purple-300
            grad.addColorStop(0.4, '#a855f7'); // purple-500
            grad.addColorStop(0.6, '#7e22ce'); // purple-700
            grad.addColorStop(1, '#3b0764'); // purple-950
            
 // Remove shadow for fill
            ctx.fillStyle = grad;
            ctx.fillText(count.toString(), 0, 0);
            
            // Inner highlight
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.fillText(count.toString(), -5, -8);

            ctx.restore();
        }
        
        // RYSOWANIE DYNAMICZNYCH STRZAŁEK NAPROWADZAJĄCYCH NAD PRZYCISKAMI INTERFEJSU MOBILNEGO
        const drawButtonArrow = (targetX: number) => {
            ctx.save();
            const btnBounceY = Math.sin(now * 0.01) * 6; // Szybki, rzucający się w oczy bounce
            ctx.translate(targetX, GAME_HEIGHT - 120 + btnBounceY); // Pozycja idealnie nad ramkami przycisków

            ctx.beginPath();
            ctx.moveTo(-10, -25); ctx.lineTo(-10, 0);
            ctx.lineTo(-20, 0);   ctx.lineTo(0, 18); ctx.lineTo(20, 0);
            ctx.lineTo(10, 0);    ctx.lineTo(10, -25);
            ctx.closePath();

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 5;
            ctx.lineJoin = 'round';
            ctx.stroke();
            ctx.fillStyle = '#AF5BF4'; // Fiolet gry
            ctx.fill();
            ctx.restore();
        };
// POPRAWKA: Wyłączono starą Canvasową strzałkę z lewego brzegu ekranu, która wskazywała puste miejsce.
        if (world.isExtraPointAttempt && world.subState === GameSubState.KICKING && world.player.role === PlayerRole.ATTACKER) {
            drawButtonArrow(GAME_WIDTH - 94);  // Nad przyciskiem KICK wyłącznie podczas wykopu
        }



        ctx.restore();
    }
drawTrail(player: Player, dir: number, skinColor: string, shirtColor: string, img: HTMLImageElement | undefined, hasOptimalMomentum: boolean, isTackling: boolean) {
        if (!hasOptimalMomentum && !isTackling) return;

        const ctx = this.ctx;
        ctx.save();
        
        ctx.globalCompositeOperation = 'lighter';
        
        // POPRAWKA: Sprawdzamy czy aktualnie trwa kinowy pokaz szarży specjalnej gracza
        const isSpecialAttackActive = hasOptimalMomentum && player.scrumPushTimer > 0.4;

        // POPRAWKA WIZUALNA: Jeśli trwa Special Attack, zagęszczamy linie (aż 12!), wydłużamy ogon do kolosalnych 260px 
        // oraz drastycznie zwiększamy grubość pasów (16px), tworząc niesamowicie potężną, neonową kometę energii!
        const lines = isSpecialAttackActive ? 12 : (isTackling ? 8 : 6);
        const trailLen = isSpecialAttackActive ? 260 : (isTackling ? 130 : 80);
        const t = Date.now() / 100;
        
        for (let i = 0; i < lines; i++) {
            const y = player.pos.y + (player.size.y / lines) * (i + 0.5);
            const phase = i * 2.5;
            const xWobble = Math.sin(t + phase) * 8;
            
            const alpha = isSpecialAttackActive ? 0.85 : (0.5 + Math.sin(t * 1.5 + phase) * 0.3);
            
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            
            ctx.lineWidth = isSpecialAttackActive ? 16 : (isTackling ? 6 : 4);
            ctx.lineCap = 'round';
            
            const startX = player.pos.x + (dir > 0 ? 0 : player.size.x) - (dir * xWobble);
            const endX = startX - (dir * trailLen);
            
            const grad = ctx.createLinearGradient(startX, y, endX, y);
            grad.addColorStop(0, shirtColor);
            grad.addColorStop(1, 'rgba(0,0,0,0)');
            
            ctx.strokeStyle = grad;
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
            ctx.stroke();
        }
        
        ctx.restore();
    }

drawStadiumBackground(world: GameWorld) {
        const { ctx } = this;
        
        const arenaImg = getImage('backgrounds.arena');
        if (arenaImg) {
            ctx.save();
            // Object-fit: cover logic
            const scale = Math.max(GAME_WIDTH / arenaImg.width, GAME_HEIGHT / arenaImg.height);
            const drawW = arenaImg.width * scale;
            const drawH = arenaImg.height * scale;
            const drawY = (GAME_HEIGHT - drawH) / 2;
            
            let offsetX = (world as any).bgScrollX || 0;
            offsetX = offsetX % drawW;
            
            // POPRAWKA: Sprowadzamy pozycje X do liczb całkowitych i dodajemy 1px nakładki szerokości (w).
            // To całkowicie eliminuje sprzętowy błąd wygładzania krawędzi (subpixel anti-aliasing) w Canvasie!
            const x1 = Math.floor(-offsetX);
            const x2 = Math.floor(drawW - offsetX);
            const w = Math.ceil(drawW) + 1; // 1px naddatku (overlap) gwarantuje idealny szew bez prześwitów
            
            // Rysujemy podwójnie z bezpiecznym mikronakładaniem na siebie
            ctx.drawImage(arenaImg, x1, drawY, w, drawH);
            ctx.drawImage(arenaImg, x2, drawY, w, drawH);
            
            ctx.restore();
            return;
        }

        const horizon = GAME_HEIGHT * 0.40;
        
        ctx.save();
        // Give the background a massive horizontal bleed area to prevent zoom clipping
        const bleed = GAME_WIDTH;
        
        // Wall / Crowd Area
        const gradient = ctx.createLinearGradient(0, 0, 0, horizon);
        gradient.addColorStop(0, '#0a0a1a');
        gradient.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = gradient;
        ctx.fillRect(-bleed, 0, GAME_WIDTH + bleed * 2, horizon);
        
        // Simple Crowd dots
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for(let i=0; i<300; i++) {
             let y = Math.random() * horizon * 0.8 + horizon * 0.1;
             ctx.fillRect(-bleed + Math.random() * (GAME_WIDTH + bleed * 2), y, 3, 3);
        }
        
        // Stadium Lights
        ctx.fillStyle = '#ffffe0';
        if (!world.isExtraPointAttempt) {
            ctx.shadowColor = '#ffffaa';
            ctx.shadowBlur = 15;
        }
        ctx.beginPath(); ctx.arc(GAME_WIDTH * 0.2, 40, 12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(GAME_WIDTH * 0.8, 40, 12, 0, Math.PI * 2); ctx.fill();
        if (!world.isExtraPointAttempt) {
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'rgba(0,0,0,0)';
        }
         
        
        // Turf Floor with perspective
        const floorGrad = ctx.createLinearGradient(0, horizon, 0, GAME_HEIGHT);
        floorGrad.addColorStop(0, '#195a2e');
        floorGrad.addColorStop(1, '#2c8f49');
        ctx.fillStyle = floorGrad;
        ctx.fillRect(-bleed, horizon, GAME_WIDTH + bleed * 2, GAME_HEIGHT - horizon);
        
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        
        const numLines = 11;
        for(let i=0; i<numLines; i++) {
            const topX = GAME_WIDTH/2 + (i - 5) * 45;
            const bottomX = GAME_WIDTH/2 + (i - 5) * 150; // Perspective fan outwards
            
            ctx.beginPath();
            ctx.moveTo(topX, horizon);
            ctx.lineTo(bottomX, GAME_HEIGHT);
            ctx.stroke();
            
            // Yard labels
            if (i > 0 && i < numLines - 1) {
                 let yard = i * 10;
                 if (yard > 50) yard = 100 - yard;
                 ctx.fillStyle = 'rgba(255,255,255,0.5)';
                 ctx.fillText(yard.toString(), bottomX, GAME_HEIGHT - 10);
            }
        }
        
        // Endzones projection
        ctx.fillStyle = 'rgba(67, 97, 238, 0.4)'; // Blue left
        ctx.beginPath();
        ctx.moveTo(-bleed, horizon); // Bleed left
        ctx.lineTo(GAME_WIDTH/2 - 5 * 45, horizon);
        ctx.lineTo(GAME_WIDTH/2 - 5 * 150, GAME_HEIGHT);
        ctx.lineTo(-bleed, GAME_HEIGHT); // Bleed left
        ctx.fill();

        ctx.fillStyle = 'rgba(230, 57, 70, 0.4)'; // Red right
        ctx.beginPath();
        ctx.moveTo(GAME_WIDTH/2 + 5 * 45, horizon);
        ctx.lineTo(GAME_WIDTH + bleed, horizon); // Bleed right
        ctx.lineTo(GAME_WIDTH + bleed, GAME_HEIGHT); // Bleed right
        ctx.lineTo(GAME_WIDTH/2 + 5 * 150, GAME_HEIGHT);
        ctx.fill();

        // Draw goals
        this.drawGoalPost(GAME_WIDTH * 0.08, horizon, '#0ff');
        this.drawGoalPost(GAME_WIDTH * 0.92, horizon, '#f0f');
        
        ctx.restore();
    }

    drawGoalPost(xBottom: number, yBottom: number, neonColor: string) {
        const { ctx } = this;
        ctx.strokeStyle = neonColor;
        ctx.lineWidth = 4;
        
        // Remove shadows for extra point
        // if (!world.isExtraPointAttempt) { 
        //   we don't have access to world here, but it's safe to just draw them without glow, 
        //   or we can skip glow entirely or pass in world.
        // }
        // Let's just remove the glow from the goalpost, it was probably causing bleed issues anyway.
        // ctx.shadowBlur = 10;
        // ctx.shadowColor = neonColor;
        
        const yTop = yBottom - 80;
        const w = 40;
        
        ctx.beginPath();
        ctx.moveTo(xBottom, yBottom);
        ctx.lineTo(xBottom, yTop); // Main trunk
        
        ctx.moveTo(xBottom - w, yTop);
        ctx.lineTo(xBottom + w, yTop); // Crossbar
        
        ctx.moveTo(xBottom - w, yTop);
        ctx.lineTo(xBottom - w, yTop - 60); // Left upright
        
        ctx.moveTo(xBottom + w, yTop);
        ctx.lineTo(xBottom + w, yTop - 60); // Right upright
        ctx.stroke();
        
         
    }
   
    syncHtmlJumpButton(visible: boolean, transition: number) {
        if (typeof document === 'undefined') return;
        
        // Namierzanie bezpośrednio po unikalnym ID kontenera
        const jumpBtn = document.getElementById('html-jump-button');
        if (!jumpBtn) return;

        if (visible && transition > 0) {
            // Przeniesienie przycisku na prawą stronę pasu kinowego
            jumpBtn.style.setProperty('display', 'block', 'important');
            jumpBtn.style.position = 'absolute';
            jumpBtn.style.left = 'auto';
            jumpBtn.style.right = '24px'; // Margines boczny od prawej krawędzi kadru
            
            // Dla pasu 144px i przycisku 96px, dolny margines 24px daje idealne wyśrodkowanie w pionie (24 + 96 + 24 = 144)
            jumpBtn.style.bottom = `${24 * transition}px`;
            
            // Płynne wejście kinowe
            jumpBtn.style.opacity = `${transition}`;
            jumpBtn.style.transform = `scale(${transition})`;
            jumpBtn.style.zIndex = '999';
        } else {
            // Całkowite ukrycie i wyczyszczenie cienia podczas normalnego biegu
            jumpBtn.style.setProperty('display', 'none', 'important');
        }
    }
}
