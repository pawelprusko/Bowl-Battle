import { useEffect, useRef, useState } from 'react';
import { GameState } from './game/Types';
import { GameWorld } from './game/GameWorld';
import { Renderer } from './game/Renderer';
import { loadAssets } from './game/assets';
import { loadAudio, setBGM, stopBGM } from './game/audio';
import { updateGameDimensions, ASSET_PATHS } from './game/constants';

const TriangleButton = ({ dir, onDown, onUp, onLeave }: { dir: 'left' | 'right', onDown: () => void, onUp: () => void, onLeave: () => void }) => {
    const isLeft = dir === 'left';
    return (
        <div 
            className="w-[116px] h-[96px] relative cursor-pointer touch-none select-none drop-shadow-xl group"
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerLeave={onLeave}
            onContextMenu={(e) => e.preventDefault()}
        >
            <svg viewBox="0 0 100 75" className="w-full h-full overflow-visible">
                <defs>
                    <linearGradient id="btnGradDir" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#e9d5ff" />
                        <stop offset="100%" stopColor="#d8b4fe" />
                    </linearGradient>
                    <linearGradient id="btnGradActiveDir" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#d8b4fe" />
                        <stop offset="100%" stopColor="#c084fc" />
                    </linearGradient>
                </defs>
                <g>
                    {/* 3D Bottom/Shadow */}
                    <path 
                        d={isLeft ? "M 85 13 Q 95 13 95 23 L 95 53 Q 95 63 85 63 L 25 43 Q 10 38 25 33 Z" 
                                  : "M 15 13 Q 5 13 5 23 L 5 53 Q 5 63 15 63 L 75 43 Q 90 38 75 33 Z"} 
                        fill="#3b0764"
                        className="group-active:hidden"
                    />
                    {/* Main Button Body */}
                    <path 
                        d={isLeft ? "M 85 5 Q 95 5 95 15 L 95 45 Q 95 55 85 55 L 25 35 Q 10 30 25 25 Z" 
                                  : "M 15 5 Q 5 5 5 15 L 5 45 Q 5 55 15 55 L 75 35 Q 90 30 75 25 Z"} 
                        fill="url(#btnGradDir)" 
                        stroke="#fff"
                        strokeWidth="3"
                        className="group-active:translate-y-2 group-active:fill-[url(#btnGradActiveDir)] transition-transform"
                    />
                    {/* Inner Icon */}
                    <path 
                        d={isLeft ? "M 70 21 L 52 30 L 70 39 Z" : "M 30 21 L 48 30 L 30 39 Z"} 
                        fill="#a855f7" 
                        stroke="#a855f7"
                        strokeWidth="7"
                        strokeLinejoin="round"
                        opacity="0.95"
                        className="group-active:translate-y-2 transition-transform"
                    />
                </g>
            </svg>
        </div>
    );
};

const ActionButton = ({ text, onDown, onUp, onLeave, isError }: any) => (
    <div 
        className="w-[140px] h-[96px] relative cursor-pointer touch-none select-none drop-shadow-xl group"
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerLeave={onLeave}
        onContextMenu={(e) => e.preventDefault()}
    >
        {/* EFEKT ROZCHODZĄCEGO SIĘ OKRĘGU: Jeśli gracz popełni błąd, pod przyciskiem odpala się czerwony ring, który szybko eksploduje na zewnątrz */}
        {isError && (
            <div className="absolute inset-0 bg-red-600/60 rounded-2xl animate-ping pointer-events-none scale-125 z-0" style={{ animationDuration: '0.3s' }} />
        )}
        
        <svg viewBox="0 0 110 75" className="absolute top-0 left-0 w-full h-full overflow-visible z-10">
            <defs>
                <linearGradient id={isError ? "btnGradActionErr" : "btnGradAction"} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={isError ? "#fca5a5" : "#e9d5ff"} />
                    <stop offset="100%" stopColor={isError ? "#ef4444" : "#d8b4fe"} />
                </linearGradient>
                <linearGradient id={isError ? "btnGradActiveActionErr" : "btnGradActiveAction"} x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor={isError ? "#ef4444" : "#d8b4fe"} />
                    <stop offset="100%" stopColor={isError ? "#b91c1c" : "#c084fc"} />
                </linearGradient>
            </defs>
            <g>
                {/* 3D Bottom/Shadow */}
                <rect 
                    x="5" y="13" width="100" height="50" rx="15" ry="15"
                    fill={isError ? "#7f1d1d" : "#3b0764"}
                    className="group-active:hidden"
                />
                {/* Main Button Body */}
                <rect 
                    x="5" y="5" width="100" height="50" rx="15" ry="15"
                    fill={isError ? "url(#btnGradActionErr)" : "url(#btnGradAction)"} 
                    stroke={isError ? "#f87171" : "#fff"}
                    strokeWidth="3"
                    className="group-active:translate-y-2 group-active:fill-[url(#btnGradActiveAction)] transition-transform"
                />
            </g>
        </svg>
        <div className={`absolute top-0 left-0 w-full h-full flex items-center justify-center text-[20px] font-black tracking-widest pointer-events-none pb-[16px] group-active:translate-y-2 transition-transform z-20 ${isError ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]' : 'text-[#a855f7]'}`}>
            {text}
        </div>
    </div>
);

function SplashFallback({ onPlay, gameState, loadingProgress }: { onPlay: () => void, gameState: GameState, loadingProgress: number }) {
    const [imageFailed, setImageFailed] = useState(false);
    
    return (
        <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center text-white z-50 overflow-hidden">
            {!imageFailed ? (
                <img 
                    src={ASSET_PATHS.ui.splashscreen} 
                    onError={() => setImageFailed(true)}
                    className="absolute inset-0 w-full h-full object-cover"
                    alt="Splash Background"
                />
            ) : (
                <>
                    <h1 className="text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(0,255,255,0.8)] tracking-tighter italic mb-2 z-10">
                        BOWL BATTLE
                    </h1>
                    <h2 className="text-3xl font-bold text-red-500 mb-12 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)] z-10"> </h2>
                </>
            )}
            
            {gameState === GameState.SPLASH && (
                <button 
                    onClick={onPlay}
                    className="px-12 py-3 bg-purple-500/40 backdrop-blur-sm text-white text-3xl font-semibold rounded-2xl border-2 border-white shadow-[0_4px_15px_rgba(168,85,247,0.6)] animate-bounce z-10 hover:bg-purple-400/60 hover:scale-105 active:scale-95 transition-all duration-300"
                    style={{ position: 'absolute', bottom: '14%', animationDuration: '2.5s', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}
                >
                    PLAY
                </button>
            )}

            {gameState === GameState.LOADING && (
                <div 
                    className="absolute z-10 w-1/3 max-w-sm h-5 bg-purple-500/40 backdrop-blur-sm rounded-lg border-2 border-white shadow-[0_0_15px_rgba(168,85,247,0.4)] flex items-center"
                    style={{ bottom: '15%' }}
                >
                    <div 
                        className="absolute left-0 top-0 h-full bg-purple-950 rounded-lg transition-all duration-100 ease-linear"
                        style={{ width: `${loadingProgress}%` }}
                    />
                    
                    <span className="relative z-20 ml-4 text-white text-[10px] md:text-xs font-semibold tracking-wide">
                        FINDING AN OPPONENT...
                    </span>

                    <div 
                        className="absolute z-30 transition-all duration-100 ease-linear flex items-end justify-center pointer-events-none"
                        style={{ 
                            left: `${loadingProgress}%`,
                            transform: 'translateX(-50%)',
                            bottom: '-4px'
                        }}
                    >
                        <style>{`
                            @keyframes loader-bounce {
                                0%, 100% { transform: translateY(0); }
                                50% { transform: translateY(-4px); }
                            }
                        `}</style>
                        <img 
                            src={ASSET_PATHS.ui.loader} 
                            alt="Loader" 
                            className="h-9 w-auto object-contain drop-shadow-md"
                            style={{ animation: 'loader-bounce 0.4s infinite ease-in-out' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function MatchOverFallback({ onPlay, gameState, loadingProgress, pScore, bScore }: { onPlay: () => void, gameState: GameState, loadingProgress: number, pScore: number, bScore: number }) {
    const [imageFailed, setImageFailed] = useState(false);
    
    return (
        <div className="absolute inset-0 bg-neutral-900 flex flex-col items-center justify-center text-white z-50 overflow-hidden">
            {!imageFailed ? (
                <img 
                    src={ASSET_PATHS.ui.matchover} 
                    onError={() => setImageFailed(true)}
                    className="absolute inset-0 w-full h-full object-cover"
                    alt="Match Over Background"
                />
            ) : (
                <>
                    <h1 className="text-6xl font-black text-white drop-shadow-[0_0_15px_rgba(0,255,255,0.8)] tracking-tighter italic mb-2 z-10">
                        MATCH OVER
                    </h1>
                </>
            )}
            
            {gameState === GameState.GAME_OVER && (
                <div className="absolute z-10 flex flex-col items-center top-[15%]">
                    <h2 className="text-6xl font-black mb-4 drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">MATCH OVER</h2>
                    <p className="text-3xl drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]">
                        {pScore > bScore ? 'YOU WIN!' : pScore < bScore ? 'SWEATYSTEVE WINS!' : 'DRAW!'}
                    </p>
                </div>
            )}

            {gameState === GameState.GAME_OVER && (
                <button 
                    onClick={onPlay}
                    className="px-12 py-3 bg-purple-500/40 backdrop-blur-sm text-white text-3xl font-semibold rounded-2xl border-2 border-white shadow-[0_4px_15px_rgba(168,85,247,0.6)] animate-bounce z-10 hover:bg-purple-400/60 hover:scale-105 active:scale-95 transition-all duration-300"
                    style={{ position: 'absolute', bottom: '14%', animationDuration: '2.5s', textShadow: '0 2px 4px rgba(0,0,0,0.6)' }}
                >
                    PLAY AGAIN
                </button>
            )}

            {gameState === GameState.REMATCH_LOADING && (
                <div 
                    className="absolute z-10 w-1/3 max-w-sm h-5 bg-purple-500/40 backdrop-blur-sm rounded-lg border-2 border-white shadow-[0_0_15px_rgba(168,85,247,0.4)] flex items-center"
                    style={{ bottom: '15%' }}
                >
                    <div 
                        className="absolute left-0 top-0 h-full bg-purple-950 rounded-lg transition-all duration-100 ease-linear"
                        style={{ width: `${loadingProgress}%` }}
                    />
                    
                    <span className="relative z-20 ml-4 text-white text-[10px] md:text-xs font-semibold tracking-wide">
                        Finding an Opponent...
                    </span>

                    <div 
                        className="absolute z-30 transition-all duration-100 ease-linear flex items-end justify-center pointer-events-none"
                        style={{ 
                            left: `${loadingProgress}%`,
                            transform: 'translateX(-50%)',
                            bottom: '-4px'
                        }}
                    >
                        <style>{`
                            @keyframes loader-bounce {
                                0%, 100% { transform: translateY(0); }
                                50% { transform: translateY(-4px); }
                            }
                        `}</style>
                        <img 
                            src={ASSET_PATHS.ui.loader} 
                            alt="Loader" 
                            className="w-12 h-12 object-contain"
                            style={{ animation: 'loader-bounce 0.5s infinite ease-in-out' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.SPLASH);
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // Stany dla wizualnego mignięcia błędu przycisków w klinczu
  const [pushError, setPushError] = useState(false);
  const [holdError, setHoldError] = useState(false);
  
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
    subState: 'COUNTDOWN',
    scrumPrompt: null as 'PUSH' | 'HOLD' | null
  });

  const updateGameState = (newState: GameState) => {
      setGameState(newState);
      gameStateRef.current = newState;
  };

  const handleRematchClick = () => {
    updateGameState(GameState.REMATCH_LOADING);
    
    // start loading
    Promise.all([loadAssets(), loadAudio()]).then(() => {
        let progress = 0;
        const interval = setInterval(() => {
            progress += 100 / (4.0 / 0.1); // 4 seconds total
            if (progress >= 100) {
                clearInterval(interval);
                startGame();
            }
            setLoadingProgress(Math.min(progress, 100));
        }, 100);
    });
  };

  const handlePlayClick = () => {
    updateGameState(GameState.LOADING);
    
    // Try to lock orientation and go fullscreen (Skip if in iframe like AI Studio preview to prevent reload loops)
    try {
        const isInIframe = window !== window.top;
        if (!isInIframe) {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
            const orientation: any = screen.orientation || (screen as any).mozOrientation || (screen as any).msOrientation;
            if (orientation && orientation.lock) {
                orientation.lock('landscape').catch(() => {});
            }
        }
    } catch (e) {}
    
    // start loading
    Promise.all([loadAssets(), loadAudio()]).then(() => {
        let progress = 0;
        const interval = setInterval(() => {
            progress += 100 / (4.0 / 0.1); // 4 seconds total
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
      // Try best-effort orientation lock on mount for PWAs
      try {
          const orientation: any = screen.orientation || (screen as any).mozOrientation || (screen as any).msOrientation;
          if (orientation && orientation.lock) {
              orientation.lock('landscape').catch(() => {});
          }
      } catch (e) {}

      // [FIX] Layout hack for Mobile Safe Area / 100vh bugs
      const nudgeLayout = () => {
          const root = document.getElementById('root');
          if (root) {
              root.style.height = '100.1vh';
              
              window.scrollTo(0, 1);
              
              setTimeout(() => {
                  root.style.height = '100vh';
                  // Force window resize event to recalculate logic
                  window.dispatchEvent(new Event('resize'));
              }, 200);
          }
      };

      nudgeLayout();
      setTimeout(nudgeLayout, 500);
      setTimeout(nudgeLayout, 1500);
      
      const handleResize = () => {
          const container = document.querySelector('.game-container') as HTMLElement;
          let logicalWidth, logicalHeight;
          const isPortrait = window.innerHeight > window.innerWidth;
          
          if (container) {
              if (isPortrait) {
                  // Let CSS handle the 100vh / 100vw rotation
                  container.style.width = '';
                  container.style.height = '';
                  logicalWidth = window.innerHeight;
                  logicalHeight = window.innerWidth;
              } else {
                  container.style.width = '100%';
                  container.style.height = '100%';
                  logicalWidth = window.innerWidth;
                  logicalHeight = window.innerHeight;
              }
          } else {
              logicalWidth = isPortrait ? window.innerHeight : window.innerWidth;
              logicalHeight = isPortrait ? window.innerWidth : window.innerHeight;
          }

          const windowRatio = logicalWidth / logicalHeight;
          const gameWidth = 450 * windowRatio;
          updateGameDimensions(gameWidth, 450);
          setDimensions({ width: gameWidth, height: 450 });
          setScale(logicalHeight / 450);
      };
      
      const resizeWithDelay = () => {
          handleResize();
          setTimeout(handleResize, 100);
          setTimeout(handleResize, 300);
      };

      const orientationChangeWithDelay = () => {
          setTimeout(() => {
              nudgeLayout();
              resizeWithDelay();
          }, 200);
      };
      
      handleResize();
      window.addEventListener('resize', resizeWithDelay);
      window.addEventListener('orientationchange', orientationChangeWithDelay);
      return () => {
          window.removeEventListener('resize', resizeWithDelay);
          window.removeEventListener('orientationchange', orientationChangeWithDelay);
      };
  }, []);

  useEffect(() => {
      // Start or resume the game loop whenever we enter PLAYING state
      if (gameState === GameState.PLAYING) {
          setBGM('board');
          if (canvasRef.current) {
              // Always recreate renderer to ensure it holds the newly mounted canvas
              rendererRef.current = new Renderer(canvasRef.current);
          }
          lastTimeRef.current = performance.now();
          if (animationRef.current) cancelAnimationFrame(animationRef.current);
          gameLoop(performance.now());
      } else {
          stopBGM();
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
            // Reagujemy wyłącznie na dynamiczne tąpnięcia ekranu (screenShake), 
            // oczyszczając klincz z ciągłego buczenia, by wydobyć głębię z precyzyjnych uderzeń.
            const wantsVibrate = worldRef.current.screenShake > 0;
            // @ts-ignore
            if (wantsVibrate && (!window.lastVibrate || time - window.lastVibrate > 120)) {
                if (navigator.vibrate) navigator.vibrate(60); // Krótki, czysty impuls uderzenia
                // @ts-ignore
                window.lastVibrate = time;
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
                
            if (prev.time !== newTime || prev.pScore !== worldRef.current.playerScore || prev.bScore !== worldRef.current.botScore || prev.message !== newMessage || prev.playerRole !== pRole || prev.isExtraPoint !== worldRef.current.isExtraPointAttempt || prev.subState !== worldRef.current.subState || prev.scrumPrompt !== worldRef.current.scrumPrompt) {
                return {
                    time: newTime,
                    pScore: worldRef.current.playerScore,
                    bScore: worldRef.current.botScore,
                    message: newMessage,
                    playerRole: pRole,
                    isExtraPoint: worldRef.current.isExtraPointAttempt,
                    subState: worldRef.current.subState,
                    scrumPrompt: worldRef.current.scrumPrompt
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
          if (worldRef.current.subState === 'SCRUM_MATRIX') {
              if (e.key === 'ArrowLeft' || e.key === 'a') worldRef.current.resolveScrumAction(worldRef.current.player, 'PUSH');
              if (e.key === 'ArrowRight' || e.key === 'd') worldRef.current.resolveScrumAction(worldRef.current.player, 'HOLD');
              return;
          }
          if (e.key === 'ArrowLeft' || e.key === 'a') worldRef.current.player.dirX = -1;
          if (e.key === 'ArrowRight' || e.key === 'd') worldRef.current.player.dirX = 1;
          if (e.key === ' ' || e.key === 'Enter') {
              if (e.repeat) return;
              worldRef.current.playerTackle();
          }
          if (e.key === 'p') worldRef.current.popBall();
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
  
const handleScrumPush = () => {
      if (worldRef.current) {
          const isCorrect = worldRef.current.resolveScrumAction(worldRef.current.player, 'PUSH');
          if (isCorrect === false) {
              setPushError(true);
              setTimeout(() => setPushError(false), 300); // Wyłączenie błysku i fali po 300ms
          }
      }
  };

  const handleScrumHold = () => {
      if (worldRef.current) {
          const isCorrect = worldRef.current.resolveScrumAction(worldRef.current.player, 'HOLD');
          if (isCorrect === false) {
              setHoldError(true);
              setTimeout(() => setHoldError(false), 300); // Wyłączenie błysku i fali po 300ms
          }
      }
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
      {(gameState === GameState.SPLASH || gameState === GameState.LOADING) && (
        <SplashFallback onPlay={handlePlayClick} gameState={gameState} loadingProgress={loadingProgress} />
      )}

      {(gameState === GameState.GAME_OVER || gameState === GameState.REMATCH_LOADING) && (
        <MatchOverFallback 
            onPlay={handleRematchClick} 
            gameState={gameState} 
            loadingProgress={loadingProgress}
            pScore={hudState.pScore}
            bScore={hudState.bScore}
        />
      )}

      {/* Main Game rendering inside PLAYING */}
      {gameState === GameState.PLAYING && (
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
                    className="absolute top-0 left-0 w-full p-4 flex justify-center items-start pointer-events-none z-10 gap-2"
                    style={{
                        paddingTop: 'max(1rem, env(safe-area-inset-top))'
                    }}
                >
                    {/* Player Side */}
                    <div className="flex flex-col items-end">
                        <div className="bg-white/20 backdrop-blur-sm px-4 py-1 rounded-t-lg text-white text-xs font-bold uppercase tracking-wider w-32 text-center">
                            SaltySam
                        </div>
                        <div className="bg-black/60 backdrop-blur-md text-white px-8 py-2 rounded-l-xl rounded-br-xl text-3xl font-black border-y border-l border-white/20 shadow-lg min-w-[80px] text-center">
                            {hudState.pScore}
                        </div>
                    </div>

                    {/* Timer */}
                    <div className="flex flex-col items-center z-20" style={{ marginTop: '0.2rem' }}>
                        <div className="bg-black/80 text-white px-6 py-2 rounded-xl text-4xl font-black font-mono border-2 border-white/20 shadow-lg relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent"></div>
                            {hudState.time}
                        </div>
                    </div>
                    
                    {/* Bot Side */}
                    <div className="flex flex-col items-start">
                        <div className="bg-white/20 backdrop-blur-sm px-4 py-1 rounded-t-lg text-white text-xs font-bold uppercase tracking-wider w-32 text-center">
                            SweatySteve
                        </div>
                        <div className="bg-black/60 backdrop-blur-md text-white px-8 py-2 rounded-r-xl rounded-bl-xl text-3xl font-black border-y border-r border-white/20 shadow-lg min-w-[80px] text-center">
                            {hudState.bScore}
                        </div>
                    </div>
                </div>
                
                {/* Mobile Controls Overlay */}
                {gameState === GameState.PLAYING && (
                   <div 
                       className="absolute bottom-0 left-0 w-full h-full pointer-events-none p-4 flex justify-between items-end pb-0 z-10"
                       style={{
                           paddingLeft: 'max(1.5rem, env(safe-area-inset-left))',
                           paddingRight: 'max(1.5rem, env(safe-area-inset-right))',
                           paddingBottom: 'max(0px, env(safe-area-inset-bottom))'
                       }}
                   >
  {/* Left Controls */}
                       <div className="flex gap-6 pointer-events-auto translate-y-4">
                           {hudState.subState === 'SCRUM_MATRIX' ? (
                               <ActionButton 
                                   text="PUSH"
                                   onDown={handleScrumPush}
                                   onUp={() => {}}
                                   onLeave={() => {}}
                                   isError={pushError} // REKORD BŁĘDU DLA PUSH
                               />
                           ) : (
                               <>
                                   <TriangleButton 
                                       dir="left"
                                       onDown={() => handleDirBtn(-1)}
                                       onUp={() => handleDirBtn(0)}
                                       onLeave={() => handleDirBtn(0)}
                                   />
                                   <TriangleButton 
                                       dir="right"
                                       onDown={() => handleDirBtn(1)}
                                       onUp={() => handleDirBtn(0)}
                                       onLeave={() => handleDirBtn(0)}
                                   />
                               </>
                           )}
                       </div>
                       
    {/* Right Controls */}
                       <div className="flex gap-4 pointer-events-auto items-end translate-y-4">
                           {hudState.subState === 'SCRUM_MATRIX' && !hudState.isExtraPoint ? (
                               <ActionButton 
                                   text="HOLD"
                                   onDown={handleScrumHold}
                                   onUp={() => {}}
                                   onLeave={() => {}}
                                   isError={holdError} // REKORD BŁĘDU DLA HOLD
                               />
                           ) : (
                               <>
                                   {hudState.isExtraPoint && hudState.playerRole === 'ATTACKER' && (
                                       <ActionButton 
                                           text="KICK"
                                           onDown={handleKickPress}
                                           onUp={handleKickRelease}
                                           onLeave={handleKickRelease}
                                       />
                                   )}
                               </>
                           )}
                       </div>
                   </div>
                )}

            </div>
        </div>
      )}
    </div>
  );
}
