import { GameWorld, PhysicalBody } from './GameWorld';
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
        
        this.drawStadiumBackground(); // We will implement this
        
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
            let cx = x + w/2;
            let cy = y + h;
            
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            
            if (knockbackTimer > 0) {
                let progress = 1.0 - (knockbackTimer / 0.4);
                let rot = (Math.PI/2) * progress;
                ctx.rotate((velX < 0 ? -rot : rot) * (dirX >= 0 ? 1 : -1));
                ctx.translate(0, -40 * Math.min(1, progress*3)); // jump up slightly while rotating
            } else if (isStunned) {
                // Animate get up in the last 0.3 seconds
                let rot = Math.PI/2;
                if (stunTimer < 0.3) {
                    rot = (Math.PI/2) * (stunTimer / 0.3);
                }
                ctx.rotate(rot * (dirX >= 0 ? 1 : -1));
                ctx.translate(0, -40 * Math.min(1, stunTimer*3)); // 40 is old w/2
            } else if (isTackling) {
                ctx.rotate((Math.PI/8) * (velX >= 0 ? 1 : -1));
            }
            
            // Override cx and cy for drawing logic since we already translated
            cx = 0;
            cy = 0;
            
            if (isDebuff) {
                ctx.globalAlpha = 0.6;
            }
        
            const runSpeed = isStunned ? 0 : Math.abs(velX);
            const runCycle = now * 0.015 * (runSpeed / 100);
            const bounceY = (runSpeed > 10 && !isTackling) ? Math.abs(Math.sin(runCycle)) * 12 : 0;
            
            const faceDir = dirX !== 0 ? dirX : 1;
            
            const headS = 45; 
            const torsoW = 35;
            const torsoH = 40;
            const shoeS = 22;
            const handS = 12;
            const drawH = 80;
            
            const imgHead = spritePrefix ? getImage('sprites.' + spritePrefix + '_head') : null;
            const imgBody = spritePrefix ? getImage('sprites.' + spritePrefix + '_body') : null;
            const imgArm = spritePrefix ? getImage('sprites.' + spritePrefix + '_arm') : null;
            const imgLeg = spritePrefix ? getImage('sprites.' + spritePrefix + '_leg') : null;

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
            
            // Back Arm
            const bArmY = cy - drawH + headS + 15 + bounceY;
            const bArmX = cx + Math.sin(runCycle + Math.PI) * 20 * (runSpeed>10?1:0);
            if (!drawPart(imgArm, bArmX, bArmY, handS * 3)) {
                ctx.fillStyle = skinColor;
                ctx.beginPath(); ctx.arc(bArmX, bArmY, handS, 0, Math.PI*2); ctx.fill();
            }
            
            // Back Leg (Shoe)
            const bLegY = cy - shoeS/2 - (runSpeed>10 ? Math.max(0, Math.sin(runCycle + Math.PI) * 15) : 0);
            const bLegX = cx + Math.cos(runCycle + Math.PI) * 20 * (runSpeed>10?1:0);
            if (!drawPart(imgLeg, bLegX, bLegY, shoeS * 1.5)) {
                ctx.fillStyle = '#222'; 
                ctx.beginPath(); ctx.ellipse(bLegX, bLegY, shoeS, shoeS/1.5, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#0ff'; // Neon laces
                ctx.fillRect(bLegX + (faceDir * shoeS*0.3), bLegY - 4, 4, 8);
            }
            
            // Torso
            const torsoY = cy - drawH + headS + bounceY + torsoH/2;
            if (!drawPart(imgBody, cx, torsoY, torsoH * 1.5)) {
                ctx.fillStyle = primaryColor;
                ctx.beginPath();
                ctx.roundRect(cx - torsoW/2, cy - drawH + headS + bounceY, torsoW, torsoH, 10);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.fillRect(cx - torsoW/2 + 5, cy - drawH + headS + 15 + bounceY, torsoW - 10, 8); // Stripe
            }
            
            // Front Leg (Shoe)
            let fLegY = cy - shoeS/2 - (runSpeed>10 ? Math.max(0, Math.sin(runCycle) * 15) : 0);
            let fLegX = cx + Math.cos(runCycle) * 20 * (runSpeed>10?1:0);
            let fLegRot = 0;
            if (isKicking) {
                fLegY = cy - 40;
                fLegX = cx + faceDir * 40;
                fLegRot = -Math.PI/4;
            } else if (isTackling) {
                fLegY = cy - 10;
                fLegX = cx + faceDir * 30;
                fLegRot = -Math.PI/8;
            }
            if (!drawPart(imgLeg, fLegX, fLegY, shoeS * 1.5, fLegRot)) {
                ctx.fillStyle = primaryColor; 
                ctx.beginPath(); ctx.ellipse(fLegX, fLegY, shoeS, shoeS/1.5, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; 
                ctx.fillRect(fLegX - shoeS + 5, fLegY + shoeS/2 - 2, shoeS*2 - 10, 4);
            }
            
            // Head / Helmet
            const headY = cy - drawH + headS/2 + bounceY;
            const headX = cx + (faceDir * 5); 
            if (!drawPart(imgHead, headX, headY, headS * 2)) {
                ctx.fillStyle = primaryColor; 
                ctx.beginPath(); ctx.arc(headX, headY, headS, 0, Math.PI*2); ctx.fill();
                
                // Visor / Face cut
                ctx.fillStyle = skinColor;
                ctx.beginPath(); ctx.arc(headX + faceDir*10, headY+8, headS - 15, 0, Math.PI*2); ctx.fill();
                
                // Helmet grill
                ctx.strokeStyle = '#e0e0e0';
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.moveTo(headX + faceDir*20, headY);
                ctx.lineTo(headX + faceDir*45, headY + 20);
                ctx.moveTo(headX + faceDir*15, headY + 10);
                ctx.lineTo(headX + faceDir*35, headY + 30);
                ctx.stroke();
                
                // Eye
                ctx.fillStyle = isStunned ? '#ff0000' : '#fff';
                if(isStunned) {
                    ctx.strokeStyle = '#800'; ctx.lineWidth = 3;
                    ctx.beginPath(); ctx.moveTo(headX + faceDir*20 - 6, headY-6); ctx.lineTo(headX + faceDir*20 + 6, headY+6); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(headX + faceDir*20 + 6, headY-6); ctx.lineTo(headX + faceDir*20 - 6, headY+6); ctx.stroke();
                } else {
                    ctx.beginPath(); ctx.arc(headX + faceDir*20, headY-5, 8, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = '#000';
                    ctx.beginPath(); ctx.arc(headX + faceDir*(20 + (velX*faceDir>10?3:0)), headY-5, 3, 0, Math.PI*2); ctx.fill();
                    // Eyebrow
                    ctx.strokeStyle = '#222';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(headX + faceDir*10, headY - 15);
                    ctx.lineTo(headX + faceDir*28, headY - 8 + (isTackling?5:0)); // Angrier if tackling
                    ctx.stroke();
                }
            }
            
            // Front Arm
            let fArmY = cy - drawH + headS + 15 + bounceY;
            let fArmX = cx + Math.sin(runCycle) * 20 * (runSpeed>10?1:0);
            let fArmRot = 0;
            if (isTackling) {
                fArmX = cx + faceDir * 35;
                fArmY = cy - drawH + headS + 10;
                fArmRot = -Math.PI/4;
            }
            if (!drawPart(imgArm, fArmX, fArmY, handS * 3, fArmRot)) {
                ctx.fillStyle = skinColor;
                ctx.beginPath(); ctx.arc(fArmX, fArmY, handS, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; // Sweatband
                ctx.fillRect(fArmX - handS, fArmY - 2, handS*2, 4);
            }
        
            ctx.restore();
        };

        // Draw Bot
        const botDir = world.bot.facingX;
        const botImg = getImage('sprites.bot');
        const botEffectiveStun = world.bot.isWaitingForScrumRecovery ? 1.0 : world.bot.stunTimer;
        
        if (world.bot.isTackling || world.bot.isBoosting) {
             this.drawTrail(world.bot, botDir, '#fbc4ab', '#e63946', botImg, world.bot.isBoosting, world.bot.isTackling);
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
                ctx.rotate(Math.PI/8);
            }
            
            ctx.drawImage(botImg, -world.bot.size.x/2, -world.bot.size.y/2, world.bot.size.x, world.bot.size.y);
            ctx.restore();
        } else {
            drawHeadballPlayer(world.bot.pos.x, world.bot.pos.y, world.bot.size.x, world.bot.size.y, 
                '#e63946', '#fbc4ab', botEffectiveStun, world.bot.debuffTimer > 0, 
                world.bot.isTackling || world.bot.isDiving || world.subState === GameSubState.SCRUM_MATRIX, world.subState === GameSubState.KICKING && world.bot.role === PlayerRole.ATTACKER, botDir, world.bot.vel.x, world.bot.onGround, world.bot.vel.y, world.bot.knockbackTimer, 'bot');
        }
        ctx.shadowBlur = 0;
        
        // Draw Player
        const pDir = world.player.facingX;
        const playerImg = getImage('sprites.player');
        const pEffectiveStun = world.player.isWaitingForScrumRecovery ? 1.0 : world.player.stunTimer;
        
        if (world.player.isTackling || world.player.isBoosting) {
             this.drawTrail(world.player, pDir, '#ffcab0', '#4361ee', playerImg, world.player.isBoosting, world.player.isTackling);
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
            } else if (world.player.isTackling) {
                ctx.rotate(Math.PI/8);
            }
            
            ctx.drawImage(playerImg, -world.player.size.x/2, -world.player.size.y/2, world.player.size.x, world.player.size.y);
            ctx.restore();
        } else {
            drawHeadballPlayer(world.player.pos.x, world.player.pos.y, world.player.size.x, world.player.size.y, 
                '#4361ee', '#ffcab0', pEffectiveStun, world.player.debuffTimer > 0, 
                world.player.isTackling || world.player.isDiving || world.subState === GameSubState.SCRUM_MATRIX, world.subState === GameSubState.KICKING && world.player.role === PlayerRole.ATTACKER, 
                pDir, world.player.vel.x, world.player.onGround, world.player.vel.y, world.player.knockbackTimer, 'player');
        }
        ctx.shadowBlur = 0;

        // Draw Ball Shadow
        if (!world.ball.onGround) {
             let shadowW = Math.max(5, 60 - ((GROUND_Y - world.ball.pos.y) / 15));
             ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
             ctx.beginPath();
             ctx.ellipse(world.ball.pos.x + world.ball.size.x/2, GROUND_Y - 5, Math.abs(shadowW), Math.abs(shadowW)/3, 0, 0, Math.PI*2);
             ctx.fill();
        }

        // Draw Ball
        const ballImg = getImage('sprites.ball');
        if (ballImg) {
             ctx.drawImage(ballImg, world.ball.pos.x, world.ball.pos.y, world.ball.size.x, world.ball.size.y);
        } else {
             ctx.save();
             ctx.translate(world.ball.pos.x + world.ball.size.x/2, world.ball.pos.y + world.ball.size.y/2);
             // Spin ball if moving
             const spin = world.ball.vel.x !== 0 ? (now / 100) * (world.ball.vel.x > 0 ? 1 : -1) : 0;
             ctx.rotate(spin);
             
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

        // Draw Particles
        for (const p of world.particles) {
            ctx.fillStyle = p.type === 'hit' ? '#ff9f1c' : p.type === 'perfect' ? '#2ec4b6' : p.type === 'miss' ? '#e63946' : '#fff';
            ctx.globalAlpha = Math.min(1, p.life * 2);
            
            if (p.type === 'touchdown' || p.type === 'fieldgoal' || p.type === 'perfect') {
                 // Confetti
                 ctx.save();
                 ctx.translate(p.pos.x, p.pos.y);
                 ctx.rotate(p.life * 10);
                 ctx.fillRect(-4, -4, 8, 8);
                 ctx.restore();
            } else {
                 ctx.beginPath();
                 ctx.arc(p.pos.x, p.pos.y, 4, 0, Math.PI*2);
                 ctx.fill();
            }
            ctx.globalAlpha = 1.0;
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
        
        // --- BEGIN FIXED ON-SCREEN HUD ---
        ctx.save();
        
        // Draw Scrum Bars
        if (world.subState === GameSubState.SCRUM_MATRIX) {
            
            const drawGiantScrumBar = (percent: number, released: boolean, power: number, isLeft: boolean) => {
                const bw = GAME_WIDTH * 0.45; // Massive horizontal bar (45% of width)
                const bh = 40; // thick
                const bx = isLeft ? 15 : GAME_WIDTH - 15 - bw;
                const by = 120; // Lowered to avoid HUD message overlap
                
                // Background
                ctx.fillStyle = '#111';
                ctx.strokeStyle = isLeft ? '#4361ee' : '#e63946';
                ctx.lineWidth = 4;
                ctx.fillRect(bx, by, bw, bh);
                ctx.strokeRect(bx, by, bw, bh);
                
                // Perfect zone (80% to 88%)
                const perfStart = isLeft ? bx + bw * 0.8 : bx + bw * 0.12;
                ctx.fillStyle = '#1b7068';
                ctx.fillRect(perfStart, by, bw * 0.08, bh);
                
                // Fill
                if (released) {
                    if (power === 100) {
                        ctx.fillStyle = '#2ec4b6'; // perfect
                        ctx.fillRect(isLeft ? bx : bx + bw - bw * 0.84, by, bw * 0.84, bh);
                    } else if (power === 0) {
                        ctx.fillStyle = '#e63946'; // fail
                        ctx.fillRect(bx, by, bw, bh);
                    } else {
                        ctx.fillStyle = '#ffb703'; // early
                        const w = bw * (0.8 * (power-10)/70);
                        ctx.fillRect(isLeft ? bx : bx + bw - w, by, w, bh); 
                    }
                } else {
                    ctx.fillStyle = isLeft ? '#4361ee' : '#e63946';
                    const w = bw * Math.min(1, percent);
                    ctx.fillRect(isLeft ? bx : bx + bw - w, by, w, bh);
                }
            };

            const pPercent = world.player.scrumCharging ? world.player.scrumChargeTimer / world.scrumDuration : 0;
            const bPercent = world.bot.scrumCharging ? world.bot.scrumChargeTimer / world.scrumDuration : 0;

            drawGiantScrumBar(pPercent, world.player.scrumReleased, world.player.scrumPower, true);
            drawGiantScrumBar(bPercent, world.bot.scrumReleased, world.bot.scrumPower, false);
        }

        // Draw Kick meter depending on if it's Extra Point time
        if (world.isExtraPointAttempt) {
            const kw = 400; // wide meter at top
            const kh = 24;
            const kx = GAME_WIDTH / 2 - kw / 2;
            const ky = 60;
            
            ctx.fillStyle = '#555';
            ctx.fillRect(kx - 2, ky - 2, kw + 4, kh + 4);
            
            // Orange (too early) 0-70
            ctx.fillStyle = world.isChargingKick ? '#ffb703' : '#a37a00'; 
            ctx.fillRect(kx, ky, kw * 0.7, kh);
            
            // Green (perfect) 70-90
            ctx.fillStyle = world.isChargingKick ? '#2ec4b6' : '#1b7068';
            ctx.fillRect(kx + kw * 0.7, ky, kw * 0.2, kh);
            
            // Red (too late) 90-100
            ctx.fillStyle = world.isChargingKick ? '#e63946' : '#852129';
            ctx.fillRect(kx + kw * 0.9, ky, kw * 0.1, kh);

            if (world.isChargingKick) {
                // "KOPNIĘCIE!" Label
                ctx.fillStyle = '#ff9f1c';
                ctx.font = 'bold 24px Impact, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText("KOPNIĘCIE!", GAME_WIDTH / 2, ky - 10);
                
                // Marker
                ctx.fillStyle = '#fff';
                ctx.fillRect(kx + (kw * world.kickPower/100) - 2, ky-5, 4, kh+10);
            }
        }

        if (world.bigTackleTimer > 0) {
            ctx.fillStyle = '#ff9f1c';
            ctx.font = 'bold 80px Impact, sans-serif';
            ctx.textAlign = 'center';
            ctx.globalAlpha = world.bigTackleTimer;
            ctx.fillText("TACKLE!", GAME_WIDTH / 2, GAME_HEIGHT / 2);
            ctx.globalAlpha = 1.0;
        }

        if (world.subState === GameSubState.COUNTDOWN) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 120px Impact, sans-serif';
            ctx.textAlign = 'center';
            const count = Math.ceil(world.countdownTimer);
            ctx.fillText(count.toString() + "...", GAME_WIDTH / 2, GAME_HEIGHT / 2);
        }
        
        // Hide extra BLITZ text as we have KICKOFF red message
        // removed KICKOFF_LAUNCH text
        
        // Draw Momentum UI (Fighting game style)
        this.drawUIBars(world);

        ctx.restore();
    }
    
    drawUIBars(world: GameWorld) {
        const { ctx } = this;
        // P1 Momentum
        this.drawLargeMomentumBar(30, 20, world.player.momentum, true);
        // Bot Momentum
        this.drawLargeMomentumBar(GAME_WIDTH - 230, 20, world.bot.momentum, false);
        
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px "Courier New", Courier, monospace';
        ctx.textAlign = 'left';
        ctx.fillText("MOMENTUM P1", 30, 15);
        ctx.textAlign = 'right';
        ctx.fillText("MOMENTUM BOT", GAME_WIDTH - 30, 15);
    }
    
    drawLargeMomentumBar(x: number, y: number, momentum: number, isLeft: boolean) {
        this.ctx.fillStyle = '#333';
        const w = 200;
        this.ctx.fillRect(x, y, w, 15);
        
        this.ctx.fillStyle = momentum >= 100 ? '#ff9f1c' : (momentum > 70 ? '#2ec4b6' : '#00ffcc');
        if (isLeft) {
            this.ctx.fillRect(x, y, w * (momentum/100), 15);
        } else {
            this.ctx.fillRect(x + w - w * (momentum/100), y, w * (momentum/100), 15);
        }
        
        // Draw 100% glow if full
        if (momentum >= 100) {
            this.ctx.strokeStyle = '#ff9f1c';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x-2, y-2, w+4, 19);
        }
    }

    drawTrail(player: PhysicalBody, dir: number, skinColor: string, shirtColor: string, img: HTMLImageElement | undefined, hasOptimalMomentum: boolean, isTackling: boolean) {
        if (!hasOptimalMomentum && !isTackling) return;

        const ctx = this.ctx;
        ctx.save();
        
        ctx.globalCompositeOperation = 'lighter';
        
        const lines = isTackling ? 6 : 4;
        const trailLen = isTackling ? 100 : 50;
        const t = Date.now() / 100;
        
        for (let i = 0; i < lines; i++) {
            const y = player.pos.y + (player.size.y / lines) * (i + 0.5);
            const phase = i * 2.5;
            const xWobble = Math.sin(t + phase) * 8;
            const alpha = 0.3 + Math.sin(t * 1.5 + phase) * 0.3;
            
            ctx.globalAlpha = alpha;
            ctx.beginPath();
            ctx.lineWidth = isTackling ? 4 : 2;
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

    drawStadiumBackground() {
        const { ctx } = this;
        
        const arenaImg = getImage('backgrounds.arena');
        if (arenaImg) {
            ctx.save();
            // Object-fit: cover logic
            const scale = Math.max(GAME_WIDTH / arenaImg.width, GAME_HEIGHT / arenaImg.height);
            const drawW = arenaImg.width * scale;
            const drawH = arenaImg.height * scale;
            const drawX = (GAME_WIDTH - drawW) / 2;
            const drawY = (GAME_HEIGHT - drawH) / 2;
            ctx.drawImage(arenaImg, drawX, drawY, drawW, drawH);
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
        ctx.shadowColor = '#ffffaa';
        ctx.shadowBlur = 15;
        ctx.beginPath(); ctx.arc(GAME_WIDTH * 0.2, 40, 12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(GAME_WIDTH * 0.8, 40, 12, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        
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
        ctx.shadowBlur = 10;
        ctx.shadowColor = neonColor;
        
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
        
        ctx.shadowBlur = 0;
    }
}
