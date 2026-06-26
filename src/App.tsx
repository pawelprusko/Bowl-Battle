import { useEffect, useRef, useState } from 'react';
import { GameState } from './game/Types';
import { GameWorld } from './game/GameWorld';
import { Renderer } from './game/Renderer';
import { loadAssets } from './game/assets';
import { updateGameDimensions } from './game/constants';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.SPLASH);
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // Game instance Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<GameWorld | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const gameStateRef = useRef<GameState>(GameState.SPLASH);

  // HUD State
  const [hudState, setHudState] = useState({
    time: 45,
    pScore: 0,
    bScore: 0,
    message: '',
    playerRole: 'NEUTRAL',
    isExtraPoint: false,
    subState: 'COUNTDOWN'
  });

  const updateGameState = (newState: GameState) => {
      setGameState(newState);
      gameStateRef.current = newState;
  };

  const handlePlayClick = () => {
    updateGameState(GameState.LOADING);
    
    // start loading
    loadAssets().then(() => {
        let progress = 0;
        const interval = setInterval(() => {
            progress += 100 / (5.0 / 0.1); // 5 seconds total
            if (progress >= 100) {
                clearInterval(interval);
                startGame();
            }
            setLoadingProgress(Math.min(progress, 100));
        }, 100);
    });
  };

  const startGame = () => {
    updateGameState(GameState.PLAYING);
    if (!worldRef.current) {
        worldRef.current = new GameWorld();
    } else {
        worldRef.current.isExtraPointAttempt = false;
        worldRef.current.resetToSnap();
        worldRef.current.playerScore = 0;
        worldRef.current.botScore = 0;
        worldRef.current.timeLeft = 45;
    }
  };
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 450 });
  const [scale, setScale] = useState(1);

  useEffect(() => {
      // [FIX] Layout hack for Mobile Safe Area / 100vh bugs
      const nudgeLayout = () => {
          const root = document.getElementById('root');
          if (root) {
              root.style.height = '100.1vh';
              root.style.minHeight = '100.1vh';
              
              window.scrollTo(0, 1);
              
              setTimeout(() => {
                  root.style.height = '100%';
                  root.style.minHeight = '100dvh';
              }, 200);
          }
      };

      nudgeLayout();
      setTimeout(nudgeLayout, 500);
      
      const handleResize = () => {
          const windowRatio = window.innerWidth / window.innerHeight;
          const gameWidth = 450 * windowRatio;
          updateGameDimensions(gameWidth, 450);
          setDimensions({ width: gameWidth, height: 450 });
          setScale(window.innerHeight / 450);
      };
      
      const resizeWithDelay = () => {
          handleResize();
          setTimeout(handleResize, 100);
          setTimeout(handleResize, 300);
      };
      
      handleResize();
      window.addEventListener('resize', resizeWithDelay);
      window.addEventListener('orientationchange', resizeWithDelay);
      return () => {
          window.removeEventListener('resize', resizeWithDelay);
          window.removeEventListener('orientationchange', resizeWithDelay);
      };
  }, []);

  useEffect(() => {
      // Start or resume the game loop whenever we enter PLAYING state
      if (gameState === GameState.PLAYING) {
          if (canvasRef.current) {
              // Always recreate renderer to ensure it holds the newly mounted canvas
              rendererRef.current = new Renderer(canvasRef.current);
          }
          lastTimeRef.current = performance.now();
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
          gameLoop(performance.now());
      }
      return () => {
          if (animationRef.current) {
              cancelAnimationFrame(animationRef.current);
              animationRef.current = null;
          }
      };
  }, [gameState]);

  const gameLoop = (time: number) => {
    const dt = Math.min((time - lastTimeRef.current) / 1000, 0.1); // Cap dt
    lastTimeRef.current = time;
    
    if (worldRef.current && rendererRef.current) {
        const timeScale = worldRef.current.subState === 'SCRUM_MATRIX' ? 0.3 : 1.0;
        worldRef.current.update(dt * timeScale);
        rendererRef.current.render(worldRef.current);
        
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
            // Check if we need to vibrate
            const wantsVibrate = worldRef.current.screenShake > 0 || worldRef.current.subState === 'SCRUM_MATRIX';
            // @ts-ignore - custom global for throttling
            if (wantsVibrate && (!window.lastVibrate || time - window.lastVibrate > 100)) {
                if (worldRef.current.subState === 'SCRUM_MATRIX') {
                    // Pulsating: vibrate for 150ms every 300ms
                    if (Math.floor(time / 300) % 2 === 0) {
                        if (navigator.vibrate) navigator.vibrate(150);
                    }
                    // We only throttle the screen shake, for scrum we let the modulo handle timing,
                    // but we still need to prevent calling vibrate 60 times a second if possible,
                    // although browser ignores redundant calls.
                    // @ts-ignore
                    window.lastVibrate = time;
                } else {
                    if (navigator.vibrate) navigator.vibrate(50); // punch
                    // @ts-ignore
                    window.lastVibrate = time;
                }
            }
        }
        
        // sync HUD occasionally
        setHudState(prev => {
            if (!worldRef.current) return prev;
            const newTime = Math.ceil(worldRef.current.timeLeft);
            const pRole = worldRef.current.player.role;
            const newMessage = worldRef.current.acquiredMessage 
                ? worldRef.current.acquiredMessage
                : worldRef.current.subState === 'CELEBRATION' || worldRef.current.subState === 'BALL_ACQUIRED'
                ? worldRef.current.celebrationMessage
                : (worldRef.current.isExtraPointAttempt && worldRef.current.subState === 'REGULAR')
                ? "EXTRA POINT"
                : (worldRef.current.subState === 'KICKOFF_LAUNCH')
                ? "KICKOFF!"
                : "";
                
            if (prev.time !== newTime || prev.pScore !== worldRef.current.playerScore || prev.bScore !== worldRef.current.botScore || prev.message !== newMessage || prev.playerRole !== pRole || prev.isExtraPoint !== worldRef.current.isExtraPointAttempt || prev.subState !== worldRef.current.subState) {
                return {
                    time: newTime,
                    pScore: worldRef.current.playerScore,
                    bScore: worldRef.current.botScore,
                    message: newMessage,
                    playerRole: pRole,
                    isExtraPoint: worldRef.current.isExtraPointAttempt,
                    subState: worldRef.current.subState
                };
            }
            return prev;
        });
        
        if (worldRef.current.timeLeft <= 0 && worldRef.current.subState !== 'CELEBRATION' && gameStateRef.current === GameState.PLAYING) {
            updateGameState(GameState.GAME_OVER);
        }
    }
    
    if (gameStateRef.current === GameState.PLAYING) {
        animationRef.current = requestAnimationFrame(gameLoop);
    }
  };
  
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (!worldRef.current) return;
          if (e.key === 'ArrowLeft' || e.key === 'a') worldRef.current.player.dirX = -1;
          if (e.key === 'ArrowRight' || e.key === 'd') worldRef.current.player.dirX = 1;
          if (e.key === ' ' || e.key === 'Enter') {
              if (e.repeat) return;
              worldRef.current.playerTackle();
          }
          if (e.key === 'p' || e.key === 'e') worldRef.current.popBall();
          if (e.key === 'Shift') {
              if (e.repeat) return;
              worldRef.current.startKick();
          }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
          if (!worldRef.current) return;
          if (e.key === 'ArrowLeft' || e.key === 'a') {
              if (worldRef.current.player.dirX === -1) worldRef.current.player.dirX = 0;
          }
          if (e.key === 'ArrowRight' || e.key === 'd') {
              if (worldRef.current.player.dirX === 1) worldRef.current.player.dirX = 0;
          }
          if (e.key === ' ' || e.key === 'Enter') {
              worldRef.current.releaseTackle();
          }
          if (e.key === 'Shift') {
              worldRef.current.releaseKick();
          }
      };
      
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          if (animationRef.current) {
              cancelAnimationFrame(animationRef.current);
              animationRef.current = null;
          }
      };
  }, []);

  // Input Handlers
  const handleDirBtn = (dir: number) => {
      if (worldRef.current) worldRef.current.player.dirX = dir;
  };
  
  const handleTacklePress = () => {
      if (worldRef.current) worldRef.current.playerTackle();
  };
  
  const handleTackleRelease = () => {
      if (worldRef.current) worldRef.current.releaseTackle();
  };
  
  const handleKickPress = () => {
      if (worldRef.current) worldRef.current.startKick();
  };
  
  const handleKickRelease = () => {
      if (worldRef.current) worldRef.current.releaseKick();
  };

  return (
    <div className="game-container select-none">
      <div className="rotate-warning">
         <span className="text-4xl">📱</span>
         <h1 className="text-2xl font-bold">Obróć telefon do poziomu</h1>
         <p>Gra wymaga układu horyzontalnego (Landscape 16:9)</p>
      </div>

      {gameState === GameState.SPLASH && (
        <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center text-white z-50">
            <h1 className="text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(0,255,255,0.8)] tracking-tighter italic mb-2">
                BOWL BATTLE
            </h1>
            <h2 className="text-3xl font-bold text-red-500 mb-12 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]"> </h2>
            <button 
                onClick={handlePlayClick}
                className="px-12 py-4 bg-yellow-400 text-black text-3xl font-bold rounded shadow-[0_0_20px_rgba(255,255,0,0.6)] animate-pulse"
            >
                PLAY
            </button>
        </div>
      )}

      {gameState === GameState.LOADING && (
        <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center text-white z-50">
            <h2 className="text-2xl font-mono mb-4 text-cyan-400">Ładowanie dzielnicy...</h2>
            <div className="w-64 h-8 bg-gray-800 rounded p-1 border border-cyan-500/50">
                <div 
                    className="h-full bg-cyan-500 rounded transition-all duration-100 linear"
                    style={{ width: `${loadingProgress}%` }}
                />
            </div>
            <p className="mt-4 font-mono text-xl">{Math.ceil(5 - (loadingProgress/100)*5)}</p>
        </div>
      )}

      {/* Main Game rendering inside PLAYING or GAME_OVER */}
      {(gameState === GameState.PLAYING || gameState === GameState.GAME_OVER) && (
        <div className="fixed inset-0 bg-black overflow-hidden">
            <div 
                className="absolute top-1/2 left-1/2" 
                style={{ 
                    width: dimensions.width, 
                    height: dimensions.height, 
                    transform: `translate(-50%, -50%) scale(${scale})`, 
                    transformOrigin: 'center center' 
                }}
            >
                <canvas 
                    ref={canvasRef} 
                    className="absolute inset-0" 
                    width={dimensions.width}
                    height={dimensions.height}
                    style={{ width: dimensions.width, height: dimensions.height }}
                />
                
                {/* HUD Overlay */}
                <div 
                    className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none z-10"
                    style={{
                        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
                        paddingRight: 'max(1rem, env(safe-area-inset-right))',
                        paddingTop: 'max(1rem, env(safe-area-inset-top))'
                    }}
                >
                    <div className="bg-black/50 text-white px-6 py-2 rounded text-2xl font-bold font-mono">
                        P1: <span className="text-cyan-400">{hudState.pScore}</span>
                    </div>
                    
                    <div className="flex flex-col items-center">
                        <div className="bg-black/80 border-2 border-yellow-400 text-yellow-400 px-8 py-2 rounded-lg text-4xl font-black font-mono">
                            {hudState.time}
                        </div>
                        {hudState.message && (
                            <div className="mt-2 text-xl font-bold text-white bg-red-500 px-4 py-1 rounded animate-bounce">
                                {hudState.message}
                            </div>
                        )}
                    </div>
                    
                    <div className="bg-black/50 text-white px-6 py-2 rounded text-2xl font-bold font-mono">
                        BOT: <span className="text-red-400">{hudState.bScore}</span>
                    </div>
                </div>
                
                {/* Mobile Controls Overlay */}
                {gameState === GameState.PLAYING && (
                   <div 
                       className="absolute bottom-0 left-0 w-full h-full pointer-events-none p-4 flex justify-between items-end pb-8 z-10"
                       style={{
                           paddingLeft: 'max(1rem, env(safe-area-inset-left))',
                           paddingRight: 'max(1rem, env(safe-area-inset-right))',
                           paddingBottom: 'max(2rem, env(safe-area-inset-bottom))'
                       }}
                   >
                       {/* D-PAD Left */}
                       <div className="flex gap-2 pointer-events-auto">
                           <button 
                               className="w-20 h-20 bg-white/20 active:bg-white/40 border border-white/50 rounded-full flex items-center justify-center text-white text-3xl select-none"
                               onPointerDown={() => handleDirBtn(-1)}
                               onPointerUp={() => handleDirBtn(0)}
                               onPointerLeave={() => handleDirBtn(0)}
                           >
                               ◄
                           </button>
                           <button 
                               className="w-20 h-20 bg-white/20 active:bg-white/40 border border-white/50 rounded-full flex items-center justify-center text-white text-3xl select-none"
                               onPointerDown={() => handleDirBtn(1)}
                               onPointerUp={() => handleDirBtn(0)}
                               onPointerLeave={() => handleDirBtn(0)}
                           >
                               ►
                           </button>
                       </div>
                       
                       {/* Action Buttons Right */}
                       <div className="flex gap-4 pointer-events-auto items-end">
                           {hudState.subState === 'SCRUM_MATRIX' && !hudState.isExtraPoint && (
                               <button 
                                   className="w-24 h-24 bg-red-500/50 active:bg-red-500/80 border-2 border-red-500 rounded-full flex items-center justify-center text-white font-bold text-xl select-none"
                                   onPointerDown={handleTacklePress}
                                   onPointerUp={handleTackleRelease}
                                   onPointerLeave={handleTackleRelease}
                               >
                                   TACKLE
                               </button>
                           )}
                           {hudState.isExtraPoint && hudState.playerRole === 'ATTACKER' && (
                               <button 
                                   className="w-28 h-28 bg-yellow-500/50 active:bg-yellow-500/80 border-2 border-yellow-500 rounded-full flex items-center justify-center text-white font-bold text-2xl select-none mb-4"
                                   onPointerDown={handleKickPress}
                                   onPointerUp={handleKickRelease}
                                   onPointerLeave={handleKickRelease}
                               >
                                   KICK
                               </button>
                           )}
                       </div>
                   </div>
                )}

                {/* Game Over Screen */}
                {gameState === GameState.GAME_OVER && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-white z-50">
                        <h2 className="text-6xl font-black mb-4">MATCH OVER</h2>
                        <p className="text-3xl mb-8">
                            {hudState.pScore > hudState.bScore ? 'YOU WIN!' : hudState.pScore < hudState.bScore ? 'BOT WINS!' : 'DRAW!'}
                        </p>
                        <button 
                            onClick={handlePlayClick}
                            className="px-8 py-3 bg-cyan-500 text-black font-bold text-2xl rounded"
                        >
                            PLAY AGAIN
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}
    </div>
  );
}
