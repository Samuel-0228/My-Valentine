import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Heart, Sparkles, Clock, Music, VolumeX, MessageCircle, 
  Send, Users, Home as HomeIcon, Ghost, Quote, AlertCircle, ChevronRight, Activity
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
  ACCEPTED: 'valentine_accepted',
  REACTION: 'valentine_ai_reaction',
  MY_USERNAME: 'valentine_my_username',
  LOCAL_FEED: 'valentine_local_feed'
};

const PROMPTS = [
  "What's your dream date?", 
  "Define love in one word.", 
  "The cheesiest pickup line you actually like?",
  "What song reminds you of love?",
  "First thing you notice in a crush?",
  "Your idea of a perfect rainy day with someone?",
  "What's the best compliment you've ever received?"
];

// --- Supabase Client ---
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// --- Helpers ---
function generateUsername() {
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
      id: i, left: `${Math.random() * 100}%`, size: Math.random() * (25 - 12) + 12,
      duration: Math.random() * (12 - 7) + 7, delay: Math.random() * 5,
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
  
  // Forms
  const [newConfession, setNewConfession] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState(PROMPTS[0]);
  const [aiReaction, setAiReaction] = useState(() => localStorage.getItem(STORAGE_KEYS.REACTION) || "");
  const [isGenerating, setIsGenerating] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Hybrid Data Sync ---
  useEffect(() => {
    if (supabase) {
      // Supabase Mode
      const fetchInitial = async () => {
        const { data, error } = await supabase.from('responses').select('*').order('created_at', { ascending: false }).limit(40);
        if (!error && data) { setGlobalFeed(data); setIsConnected(true); }
      };
      fetchInitial();

      const channel = supabase.channel('public:responses').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'responses' }, (payload) => {
        setGlobalFeed(prev => [payload.new as GlobalResponse, ...prev].slice(0, 50));
      }).subscribe();
      return () => { supabase.removeChannel(channel); };
    } else {
      // Local Mode Fallback
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_FEED) || '[]');
      setGlobalFeed(saved);
      setIsConnected(false);
    }
  }, []);

  const saveToFeed = async (question: string, answer: string) => {
    const entry: GlobalResponse = {
      id: Date.now(),
      username: generateUsername(),
      question,
      answer,
      created_at: new Date().toISOString()
    };

    if (supabase) {
      const { error } = await supabase.from('responses').insert([{ username: entry.username, question, answer }]);
      if (error) console.error(error);
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

  const handleConfessionSubmit = () => {
    if (newConfession.trim()) {
      saveToFeed("Confession", newConfession);
      setNewConfession("");
    }
  };

  const handlePromptSubmit = async () => {
    if (!promptAnswer.trim()) return;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    setAiReaction("Blushing...");
    await saveToFeed(currentPrompt, promptAnswer);
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Question: "${currentPrompt}". User Answer: "${promptAnswer}". Give a very short, cute 1-sentence reaction.`,
      });
      const txt = resp.text || "So sweet! ❤️";
      setAiReaction(txt);
      localStorage.setItem(STORAGE_KEYS.REACTION, txt);
      setPromptAnswer("");
    } catch (e) { setAiReaction("Lovely! ✨"); }
  };

  const generateAiSpark = async () => {
    setIsGenerating(true);
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Write one short (max 12 words) anonymous romantic confession. Just the text.",
      });
      const txt = resp.text?.trim() || "Love is everywhere... 🌹";
      const user = "CupidAI";
      if (supabase) {
        await supabase.from('responses').insert([{ username: user, question: "Confession", answer: txt }]);
      } else {
        const entry = { id: Date.now(), username: user, question: "Confession", answer: txt, created_at: new Date().toISOString() };
        setGlobalFeed(prev => {
          const next = [entry, ...prev].slice(0, 50);
          localStorage.setItem(STORAGE_KEYS.LOCAL_FEED, JSON.stringify(next));
          return next;
        });
      }
    } finally { setIsGenerating(false); }
  };

  // Timer logic
  useEffect(() => {
    if (timeLeft > 0 && !isAccepted) {
      timerRef.current = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
    } else if (timeLeft === 0 && !isAccepted) {
      handleAccept("Time's up! Official Valentine! 💘");
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timeLeft, isAccepted]);

  const handleAccept = (msg: string) => {
    setIsAccepted(true);
    setSuccessMessage(msg);
    localStorage.setItem(STORAGE_KEYS.ACCEPTED, 'true');
    if (timerRef.current) clearInterval(timerRef.current);
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#fb7185', '#e11d48', '#f43f5e'] });
  };

  const moveNoButton = useCallback(() => {
    const p = 100;
    setNoButtonPos({ x: Math.random() * (window.innerWidth - p * 2) + p, y: Math.random() * (window.innerHeight - p * 2) + p });
    setIsNoButtonMoved(true);
  }, []);

  return (
    <div className="min-h-screen w-full relative bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col items-center pt-24 pb-24 overflow-x-hidden">
      <FloatingHearts />
      
      {/* --- Navbar --- */}
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg">
        <div className="bg-white/70 backdrop-blur-xl border border-white/40 p-1.5 rounded-full shadow-lg flex justify-between items-center">
          <button onClick={() => setCurrentView('home')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'home' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400'}`}>
            <HomeIcon size={18} /><span className="text-sm font-bold hidden sm:inline">Home</span>
          </button>
          <button onClick={() => setCurrentView('wall')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'wall' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400'}`}>
            <Users size={18} /><span className="text-sm font-bold hidden sm:inline">Feed</span>
          </button>
          <button onClick={() => setCurrentView('prompts')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'prompts' ? 'bg-rose-500 text-white shadow-md' : 'text-rose-400'}`}>
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
                <p className="text-xl text-rose-500 font-medium italic">Love is truly in the air. ✨</p>
                <button onClick={() => setCurrentView('wall')} className="mt-8 bg-rose-500 text-white px-8 py-3 rounded-full font-bold shadow-lg hover:bg-rose-600 flex items-center gap-2 mx-auto">
                  View the Feed <ChevronRight size={18} />
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                <div className="space-y-4">
                  <h1 className="text-5xl md:text-7xl font-pacifico text-rose-600 drop-shadow-sm">Be My Valentine? 💕</h1>
                  <p className="text-rose-400 font-medium italic">A "Yes" makes history...</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 relative h-32">
                  <button onClick={() => handleAccept("Yay! Forever yours! 💕")} className="group relative inline-flex items-center gap-2 px-14 py-5 bg-rose-500 text-white rounded-full text-2xl font-bold shadow-xl shadow-rose-200 hover:bg-rose-600 transition-all">
                    <span>Yes 💖</span>
                    <div className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-20 pointer-events-none"></div>
                  </button>
                  <button
                    onMouseEnter={moveNoButton} onClick={moveNoButton}
                    style={isNoButtonMoved ? { position: 'fixed', left: `${noButtonPos.x}px`, top: `${noButtonPos.y}px`, zIndex: 100, transform: 'translate(-50%, -50%)', transition: 'all 0.1s' } : {}}
                    className="px-8 py-3 bg-white/80 text-gray-400 rounded-full text-lg font-semibold shadow-sm transition-all"
                  >No 🙃</button>
                </div>
                <div className="bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 inline-flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3 text-rose-500">
                    <Clock size={24} className={timeLeft <= 10 ? 'animate-bounce text-red-500' : ''} />
                    <span className="text-3xl font-mono font-bold">00:{timeLeft.toString().padStart(2, '0')}</span>
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
                  {isConnected ? <><div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" /> Global Pulse</> : <><Activity size={10} /> Local Heartbeat</>}
                </span>
              </div>
              <p className="text-rose-400 font-medium">Anonymous whispers shared by all.</p>
            </div>

            <div className="bg-white/70 backdrop-blur-md p-4 rounded-3xl shadow-sm border border-white/50 flex flex-col gap-3">
              <textarea value={newConfession} onChange={(e) => setNewConfession(e.target.value)} placeholder="Write a global confession..." className="w-full bg-rose-50/50 rounded-2xl p-4 text-rose-700 placeholder-rose-300 border-none focus:ring-2 focus:ring-rose-200 resize-none h-24" />
              <div className="flex justify-between items-center px-1">
                <button onClick={generateAiSpark} disabled={isGenerating} className="text-xs text-rose-400 hover:text-rose-600 font-bold flex items-center gap-1 disabled:opacity-50">
                  <Sparkles size={14} /> AI Spark
                </button>
                <button onClick={handleConfessionSubmit} disabled={!newConfession.trim()} className="bg-rose-500 text-white px-6 py-2 rounded-full font-bold flex items-center gap-2 hover:bg-rose-600 transition-all">
                  Post <Send size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {globalFeed.map((post) => (
                <div key={post.id} className="bg-white/60 p-5 rounded-2xl border border-white/40 shadow-sm animate-in slide-in-from-bottom-2 duration-300">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-rose-400 uppercase flex items-center gap-1"><Ghost size={12} /> {post.username}</span>
                    <span className="text-[10px] text-rose-300 italic">{new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {post.question !== "Confession" && <p className="text-[10px] text-rose-400 font-bold uppercase mb-1 opacity-60 flex items-center gap-1"><Quote size={8} /> Q: {post.question}</p>}
                  <p className="text-rose-700 font-medium italic text-lg leading-relaxed">"{post.answer}"</p>
                </div>
              ))}
              {globalFeed.length === 0 && <div className="py-20 text-center text-rose-300 italic">Be the first to share your heart... 🌹</div>}
            </div>
          </div>
        )}

        {/* VIEW: ASK */}
        {currentView === 'prompts' && (
          <div className="w-full space-y-8 view-enter text-center">
             <div className="space-y-2">
                <h2 className="text-4xl font-pacifico text-rose-600">Daily Love Ask</h2>
                <p className="text-rose-400 italic">Answers are shared globally on the feed.</p>
             </div>
             <div className="bg-white/80 backdrop-blur-lg p-8 rounded-[2.5rem] shadow-xl border border-white space-y-8 relative overflow-hidden">
                <Quote className="absolute top-4 left-4 text-rose-100 w-24 h-24 -z-10" />
                <h3 className="text-2xl font-bold text-rose-600 italic leading-tight">"{currentPrompt}"</h3>
                <div className="space-y-4">
                  <input type="text" value={promptAnswer} onChange={(e) => setPromptAnswer(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handlePromptSubmit()} placeholder="Type your answer..." className="w-full bg-rose-50/50 border-2 border-rose-100 rounded-2xl px-6 py-4 text-rose-700 placeholder-rose-300 focus:outline-none focus:border-rose-400 transition-all text-center text-lg" />
                  <button onClick={handlePromptSubmit} disabled={!promptAnswer.trim()} className="w-full bg-rose-500 text-white font-bold py-4 rounded-2xl hover:bg-rose-600 shadow-lg transition-all">Submit to Global Feed 💌</button>
                </div>
                {aiReaction && <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-in fade-in"><p className="text-rose-600 font-medium italic flex items-center justify-center gap-2"><Sparkles size={16} className="text-yellow-400" /> {aiReaction}</p></div>}
             </div>
             <button onClick={() => { setCurrentPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]); setAiReaction(""); }} className="text-rose-400 font-bold text-xs uppercase tracking-widest hover:text-rose-600">Shuffle →</button>
          </div>
        )}
      </main>

      <button onClick={() => setIsMuted(!isMuted)} className="fixed bottom-6 right-6 p-3 bg-white/60 backdrop-blur-md rounded-full text-rose-500 shadow-sm border border-white/50 z-20">
        {isMuted ? <VolumeX size={20} /> : <Music size={20} className="animate-pulse" />}
      </button>

      <div className="fixed bottom-6 w-full flex justify-center pointer-events-none z-10">
        <a href="https://t.me/savvy_society" target="_blank" rel="noopener noreferrer" className="bg-white/50 backdrop-blur-md px-5 py-2 rounded-full text-rose-400 text-xs font-bold tracking-[0.2em] border border-white/60 shadow-lg hover:bg-rose-50 transition-all pointer-events-auto flex items-center gap-2 uppercase">built with ❤️‍🔥 by savvy</a>
      </div>
    </div>
  );
};
export default App;