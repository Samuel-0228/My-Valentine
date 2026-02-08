
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Heart, Sparkles, Clock, Music, VolumeX, HeartHandshake, 
  MessageCircle, Send, Users, Home as HomeIcon, Ghost, Quote
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types & Constants ---
type View = 'home' | 'wall' | 'prompts';

interface Confession {
  id: string;
  username: string;
  message: string;
  likes: number;
  timestamp: number;
  isUserOwned?: boolean;
}

const ALIASES = ["Cupid", "Heart", "LoveBird", "Dreamer", "Romeo", "Juliet", "SecretAdmirer", "Starlight", "Honey", "Petal"];
const STORAGE_KEYS = {
  CONFESSIONS: 'valentine_confessions',
  ACCEPTED: 'valentine_accepted',
  REACTION: 'valentine_ai_reaction'
};

const generateAlias = () => {
  const name = ALIASES[Math.floor(Math.random() * ALIASES.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${name}${num}`;
};

// --- Helper Components ---

const FloatingHearts = () => {
  const [hearts, setHearts] = useState<{ id: number; left: string; size: number; duration: number; delay: number }[]>([]);

  useEffect(() => {
    const newHearts = Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      size: Math.random() * (25 - 12) + 12,
      duration: Math.random() * (12 - 7) + 7,
      delay: Math.random() * 5,
    }));
    setHearts(newHearts);
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {hearts.map((heart) => (
        <div
          key={heart.id}
          className="heart-particle text-rose-300/30"
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

// --- Main App Component ---

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isAccepted, setIsAccepted] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.ACCEPTED) === 'true';
  });
  const [successMessage, setSuccessMessage] = useState("Yay! You made my heart skip a beat! 💕");
  const [timeLeft, setTimeLeft] = useState(60);
  const [noButtonPos, setNoButtonPos] = useState({ x: 0, y: 0 });
  const [isNoButtonMoved, setIsNoButtonMoved] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  
  // Wall State initialized from LocalStorage
  const [confessions, setConfessions] = useState<Confession[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.CONFESSIONS);
    return saved ? JSON.parse(saved) : [];
  });
  const [newPost, setNewPost] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Prompts State
  const [currentPrompt, setCurrentPrompt] = useState("What's your dream date?");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [aiReaction, setAiReaction] = useState(() => {
    return localStorage.getItem(STORAGE_KEYS.REACTION) || "";
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Persistence Sync ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CONFESSIONS, JSON.stringify(confessions));
  }, [confessions]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACCEPTED, isAccepted.toString());
  }, [isAccepted]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.REACTION, aiReaction);
  }, [aiReaction]);

  // --- AI Logic ---
  
  const fetchAiConfessions = async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    setIsGenerating(true);
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Generate 3 unique, short, anonymous romantic confessions or cute date ideas. Return them as a JSON array of strings.",
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      
      const texts = JSON.parse(response.text || "[]");
      const newEntries = texts.map((t: string) => ({
        id: 'ai-' + Math.random().toString(36).substr(2, 9),
        username: generateAlias(),
        message: t,
        likes: Math.floor(Math.random() * 50),
        timestamp: Date.now()
      }));

      // Merge and remove duplicates if any, keep a max of 40
      setConfessions(prev => {
        const combined = [...newEntries, ...prev];
        const unique = combined.filter((v, i, a) => a.findIndex(t => t.message === v.message) === i);
        return unique.slice(0, 40);
      });
    } catch (e) {
      console.error("AI Generation failed", e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePromptSubmit = async () => {
    if (!promptAnswer.trim()) return;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    setAiReaction("Thinking of a sweet reply...");
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I was asked: "${currentPrompt}". My answer is: "${promptAnswer}". Give me a very short, sweet, and romantic 1-sentence reaction as a Valentine's AI.`,
      });
      setAiReaction(response.text || "That is so sweet! ❤️");
      setPromptAnswer("");
    } catch (e) {
      setAiReaction("That sounds absolutely lovely! ✨");
    }
  };

  // Initial load logic
  useEffect(() => {
    // Only fetch AI confessions if we have very few saved
    if (confessions.length < 10) {
      fetchAiConfessions();
    }
    const interval = setInterval(fetchAiConfessions, 180000); // Every 3 mins
    return () => clearInterval(interval);
  }, []);

  // Timer logic
  useEffect(() => {
    if (timeLeft > 0 && !isAccepted) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && !isAccepted) {
      handleAccept("Time's up! That's a YES 💘🥰");
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft, isAccepted]);

  const handleAccept = (msg: string) => {
    setIsAccepted(true);
    setSuccessMessage(msg);
    if (timerRef.current) clearInterval(timerRef.current);
    confetti({ 
      particleCount: 150, 
      spread: 70, 
      origin: { y: 0.6 },
      colors: ['#fb7185', '#e11d48', '#f43f5e']
    });
  };

  const moveNoButton = useCallback(() => {
    const padding = 100;
    const maxX = window.innerWidth - padding;
    const maxY = window.innerHeight - padding;
    const newX = Math.random() * (maxX - padding) + padding;
    const newY = Math.random() * (maxY - padding) + padding;
    setNoButtonPos({ x: newX, y: newY });
    setIsNoButtonMoved(true);
  }, []);

  const handlePostConfession = () => {
    if (!newPost.trim()) return;
    const post: Confession = {
      id: 'user-' + Date.now().toString(),
      username: generateAlias(),
      message: newPost,
      likes: 0,
      timestamp: Date.now(),
      isUserOwned: true
    };
    setConfessions([post, ...confessions]);
    setNewPost("");
    confetti({ particleCount: 30, scalar: 0.7, origin: { y: 0.9 }, colors: ['#f43f5e'] });
  };

  const handleLike = (id: string) => {
    setConfessions(prev => prev.map(c => 
      c.id === id ? { ...c, likes: c.likes + 1 } : c
    ));
  };

  return (
    <div className="min-h-screen w-full relative bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col items-center pt-24 pb-20">
      <FloatingHearts />
      
      {/* --- Navbar --- */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg">
        <div className="bg-white/70 backdrop-blur-xl border border-white/40 p-1.5 rounded-full shadow-lg flex justify-between items-center">
          <button 
            onClick={() => setCurrentView('home')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all duration-300 ${currentView === 'home' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-50'}`}
          >
            <HomeIcon size={18} />
            <span className="text-sm font-bold hidden sm:inline">Home</span>
          </button>
          <button 
            onClick={() => setCurrentView('wall')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all duration-300 ${currentView === 'wall' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-50'}`}
          >
            <Users size={18} />
            <span className="text-sm font-bold hidden sm:inline">Wall</span>
          </button>
          <button 
            onClick={() => setCurrentView('prompts')}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all duration-300 ${currentView === 'prompts' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-50'}`}
          >
            <MessageCircle size={18} />
            <span className="text-sm font-bold hidden sm:inline">Prompts</span>
          </button>
        </div>
      </nav>

      <button 
        onClick={() => setIsMuted(!isMuted)}
        className="fixed bottom-6 right-6 p-3 bg-white/60 backdrop-blur-md rounded-full text-rose-500 hover:bg-rose-50 transition-colors z-20 shadow-sm border border-white/50"
      >
        {isMuted ? <VolumeX size={20} /> : <Music size={20} className="animate-pulse" />}
      </button>

      {/* --- Main Content Area --- */}
      <main className="w-full max-w-3xl px-6 relative z-10 min-h-[60vh] flex flex-col items-center justify-center">
        
        {/* VIEW: HOME */}
        {currentView === 'home' && (
          <div className="w-full space-y-12 text-center view-enter">
            {isAccepted ? (
              <div className="space-y-6">
                <div className="relative inline-block">
                  <Heart fill="#e11d48" className="w-32 h-32 text-rose-600 animate-bounce" />
                  <Sparkles className="absolute -top-4 -right-4 w-12 h-12 text-yellow-400 animate-pulse" />
                </div>
                <h1 className="text-4xl md:text-6xl font-pacifico text-rose-600 leading-relaxed">
                  {successMessage}
                </h1>
                <p className="text-xl text-rose-500">My world is brighter with you. ✨</p>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="space-y-4">
                  <h1 className="text-5xl md:text-7xl font-pacifico text-rose-600 drop-shadow-sm">
                    Be My Valentine? 💕
                  </h1>
                  <p className="text-rose-400 font-medium italic">Love is only a "Yes" away...</p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 relative h-32">
                  <button
                    onClick={() => handleAccept("Yay! You made my heart skip a beat! 💕")}
                    className="group relative inline-flex items-center gap-2 px-14 py-5 bg-rose-500 text-white rounded-full text-2xl font-bold shadow-xl shadow-rose-200 hover:bg-rose-600 hover:scale-105 active:scale-95 transition-all"
                  >
                    <span>Yes 💖</span>
                    <div className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-20 pointer-events-none"></div>
                  </button>

                  <button
                    onMouseEnter={() => moveNoButton()}
                    onClick={() => moveNoButton()}
                    style={isNoButtonMoved ? {
                      position: 'fixed', 
                      left: `${noButtonPos.x}px`, 
                      top: `${noButtonPos.y}px`,
                      zIndex: 100, 
                      transform: 'translate(-50%, -50%)',
                      transition: 'all 0.1s cubic-bezier(0.18, 0.89, 0.32, 1.28)'
                    } : {}}
                    className="px-8 py-3 bg-white/80 text-gray-400 rounded-full text-lg font-semibold border border-transparent hover:border-gray-200 shadow-sm transition-all"
                  >
                    No 🙃
                  </button>
                </div>

                <div className="bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 inline-flex flex-col items-center gap-2 shadow-sm">
                  <div className="flex items-center gap-3 text-rose-500">
                    <Clock size={24} className={timeLeft <= 10 ? 'animate-bounce text-red-500' : ''} />
                    <span className="text-3xl font-mono font-bold tracking-tighter">
                      00:{timeLeft.toString().padStart(2, '0')}
                    </span>
                  </div>
                  <p className="text-xs uppercase tracking-widest text-rose-400 font-bold">Automatic Accept Countdown</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: LOVE WALL */}
        {currentView === 'wall' && (
          <div className="w-full space-y-8 view-enter">
            <div className="text-center space-y-2">
              <h2 className="text-4xl font-pacifico text-rose-600">The Love Wall</h2>
              <p className="text-rose-400">Anonymous whispers of affection.</p>
            </div>

            <div className="bg-white/70 backdrop-blur-md p-4 rounded-3xl shadow-sm border border-white/50 flex flex-col gap-3">
              <textarea 
                value={newPost}
                onChange={(e) => setNewPost(e.target.value)}
                placeholder="Write an anonymous confession..."
                className="w-full bg-rose-50/50 rounded-2xl p-4 text-rose-700 placeholder-rose-300 border-none focus:ring-2 focus:ring-rose-200 resize-none h-24"
              />
              <button 
                onClick={() => handlePostConfession()}
                className="self-end bg-rose-500 text-white px-6 py-2.5 rounded-full font-bold flex items-center gap-2 hover:bg-rose-600 transition-colors shadow-sm active:scale-95"
              >
                Post <Send size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {confessions.length === 0 && !isGenerating && (
                <div className="col-span-full py-20 text-center text-rose-300 italic font-medium">
                  The wall is quiet... why not be the first to post? 💌
                </div>
              )}
              {confessions.map((c) => (
                <div key={c.id} className={`bg-white/60 p-5 rounded-2xl border border-white/40 shadow-sm hover:scale-[1.02] transition-transform flex flex-col gap-3 group ${c.isUserOwned ? 'ring-2 ring-rose-100 ring-offset-2' : ''}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                      <Ghost size={12} /> {c.isUserOwned ? 'You' : c.username}
                    </span>
                    <span className="text-[10px] text-gray-400">{new Date(c.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-rose-700 font-medium italic leading-relaxed">"{c.message}"</p>
                  <div className="flex justify-end pt-2">
                    <button 
                      onClick={() => handleLike(c.id)}
                      className="flex items-center gap-1 text-rose-300 hover:text-rose-500 transition-colors"
                    >
                      <Heart size={14} fill={c.likes > 0 ? "currentColor" : "none"} className={c.likes > 0 ? 'text-rose-500' : ''} />
                      <span className="text-xs">{c.likes}</span>
                    </button>
                  </div>
                </div>
              ))}
              {isGenerating && <div className="col-span-full py-10 text-center text-rose-300 animate-pulse font-medium">✨ AI is whispering to the wall...</div>}
            </div>
          </div>
        )}

        {/* VIEW: PROMPTS */}
        {currentView === 'prompts' && (
          <div className="w-full space-y-8 view-enter text-center">
             <div className="space-y-2">
                <h2 className="text-4xl font-pacifico text-rose-600">Daily Prompts</h2>
                <p className="text-rose-400">Answer the prompt and get a sweet AI reaction.</p>
             </div>

             <div className="bg-white/80 backdrop-blur-lg p-8 rounded-[2.5rem] shadow-xl border border-white shadow-rose-200/20 space-y-8 relative overflow-hidden">
                <Quote className="absolute top-4 left-4 text-rose-100 w-24 h-24 -z-10" />
                
                <div className="space-y-4">
                  <h3 className="text-2xl font-bold text-rose-600 leading-tight">
                    "{currentPrompt}"
                  </h3>
                  <p className="text-sm text-rose-400">Tap below to share your heart...</p>
                </div>

                <div className="space-y-4">
                  <input 
                    type="text" 
                    value={promptAnswer}
                    onChange={(e) => setPromptAnswer(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()}
                    placeholder="Type your answer here..."
                    className="w-full bg-rose-50/50 border-2 border-rose-100 rounded-2xl px-6 py-4 text-rose-700 placeholder-rose-300 focus:outline-none focus:border-rose-300 transition-all text-center text-lg"
                  />
                  <button 
                    onClick={() => handlePromptSubmit()}
                    disabled={!promptAnswer.trim()}
                    className="w-full bg-rose-500 text-white font-bold py-4 rounded-2xl hover:bg-rose-600 transition-all active:scale-95 disabled:opacity-50 shadow-lg shadow-rose-200"
                  >
                    Share with the Universe ✨
                  </button>
                </div>

                {aiReaction && (
                  <div className="animate-in fade-in slide-in-from-top-4 duration-500 bg-rose-50 p-4 rounded-2xl border border-rose-100">
                    <p className="text-rose-600 font-medium italic flex items-center justify-center gap-2">
                      <Sparkles size={16} className="text-yellow-400" />
                      {aiReaction}
                    </p>
                  </div>
                )}
             </div>

             <button 
               onClick={() => {
                 const prompts = [
                   "What's your dream date?", 
                   "Define love in one word.", 
                   "The cheesiest pickup line you actually like?",
                   "What song reminds you of love?",
                   "First thing you notice in a crush?"
                 ];
                 const next = prompts[(prompts.indexOf(currentPrompt) + 1) % prompts.length];
                 setCurrentPrompt(next);
                 // We don't clear AI reaction here if we want to keep it across toggles
               }}
               className="text-rose-400 font-bold text-sm hover:text-rose-600 transition-colors uppercase tracking-widest"
             >
               Next Question →
             </button>
          </div>
        )}

      </main>

      {/* --- Footer Label --- */}
      <div className="fixed bottom-6 w-full flex justify-center pointer-events-none z-10">
        <a 
          href="https://t.me/savvy_society"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/50 backdrop-blur-md px-5 py-2 rounded-full text-rose-400 text-xs font-bold tracking-[0.2em] border border-white/60 shadow-lg hover:bg-rose-50 hover:text-rose-600 hover:scale-110 transition-all duration-300 pointer-events-auto cursor-pointer uppercase flex items-center gap-2"
        >
          built with ❤️‍🔥 by <span className="underline decoration-rose-300 underline-offset-4">savvy</span>
        </a>
      </div>
    </div>
  );
};

export default App;
