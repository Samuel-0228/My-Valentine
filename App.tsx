
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, Sparkles, Clock, Music, VolumeX, HeartHandshake } from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Helper Components ---

const FloatingHearts = () => {
  const [hearts, setHearts] = useState<{ id: number; left: string; size: number; duration: number; delay: number }[]>([]);

  useEffect(() => {
    const newHearts = Array.from({ length: 25 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: Math.random() * (30 - 15) + 15,
      duration: Math.random() * (10 - 5) + 5,
      delay: Math.random() * 5,
    }));
    setHearts(newHearts);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="heart-particle text-rose-300/40"
          style={{
            left: heart.left,
            fontSize: `${heart.size}px`,
            animationDuration: `${heart.duration}s`,
            animationDelay: `${heart.delay}s`,
          }}
        >
          <Heart fill="currentColor" />
        </div>
      ))}
    </div>
  );
};

const SuccessScreen = ({ message }: { message: string }) => {
  useEffect(() => {
    const duration = 15 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const interval: any = setInterval(function() {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
      confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
    }, 250);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-rose-50 z-50 animate-in fade-in duration-1000">
      <div className="text-center p-8 space-y-6">
        <div className="relative inline-block">
          <Heart fill="#e11d48" className="w-32 h-32 text-rose-600 animate-bounce" />
          <Sparkles className="absolute -top-4 -right-4 w-12 h-12 text-yellow-400 animate-pulse" />
        </div>
        <h1 className="text-4xl md:text-6xl font-pacifico text-rose-600 drop-shadow-sm">
          {message}
        </h1>
        <p className="text-xl md:text-2xl text-rose-500 font-medium">
          You just made my heart very happy 💕
        </p>
        <div className="flex justify-center gap-4 text-rose-400">
          <Heart fill="currentColor" className="w-6 h-6 animate-pulse" />
          <Heart fill="currentColor" className="w-8 h-8 animate-pulse delay-75" />
          <Heart fill="currentColor" className="w-6 h-6 animate-pulse delay-150" />
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [isAccepted, setIsAccepted] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [timeLeft, setTimeLeft] = useState(60);
  const [noButtonPos, setNoButtonPos] = useState({ x: 0, y: 0 });
  const [isNoButtonMoved, setIsNoButtonMoved] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  
  // Fix: Replacing NodeJS.Timeout with ReturnType<typeof setInterval> to avoid namespace errors in browser environment
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-accept when timer hits 0
  useEffect(() => {
    if (timeLeft > 0 && !isAccepted) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && !isAccepted) {
      handleAccept("Time's up! That's a YES 💘🥰");
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, isAccepted]);

  const handleAccept = (msg: string) => {
    setIsAccepted(true);
    setSuccessMessage(msg);
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Final burst of confetti
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const moveNoButton = useCallback(() => {
    // Generate random position within screen bounds, leaving some margin
    const padding = 100;
    const maxX = window.innerWidth - padding;
    const maxY = window.innerHeight - padding;
    
    // Ensure it doesn't just jitter in place
    const newX = Math.random() * (maxX - padding) + padding;
    const newY = Math.random() * (maxY - padding) + padding;
    
    setNoButtonPos({ x: newX, y: newY });
    setIsNoButtonMoved(true);
  }, []);

  return (
    <div className="min-h-screen w-full relative bg-gradient-to-br from-rose-100 via-pink-100 to-purple-100 flex flex-col items-center justify-center p-4">
      {/* Background elements */}
      <FloatingHearts />
      
      {/* Audio Toggle (Simulated visual toggle since browsers block auto-play) */}
      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="fixed top-6 right-6 p-3 bg-white/60 backdrop-blur-md rounded-full text-rose-500 hover:bg-rose-50 transition-colors z-20 shadow-sm"
      >
        {isMuted ? <VolumeX className="w-6 h-6" /> : <Music className="w-6 h-6 animate-pulse" />}
      </button>

      {isAccepted ? (
        <SuccessScreen message={successMessage} />
      ) : (
        <div className="z-10 text-center max-w-2xl w-full space-y-12 animate-in slide-in-from-bottom-8 duration-700">
          <div className="space-y-4">
            <h1 className="text-5xl md:text-7xl font-pacifico text-rose-600 drop-shadow-md">
              Will you be my Valentine? 💕
            </h1>
            <p className="text-rose-400 font-medium text-lg md:text-xl italic">
              (Choose wisely... or don't choose at all 😉)
            </p>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-8 relative h-32">
            {/* YES BUTTON */}
            <button
              onClick={() => handleAccept("Yay! You just made my heart very happy 💕")}
              className="group relative inline-flex items-center gap-2 px-12 py-5 bg-rose-500 text-white rounded-full text-2xl font-bold shadow-lg shadow-rose-200 hover:bg-rose-600 hover:scale-110 active:scale-95 transition-all duration-300"
            >
              <span>Yes 💖</span>
              <div className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-20 pointer-events-none"></div>
            </button>

            {/* NO BUTTON (The elusive one) */}
            <button
              onMouseEnter={moveNoButton}
              onClick={moveNoButton}
              style={isNoButtonMoved ? {
                position: 'fixed',
                left: `${noButtonPos.x}px`,
                top: `${noButtonPos.y}px`,
                zIndex: 40,
                transform: 'translate(-50%, -50%)',
                transition: 'all 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
              } : {}}
              className="inline-flex items-center gap-2 px-8 py-3 bg-gray-200 text-gray-500 rounded-full text-lg font-semibold border-2 border-transparent hover:border-gray-300 transition-all duration-300 shadow-sm"
            >
              No 🙃
            </button>
          </div>

          <div className="space-y-4 bg-white/40 backdrop-blur-sm p-6 rounded-2xl border border-white/50 inline-block mx-auto shadow-inner">
            <div className="flex items-center justify-center gap-3 text-rose-500">
              <Clock className={`w-6 h-6 ${timeLeft <= 10 ? 'animate-bounce text-red-600' : ''}`} />
              <span className={`text-2xl font-bold font-mono ${timeLeft <= 10 ? 'text-red-600' : ''}`}>
                00:{timeLeft.toString().padStart(2, '0')}
              </span>
            </div>
            <p className="text-rose-500 font-medium">
              ⏳ If you don’t answer in time… I’ll take that as a YES 😉
            </p>
          </div>
        </div>
      )}

      {/* Decorative corners */}
      <div className="fixed bottom-4 left-4 text-rose-200 opacity-50">
        <HeartHandshake className="w-16 h-16" />
      </div>
      <div className="fixed bottom-4 right-4 text-rose-200 opacity-50">
        <Sparkles className="w-16 h-16" />
      </div>
    </div>
  );
};

export default App;
