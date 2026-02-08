import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Heart, Sparkles, Clock, Music, VolumeX, MessageCircle, 
  Send, Users, Home as HomeIcon, Ghost, Quote, ChevronRight, Radio, MessageSquare, Palette, Moon, Sun, Zap, Leaf
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// --- Types ---
type View = 'home' | 'wall' | 'prompts';
type ThemeMode = 'romantic' | 'dark' | 'vivid' | 'calm';

interface Reply {
  id: string | number;
  post_id: string | number;
  username: string;
  content: string;
  created_at: string;
}

interface GlobalResponse {
  id: string | number;
  username: string;
  question: string;
  answer: string;
  created_at: string;
  likes: number; // UI state only unless DB column is added
}

const STORAGE_KEYS = {
  ACCEPTED: 'valentine_accepted_v11',
  REACTION: 'valentine_ai_reaction_v11',
  MY_USERNAME: 'valentine_my_username_v11',
  LOCAL_FEED: 'valentine_local_feed_v11',
  LIKED_POSTS: 'valentine_liked_posts_v11',
  THEME: 'valentine_theme_v11'
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

// --- Theme Configs ---
const THEME_CONFIG: Record<ThemeMode, { 
  bg: string, 
  card: string, 
  text: string, 
  accent: string, 
  input: string,
  nav: string,
  heart: string 
}> = {
  romantic: {
    bg: 'bg-gradient-to-br from-rose-50 via-pink-50 to-purple-50',
    card: 'bg-white/70 border-white/60 shadow-sm',
    text: 'text-rose-600',
    accent: 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-200',
    input: 'bg-rose-50/50 border-rose-100 text-rose-700 placeholder-rose-300',
    nav: 'bg-white/70 border-white/40',
    heart: 'text-rose-300/30'
  },
  dark: {
    bg: 'bg-slate-950',
    card: 'bg-slate-900/80 border-slate-800 shadow-xl',
    text: 'text-rose-400',
    accent: 'bg-rose-600 hover:bg-rose-500 text-white shadow-none',
    input: 'bg-slate-800 border-slate-700 text-rose-100 placeholder-slate-500',
    nav: 'bg-slate-900/90 border-slate-800',
    heart: 'text-rose-500/20'
  },
  vivid: {
    bg: 'bg-gradient-to-br from-indigo-600 via-purple-600 to-rose-500',
    card: 'bg-white/20 backdrop-blur-md border-white/30 shadow-2xl text-white',
    text: 'text-white',
    accent: 'bg-white text-indigo-600 hover:bg-slate-100 shadow-none',
    input: 'bg-white/10 border-white/20 text-white placeholder-white/50',
    nav: 'bg-white/20 border-white/30',
    heart: 'text-white/20'
  },
  calm: {
    bg: 'bg-slate-50',
    card: 'bg-white border-slate-200 shadow-sm',
    text: 'text-slate-700',
    accent: 'bg-slate-800 hover:bg-slate-900 text-white shadow-none',
    input: 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400',
    nav: 'bg-white border-slate-200',
    heart: 'text-slate-300/40'
  }
};

const getSupabaseConfig = () => {
  // Try multiple env sources
  const url = process.env.VITE_SUPABASE_URL || (import.meta as any).env?.VITE_SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
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

const FloatingHearts = ({ colorClass }: { colorClass: string }) => {
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
        <div key={h.id} className={`heart-particle ${colorClass}`}
          style={{ left: h.left, fontSize: `${h.size}px`, animationDuration: `${h.duration}s`, animationDelay: `${h.delay}s` }}>
          <Heart fill="currentColor" />
        </div>
      ))}
    </div>
  );
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('home');
  const [theme, setTheme] = useState<ThemeMode>(() => (localStorage.getItem(STORAGE_KEYS.THEME) as ThemeMode) || 'romantic');
  const [isAccepted, setIsAccepted] = useState(() => localStorage.getItem(STORAGE_KEYS.ACCEPTED) === 'true');
  const [successMessage, setSuccessMessage] = useState("Yay! You made my heart skip a beat! 💕");
  const [timeLeft, setTimeLeft] = useState(60);
  const [noButtonPos, setNoButtonPos] = useState({ x: 0, y: 0 });
  const [isNoButtonMoved, setIsNoButtonMoved] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  
  const [globalFeed, setGlobalFeed] = useState<GlobalResponse[]>([]);
  const [replies, setReplies] = useState<Record<string | number, Reply[]>>({});
  const [likedPosts, setLikedPosts] = useState<Set<string | number>>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.LIKED_POSTS);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  
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

  const activeTheme = THEME_CONFIG[theme];
  const feedRef = useRef<GlobalResponse[]>([]);
  useEffect(() => { feedRef.current = globalFeed; }, [globalFeed]);

  // --- Data Logic ---
  useEffect(() => {
    const cached = localStorage.getItem(STORAGE_KEYS.LOCAL_FEED);
    if (cached) setGlobalFeed(JSON.parse(cached));

    if (supabase) {
      const fetchData = async () => {
        try {
          const { data: postsData, error: postError } = await supabase.from('responses').select('*').order('created_at', { ascending: false }).limit(50);
          const { data: repliesData, error: replyError } = await supabase.from('replies').select('*');
          
          if (postsData) { 
            const formatted = postsData.map(p => ({ ...p, likes: p.likes || 0 }));
            setGlobalFeed(formatted); 
            setIsConnected(true); 
            localStorage.setItem(STORAGE_KEYS.LOCAL_FEED, JSON.stringify(formatted));
          }
          if (repliesData) {
            const replyMap: Record<string | number, Reply[]> = {};
            repliesData.forEach((r: Reply) => {
              if (!replyMap[r.post_id]) replyMap[r.post_id] = [];
              replyMap[r.post_id].push(r);
            });
            setReplies(replyMap);
          }
        } catch (err) {
          console.error("Supabase link issue:", err);
        }
      };
      fetchData();

      const postsChannel = supabase.channel('posts-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'responses' }, (payload) => {
          if (payload.eventType === 'INSERT') {
            setGlobalFeed(prev => {
              if (prev.some(p => p.id === payload.new.id)) return prev;
              const newPost = { ...(payload.new as GlobalResponse), likes: payload.new.likes || 0 };
              const updated = [newPost, ...prev].slice(0, 50);
              localStorage.setItem(STORAGE_KEYS.LOCAL_FEED, JSON.stringify(updated));
              return updated;
            });
          }
          if (payload.eventType === 'UPDATE') {
            setGlobalFeed(prev => prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p));
          }
        }).subscribe();

      const repliesChannel = supabase.channel('replies-channel')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'replies' }, (payload) => {
          const newReply = payload.new as Reply;
          setReplies(prev => {
            const current = prev[newReply.post_id] || [];
            if (current.some(r => r.id === newReply.id)) return prev;
            return { ...prev, [newReply.post_id]: [...current, newReply] };
          });
        }).subscribe();

      return () => {
        supabase.removeChannel(postsChannel);
        supabase.removeChannel(repliesChannel);
      };
    }
  }, [supabase]);

  const handleLike = async (postId: string | number) => {
    if (likedPosts.has(postId) || String(postId).startsWith('temp-')) return;
    
    // UI only update for likes since schema doesn't have likes column
    setGlobalFeed(prev => prev.map(p => p.id === postId ? { ...p, likes: (p.likes || 0) + 1 } : p));
    const newLiked = new Set(likedPosts).add(postId);
    setLikedPosts(newLiked);
    localStorage.setItem(STORAGE_KEYS.LIKED_POSTS, JSON.stringify(Array.from(newLiked)));
    confetti({ particleCount: 15, spread: 40, colors: ['#f43f5e'] });

    // We skip DB update here to prevent errors if the 'likes' column is missing in DB
    // To enable: Run 'ALTER TABLE responses ADD COLUMN likes INTEGER DEFAULT 0;'
  };

  const handleReplySubmit = async (postId: string | number) => {
    if (!replyText.trim() || String(postId).startsWith('temp-')) return;
    const username = getOrGenerateUsername();
    const content = replyText;
    setReplyText("");
    setReplyingTo(null);

    // Optimistic
    const tempId = 'tr-' + Date.now();
    setReplies(prev => ({ 
      ...prev, 
      [postId]: [...(prev[postId] || []), { id: tempId, post_id: postId, username, content, created_at: new Date().toISOString() }] 
    }));

    if (supabase) {
      const { data, error } = await supabase.from('replies').insert([{ post_id: postId, username, content }]).select();
      if (!error && data) {
        setReplies(prev => ({
          ...prev,
          [postId]: (prev[postId] || []).map(r => r.id === tempId ? data[0] : r)
        }));
      }
    }
  };

  const saveToFeed = async (question: string, answer: string) => {
    const username = getOrGenerateUsername();
    const tempId = 'temp-' + Date.now();
    
    // Optimistic
    const tempPost: GlobalResponse = { id: tempId, username, question, answer, likes: 0, created_at: new Date().toISOString() };
    setGlobalFeed(prev => [tempPost, ...prev]);
    confetti({ particleCount: 30, spread: 60 });

    if (supabase) {
      // NOTE: We omit 'likes' here to match the schema you provided (id, username, question, answer, created_at)
      const { data, error } = await supabase.from('responses').insert([{ username, question, answer }]).select();
      
      if (error) {
        console.error("Supabase Insert Error:", error.message);
      } else if (data && data.length > 0) {
        setGlobalFeed(prev => {
          const updated = prev.map(p => p.id === tempId ? { ...data[0], likes: 0 } : p);
          localStorage.setItem(STORAGE_KEYS.LOCAL_FEED, JSON.stringify(updated.filter(u => !String(u.id).startsWith('temp-'))));
          return updated;
        });
      }
    }
  };

  const generateAiSpark = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: "Write a short, heart-melting anonymous Valentine confession. Max 12 words.",
      });
      if (response.text) setNewConfession(response.text.trim().replace(/^"|"$/g, ''));
    } catch (e) {
      setNewConfession("You make my heart skip a beat... anonymously. ❤️");
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem(STORAGE_KEYS.THEME, newTheme);
  };

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

  return (
    <div className={`min-h-screen w-full relative ${activeTheme.bg} transition-colors duration-500 flex flex-col items-center pt-24 pb-24 overflow-x-hidden`}>
      <FloatingHearts colorClass={activeTheme.heart} />
      
      <nav className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg">
        <div className={`backdrop-blur-xl border ${activeTheme.nav} p-1.5 rounded-full shadow-lg flex justify-between items-center transition-all duration-500`}>
          <button onClick={() => setCurrentView('home')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'home' ? activeTheme.accent : 'text-rose-400 hover:bg-rose-50/10'}`}>
            <HomeIcon size={18} /><span className="text-sm font-bold hidden sm:inline">Home</span>
          </button>
          <button onClick={() => setCurrentView('wall')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'wall' ? activeTheme.accent : 'text-rose-400 hover:bg-rose-50/10'}`}>
            <Users size={18} /><span className="text-sm font-bold hidden sm:inline">Feed</span>
          </button>
          <button onClick={() => setCurrentView('prompts')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-full transition-all ${currentView === 'prompts' ? activeTheme.accent : 'text-rose-400 hover:bg-rose-50/10'}`}>
            <MessageCircle size={18} /><span className="text-sm font-bold hidden sm:inline">Ask</span>
          </button>
        </div>
      </nav>

      <main className="w-full max-w-3xl px-6 relative z-10">
        {currentView === 'home' && (
          <div className="w-full text-center view-enter py-10 space-y-12">
            {isAccepted ? (
              <div className="space-y-6 animate-in fade-in zoom-in">
                <Heart fill={theme === 'dark' ? '#fb7185' : '#e11d48'} className={`w-32 h-32 ${activeTheme.text} animate-bounce mx-auto`} />
                <h1 className={`text-4xl md:text-6xl font-pacifico ${activeTheme.text}`}>{successMessage}</h1>
                <p className={`text-xl italic ${activeTheme.text} opacity-80`}>The world is brighter now. ✨</p>
                <button onClick={() => setCurrentView('wall')} className={`mt-8 px-8 py-3 rounded-full font-bold shadow-lg flex items-center gap-2 mx-auto active:scale-95 transition-all ${activeTheme.accent}`}>
                  Explore Global Feed <ChevronRight size={18} />
                </button>
              </div>
            ) : (
              <div className="space-y-12">
                <h1 className={`text-5xl md:text-7xl font-pacifico ${activeTheme.text}`}>Be My Valentine? 💕</h1>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-8 min-h-[160px]">
                  <button onClick={() => handleAccept("Yay! Forever yours! 💕")} className={`group relative px-14 py-5 rounded-full text-2xl font-bold transition-all hover:scale-105 active:scale-95 ${activeTheme.accent}`}>
                    Yes 💖
                  </button>
                  <button
                    onMouseEnter={() => {
                      const p = 100;
                      setNoButtonPos({ x: Math.random() * (window.innerWidth - p * 2) + p, y: Math.random() * (window.innerHeight - p * 2) + p });
                      setIsNoButtonMoved(true);
                    }}
                    style={isNoButtonMoved ? { position: 'fixed', left: `${noButtonPos.x}px`, top: `${noButtonPos.y}px`, zIndex: 100, transform: 'translate(-50%, -50%)' } : {}}
                    className={`px-8 py-3 rounded-full text-lg font-semibold shadow-sm transition-all ${theme === 'dark' ? 'bg-slate-800 text-slate-500' : 'bg-white/80 text-gray-400'}`}
                  >No 🙃</button>
                </div>
                <div className={`backdrop-blur-md p-6 rounded-3xl border inline-flex flex-col items-center gap-2 transition-all ${activeTheme.nav}`}>
                  <div className={`flex items-center gap-3 text-3xl font-mono font-bold tracking-tighter ${activeTheme.text}`}>
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
              <h2 className={`text-4xl font-pacifico mb-2 ${activeTheme.text}`}>Global Confessions</h2>
              <span className={`px-4 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full border shadow-sm ${isConnected ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-rose-500/10 text-rose-500 border-rose-500/20'}`}>
                {isConnected ? '• Live' : 'Connecting to Heartbeat...'}
              </span>
            </div>

            <div className={`backdrop-blur-md p-4 rounded-3xl border space-y-3 transition-all ${activeTheme.card}`}>
              <textarea 
                value={newConfession} onChange={(e) => setNewConfession(e.target.value)} 
                placeholder="Type your anonymous confession here..." 
                className={`w-full rounded-2xl p-4 border-none focus:ring-2 focus:ring-rose-200 resize-none h-24 font-medium transition-all ${activeTheme.input}`} 
              />
              <div className="flex justify-between items-center px-1">
                <button onClick={generateAiSpark} disabled={isGenerating} className={`text-xs font-bold flex items-center gap-1 transition-colors disabled:opacity-50 ${activeTheme.text} opacity-70 hover:opacity-100`}>
                  <Sparkles size={14} /> AI Spark
                </button>
                <button onClick={() => { if(newConfession.trim()) { saveToFeed("Confession", newConfession); setNewConfession(""); } }} disabled={!newConfession.trim()} className={`px-6 py-2 rounded-full font-bold flex items-center gap-2 active:scale-95 disabled:opacity-50 transition-all ${activeTheme.accent}`}>
                  Post <Send size={16} />
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {globalFeed.map((post) => {
                const isTemp = String(post.id).startsWith('temp-');
                return (
                  <div key={post.id} className={`p-6 rounded-3xl border transition-all animate-in slide-in-from-bottom-2 ${activeTheme.card} ${isTemp ? 'opacity-50' : ''}`}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-bold uppercase flex items-center gap-1 opacity-70 ${activeTheme.text}`}><Ghost size={12} /> {post.username} {isTemp && "(Syncing...)"}</span>
                      <span className={`text-[10px] font-medium opacity-50 ${activeTheme.text}`}>{new Date(post.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {post.question !== "Confession" && <p className={`text-[10px] font-bold uppercase mb-1 opacity-60 ${activeTheme.text}`}>Q: {post.question}</p>}
                    <p className={`font-medium italic text-xl ${theme === 'vivid' ? 'text-white' : activeTheme.text}`}>"{post.answer}"</p>

                    <div className={`flex items-center gap-4 pt-4 border-t mt-4 transition-all ${theme === 'vivid' ? 'border-white/20' : 'border-rose-100/30'}`}>
                      <button onClick={() => handleLike(post.id)} disabled={likedPosts.has(post.id) || isTemp} className={`flex items-center gap-1.5 transition-all font-bold text-sm ${likedPosts.has(post.id) ? 'text-rose-500' : activeTheme.text + ' opacity-70 hover:opacity-100 group'}`}>
                        <Heart size={16} className={`${likedPosts.has(post.id) ? 'fill-rose-500 text-rose-500' : 'group-hover:scale-125 transition-transform'}`} />
                        {post.likes || 0}
                      </button>
                      <button onClick={() => !isTemp && setReplyingTo(replyingTo === post.id ? null : post.id)} className={`flex items-center gap-1.5 transition-all font-bold text-sm ${activeTheme.text} opacity-70 hover:opacity-100`}>
                        <MessageSquare size={16} /> {replies[post.id]?.length || 0}
                      </button>
                    </div>

                    {replyingTo === post.id && (
                      <div className="mt-3 flex gap-2">
                        <input type="text" value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleReplySubmit(post.id)} placeholder="Whisper a reply..." className={`flex-1 rounded-xl px-4 py-2 text-sm ${activeTheme.input}`} />
                        <button onClick={() => handleReplySubmit(post.id)} className={`px-4 py-2 rounded-xl text-xs font-bold ${activeTheme.accent}`}>Send</button>
                      </div>
                    )}

                    {replies[post.id]?.map(reply => (
                      <div key={reply.id} className={`mt-3 p-3 rounded-2xl text-sm ${theme === 'vivid' ? 'bg-white/10' : 'bg-rose-50/50'}`}>
                        <span className={`text-[10px] font-bold block opacity-60 ${activeTheme.text}`}>{reply.username}</span>
                        <p className={`italic ${theme === 'vivid' ? 'text-white' : 'text-rose-700'}`}>{reply.content}</p>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {currentView === 'prompts' && (
          <div className="w-full space-y-8 view-enter text-center">
            <h2 className={`text-4xl font-pacifico ${activeTheme.text}`}>Daily Question</h2>
            <div className={`backdrop-blur-lg p-10 rounded-[2.5rem] border space-y-8 relative overflow-hidden transition-all duration-500 ${activeTheme.card}`}>
              <Quote className={`absolute top-4 left-4 w-24 h-24 -z-10 opacity-10 ${activeTheme.text}`} />
              <h3 className={`text-2xl font-bold italic leading-relaxed ${theme === 'vivid' ? 'text-white' : activeTheme.text}`}>"{currentPrompt}"</h3>
              <input type="text" value={promptAnswer} onChange={(e) => setPromptAnswer(e.target.value)} placeholder="Type your answer..." className={`w-full border-2 rounded-2xl px-6 py-4 text-center text-lg font-medium ${activeTheme.input}`} />
              <button onClick={() => { if(promptAnswer.trim()) { saveToFeed(currentPrompt, promptAnswer); setPromptAnswer(""); } }} disabled={!promptAnswer.trim()} className={`w-full font-bold py-4 rounded-2xl shadow-lg transition-all ${activeTheme.accent}`}>Share with the World 💌</button>
              {aiReaction && <div className={`p-4 rounded-2xl border animate-in fade-in ${theme === 'vivid' ? 'bg-white/10 border-white/20' : 'bg-rose-50 border-rose-100'}`}><p className={`font-medium italic text-sm ${activeTheme.text}`}><Sparkles size={14} className="inline mr-1 text-yellow-400" /> {aiReaction}</p></div>}
            </div>
            <button onClick={() => setCurrentPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)])} className={`font-bold text-xs uppercase opacity-60 hover:opacity-100 transition-colors ${activeTheme.text}`}>Shuffle Prompt</button>
          </div>
        )}
      </main>

      <div className="fixed bottom-6 right-6 flex flex-col gap-3 items-end z-20">
        <div className={`flex items-center gap-1 p-1 rounded-full backdrop-blur-md border shadow-lg transition-all duration-500 ${activeTheme.nav}`}>
          {(['romantic', 'dark', 'vivid', 'calm'] as ThemeMode[]).map(t => (
            <button key={t} onClick={() => toggleTheme(t)} className={`p-2 rounded-full transition-all ${theme === t ? 'bg-rose-500 text-white shadow-sm' : 'text-rose-400'}`}>
              {t === 'romantic' && <Heart size={16} />}
              {t === 'dark' && <Moon size={16} />}
              {t === 'vivid' && <Zap size={16} />}
              {t === 'calm' && <Leaf size={16} />}
            </button>
          ))}
        </div>
        <button onClick={() => setIsMuted(!isMuted)} className={`p-3 backdrop-blur-md rounded-full shadow-sm border z-20 hover:scale-110 transition-all ${activeTheme.nav} ${activeTheme.text}`}>
          {isMuted ? <VolumeX size={20} /> : <Music size={20} className="animate-pulse" />}
        </button>
      </div>

      <div className="fixed bottom-6 w-full flex justify-center pointer-events-none z-10">
        <a href="https://t.me/savvy_society" target="_blank" rel="noopener noreferrer" className={`backdrop-blur-md px-5 py-2 rounded-full text-[10px] font-bold tracking-widest border shadow-sm pointer-events-auto flex items-center gap-2 uppercase transition-all duration-500 ${activeTheme.nav} ${activeTheme.text} hover:opacity-80`}>
          built with ❤️ by <span className="underline underline-offset-4 decoration-current opacity-70">savvy</span>
        </a>
      </div>
    </div>
  );
};

export default App;