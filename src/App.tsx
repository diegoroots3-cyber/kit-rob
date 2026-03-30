/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, createContext, useContext, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useParams } from 'react-router-dom';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, getDocs, setDoc, collection, query, where, onSnapshot, orderBy, limit, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { User, Kit, Item, Loan, OperationType } from './types';
import { handleFirestoreError, cn } from './lib/utils';
import { 
  LayoutDashboard, 
  Package, 
  History, 
  User as UserIcon, 
  LogOut, 
  Plus, 
  Search, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  ChevronRight,
  Menu,
  X,
  ArrowLeft,
  Camera,
  Trash2,
  Edit2,
  Save,
  Sun,
  Moon
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'motion/react';
import { DEFAULT_KIT_ITEMS } from './constants';
import { sendMovementNotification } from './services/emailService';

// --- Contexts ---
const AuthContext = createContext<{
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
} | null>(null);

const ThemeContext = createContext<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
} | null>(null);

const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// --- Components ---

const LoadingScreen = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-white dark:bg-gray-950 z-50">
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full"
    />
  </div>
);

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button 
      onClick={toggleTheme}
      className="p-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all active:scale-90"
      title={theme === 'light' ? 'Mudar para modo escuro' : 'Mudar para modo claro'}
    >
      {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
    </button>
  );
};

const Header = () => {
  const { user, isAdmin } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-4">
          <div className="w-20 h-20 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-100 dark:border-gray-700 p-0">
            <img 
              src="https://lh3.googleusercontent.com/d/10lAT_QItdYg7MFvIfZPWbNSrkdWC7HVZ" 
              alt="Logo RoboKit" 
              className="w-full h-full object-contain scale-125"
              referrerPolicy="no-referrer"
            />
          </div>
          <span className="font-bold text-3xl tracking-tight text-gray-900 dark:text-white">RoboKit</span>
        </Link>

        {user && (
          <>
            <nav className="hidden md:flex items-center gap-6">
              <Link to="/" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Início</Link>
              <Link to="/history" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Histórico</Link>
              {isAdmin && <Link to="/admin" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors">Painel Admin</Link>}
            </nav>

            <div className="flex items-center gap-4">
              <ThemeToggle />
              
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="md:hidden p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
              >
                {isMenuOpen ? <X /> : <Menu />}
              </button>
              
              <div className="hidden md:flex items-center gap-3 pl-4 border-l border-gray-200 dark:border-gray-800">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none">{user.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wider font-bold">{user.role}</p>
                </div>
                <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        )}
        {!user && <div className="flex items-center gap-4"><ThemeToggle /></div>}
      </div>

      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden absolute top-16 left-0 w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-xl p-4 space-y-2"
          >
            <Link to="/" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors">
              <Package className="w-5 h-5" /> Início
            </Link>
            <Link to="/history" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors">
              <History className="w-5 h-5" /> Meu Histórico
            </Link>
            {isAdmin && (
              <Link to="/admin" onClick={() => setIsMenuOpen(false)} className="flex items-center gap-3 p-3 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 rounded-xl transition-colors font-bold">
                <LayoutDashboard className="w-5 h-5" /> Painel Admin
              </Link>
            )}
            <button onClick={handleLogout} className="w-full flex items-center gap-3 p-3 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors">
              <LogOut className="w-5 h-5" /> Sair
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

// --- Pages ---

const Login = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setError(`Falha ao entrar com Google: ${err.message || 'Erro desconhecido'}`);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (user) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-10 text-center border border-gray-100 dark:border-gray-800"
        >
          <div className="flex justify-center w-full mb-8">
            <div className="w-24 h-24 bg-green-50 dark:bg-green-900/20 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">Login realizado!</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">Bem-vindo de volta, {user.name}.</p>
          
          <button 
            onClick={() => navigate('/')}
            className="w-full h-14 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-100 dark:shadow-none"
          >
            Ir para o Painel <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center p-4 bg-gray-50 dark:bg-gray-950">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl p-10 text-center border border-gray-100 dark:border-gray-800"
      >
        <div className="flex justify-center w-full mb-8">
          <div className="w-[250px] h-[250px] flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-full overflow-hidden border-4 border-gray-100 dark:border-gray-800 p-0 shadow-inner">
            <img 
              src="https://lh3.googleusercontent.com/d/10lAT_QItdYg7MFvIfZPWbNSrkdWC7HVZ" 
              alt="Logo RoboKit" 
              className="max-w-full max-h-full object-contain scale-125"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2 tracking-tight">RoboKit Manager</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium">Controle de kits de robótica para alunos e professores.</p>
        
        <div className="mb-8 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-3xl border border-blue-100 dark:border-blue-800/50 text-center">
          <p className="text-blue-700 dark:text-blue-300 font-bold text-sm mb-1">Login Fácil e Seguro</p>
          <p className="text-blue-600/70 dark:text-blue-400/70 text-xs mb-2">Use sua conta Google institucional para acessar instantaneamente.</p>
          <p className="text-blue-800 dark:text-blue-200 text-[10px] font-black uppercase tracking-widest bg-blue-100 dark:bg-blue-900/40 py-1 px-3 rounded-full inline-block">
            Todos os dados coletados em nosso sites são protegidos
          </p>
        </div>
        
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl flex items-center gap-3 text-sm font-medium border border-red-100 dark:border-red-800/50">
            <AlertCircle className="w-5 h-5 shrink-0" />
            {error}
          </div>
        )}

        <button 
          onClick={handleLogin}
          disabled={loading}
          className="w-full h-14 bg-gray-900 dark:bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-gray-800 dark:hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50 shadow-xl shadow-gray-200 dark:shadow-none"
        >
          {loading ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Entrar com Google
            </>
          )}
        </button>
        
        <p className="mt-8 text-xs text-gray-400 dark:text-gray-500 font-medium">
          Acesso restrito a alunos e professores autorizados.
        </p>
      </motion.div>
    </div>
  );
};

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [kits, setKits] = useState<Kit[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeLoans, setActiveLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const kitsQuery = query(collection(db, 'kits'), orderBy('name'));
    const unsubscribeKits = onSnapshot(kitsQuery, (snapshot) => {
      setKits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit)));
    });

    const itemsQuery = query(collection(db, 'items'));
    const unsubscribeItems = onSnapshot(itemsQuery, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
    });

    const loansQuery = isAdmin 
      ? query(collection(db, 'loans'), where('status', '==', 'active'))
      : query(collection(db, 'loans'), where('userId', '==', user?.id), where('status', '==', 'active'));
      
    const unsubscribeLoans = onSnapshot(loansQuery, (snapshot) => {
      setActiveLoans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: (doc.data().createdAt as Timestamp).toDate() } as Loan)));
      setLoading(false);
    });

    return () => {
      unsubscribeKits();
      unsubscribeItems();
      unsubscribeLoans();
    };
  }, [user, isAdmin]);

  const filteredKits = useMemo(() => {
    const normalize = (str: string) => 
      (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    const searchLower = normalize(searchQuery);
    if (!searchLower) return kits;

    return kits.filter(kit => {
      const kitName = normalize(kit.name);
      const kitIdentifier = normalize(kit.identifier);
      const kitDescription = normalize(kit.description);
      
      const matchesKit = kitName.includes(searchLower) || 
                        kitIdentifier.includes(searchLower) ||
                        kitDescription.includes(searchLower);
      
      if (matchesKit) return true;

      // Search within items of this kit
      const kitItems = items.filter(item => item.kitId === kit.id);
      return kitItems.some(item => normalize(item.name).includes(searchLower));
    });
  }, [kits, items, searchQuery]);

  if (loading) return <LoadingScreen />;

  return (
    <main className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Olá, {user?.name.split(' ')[0]}!</h1>
          <p className="text-gray-500 dark:text-gray-400 font-medium">O que vamos construir hoje?</p>
        </div>
      </div>

      {activeLoans.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <AlertCircle className="text-orange-500 w-5 h-5" />
              Retiradas Pendentes
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeLoans.map(loan => (
              <Link 
                key={loan.id} 
                to={`/loan/${loan.id}`}
                className="group bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/50 p-5 rounded-3xl flex items-center justify-between hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center shadow-sm">
                    <Package className="text-orange-600 dark:text-orange-400 w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{loan.kitName}</h3>
                    <p className="text-sm text-orange-700 dark:text-orange-300 font-medium">
                      {loan.userName} • {loan.items.length} itens • {format(loan.createdAt, "dd/MM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
                <ChevronRight className="text-orange-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Kits Disponíveis</h2>
          <div className="flex w-full sm:w-auto gap-2">
            <div className="relative flex-1 sm:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input 
                type="text" 
                placeholder="Buscar por kit ou itens..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                className="w-full pl-11 pr-10 py-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 transition-all text-gray-900 dark:text-white shadow-sm"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button 
              onClick={() => {
                const input = document.querySelector('input[placeholder="Buscar por kit ou itens..."]') as HTMLInputElement;
                input?.blur();
              }}
              className="md:hidden px-6 bg-blue-600 text-white rounded-2xl font-bold text-sm active:scale-95 transition-all"
            >
              Ir
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredKits.map(kit => {
            const normalize = (str: string) => 
              (str || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const searchLower = normalize(searchQuery);
            
            const matchingItems = searchQuery.trim() ? items.filter(item => 
              item.kitId === kit.id && normalize(item.name).includes(searchLower)
            ) : [];

            return (
              <Link 
                key={kit.id} 
                to={`/kit/${kit.id}`}
                className="group bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-3xl shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col"
              >
                <div className="w-14 h-14 bg-blue-50 dark:bg-blue-900/30 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-blue-600 transition-colors">
                  <Package className="text-blue-600 dark:text-blue-400 w-7 h-7 group-hover:text-white transition-colors" />
                </div>
                <h3 className="text-lg font-black text-gray-900 dark:text-white mb-1">{kit.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-4 line-clamp-2">{kit.description || 'Kit de robótica educacional.'}</p>
                
                {matchingItems.length > 0 && (
                  <div className="mb-4 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-2xl border border-blue-100/50 dark:border-blue-800/30">
                    <p className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">Itens encontrados:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {matchingItems.map(item => (
                        <span key={item.id} className="text-[11px] font-bold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 px-2 py-1 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                          {item.totalQuantity}x {item.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-auto flex items-center text-blue-600 dark:text-blue-400 font-bold text-sm gap-1 group-hover:gap-2 transition-all">
                  Ver itens <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            );
          })}
        </div>

        {filteredKits.length === 0 && (
          <div className="text-center py-20 bg-gray-50 dark:bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800">
            <div className="w-20 h-20 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Nenhum kit encontrado</h3>
            <p className="text-gray-500 dark:text-gray-400">Tente buscar por outro nome ou verifique se o item está cadastrado.</p>
            <button 
              onClick={() => setSearchQuery('')}
              className="mt-6 text-blue-600 dark:text-blue-400 font-bold hover:underline"
            >
              Limpar busca
            </button>
          </div>
        )}
      </section>
    </main>
  );
};

const KitDetails = () => {
  const { kitId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [kit, setKit] = useState<Kit | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!kitId) return;

    const fetchKit = async () => {
      const kitDoc = await getDoc(doc(db, 'kits', kitId));
      if (kitDoc.exists()) {
        setKit({ id: kitDoc.id, ...kitDoc.data() } as Kit);
      }
    };

    const itemsQuery = query(collection(db, 'items'), where('kitId', '==', kitId));
    const unsubscribeItems = onSnapshot(itemsQuery, (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
      setLoading(false);
    });

    fetchKit();
    return () => unsubscribeItems();
  }, [kitId]);

  const handleQuantityChange = (itemId: string, delta: number, available: number) => {
    setSelectedItems(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, Math.min(available, current + delta));
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const handleWithdrawal = async () => {
    if (!user || !kit || Object.keys(selectedItems).length === 0) return;
    
    setSubmitting(true);
    try {
      const loanItems = Object.entries(selectedItems).map(([itemId, quantity]) => {
        const item = items.find(i => i.id === itemId);
        return {
          itemId,
          itemName: item?.name || 'Item desconhecido',
          quantity
        };
      });

      // 1. Create Loan
      await addDoc(collection(db, 'loans'), {
        userId: user.id,
        userName: user.name,
        kitId: kit.id,
        kitName: kit.name,
        items: loanItems,
        status: 'active',
        createdAt: serverTimestamp()
      });

      // 2. Update Item Quantities
      for (const [itemId, quantity] of Object.entries(selectedItems)) {
        const item = items.find(i => i.id === itemId);
        if (item) {
          await updateDoc(doc(db, 'items', itemId), {
            availableQuantity: Number(item.availableQuantity) - Number(quantity)
          });
        }
      }

      // 3. Send Notification
      await sendMovementNotification(
        user.name, 
        'Retirada de Kit', 
        `Retirou ${Object.values(selectedItems).reduce((a: number, b: number) => a + b, 0)} itens do kit ${kit.name}`
      );

      navigate('/');
    } catch (err) {
      console.error(err);
      alert('Erro ao realizar retirada. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!kit) return <div>Kit não encontrado.</div>;

  const hasSelection = Object.keys(selectedItems).length > 0;

  return (
    <main className="container mx-auto px-4 py-8 max-w-3xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 font-bold mb-6 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-5 h-5" /> Voltar
      </button>

      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm mb-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">{kit.name}</h1>
            <p className="text-gray-500 dark:text-gray-400 font-medium mt-1">ID: {kit.identifier}</p>
          </div>
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center">
            <Package className="text-blue-600 dark:text-blue-400 w-8 h-8" />
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{kit.description || 'Selecione os itens que deseja retirar deste kit.'}</p>
      </div>

      <div className="space-y-4 mb-24">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white px-2">Itens do Kit</h2>
        {items.map(item => (
          <div key={item.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-3xl flex items-center justify-between shadow-sm">
            <div className="flex-1">
              <h3 className="font-bold text-gray-900 dark:text-white">{item.name}</h3>
              <p className={cn(
                "text-sm font-medium",
                item.availableQuantity === 0 ? "text-red-500" : "text-gray-500 dark:text-gray-400"
              )}>
                {item.availableQuantity} disponíveis de {item.totalQuantity}
              </p>
            </div>
            
            <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800 p-2 rounded-2xl">
              <button 
                onClick={() => handleQuantityChange(item.id, -1, item.availableQuantity)}
                className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-90 transition-all"
              >
                -
              </button>
              <span className="w-6 text-center font-black text-gray-900 dark:text-white">{selectedItems[item.id] || 0}</span>
              <button 
                onClick={() => handleQuantityChange(item.id, 1, item.availableQuantity)}
                disabled={item.availableQuantity === 0}
                className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 active:scale-90 transition-all disabled:opacity-30"
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {hasSelection && (
          <motion.div 
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-0 left-0 w-full p-4 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 shadow-2xl z-30"
          >
            <div className="container mx-auto max-w-3xl flex items-center justify-between gap-4">
              <div className="hidden sm:block">
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total de itens selecionados</p>
                <p className="text-lg font-black text-gray-900 dark:text-white">
                  {Object.values(selectedItems).reduce((a: number, b: number) => a + b, 0)} itens
                </p>
              </div>
              <button
                onClick={handleWithdrawal}
                disabled={submitting}
                className="flex-1 sm:flex-none bg-blue-600 text-white h-14 px-10 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all active:scale-95 disabled:opacity-50"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>Confirmar Retirada <CheckCircle2 className="w-5 h-5" /></>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
};

const LoanDetails = () => {
  const { loanId } = useParams();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loanId) return;
    const unsubscribe = onSnapshot(doc(db, 'loans', loanId), (snapshot) => {
      if (snapshot.exists()) {
        setLoan({ id: snapshot.id, ...snapshot.data(), createdAt: (snapshot.data().createdAt as Timestamp).toDate() } as Loan);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [loanId]);

  const handleReturn = async () => {
    if (!loan) return;
    setSubmitting(true);
    try {
      // 1. Update Loan Status
      await updateDoc(doc(db, 'loans', loan.id), {
        status: 'returned',
        returnedAt: serverTimestamp()
      });

      // 2. Restore Item Quantities
      for (const loanItem of loan.items) {
        const itemDoc = await getDoc(doc(db, 'items', loanItem.itemId));
        if (itemDoc.exists()) {
          const currentAvailable = (itemDoc.data() as Item).availableQuantity;
          await updateDoc(doc(db, 'items', loanItem.itemId), {
            availableQuantity: currentAvailable + loanItem.quantity
          });
        }
      }

      // 3. Send Notification
      await sendMovementNotification(
        loan.userName, 
        'Devolução de Kit', 
        `Devolveu os itens do kit ${loan.kitName}`
      );

      navigate('/');
    } catch (err) {
      console.error(err);
      alert('Erro ao realizar devolução.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingScreen />;
  if (!loan) return <div>Retirada não encontrada.</div>;

  const isActive = loan.status === 'active';

  return (
    <main className="container mx-auto px-4 py-8 max-w-2xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 font-bold mb-6 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-5 h-5" /> Voltar
      </button>

      <div className={cn(
        "rounded-3xl p-8 mb-8 border",
        isActive 
          ? "bg-orange-50 border-orange-100 dark:bg-orange-900/20 dark:border-orange-900/30" 
          : "bg-green-50 border-green-100 dark:bg-green-900/20 dark:border-green-900/30"
      )}>
        <div className="flex items-center justify-between mb-4">
          <span className={cn(
            "px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest",
            isActive 
              ? "bg-orange-200 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300" 
              : "bg-green-200 text-green-800 dark:bg-green-900/40 dark:text-green-300"
          )}>
            {isActive ? 'Em Aberto' : 'Devolvido'}
          </span>
          <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
            {format(loan.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{loan.kitName}</h1>
        <p className="text-gray-600 dark:text-gray-400 font-medium">Retirado por {loan.userName}</p>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 overflow-hidden shadow-sm mb-8">
        <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-bold text-gray-900 dark:text-white">Itens Retirados</h2>
        </div>
        <div className="divide-y divide-gray-50 dark:divide-gray-800">
          {loan.items.map((item, idx) => (
            <div key={idx} className="px-6 py-4 flex items-center justify-between">
              <span className="font-medium text-gray-700 dark:text-gray-300">{item.itemName}</span>
              <span className="font-black text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-lg">{item.quantity}x</span>
            </div>
          ))}
        </div>
      </div>

      {isActive && (
        <button
          onClick={handleReturn}
          disabled={submitting}
          className="w-full h-16 bg-green-600 text-white rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-green-100 hover:bg-green-700 transition-all active:scale-95 disabled:opacity-50"
        >
          {submitting ? (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>Devolver Itens <CheckCircle2 className="w-6 h-6" /></>
          )}
        </button>
      )}
    </main>
  );
};

const HistoryPage = () => {
  const { user } = useAuth();
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'loans'), 
      where('userId', '==', user.id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLoans(snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        createdAt: (doc.data().createdAt as Timestamp)?.toDate() || new Date()
      } as Loan)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  if (loading) return <LoadingScreen />;

  return (
    <main className="container mx-auto px-4 py-8 max-w-3xl">
      <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-8 tracking-tight">Meu Histórico</h1>
      
      <div className="space-y-4">
        {loans.length === 0 ? (
          <div className="text-center py-20 bg-gray-50 dark:bg-gray-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800">
            <History className="w-12 h-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400 font-bold">Nenhuma retirada registrada ainda.</p>
          </div>
        ) : (
          loans.map(loan => (
            <Link 
              key={loan.id} 
              to={`/loan/${loan.id}`}
              className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-3xl flex items-center justify-between hover:shadow-lg dark:hover:shadow-gray-900/50 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center",
                  loan.status === 'active' 
                    ? "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" 
                    : "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
                )}>
                  {loan.status === 'active' ? <AlertCircle /> : <CheckCircle2 />}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white">{loan.kitName}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
                    {format(loan.createdAt, "dd 'de' MMMM", { locale: ptBR })}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={cn(
                  "text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full",
                  loan.status === 'active' 
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" 
                    : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                )}>
                  {loan.status === 'active' ? 'Ativo' : 'Devolvido'}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </main>
  );
};

const AdminPanel = () => {
  const { isAdmin } = useAuth();
  const [kits, setKits] = useState<Kit[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeTab, setActiveTab] = useState<'kits' | 'history' | 'stats' | 'users'>('kits');
  const [isAddingKit, setIsAddingKit] = useState(false);
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [newKit, setNewKit] = useState({ name: '', identifier: '', description: '' });
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '' });
  const [kitChecklist, setKitChecklist] = useState<Record<string, { selected: boolean, quantity: number }>>(
    DEFAULT_KIT_ITEMS.reduce<Record<string, { selected: boolean, quantity: number }>>((acc, item) => ({
      ...acc,
      [item.name]: { selected: true, quantity: item.quantity }
    }), {})
  );

  useEffect(() => {
    if (!isAdmin) return;
    
    const unsubscribeKits = onSnapshot(collection(db, 'kits'), (snapshot) => {
      setKits(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit)));
    });

    const unsubscribeItems = onSnapshot(collection(db, 'items'), (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
    });

    const unsubscribeLoans = onSnapshot(query(collection(db, 'loans'), orderBy('createdAt', 'desc'), limit(50)), (snapshot) => {
      setLoans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), createdAt: (doc.data().createdAt as Timestamp)?.toDate() || new Date() } as Loan)));
    });

    const unsubscribeUsers = onSnapshot(query(collection(db, 'users'), where('role', '==', 'admin')), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });

    return () => {
      unsubscribeKits();
      unsubscribeItems();
      unsubscribeLoans();
      unsubscribeUsers();
    };
  }, [isAdmin]);

  const handleAddKit = async () => {
    if (!newKit.name || !newKit.identifier) return;
    try {
      const kitRef = await addDoc(collection(db, 'kits'), newKit);
      
      // Create items from checklist
      const itemsToCreate = Object.entries(kitChecklist)
        .filter(([_, data]) => (data as { selected: boolean, quantity: number }).selected)
        .map(([name, data]) => ({
          kitId: kitRef.id,
          name,
          totalQuantity: (data as { selected: boolean, quantity: number }).quantity,
          availableQuantity: (data as { selected: boolean, quantity: number }).quantity
        }));

      for (const item of itemsToCreate) {
        await addDoc(collection(db, 'items'), item);
      }

      setNewKit({ name: '', identifier: '', description: '' });
      setKitChecklist(
        DEFAULT_KIT_ITEMS.reduce<Record<string, { selected: boolean, quantity: number }>>((acc, item) => ({
          ...acc,
          [item.name]: { selected: true, quantity: item.quantity }
        }), {})
      );
      setIsAddingKit(false);
      
      // 3. Send Notification
      await sendMovementNotification(
        'Admin', 
        'Criação de Kit', 
        `Criou o kit ${newKit.name} (${newKit.identifier}) com ${itemsToCreate.length} itens.`
      );
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddAdmin = async () => {
    if (!newAdmin.name || !newAdmin.email) return;
    try {
      // Check if user already exists by email
      const q = query(collection(db, 'users'), where('email', '==', newAdmin.email));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        // Update existing user to admin
        const userDoc = querySnapshot.docs[0];
        await updateDoc(doc(db, 'users', userDoc.id), {
          role: 'admin'
        });
      } else {
        // Create a "pre-approved" admin document using email as ID
        await setDoc(doc(db, 'users', newAdmin.email), {
          name: newAdmin.name,
          email: newAdmin.email,
          role: 'admin'
        });
      }
      
      setNewAdmin({ name: '', email: '' });
      setIsAddingAdmin(false);
      alert('Administrador adicionado com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao adicionar administrador.');
    }
  };

  const handleDeleteKit = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este kit? Todos os itens associados também serão removidos.')) return;
    
    console.log('Iniciando exclusão do kit:', id);
    try {
      // 1. Delete associated items
      const itemsSnapshot = await getDocs(query(collection(db, 'items'), where('kitId', '==', id)));
      console.log(`Encontrados ${itemsSnapshot.size} itens para excluir.`);
      
      const deletePromises = itemsSnapshot.docs.map(itemDoc => {
        console.log('Excluindo item:', itemDoc.id);
        return deleteDoc(doc(db, 'items', itemDoc.id));
      });
      
      await Promise.all(deletePromises);
      console.log('Todos os itens foram excluídos.');
      
      // 2. Delete the kit
      console.log('Excluindo o kit...');
      await deleteDoc(doc(db, 'kits', id));
      console.log('Kit excluído com sucesso.');
      
      // 3. Send Notification
      await sendMovementNotification(
        'Admin', 
        'Exclusão de Kit', 
        `Excluiu o kit ID: ${id} e todos os seus itens associados.`
      );
      
      alert('Kit e itens associados excluídos com sucesso!');
    } catch (err) {
      console.error('Erro detalhado ao excluir kit:', err);
      alert('Falha ao excluir o kit. Verifique os logs do console para mais detalhes.');
    }
  };

  if (!isAdmin) return <Navigate to="/" />;

  return (
    <main className="container mx-auto px-4 py-8 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Painel Administrativo</h1>
      </div>

      <div className="flex gap-2 mb-8 bg-gray-100 dark:bg-gray-900 p-1.5 rounded-2xl w-fit overflow-x-auto max-w-full">
        <button 
          onClick={() => setActiveTab('kits')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'kits' 
              ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          Kits & Itens
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'history' 
              ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          Movimentações
        </button>
        <button 
          onClick={() => setActiveTab('users')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'users' 
              ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          Administradores
        </button>
        <button 
          onClick={() => setActiveTab('stats')}
          className={cn(
            "px-6 py-2.5 rounded-xl text-sm font-bold transition-all whitespace-nowrap",
            activeTab === 'stats' 
              ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm" 
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          )}
        >
          Estatísticas
        </button>
      </div>

      {activeTab === 'kits' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gerenciar Kits</h2>
            <button 
              onClick={() => setIsAddingKit(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all"
            >
              <Plus className="w-4 h-4" /> Novo Kit
            </button>
          </div>

          <AnimatePresence>
            {isAddingKit && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900/30 rounded-3xl p-6 shadow-xl shadow-blue-50 dark:shadow-none overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <input 
                    type="text" 
                    placeholder="Nome do Kit (ex: Kit 01)" 
                    className="p-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newKit.name}
                    onChange={e => setNewKit({...newKit, name: e.target.value})}
                  />
                  <input 
                    type="text" 
                    placeholder="Identificador (ex: K01)" 
                    className="p-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newKit.identifier}
                    onChange={e => setNewKit({...newKit, identifier: e.target.value})}
                  />
                  <input 
                    type="text" 
                    placeholder="Descrição curta" 
                    className="p-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newKit.description}
                    onChange={e => setNewKit({...newKit, description: e.target.value})}
                  />
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-4 px-1">Checklist de Itens Padrão</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {DEFAULT_KIT_ITEMS.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={cn(
                          "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer",
                          kitChecklist[item.name]?.selected 
                            ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-900/40" 
                            : "bg-gray-50 border-gray-100 dark:bg-gray-800 dark:border-gray-700 opacity-60"
                        )}
                        onClick={() => setKitChecklist(prev => ({
                          ...prev,
                          [item.name]: { ...prev[item.name], selected: !prev[item.name]?.selected }
                        }))}
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={cn(
                            "w-5 h-5 rounded-md flex items-center justify-center border transition-colors",
                            kitChecklist[item.name]?.selected ? "bg-blue-600 border-blue-600" : "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                          )}>
                            {kitChecklist[item.name]?.selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 truncate">{item.name}</span>
                        </div>
                        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                          <input 
                            type="number" 
                            className="w-12 h-8 text-center bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-xs font-black dark:text-white"
                            value={kitChecklist[item.name]?.quantity || 0}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0;
                              setKitChecklist(prev => ({
                                ...prev,
                                [item.name]: { ...prev[item.name], quantity: val }
                              }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-3">
                  <button onClick={() => setIsAddingKit(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 font-bold">Cancelar</button>
                  <button onClick={handleAddKit} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">Salvar Kit</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-4">
            {kits.map(kit => (
              <div key={kit.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-2xl">
                    <QRCodeSVG value={kit.id} size={64} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 dark:text-white">{kit.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">ID: {kit.identifier}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1">
                      {items.filter(i => i.kitId === kit.id).length} itens cadastrados
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link 
                    to={`/kit/${kit.id}`} 
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl font-bold text-sm hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-all"
                  >
                    <ArrowRight className="w-4 h-4" /> Empréstimo
                  </Link>
                  <Link to={`/admin/kit/${kit.id}`} className="p-3 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-all">
                    <Edit2 className="w-5 h-5" />
                  </Link>
                  <button onClick={() => handleDeleteKit(kit.id)} className="p-3 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
                <th className="px-6 py-4 text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Usuário</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Kit</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Data</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-xs font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loans.map(loan => (
                <tr key={loan.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-900 dark:text-white">{loan.userName}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-700 dark:text-gray-300">{loan.kitName}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-500 dark:text-gray-500">{format(loan.createdAt, "dd/MM/yy HH:mm")}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full",
                      loan.status === 'active' 
                        ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" 
                        : "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                    )}>
                      {loan.status === 'active' ? 'Ativo' : 'Devolvido'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link to={`/loan/${loan.id}`} className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-bold">Detalhes</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gerenciar Administradores</h2>
            <button 
              onClick={() => setIsAddingAdmin(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all"
            >
              <Plus className="w-4 h-4" /> Novo Admin
            </button>
          </div>

          <AnimatePresence>
            {isAddingAdmin && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900/30 rounded-3xl p-6 shadow-xl shadow-blue-50 dark:shadow-none overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <input 
                    type="text" 
                    placeholder="Nome Completo" 
                    className="p-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newAdmin.name}
                    onChange={e => setNewAdmin({...newAdmin, name: e.target.value})}
                  />
                  <input 
                    type="email" 
                    placeholder="E-mail Google" 
                    className="p-3 bg-gray-50 dark:bg-gray-800 border-none rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white"
                    value={newAdmin.email}
                    onChange={e => setNewAdmin({...newAdmin, email: e.target.value})}
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button onClick={() => setIsAddingAdmin(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 font-bold">Cancelar</button>
                  <button onClick={handleAddAdmin} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">Criar Admin</button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 gap-4">
            {users.map(admin => (
              <div key={admin.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-6 rounded-3xl flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
                    <UserIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{admin.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{admin.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                    Administrador
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <p className="text-sm font-bold text-gray-500 dark:text-gray-500 mb-2">Total de Kits</p>
            <p className="text-4xl font-black text-gray-900 dark:text-white">{kits.length}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <p className="text-sm font-bold text-gray-500 dark:text-gray-500 mb-2">Retiradas Ativas</p>
            <p className="text-4xl font-black text-orange-600 dark:text-orange-400">{loans.filter(l => l.status === 'active').length}</p>
          </div>
          <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-sm">
            <p className="text-sm font-bold text-gray-500 dark:text-gray-500 mb-2">Total de Itens</p>
            <p className="text-4xl font-black text-blue-600 dark:text-blue-400">
              {items.reduce((acc: number, curr: Item) => acc + (Number(curr.totalQuantity) || 0), 0)}
            </p>
          </div>
        </div>
      )}
    </main>
  );
};

const AdminKitEditor = () => {
  const { kitId } = useParams();
  const navigate = useNavigate();
  const [kit, setKit] = useState<Kit | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', totalQuantity: 1 });

  useEffect(() => {
    if (!kitId) return;
    const fetchKit = async () => {
      const docSnap = await getDoc(doc(db, 'kits', kitId));
      if (docSnap.exists()) setKit({ id: docSnap.id, ...docSnap.data() } as Kit);
    };
    const unsubscribeItems = onSnapshot(query(collection(db, 'items'), where('kitId', '==', kitId)), (snapshot) => {
      setItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Item)));
    });
    fetchKit();
    return () => unsubscribeItems();
  }, [kitId]);

  const handleAddItem = async () => {
    if (!newItem.name || !kitId) return;
    try {
      await addDoc(collection(db, 'items'), {
        kitId,
        name: newItem.name,
        totalQuantity: newItem.totalQuantity,
        availableQuantity: newItem.totalQuantity
      });
      setNewItem({ name: '', totalQuantity: 1 });
      setIsAddingItem(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('Tem certeza que deseja remover este item?')) return;
    try {
      await deleteDoc(doc(db, 'items', id));
    } catch (err) {
      console.error(err);
    }
  };

  if (!kit) return <LoadingScreen />;

  return (
    <main className="container mx-auto px-4 py-8 max-w-4xl">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 font-bold mb-6 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white transition-colors">
        <ArrowLeft className="w-5 h-5" /> Voltar
      </button>

      <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 p-8 shadow-sm mb-8">
        <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Editando {kit.name}</h1>
        <p className="text-gray-500 dark:text-gray-400 font-medium">Gerencie os itens e quantidades deste kit.</p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Itens do Kit</h2>
          <button 
            onClick={() => setIsAddingItem(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-all"
          >
            <Plus className="w-4 h-4" /> Novo Item
          </button>
        </div>

        <AnimatePresence>
          {isAddingItem && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl p-6"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <input 
                  type="text" 
                  placeholder="Nome do Item (ex: Sensor)" 
                  className="p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white"
                  value={newItem.name}
                  onChange={e => setNewItem({...newItem, name: e.target.value})}
                />
                <input 
                  type="number" 
                  placeholder="Quantidade Total" 
                  className="p-3 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-blue-500 dark:text-white"
                  value={newItem.totalQuantity}
                  onChange={e => setNewItem({...newItem, totalQuantity: parseInt(e.target.value)})}
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setIsAddingItem(false)} className="px-4 py-2 text-gray-500 dark:text-gray-400 font-bold">Cancelar</button>
                <button onClick={handleAddItem} className="bg-blue-600 text-white px-6 py-2 rounded-xl font-bold">Adicionar</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 gap-3">
          {items.map(item => (
            <div key={item.id} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 p-5 rounded-3xl flex items-center justify-between shadow-sm">
              <div>
                <h3 className="font-bold text-gray-900 dark:text-white">{item.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Total: {item.totalQuantity} | Disponível: {item.availableQuantity}</p>
              </div>
              <button 
                onClick={() => handleDeleteItem(item.id)}
                className="p-3 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
};

// --- Auth Provider ---

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // 1. Check by UID first
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          
          if (userDoc.exists()) {
            setUser({ id: userDoc.id, ...userDoc.data() } as User);
          } else {
            // 2. Check if there's a "pre-approved" document by email
            const emailDoc = await getDoc(doc(db, 'users', firebaseUser.email || ''));
            
            if (emailDoc.exists()) {
              const data = emailDoc.data();
              // Promote email doc to UID doc
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                name: firebaseUser.displayName || data.name,
                email: firebaseUser.email,
                role: data.role
              });
              // Delete the temporary email doc
              await deleteDoc(doc(db, 'users', firebaseUser.email || ''));
              
              setUser({ 
                id: firebaseUser.uid, 
                name: firebaseUser.displayName || data.name,
                email: firebaseUser.email || '',
                role: data.role 
              } as User);
            } else {
              // 3. Create new student user by default
              const newUser: User = {
                id: firebaseUser.uid,
                name: firebaseUser.displayName || 'Usuário',
                email: firebaseUser.email || '',
                role: firebaseUser.email === 'diegoroots3@gmail.com' ? 'admin' : 'student'
              };
              await setDoc(doc(db, 'users', firebaseUser.uid), {
                name: newUser.name,
                email: newUser.email,
                role: newUser.role
              });
              setUser(newUser);
            }
          }
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Erro no AuthProvider:', error);
        handleFirestoreError(error, OperationType.GET, 'users');
      } finally {
        setLoading(false);
      }
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, isAdmin: user?.role === 'admin' }}>
      {loading ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
};

const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" />;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Router>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans text-gray-900 dark:text-gray-100 selection:bg-blue-100 dark:selection:bg-blue-900 selection:text-blue-900 dark:selection:text-blue-100 transition-colors duration-300">
            <Header />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
              <Route path="/kit/:kitId" element={<PrivateRoute><KitDetails /></PrivateRoute>} />
              <Route path="/loan/:loanId" element={<PrivateRoute><LoanDetails /></PrivateRoute>} />
              <Route path="/history" element={<PrivateRoute><HistoryPage /></PrivateRoute>} />
              <Route path="/admin" element={<PrivateRoute><AdminPanel /></PrivateRoute>} />
              <Route path="/admin/kit/:kitId" element={<PrivateRoute><AdminKitEditor /></PrivateRoute>} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}
