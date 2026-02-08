import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Heart, Sparkles, Clock, Music, VolumeX, MessageCircle, 
  Send, Users, Home as HomeIcon, Ghost, Quote, ChevronRight, Activity, Radio, ThumbsUp, MessageSquare
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// --- Types ---
type View = 'home' | 'wall' | 'prompts';

interface Reply {
  id: string | number;
  username: string;
  text: string;
  created_at: string;
}

interface GlobalResponse {
  id: string | number;
  username: string;
  question: string;
  answer: string;
  created_at: string;
  likes?: number;
  replies?: Reply[];
}

const STORAGE_KEYS = {
  ACCEPTED: 'valentine_accepted_v6',
  REACTION: 'valentine_ai_reaction_v6',
  MY_USERNAME: 'valentine_my_username_v6',
  LOCAL_FEED: 'valentine_local_feed_v6'
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

// --- Supabase Config ---
const getSupabaseConfig = () => {
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.SUPABASE_URL || (process.env as any).VITE_SUPABASE_URL || '';
  const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || (process.env as any).VITE_SUPABASE_ANON_KEY || '';
  return { url, key };
};

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

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [isAccepted, setIsAccepted] = useState(() => localStorage.getItem(STORAGE_KEYS.ACCEPTED) === 'true');
  const [successMessage, setSuccessMessage] = useState("Yay! You made my heart skip a beat! 💕");
  const [timeLeft, setTimeLeft] = useState(60);
  const [noButtonPos, setNoButtonPos] = useState({ x: 0, y: 0 });
  const [isNoButtonMoved, setIsNoButtonMoved] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  
  const [globalFeed, setGlobalFeed] = useState<GlobalResponse[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  
  const [newConfession, setNewConfession] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState(PROMPTS[0]);
  const [aiReaction, setAiReaction] = useState(() => localStorage.getItem(STORAGE_KEYS.REACTION) || "");
  const [isGenerating, setIsGenerating] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | number | null>(null);
  const [replyText, setReplyText] = useState("");

  const timerIntervalRef = useRef<number | null>(null);
  const config = useMemo(() => getSupabaseConfig(), []);
  const supabase = useMemo(() => (config.url && config.key) ? createClient(config.url, config.key) : null, [config]);

  // --- Data Logic ---
  const loadLocalData = useCallback(() => {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOCAL_FEED) || '[]');
    setGlobalFeed(saved);
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (supabase) {
      const fetchFeed = async () => {
        const { data, error } = await supabase.from('responses').select('*').order('created_at', { ascending: false }).limit(40);
        if (!error && data) {
          setGlobalFeed(data);
          setIsConnected(true);
        } else {
          loadLocalData();
        }
      };
      fetchFeed();

      const channel = supabase.channel('public:responses')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setGlobalFeed(prev => [payload.new as GlobalResponse, ...prev].slice(0, 50));
          } else if (payload.eventType === 'UPDATE') {
            setGlobalFeed(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
          }
        }).subscribe();
      return () => { supabase.removeChannel(channel); };
    } else {
      loadLocalData();
    }
  }, [supabase, loadLocalData]);

  const updatePostLocally = (postId: string | number, updater: (post: GlobalResponse) => GlobalResponse) => {
    setGlobalFeed(prev => {
      const next = prev.map(p => p.id === postId ? updater(p) : p);
      localStorage.setItem(STORAGE_KEYS.LOCAL_FEED, JSON.stringify(next));
      return next;
    });
  };

  const handleLike = async (postId: string | number) => {
    const post = globalFeed.find(p => p.id === postId);
    if (!post) return;
    
    confetti({ particleCount: 15, spread: 40, origin: { y: 0.8 }, colors: ['#f43f5e'] });
    
    if (supabase && isConnected) {
      await supabase.from('responses').update({ likes: (post.likes || 0) + 1 }).eq('id', postId);
    } else {
      updatePostLocally(postId, p => ({ ...p, likes: (p.likes || 0) + 1 }));
    }
  };

  const handleReplySubmit = async (postId: string | number) => {
    if (!replyText.trim()) return;
    const username = getOrGenerateUsername();
    const newReply: Reply = {
      id: Date.now() + Math.random(),
      username,
      text: replyText,
      created_at: new Date().toISOString()
    };

    const post = globalFeed.find(p => p.id === postId);
    if (!post) return;
    const updatedReplies = [...(post.replies || []), newReply];

    if (supabase && isConnected) {
      await supabase.from('responses').update({ replies: updatedReplies }).eq('id', postId);
    } else {
      updatePostLocally(postId, p => ({ ...p, replies: updatedReplies }));
    }
    setReplyText("");
    setReplyingTo(null);
    confetti({ particleCount: 10, spread: 30, colors: ['#fb7185'] });
  };

  const saveToFeed = async (question: string, answer: string) => {
    const username = getOrGenerateUsername();
    const entry: GlobalResponse = {
      id: Date.now() + Math.random(),
      username,
      question,
      answer,
      likes: 0,
      replies: [],
      created_at: new Date().toISOString()
    };

    if (supabase && isConnected) {
      const { error } = await supabase.from('responses').insert([{ username, question, answer, likes: 0, replies: [] }]);
      if (error) loadLocalData();
    } else {
      setGlobalFeed(prev => {
        const next = [entry, ...prev].slice(0, 50);
        localStorage.setItem(STORAGE_KEYS.LOCAL_FEED, JSON.stringify(next));
        return next;
      });
    }
    confetti({ particleCount: 30, spread: 60, origin: { y: 0.8 }, colors: ['#f43f5e'] });
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
      await saveToFeed("Confession", txt);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- UI Handlers ---
  useEffect(() => {
    if (timeLeft > 0 && !isAccepted) {
      timerIntervalRef.current = window.setInterval(() => setTimeLeft(prev => prev - 1), 1000);
    } else if (timeLeft === 0 && !isAccepted) {
      handleAccept("Time's up! You are officially my Valentine! 💘");
    }
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current); };
  }, [timeLeft, isAccepted]);

  const handleAccept = (msg: string) => {
    setIsAccepted(true);
    setSuccessMessage(msg);
    localStorage.setItem(STORAGE_KEYS.ACCEPTED, 'true');
    confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
  };

  const moveNoButton = useCallback(() => {
    const p = 100;
    setNoButtonPos({ x: Math.random() * (window.innerWidth - p * 2) + p, y: Math.random() * (window.innerHeight - p * 2) + p });
    setIsNoButtonMoved(true);
  }, []);

  return (
    <div className="min-h-screen w-full relative bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50 flex flex-col items-center pt-24 pb-24 overflow-x-hidden">
      <FloatingHearts />
      
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg">
        <div className="bg-white/70 backdrop-blur-xl border border-white/40 p-1.5 rounded-full shadow-lg flex justify-between items-center">
          <button onClick={() => setCurrentView('home')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'home' ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-rose-50'}`}>
            <HomeIcon size={18} /><span className="text-sm font-bold hidden sm:inline">Home</span>
          </button>
          <button onClick={() => setCurrentView('wall')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'wall' ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-rose-50'}`}>
            <Users size={18} /><span className="text-sm font-bold hidden sm:inline">Feed</span>
          </button>
          <button onClick={() => setCurrentView('prompts')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'prompts' ? 'bg-rose-500 text-white' : 'text-rose-400 hover:bg-rose-50'}`}>
            <MessageCircle size={18} /><span className="text-sm font-bold hidden sm:inline">Ask</span>
          </button>
        </div>
      </nav>

      <main className="w-full max-w-3xl px-6 relative z-10">
        {currentView === 'home' && (
          <div className="w-full text-center view-enter py-10 space-y-12">
            {isAccepted ? (
              <div className="space-y-6 animate-in fade-in zoom-in">
                <Heart fill="#e11d48" className="w-32 h-32 text-rose-600 animate-bounce mx-auto" />
                <h1 className="text-4xl md:text-6xl font-pacifico text-rose-600">{successMessage}</h1>
                <p className="text-xl text-rose-500 italic">Our world is just starting to glow. ✨</p>
                <button onClick={() => setCurrentView('wall')} className="mt-8 bg-rose-500 text-white px-8 py-3 rounded-full font-bold shadow-lg flex items-center gap-2 mx-auto active:scale-95">
                  View Global Feed <ChevronRight size={18} />
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                <h1 className="text-5xl md:text-7xl font-pacifico text-rose-600">Be My Valentine? 💕</h1>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 min-h-[160px]">
                  <button onClick={() => handleAccept("Yay! Forever yours! 💕")} className="group relative px-14 py-5 bg-rose-500 text-white rounded-full text-2xl font-bold shadow-xl hover:scale-105 active:scale-95 transition-all">
                    Yes 💖
                    <div className="absolute inset-0 rounded-full bg-rose-400 animate-ping opacity-20 pointer-events-none" />
                  </button>
                  <button
                    onMouseEnter={moveNoButton} onTouchStart={moveNoButton}
                    style={isNoButtonMoved ? { position: 'fixed', left: `${noButtonPos.x}px`, top: `${noButtonPos.y}px`, zIndex: 100, transform: 'translate(-50%, -50%)' } : {}}
                    className="px-8 py-3 bg-white/80 text-gray-400 rounded-full text-lg font-semibold shadow-sm transition-all"
                  >No 🙃</button>
                </div>
                <div className="bg-white/40 backdrop-blur-md p-6 rounded-3xl border border-white/60 inline-flex flex-col items-center gap-2">
                  <div className="flex items-center gap-3 text-rose-500 text-3xl font-mono font-bold tracking-tighter">
                    <Clock size={24} className={timeLeft <= 10 ? 'animate-bounce text-red-500' : ''} />
                    00:{timeLeft.toString().padStart(2, '0')}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentView === 'wall' && (
          <div className="w-full space-y-8 view-enter">
            <div className="text-center">
              <h2 className="text-4xl font-pacifico text-rose-600 mb-2">Global Feed</h2>
              <span className={`px-4 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border shadow-sm ${isConnected ? 'bg-green-50 text-green-600 border-green-100' : 'bg-rose-50 text-rose-400 border-rose-100'}`}>
                {isConnected ? '• Live Connection' : 'Offline Mode'}
              </span>
            </div>

            <div className="bg-white/70 backdrop-blur-md p-4 rounded-3xl shadow-sm border border-white/50 space-y-3">
              <textarea 
                value={newConfession} onChange={(e) => setNewConfession(e.target.value)} 
                placeholder="Post a global confession..." 
                className="w-full bg-rose-50/50 rounded-2xl p-4 text-rose-700 placeholder-rose-300 border-none focus:ring-2 focus:ring-rose-200 resize-none h-24 font-medium" 
              />
              <div className="flex justify-between items-center px-1">
                <button onClick={generateAiSpark} disabled={isGenerating} className="text-xs text-rose-400 hover:text-rose-600 font-bold flex items-center gap-1 disabled:opacity-50 transition-colors">
                  <Sparkles size={14} /> AI Spark
                </button>
                <button onClick={handleConfessionSubmit} disabled={!newConfession.trim()} className="bg-rose-500 text-white px-6 py-2 rounded-full font-bold flex items-center gap-2 shadow-md active:scale-95">
                  Post <Send size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {globalFeed.map((post) => (
                <div key={post.id} className="bg-white/70 p-6 rounded-3xl border border-white/60 shadow-sm space-y-4 animate-in slide-in-from-bottom-2">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-rose-400 uppercase flex items-center gap-1"><Ghost size={12} /> {post.username}</span>
                      <span className="text-[10px] text-rose-300 font-medium">{new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {post.question !== "Confession" && <p className="text-[10px] text-rose-400 font-bold uppercase mb-1">Q: {post.question}</p>}
                    <p className="text-rose-700 font-medium italic text-xl">"{post.answer}"</p>
                  </div>

                  <div className="flex items-center gap-4 pt-2 border-t border-rose-100/50">
                    <button onClick={() => handleLike(post.id)} className="flex items-center gap-1.5 text-rose-400 hover:text-rose-600 transition-colors font-bold text-sm group">
                      <Heart size={16} className={`group-hover:scale-125 transition-transform ${post.likes && post.likes > 0 ? 'fill-rose-500 text-rose-500' : ''}`} />
                      {post.likes || 0}
                    </button>
                    <button onClick={() => setReplyingTo(replyingTo === post.id ? null : post.id)} className="flex items-center gap-1.5 text-rose-400 hover:text-rose-600 transition-colors font-bold text-sm">
                      <MessageSquare size={16} /> {post.replies?.length || 0}
                    </button>
                  </div>

                  {replyingTo === post.id && (
                    <div className="flex flex-col gap-2 pt-2 animate-in fade-in">
                      <input 
                        type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)}
                        placeholder="Whisper a reply..."
                        className="bg-rose-50 border-none rounded-xl px-4 py-2 text-sm text-rose-700 placeholder-rose-300 focus:ring-1 focus:ring-rose-200"
                        onKeyDown={(e) => e.key === 'Enter' && handleReplySubmit(post.id)}
                      />
                      <div className="flex justify-end">
                        <button onClick={() => handleReplySubmit(post.id)} className="text-[10px] bg-rose-500 text-white px-3 py-1 rounded-full font-bold">Reply</button>
                      </div>
                    </div>
                  )}

                  {post.replies && post.replies.length > 0 && (
                    <div className="space-y-3 mt-4 border-l-2 border-rose-100 pl-4">
                      {post.replies.map(reply => (
                        <div key={reply.id} className="bg-rose-50/50 p-3 rounded-2xl text-sm">
                          <span className="text-[10px] font-bold text-rose-400 block mb-0.5">{reply.username}</span>
                          <p className="text-rose-600 italic leading-relaxed">{reply.text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === 'prompts' && (
          <div className="w-full space-y-8 view-enter text-center">
            <h2 className="text-4xl font-pacifico text-rose-600">Daily Love Ask</h2>
            <div className="bg-white/80 backdrop-blur-lg p-10 rounded-[2.5rem] shadow-xl border border-white space-y-8 relative overflow-hidden">
              <Quote className="absolute top-4 left-4 text-rose-100 w-24 h-24 -z-10 opacity-30" />
              <h3 className="text-2xl font-bold text-rose-600 italic">"{currentPrompt}"</h3>
              <div className="space-y-4 relative z-10">
                <input 
                  type="text" value={promptAnswer} onChange={(e) => setPromptAnswer(e.target.value)} 
                  placeholder="Whisper your answer here..." 
                  className="w-full bg-rose-50/50 border-2 border-rose-100 rounded-2xl px-6 py-4 text-rose-700 text-center text-lg font-medium" 
                />
                <button onClick={handlePromptSubmit} disabled={!promptAnswer.trim()} className="w-full bg-rose-500 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 disabled:opacity-50">
                  Send Globally 💌
                </button>
              </div>
              {aiReaction && (
                <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 animate-in fade-in">
                  <p className="text-rose-600 font-medium italic flex items-center justify-center gap-2">
                    <Sparkles size={16} className="text-yellow-400" /> {aiReaction}
                  </p>
                </div>
              )}
            </div>
            <button onClick={() => { setCurrentPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]); setAiReaction(""); }} className="text-rose-400 font-bold text-xs uppercase hover:text-rose-600 transition-colors flex items-center gap-2 mx-auto">
              <Radio size={14} /> Shuffle Question
            </button>
          </div>
        )}
      </main>

      <button onClick={() => setIsMuted(!isMuted)} className="fixed bottom-6 right-6 p-3 bg-white/60 backdrop-blur-md rounded-full text-rose-500 shadow-sm border border-white/50 z-20 hover:scale-110 transition-all">
        {isMuted ? <VolumeX size={20} /> : <Music size={20} className="animate-pulse" />}
      </button>

      <div className="fixed bottom-6 w-full flex justify-center pointer-events-none z-10">
        <a href="https://t.me/savvy_society" target="_blank" rel="noopener noreferrer" className="bg-white/50 backdrop-blur-md px-5 py-2 rounded-full text-rose-400 text-[10px] font-bold tracking-widest border border-white/60 shadow-sm pointer-events-auto flex items-center gap-2 uppercase transition-all hover:text-rose-600">
          built with ❤️‍🔥 by <span className="underline decoration-rose-300 underline-offset-4">savvy</span>
        </a>
      </div>
    </div>
  );
};

export default App;
