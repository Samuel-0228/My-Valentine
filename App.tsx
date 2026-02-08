
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Heart, Sparkles, Clock, Music, VolumeX, MessageCircle, 
  Send, Users, Home as HomeIcon, Ghost, Quote, AlertCircle, ChevronRight, Activity, Radio, Database, ShieldAlert
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// --- Types & Constants ---
type View = 'home' | 'wall' | 'prompts';

interface GlobalResponse {
  id: string | number;
  username: string;
  question: string;
  answer: string;
  created_at: string;
}

const STORAGE_KEYS = {
  ACCEPTED: 'valentine_accepted_v3',
  REACTION: 'valentine_ai_reaction_v3',
  MY_USERNAME: 'valentine_my_username_v3',
  LOCAL_FEED: 'valentine_local_feed_v3'
};

const PROMPTS = [
  "What's your dream date?", 
  "Define love in one word.", 
  "The cheesiest pickup line you actually like?",
  "What song reminds you of love?",
  "First thing you notice in a crush?",
  "Your idea of a perfect rainy day with someone?",
  "What's the best compliment you've ever received?",
  "Did you believe in love at first sight? Why or why not?",
  "What's a small act of kindness that melts your heart?",
  "If you could send a love letter to your past self, what would it say?" 
];

// --- Supabase Client ---
const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphenRqaWxqanF2cG14amNkdGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NjI0NjcsImV4cCI6MjA3ODQzODQ2N30.kmXhS5DOr-k3Tx_FOGLr7IXa-Df8QtTNaxpzBMU-0JA";
  const key = process.env.SUPABASE_ANON_KEY|| "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InphenRqaWxqanF2cG14amNkdGVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NjI0NjcsImV4cCI6MjA3ODQzODQ2N30.kmXhS5DOr-k3Tx_FOGLr7IXa-Df8QtTNaxpzBMU-0JA";
  return { url, key };
};

// --- Helper Functions ---
function getOrGenerateUsername() {
  const saved = localStorage.getItem(STORAGE_KEYS.MY_USERNAME);
  if (saved) return saved;
  const adjectives = ['Heart', 'Love', 'Cupid', 'Sweet', 'Cheeky', 'Blush', 'Dreamy', 'Soft', 'Rose', 'Velvet'];
  const numbers = Math.floor(Math.random() * 999);
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const newName = `${adjective}${numbers}`;
  localStorage.setItem(STORAGE_KEYS.MY_USERNAME, newName);
  return newName;
}

const FloatingHearts = () => {
  const [hearts, setHearts] = useState<{ id: number; left: string; size: number; duration: number; delay: number }[]>([]);
  useEffect(() => {
    setHearts(Array.from({ length: 15 }).map((_, i) => ({
      id: i, 
      left: `${Math.random() * 100}%`, 
      size: Math.random() * (25 - 12) + 12,
      duration: Math.random() * (12 - 7) + 7, 
      delay: Math.random() * 5,
    })));
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {hearts.map((h) => (
        <div key={h.id} className="heart-particle text-rose-300/30"
          style={{ left: h.left, fontSize: `${h.size}px`, animationDuration: `${h.duration}s`, animationDelay: `${h.delay}s` }}>
          <Heart fill="currentColor" />
        </div>
      ))}
    </div>
  );
};

// --- Main App ---
const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isAccepted, setIsAccepted] = useState(() => localStorage.getItem(STORAGE_KEYS.ACCEPTED) === 'true');
  const [successMessage, setSuccessMessage] = useState("Yay! You made my heart skip a beat! 💕");
  const [timeLeft, setTimeLeft] = useState(60);
  const [noButtonPos, setNoButtonPos] = useState({ x: 0, y: 0 });
  const [isNoButtonMoved, setIsNoButtonMoved] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  
  // Data State
  const [globalFeed, setGlobalFeed] = useState<GlobalResponse[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);
  
  // Forms
  const [newConfession, setNewConfession] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState(PROMPTS[0]);
  const [aiReaction, setAiReaction] = useState(() => localStorage.getItem(STORAGE_KEYS.REACTION) || "");
  const [isGenerating, setIsGenerating] = useState(false);

  const timerIntervalRef = useRef<number | null>(null);

  // Memoized Supabase Client to prevent recreation
  const supabase = useMemo(() => {
    const { url, key } = getSupabaseConfig();
    if (url && key) return createClient(url, key);
    return null;
  }, []);

  // --- Data Logic ---
  useEffect(() => {
    if (supabase) {
      const fetchInitial = async () => {
        try {
          const { data, error } = await supabase
            .from('responses')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(40);
          
          if (error) {
            setDbError(error.message);
            loadFallbackLocalData();
          } else if (data) {
            setGlobalFeed(data);
            setIsConnected(true);
            setDbError(null);
          }
        } catch (e: any) {
          setDbError(e.message || "Failed to connect to database");
          loadFallbackLocalData();
        }
      };
      fetchInitial();

      // Subscribe to Realtime Updates
      const channel = supabase
        .channel('public:responses')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'responses' }, (payload) => {
          setGlobalFeed(prev => {
            const exists = prev.some(r => r.id === payload.new.id);
            if (exists) return prev;
            return [payload.new as GlobalResponse, ...prev].slice(0, 50);
          });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') setIsConnected(true);
        });

      return () => { supabase.removeChannel(channel); };
    } else {
      loadFallbackLocalData();
    }
  }, [supabase]);

  const loadFallbackLocalData = () => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_FEED) || '[]');
    setGlobalFeed(saved);
    setIsConnected(false);
  };

  const saveToFeed = async (question: string, answer: string) => {
    const username = getOrGenerateUsername();
    const entry: GlobalResponse = {
      id: Date.now() + Math.random(),
      username,
      question,
      answer,
      created_at: new Date().toISOString()
    };

    if (supabase && !dbError) {
      const { error } = await supabase.from('responses').insert([{ username, question, answer }]);
      if (error) {
        console.error("Supabase Save Error:", error.message);
        setDbError(`Save failed: ${error.message}`);
        // Add locally as fallback
        setGlobalFeed(prev => [entry, ...prev].slice(0, 50));
      }
    } else {
      setGlobalFeed(prev => {
        const next = [entry, ...prev].slice(0, 50);
        localStorage.setItem(STORAGE_KEYS.LOCAL_FEED, JSON.stringify(next));
        return next;
      });
    }
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 }, colors: ['#f43f5e'] });
    return true;
  };

  const handleConfessionSubmit = async () => {
    if (newConfession.trim()) {
      await saveToFeed("Confession", newConfession);
      setNewConfession("");
    }
  };

  const handlePromptSubmit = async () => {
    if (!promptAnswer.trim()) return;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    setAiReaction("Blushing at your answer...");
    await saveToFeed(currentPrompt, promptAnswer);
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Question: "${currentPrompt}". User Answer: "${promptAnswer}". Provide a short, heartwarming 1-sentence reaction as a Valentine's AI.`,
      });
      const txt = resp.text || "That's so sweet! ❤️";
      setAiReaction(txt);
      localStorage.setItem(STORAGE_KEYS.REACTION, txt);
      setPromptAnswer("");
    } catch (e) {
      setAiReaction("That sounds absolutely lovely! ✨");
    }
  };

  const generateAiSpark = async () => {
    setIsGenerating(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Write one short (max 12 words) anonymous romantic confession for a global love wall. Just the text.",
      });
      const txt = resp.text?.trim() || "Love is written in the stars... 🌹";
      const user = "CupidAI";
      if (supabase && !dbError) {
        await supabase.from('responses').insert([{ username: user, question: "Confession", answer: txt }]);
      } else {
        const entry = { id: Date.now(), username: user, question: "Confession", answer: txt, created_at: new Date().toISOString() };
        setGlobalFeed(prev => [entry, ...prev].slice(0, 50));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Countdown & Timer ---
  useEffect(() => {
    if (timeLeft > 0 && !isAccepted) {
      timerIntervalRef.current = window.setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && !isAccepted) {
      handleAccept("Time's up! You are officially my Valentine! 💘");
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [timeLeft, isAccepted]);

  const handleAccept = (msg: string) => {
    setIsAccepted(true);
    setSuccessMessage(msg);
    localStorage.setItem(STORAGE_KEYS.ACCEPTED, 'true');
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    confetti({ 
      particleCount: 150, 
      spread: 70, 
      origin: { y: 0.6 },
      colors: ['#fb7185', '#e11d48', '#f43f5e']
    });
  };

  const moveNoButton = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (e.type === 'touchstart') e.preventDefault();
    const p = 100;
    const newX = Math.random() * (window.innerWidth - p * 2) + p;
    const newY = Math.random() * (window.innerHeight - p * 2) + p;
    setNoButtonPos({ x: newX, y: newY });
    setIsNoButtonMoved(true);
  }, []);

  return (
    <div className="min-h-screen w-full relative bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col items-center pt-24 pb-24 overflow-x-hidden">
      <FloatingHearts />
      
      {/* --- Navbar --- */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg">
        <div className="bg-white/70 backdrop-blur-xl border border-white/40 p-1.5 rounded-full shadow-lg flex justify-between items-center overflow-hidden">
          <button onClick={() => setCurrentView('home')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all duration-300 ${currentView === 'home' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-50'}`}>
            <HomeIcon size={18} /><span className="text-sm font-bold hidden sm:inline">Home</span>
          </button>
          <button onClick={() => setCurrentView('wall')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all duration-300 ${currentView === 'wall' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-50'}`}>
            <Users size={18} /><span className="text-sm font-bold hidden sm:inline">Feed</span>
          </button>
          <button onClick={() => setCurrentView('prompts')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all duration-300 ${currentView === 'prompts' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400 hover:bg-rose-50'}`}>
            <MessageCircle size={18} /><span className="text-sm font-bold hidden sm:inline">Ask</span>
          </button>
        </div>
      </nav>

      <main className="w-full max-w-3xl px-6 relative z-10 flex flex-col items-center justify-center">
        
        {/* VIEW: HOME */}
        {currentView === 'home' && (
          <div className="w-full space-y-12 text-center view-enter py-10">
            {isAccepted ? (
              <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                <Heart fill="#e11d48" className="w-32 h-32 text-rose-600 animate-bounce mx-auto" />
                <h1 className="text-4xl md:text-6xl font-pacifico text-rose-600 drop-shadow-sm">{successMessage}</h1>
                <p className="text-xl text-rose-500 font-medium italic">Our world is just starting to glow. ✨</p>
                <button onClick={() => setCurrentView('wall')} className="mt-8 bg-rose-500 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-rose-600 transition-all flex items-center gap-2 mx-auto active:scale-95">
                  View Global Feed <ChevronRight size={18} />
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="space-y-4">
                  <h1 className="text-5xl md:text-7xl font-pacifico text-rose-600 drop-shadow-sm">Be My Valentine? 💕</h1>
                  <p className="text-rose-400 font-medium italic text-lg">Every heartbeat counts...</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 relative min-h-[160px]">
                  <button onClick={() => handleAccept("Yay! Forever yours! 💕")} className="group relative inline-flex items-center gap-2 px-14 py-5 bg-rose-500 text-white rounded-full text-2xl font-bold shadow-xl shadow-rose-200 hover:bg-rose-600 hover:scale-105 active:scale-95 transition-all">
                    <span>Yes 💖</span>
                    <div className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-20 pointer-events-none"></div>
                  </button>
                  <button
                    onMouseEnter={moveNoButton}
                    onTouchStart={moveNoButton}
                    style={isNoButtonMoved ? { position: 'fixed', left: `${noButtonPos.x}px`, top: `${noButtonPos.y}px`, zIndex: 100, transform: 'translate(-50%, -50%)', transition: 'all 0.1s cubic-bezier(0.18, 0.89, 0.32, 1.28)' } : {}}
                    className="px-8 py-3 bg-white/80 text-gray-400 rounded-full text-lg font-semibold shadow-sm border border-transparent hover:border-rose-100 transition-all select-none"
                  >No 🙃</button>
                </div>
                <div className="bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 inline-flex flex-col items-center gap-2 shadow-sm">
                  <div className="flex items-center gap-3 text-rose-500">
                    <Clock size={24} className={timeLeft <= 10 ? 'animate-bounce text-red-500' : ''} />
                    <span className="text-3xl font-mono font-bold tracking-tighter">00:{timeLeft.toString().padStart(2, '0')}</span>
                  </div>
                  <p className="text-xs uppercase tracking-widest text-rose-400 font-bold">Automatic Accept Timer</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* VIEW: LOVE WALL */}
        {currentView === 'wall' && (
          <div className="w-full space-y-8 view-enter">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2 mb-2">
                <h2 className="text-4xl font-pacifico text-rose-600">Global Feed</h2>
                <span className={`flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border shadow-sm transition-all ${isConnected ? 'bg-green-50 text-green-600 border-green-100' : 'bg-rose-50 text-rose-400 border-rose-100'}`}>
                  {isConnected ? <><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Live Pulse</> : <><Activity size={10} /> Local Heartbeat</>}
                </span>
              </div>
              <p className="text-rose-400 font-medium italic">Whispers from the collective heart.</p>
            </div>

            {/* --- CONNECTION TROUBLESHOOTER (Only shows if something is wrong) --- */}
            {(!isConnected || dbError) && (
              <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 animate-in fade-in zoom-in slide-in-from-top-4 duration-500 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="bg-amber-100 p-2 rounded-full text-amber-600">
                    <Database size={20} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-amber-800 uppercase tracking-tight">Database Troubleshooter</h4>
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {!supabase ? (
                        "Environment keys 'SUPABASE_URL' or 'SUPABASE_ANON_KEY' were not found. App is running in Local Mode."
                      ) : dbError?.includes("relation") ? (
                        "Supabase keys found, but table 'responses' does not exist in your project yet. Check your SQL Editor!"
                      ) : (
                        dbError || "Connecting to the global network..."
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white/70 backdrop-blur-md p-4 rounded-3xl shadow-sm border border-white/50 flex flex-col gap-3">
              <textarea 
                value={newConfession} 
                onChange={(e) => setNewConfession(e.target.value)} 
                placeholder="Post a global confession..." 
                className="w-full bg-rose-50/50 rounded-2xl p-4 text-rose-700 placeholder-rose-300 border-none focus:ring-2 focus:ring-rose-200 resize-none h-24 text-lg font-medium" 
              />
              <div className="flex justify-between items-center px-1">
                <button onClick={generateAiSpark} disabled={isGenerating} className="text-xs text-rose-400 hover:text-rose-600 font-bold flex items-center gap-1 disabled:opacity-50 transition-colors">
                  <Sparkles size={14} /> AI Spark
                </button>
                <button onClick={handleConfessionSubmit} disabled={!newConfession.trim()} className="bg-rose-500 text-white px-6 py-2.5 rounded-full font-bold flex items-center gap-2 hover:bg-rose-600 transition-all shadow-md active:scale-95">
                  Post <Send size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {globalFeed.map((post) => (
                <div key={post.id} className="bg-white/60 p-5 rounded-2xl border border-white/40 shadow-sm hover:translate-y-[-2px] transition-all animate-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1">
                      <Ghost size={12} /> {post.username}
                    </span>
                    <span className="text-[10px] text-rose-300 italic font-medium">
                      {new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {post.question !== "Confession" && (
                    <p className="text-[10px] text-rose-400 font-bold uppercase mb-1 opacity-70 flex items-center gap-1">
                      <Quote size={8} className="fill-current" /> Q: {post.question}
                    </p>
                  )}
                  <p className="text-rose-700 font-medium italic text-lg leading-relaxed">"{post.answer}"</p>
                </div>
              ))}
              {globalFeed.length === 0 && (
                <div className="py-20 text-center text-rose-300 italic font-medium">Be the first to share your heart with the world... 🌹</div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: ASK */}
        {currentView === 'prompts' && (
          <div className="w-full space-y-8 view-enter text-center">
             <div className="space-y-2">
                <h2 className="text-4xl font-pacifico text-rose-600">Daily Love Ask</h2>
                <p className="text-rose-400 italic font-medium">Your heart's answer will appear in the global feed.</p>
             </div>
             <div className="bg-white/80 backdrop-blur-lg p-8 rounded-[2.5rem] shadow-xl border border-white space-y-8 relative overflow-hidden transition-all hover:shadow-rose-100">
                <Quote className="absolute top-4 left-4 text-rose-100 w-24 h-24 -z-10 opacity-40" />
                <h3 className="text-2xl font-bold text-rose-600 italic leading-tight">"{currentPrompt}"</h3>
                <div className="space-y-4 relative z-10">
                  <input 
                    type="text" 
                    value={promptAnswer} 
                    onChange={(e) => setPromptAnswer(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()} 
                    placeholder="Whisper your answer here..." 
                    className="w-full bg-rose-50/50 border-2 border-rose-100 rounded-2xl px-6 py-4 text-rose-700 placeholder-rose-300 focus:outline-none focus:border-rose-400 transition-all text-center text-lg font-medium shadow-inner" 
                  />
                  <button onClick={handlePromptSubmit} disabled={!promptAnswer.trim()} className="w-full bg-rose-500 text-white font-bold py-4 rounded-2xl hover:bg-rose-600 shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:opacity-50">
                    Send Globally 💌
                  </button>
                </div>
                {aiReaction && (
                  <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-in fade-in slide-in-from-top-2">
                    <p className="text-rose-600 font-medium italic flex items-center justify-center gap-2">
                      <Sparkles size={16} className="text-yellow-400 animate-pulse" /> {aiReaction}
                    </p>
                  </div>
                )}
             </div>
             <button onClick={() => { setCurrentPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]); setAiReaction(""); }} className="text-rose-400 font-bold text-xs uppercase tracking-widest hover:text-rose-600 transition-colors flex items-center gap-2 mx-auto">
               <Radio size={14} /> Shuffle Question
             </button>
          </div>
        )}
      </main>

      {/* --- Controls --- */}
      <button onClick={() => setIsMuted(!isMuted)} className="fixed bottom-6 right-6 p-3 bg-white/60 backdrop-blur-md rounded-full text-rose-500 shadow-sm border border-white/50 z-20 hover:bg-white hover:scale-110 transition-all">
        {isMuted ? <VolumeX size={20} /> : <Music size={20} className="animate-pulse" />}
      </button>

      <div className="fixed bottom-6 w-full flex justify-center pointer-events-none z-10">
        <a href="https://t.me/savvy_society" target="_blank" rel="noopener noreferrer" className="bg-white/50 backdrop-blur-md px-5 py-2 rounded-full text-rose-400 text-xs font-bold tracking-[0.2em] border border-white/60 shadow-lg hover:bg-rose-50 hover:text-rose-600 transition-all pointer-events-auto flex items-center gap-2 uppercase">
          built with ❤️‍🔥 by <span className="underline decoration-rose-300 underline-offset-4">savvy</span>
        </a>
      </div>
    </div>
  );
};
export default App;
