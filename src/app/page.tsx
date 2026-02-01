// tradewall\src\app\page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import LiveTicker from '../components/LiveTicker';
import RiskCalculator from '../components/RiskCalculator';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import AuthModal from '../components/AuthModal'; // Import AuthModal

// --- Types ---
interface Position {
    id: string;
    entry: number;
    amount: number;
    tp: number;
    sl: number;
    risk: number;
    currency: string;
    trade_date?: string;
    trade_time?: string;
    shorts: Position[];
    user_id?: string; // Added user_id
}

type Portfolio = {
    [key: string]: Position[];
};

type Prices = {
    [key: string]: number;
};

// --- Constants ---
const COINS = ['BTC', 'ETH', 'BNB', 'SOL'];
const SECRET_PIN = process.env.NEXT_PUBLIC_SECRET_PIN || "050488";

export default function TradeWall() {
    // --- State ---
    const [prices, setPrices] = useState<Prices>({ BTC: 0, ETH: 0, BNB: 0, SOL: 0 });
    const [activeTab, setActiveTab] = useState<string>('calc');

    // User / Auth State
    const [user, setUser] = useState<any>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);

    // Portfolio Data
    const [portfolio, setPortfolio] = useState<Portfolio>({ BTC: [], ETH: [], BNB: [], SOL: [] });
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Lock Screen State
    const [isLocked, setIsLocked] = useState(false);
    const [lockPin, setLockPin] = useState('');

    // Modal State
    const [modal, setModal] = useState({
        isOpen: false,
        mode: 'add', // 'add' | 'edit'
        coin: '',
        parentIdx: null as number | null,
        childIdx: null as number | null,
        data: {
            entry: '',
            amount: '',
            tp: '',
            sl: '',
            risk: '',
            currency: 'USDT',
            date: '',
            time: ''
        }
    });

    // Delete Confirmation State
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        type: 'spot' | 'short' | null;
        coin: string;
        index: number | null;
        shortIndex: number | null;
    }>({ isOpen: false, type: null, coin: '', index: null, shortIndex: null });

    // --- Helpers for Persistence ---
    const updateLockState = (locked: boolean) => {
        setIsLocked(locked);
        if (typeof window !== 'undefined') {
            localStorage.setItem('tradeWall_isLocked', locked.toString());
        }
    };

    // --- Effects ---

    // 1. Check User Session on Mount
    useEffect(() => {
        const getUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUser(session?.user || null);
            // אם יש סשן שמור, נטען נתונים מיד
            if (session?.user) {
                fetchPortfolio(session.user.id);
            } else {
                fetchPortfolio(null);
            }
        };
        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
            // אם המשתמש התנתק, נקה את הפורטפוליו
            if (!session) {
                setPortfolio({ BTC: [], ETH: [], BNB: [], SOL: [] });
            } else {
                fetchPortfolio(session.user.id);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // 2. Initial Load & WebSocket & Restore Lock State
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedLockState = localStorage.getItem('tradeWall_isLocked');
            if (savedLockState === 'true') {
                setIsLocked(true);
            }
        }

        // Fetch data removed from here to rely on auth effect

        // --- WebSocket Logic ---
        let ws: WebSocket | null = null;
        let reconnectTimer: NodeJS.Timeout | null = null;

        const connectWebSocket = () => {
            if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
                return;
            }

            console.log('Connecting to Binance WebSocket...');
            ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@miniTicker/ethusdt@miniTicker/bnbusdt@miniTicker/solusdt@miniTicker');

            ws.onopen = () => {
                console.log('WebSocket Connected');
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                const symbol = data.s.replace('USDT', '');
                const price = parseFloat(data.c);
                setPrices(prev => ({ ...prev, [symbol]: price }));
            };

            ws.onclose = () => {
                console.log('WebSocket Closed. Reconnecting in 3s...');
                reconnectTimer = setTimeout(connectWebSocket, 3000);
            };

            ws.onerror = (err) => {
                console.error('WebSocket Error:', err);
                ws?.close();
            };
        };

        connectWebSocket();

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                    if (reconnectTimer) clearTimeout(reconnectTimer);
                    connectWebSocket();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (ws) ws.close();
        };
    }, []); 

    // --- Helpers & Supabase Logic ---

    const fetchPortfolio = async (userId: string | null) => {
        setIsLoadingData(true);
        
        // בניית השאילתה
        let query = supabase
            .from('positions')
            .select('*')
            .order('created_at', { ascending: true });

        // אם יש משתמש, סנן לפי המשתמש. אם אין, ואנחנו במצב מעבר (Legacy), 
        // אפשר להציג את כל השורות שאין להן user_id (או להסתיר הכל)
        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            // נתונים ללא שיוך (אם ישנם)
             query = query.is('user_id', null);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching data:', error);
            setIsLoadingData(false);
            return;
        }

        if (data) {
            const newPortfolio: Portfolio = { BTC: [], ETH: [], BNB: [], SOL: [] };

            const spots = data.filter(item => item.parent_id === null);
            spots.forEach(spot => {
                if (newPortfolio[spot.symbol]) {
                    newPortfolio[spot.symbol].push({
                        id: spot.id,
                        entry: Number(spot.entry),
                        amount: Number(spot.amount),
                        tp: Number(spot.tp),
                        sl: Number(spot.sl),
                        risk: Number(spot.risk),
                        currency: spot.currency,
                        trade_date: spot.trade_date,
                        trade_time: spot.trade_time,
                        user_id: spot.user_id,
                        shorts: []
                    });
                }
            });

            const shorts = data.filter(item => item.parent_id !== null);
            shorts.forEach(short => {
                const coin = short.symbol;
                if (newPortfolio[coin]) {
                    const parentSpot = newPortfolio[coin].find(p => p.id === short.parent_id);
                    if (parentSpot) {
                        parentSpot.shorts.push({
                            id: short.id,
                            entry: Number(short.entry),
                            amount: Number(short.amount),
                            tp: Number(short.tp),
                            sl: Number(short.sl),
                            risk: Number(short.risk),
                            currency: short.currency,
                            trade_date: short.trade_date,
                            trade_time: short.trade_time,
                            user_id: short.user_id,
                            shorts: []
                        });
                    }
                }
            });

            setPortfolio(newPortfolio);
        }
        setIsLoadingData(false);
    };

    // --- Modal Logic ---

    const calculateModalValues = () => {
        const entry = parseFloat(modal.data.entry);
        const amount = parseFloat(modal.data.amount);
        const tp = parseFloat(modal.data.tp);

        let calcInvest = 0;
        let calcProfit = 0;

        const isSpot = (modal.mode === 'add' && modal.parentIdx === null) || (modal.mode === 'edit' && modal.childIdx === null);

        if (entry && !isNaN(entry) && amount && !isNaN(amount)) {
            calcInvest = amount * entry;

            if (tp && !isNaN(tp)) {
                if (isSpot) calcProfit = (tp - entry) * amount;
                else calcProfit = (entry - tp) * amount;
            }
        }

        return { calcInvest, calcProfit };
    };

    const handleModalInput = (field: string, value: string) => {
        const newData = { ...modal.data, [field]: value };

        const entry = parseFloat(newData.entry);
        const sl = parseFloat(newData.sl);
        const risk = parseFloat(newData.risk);
        const amount = parseFloat(newData.amount);

        if (field === 'risk' || field === 'sl' || field === 'entry') {
            if (entry && sl && risk) {
                const diff = Math.abs(entry - sl);
                if (diff > 0) {
                    const newAmount = risk / diff;
                    newData.amount = newAmount.toFixed(6);
                }
            } else if (entry && risk && !sl && field === 'risk') {
                newData.amount = (risk / entry).toFixed(6);
            }
        }

        if (field === 'amount' && entry) {
            if (sl) {
                const diff = Math.abs(entry - sl);
                newData.risk = (diff * amount).toFixed(2);
            } else {
                newData.risk = (entry * amount).toFixed(2);
            }
        }

        setModal(prev => ({ ...prev, data: newData }));
    };

    const { calcInvest: modalInvest, calcProfit: modalProfit } = calculateModalValues();

    const openModal = (mode: 'add' | 'edit', coin: string, parentIdx: number | null = null, childIdx: number | null = null) => {
        // אם המשתמש לא מחובר, פתח את מודל ההתחברות במקום
        if (!user) {
            setShowAuthModal(true);
            return;
        }

        const now = new Date();
        const defaultDate = now.toISOString().split('T')[0];
        const defaultTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

        let initialData = {
            entry: prices[coin]?.toString() || '',
            amount: '',
            tp: '',
            sl: '',
            risk: '',
            currency: 'USDT',
            date: defaultDate,
            time: defaultTime
        };

        if (mode === 'edit') {
            if (parentIdx !== null && childIdx === null) {
                // Edit Spot
                const p = portfolio[coin][parentIdx];
                initialData = {
                    entry: p.entry.toString(),
                    amount: p.amount.toString(),
                    tp: p.tp?.toString() || '',
                    sl: p.sl?.toString() || '',
                    risk: p.risk?.toString() || '',
                    currency: p.currency || 'USDT',
                    date: p.trade_date || defaultDate,
                    time: p.trade_time || defaultTime
                };
            } else if (parentIdx !== null && childIdx !== null) {
                // Edit Short
                const s = portfolio[coin][parentIdx].shorts[childIdx];
                initialData = {
                    entry: s.entry.toString(),
                    amount: s.amount.toString(),
                    tp: s.tp?.toString() || '',
                    sl: s.sl?.toString() || '',
                    risk: s.risk?.toString() || '',
                    currency: s.currency || 'USDT',
                    date: s.trade_date || defaultDate,
                    time: s.trade_time || defaultTime
                };
            }
        }

        setModal({
            isOpen: true,
            mode,
            coin,
            parentIdx,
            childIdx,
            data: initialData
        });
    };

    const savePosition = async () => {
        if (!user) return; // הגנה נוספת

        const { coin, parentIdx, childIdx, mode, data } = modal;
        const entry = parseFloat(data.entry);
        const amount = parseFloat(data.amount);

        if (!entry || !amount) {
            alert("נא למלא מחיר וכמות");
            return;
        }

        const dbPayload: any = {
            symbol: coin,
            entry: entry,
            amount: amount,
            tp: parseFloat(data.tp) || 0,
            sl: parseFloat(data.sl) || 0,
            risk: parseFloat(data.risk) || 0,
            currency: data.currency,
            trade_date: data.date,
            trade_time: data.time,
            user_id: user.id // שיוך למשתמש המחובר
        };

        try {
            if (mode === 'add') {
                if (parentIdx === null) {
                    dbPayload.parent_id = null;
                } else {
                    const parentSpot = portfolio[coin][parentIdx];
                    if (!parentSpot?.id) throw new Error("Parent ID not found (try refreshing)");
                    dbPayload.parent_id = parentSpot.id;
                }

                const { error } = await supabase.from('positions').insert([dbPayload]);
                if (error) throw error;

            } else {
                let idToUpdate = '';

                if (childIdx === null && parentIdx !== null) {
                    idToUpdate = portfolio[coin][parentIdx].id;
                } else if (parentIdx !== null && childIdx !== null) {
                    idToUpdate = portfolio[coin][parentIdx].shorts[childIdx].id;
                }

                if (!idToUpdate) throw new Error("ID to update not found");

                const { error } = await supabase
                    .from('positions')
                    .update(dbPayload)
                    .eq('id', idToUpdate);

                if (error) throw error;
            }

            await fetchPortfolio(user.id);
            setModal(prev => ({ ...prev, isOpen: false }));

        } catch (err: any) {
            console.error("Error saving position:", err.message);
            alert("שגיאה בשמירה: " + err.message);
        }
    };

    const confirmDelete = async () => {
        const { type, coin, index, shortIndex } = deleteModal;

        try {
            let idToDelete = '';

            if (type === 'spot' && index !== null) {
                idToDelete = portfolio[coin][index].id;
            } else if (type === 'short' && index !== null && shortIndex !== null) {
                idToDelete = portfolio[coin][index].shorts[shortIndex].id;
            }

            if (!idToDelete) return;

            const { error } = await supabase.from('positions').delete().eq('id', idToDelete);

            if (error) throw error;

            await fetchPortfolio(user ? user.id : null);
            setDeleteModal({ isOpen: false, type: null, coin: '', index: null, shortIndex: null });

        } catch (err: any) {
            console.error("Error deleting:", err.message);
            alert("שגיאה במחיקה: " + err.message);
        }
    };

    // --- Render Components ---

    const renderPortfolio = () => {
        if (isLocked) {
            return (
                <div className="lock-container">
                    <div className="lock-icon">🔒</div>
                    <h3 style={{ marginBottom: 20 }}>הפורטפוליו נעול</h3>
                    <input type="password" value={lockPin} onChange={e => setLockPin(e.target.value)}
                        className="glass-input lock-input" placeholder="****" maxLength={6} />
                    <button onClick={() => { if (lockPin === SECRET_PIN) { updateLockState(false); setLockPin(''); } else alert('סיסמה שגויה!'); }}
                        className="btn-action btn-add-spot" style={{ width: 200, marginTop: 20 }}>פתיחה</button>
                </div>
            );
        }

        const strategies = portfolio[activeTab] || [];
        const currentPrice = prices[activeTab] || 0;

        if (isLoadingData) {
            return <div style={{ textAlign: 'center', padding: 40, opacity: 0.8 }}>טוען נתונים...</div>;
        }

        // אם אין משתמש, נציג הודעה להתחבר כדי לראות נתונים (או נתונים ריקים אם אין נתונים ללא שיוך)
        if (!user && strategies.length === 0) {
             return (
                <div style={{ textAlign: 'center', padding: 40, opacity: 0.8 }}>
                    <p style={{fontSize:'1.1rem', marginBottom:15}}>נא להתחבר כדי לנהל פוזיציות</p>
                    <button className="btn-action" style={{background:'#6c5ce7', color:'white', width:150}} onClick={() => setShowAuthModal(true)}>התחברות</button>
                </div>
             );
        }

        if (strategies.length === 0) {
            return (
                <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}>
                    <p style={{ fontSize: '1.2rem', marginBottom: 10 }}>הפורטפוליו ריק</p>
                    <button className="btn-action btn-add-spot" style={{ width: 200 }} onClick={() => openModal('add', activeTab)}>+ פתח פוזיציית ספוט</button>
                </div>
            );
        }

        return (
            <div className="tab-content active" style={{ direction: 'rtl', paddingLeft: '12px' }}>
                <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button className="icon-btn" onClick={() => updateLockState(true)} title="נעל מסך">🔒</button>
                    <button className="btn-action btn-add-spot" style={{ width: 'auto', padding: '8px 20px' }} onClick={() => openModal('add', activeTab)}>+ הוסף ספוט חדש</button>
                </div>

                {strategies.map((spot, idx) => {
                    const spotValue = spot.amount * currentPrice;
                    const spotCost = spot.amount * spot.entry;
                    const spotPnL = spotValue - spotCost;

                    let totalShortPnL = 0;

                    // Projections
                    const projectedSpotWin = (spot.tp - spot.entry) * spot.amount;
                    let projectedShortLossAtTP = 0;
                    let projectedShortWinAtSL = 0;

                    spot.shorts.forEach(s => {
                        if (spot.tp) projectedShortLossAtTP += (s.entry - spot.tp) * s.amount;
                        if (spot.sl) projectedShortWinAtSL += (s.entry - spot.sl) * s.amount;
                    });

                    const netAtTP = projectedSpotWin + projectedShortLossAtTP;
                    const netAtSL = (spot.sl ? (spot.sl - spot.entry) * spot.amount : 0) + projectedShortWinAtSL;

                    return (
                        <div key={idx} className="strategy-card">
                            {/* Spot Header */}
                            <div className="strategy-header">
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span className="badge badge-long" style={{ fontSize: '0.9rem' }}>SPOT LONG ({spot.currency || 'USDT'})</span>
                                    {spot.trade_date && <span style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: 4 }}>{spot.trade_date} {spot.trade_time}</span>}
                                </div>
                                <div>
                                    <button className="icon-btn btn-edit" onClick={() => openModal('edit', activeTab, idx)}>✎</button>
                                    <button className="icon-btn btn-delete" onClick={() => setDeleteModal({ isOpen: true, type: 'spot', coin: activeTab, index: idx, shortIndex: null })}>🗑</button>
                                </div>
                            </div>

                            {/* Spot Data */}
                            <div className="data-row">
                                <span>כניסה: <strong>${spot.entry}</strong></span>
                                <span>יעד: <span style={{ color: '#00b894' }}>{spot.tp ? `$${spot.tp}` : '-'}</span></span>
                            </div>
                            <div className="data-row">
                                <span>כמות: {spot.amount}</span>
                                <span>סטופ: <span style={{ color: '#ff7675' }}>{spot.sl ? `$${spot.sl}` : '-'}</span></span>
                            </div>
                            <div className="data-row">
                                <span>PNL ספוט:</span>
                                <span className={spotPnL >= 0 ? 'val-profit' : 'val-loss'}>{spotPnL >= 0 ? '+' : ''}${spotPnL.toFixed(2)}</span>
                            </div>

                            {/* Shorts */}
                            {spot.shorts.map((short, sIdx) => {
                                const shortPnL = (short.entry - currentPrice) * short.amount;
                                totalShortPnL += shortPnL;

                                return (
                                    <div key={sIdx} className="sub-card">
                                        <div className="strategy-header" style={{ marginBottom: 8, border: 'none', padding: 0 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className="badge badge-short">Short {sIdx + 1} ({short.currency || 'USDT'})</span>
                                                {short.trade_date && <span style={{ fontSize: '0.7rem', opacity: 0.6 }}>{short.trade_date} {short.trade_time}</span>}
                                            </div>
                                            <div>
                                                <button className="icon-btn btn-edit" onClick={() => openModal('edit', activeTab, idx, sIdx)}>✎</button>
                                                <button className="icon-btn btn-delete" onClick={() => setDeleteModal({ isOpen: true, type: 'short', coin: activeTab, index: idx, shortIndex: sIdx })}>×</button>
                                            </div>
                                        </div>
                                        <div className="data-row">
                                            <span>כניסה: ${short.entry}</span>
                                            <span>כמות: {short.amount}</span>
                                        </div>
                                        <div className="data-row" style={{ fontSize: '0.85rem', opacity: 0.8 }}>
                                            <span>TP: {short.tp || '-'}</span>
                                            <span>SL: {short.sl || '-'}</span>
                                        </div>
                                        <div className="data-row">
                                            <span>רווח/הפסד:</span>
                                            <span className={shortPnL >= 0 ? 'val-profit' : 'val-loss'}>{shortPnL >= 0 ? '+' : ''}${shortPnL.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Add Short Btn */}
                            {spot.shorts.length < 2 && (
                                <button className="btn-action btn-add-short" onClick={() => openModal('add', activeTab, idx)}>+ הוסף גידור (Short)</button>
                            )}

                            {/* Projections */}
                            {(spot.tp || spot.sl) && (
                                <div className="projection-box">
                                    <div><strong>תחזית (PNL משוער):</strong></div>
                                    {spot.tp > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                                            <span>ב-TP (${spot.tp}):</span>
                                            <span style={{ color: netAtTP >= 0 ? '#00ff88' : '#ff4d4d' }}>{netAtTP >= 0 ? '+' : ''}${netAtTP.toFixed(2)}</span>
                                        </div>
                                    )}
                                    {spot.sl > 0 && (
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>ב-SL (${spot.sl}):</span>
                                            <span style={{ color: netAtSL >= 0 ? '#00ff88' : '#ff4d4d' }}>{netAtSL >= 0 ? '+' : ''}${netAtSL.toFixed(2)}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Total Strategy PnL */}
                            <div className="total-pnl-box">
                                <div style={{ fontSize: '0.9rem', marginBottom: 5 }}>סה"כ רווח/הפסד אסטרטגיה:</div>
                                <div className={`big-pnl ${(spotPnL + totalShortPnL) >= 0 ? 'val-profit' : 'val-loss'}`}>
                                    {(spotPnL + totalShortPnL) >= 0 ? '+' : ''}${(spotPnL + totalShortPnL).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return (
        <main>
            <div className="wallpaper-bg"></div>

            <div className="main-container">
                <LiveTicker
                    prices={prices}
                    onCoinClick={(coin) => {
                        setActiveTab(coin);
                        // Calculator internal state handles selection now
                    }}
                    userId={user?.id || null}
                />

                <div className="glass-panel calc-col">
                    
                    {/* Header with Auth Button */}
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                        <div style={{fontSize:'0.9rem', opacity:0.8}}>
                            {user ? (
                                <span>מחובר: <span style={{color:'#00b894', fontWeight:'bold'}}>{user.email?.split('@')[0]}</span></span>
                            ) : (
                                <span>אורח</span>
                            )}
                        </div>
                        <div>
                            {user ? (
                                <button 
                                    onClick={async () => { await supabase.auth.signOut(); }}
                                    className="btn-action" 
                                    style={{background:'transparent', border:'1px solid rgba(255,255,255,0.2)', padding:'4px 12px', fontSize:'0.8rem', width:'auto'}}
                                >
                                    התנתק
                                </button>
                            ) : (
                                <button 
                                    onClick={() => setShowAuthModal(true)}
                                    className="btn-action" 
                                    style={{background:'#6c5ce7', padding:'4px 12px', fontSize:'0.8rem', width:'auto'}}
                                >
                                    התחבר/הרשם
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="tabs-container">
                        <button className={`tab-btn ${activeTab === 'calc' ? 'active' : ''}`} onClick={() => setActiveTab('calc')}>מחשבון</button>
                        <button className={`tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')}>קיצורים</button>
                        {COINS.map(c => (
                            <button key={c} className={`tab-btn ${activeTab === c ? 'active' : ''}`} onClick={() => setActiveTab(c)}>{c}</button>
                        ))}
                    </div>

                    {/* Content */}
                    {activeTab === 'calc' && <RiskCalculator prices={prices} />}
                    {activeTab === 'shortcuts' && <KeyboardShortcuts />}
                    {COINS.includes(activeTab) && renderPortfolio()}
                </div>
            </div>

            {/* --- Modals --- */}
            
            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

            {/* Add/Edit Modal */}
            {modal.isOpen && (
                <>
                    <div className="modal-overlay" onClick={() => setModal({ ...modal, isOpen: false })}></div>
                    <div className="glass-panel modal-content">
                        <h3 style={{ textAlign: 'center', marginBottom: 20, fontWeight: 800 }}>
                            {modal.mode === 'add'
                                ? (modal.parentIdx === null ? `הוספת ספוט ${modal.coin}` : `הוספת גידור (שורט) ל-${modal.coin}`)
                                : (modal.childIdx === null ? `עריכת ספוט ${modal.coin}` : `עריכת שורט ${modal.coin}`)
                            }
                        </h3>

                        <div style={{ marginBottom: 12 }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, opacity: 0.8, textAlign: 'right' }}>מטבע בסיס</label>
                            <select className="glass-input" value={modal.data.currency} onChange={e => handleModalInput('currency', e.target.value)}>
                                <option value="USDT">USDT</option>
                                <option value="USDC">USDC</option>
                            </select>
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>תאריך</label>
                                <input type="date" className="glass-input" value={modal.data.date} onChange={e => handleModalInput('date', e.target.value)} />
                            </div>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>שעה</label>
                                <input type="time" className="glass-input" value={modal.data.time} onChange={e => handleModalInput('time', e.target.value)} />
                            </div>
                        </div>

                        <div className="input-group">
                            <label>מחיר כניסה ($)</label>
                            <input type="number" className="glass-input" value={modal.data.entry} onChange={e => handleModalInput('entry', e.target.value)} />
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>סטופ לוס ($)</label>
                                <input type="number" className="glass-input" placeholder="אופציונלי" value={modal.data.sl} onChange={e => handleModalInput('sl', e.target.value)} />
                            </div>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>Take Profit ($)</label>
                                <input type="number" className="glass-input" value={modal.data.tp} onChange={e => handleModalInput('tp', e.target.value)} />
                            </div>
                        </div>

                        <div style={{ margin: '15px 0', padding: 15, background: 'rgba(255,255,255,0.05)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)' }}>
                            <div className="input-group" style={{ marginBottom: 0 }}>
                                <label style={{ color: '#00b894', fontWeight: 'bold' }}>ניהול סיכונים / השקעה ($)</label>
                                <input type="number" className="glass-input" placeholder="סכום הפסד מקסימלי או סה״כ השקעה" value={modal.data.risk} onChange={e => handleModalInput('risk', e.target.value)} />
                                <p style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: 4, textAlign: 'right' }}>אם אין סטופ, זה ייחשב כסכום הקנייה הכולל.</p>
                            </div>
                        </div>

                        <div className="investment-highlight">
                            <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.8, marginBottom: 2 }}>סה"כ לתשלום (USDT/USDC):</span>
                            <div className="investment-val">${modalInvest.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        </div>

                        <div className="profit-highlight">
                            <span style={{ display: 'block', fontSize: '0.8rem', opacity: 0.8, marginBottom: 2 }}>רווח צפוי ב-TP:</span>
                            <div className="profit-val">${modalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                        </div>

                        <div className="input-group" style={{ marginTop: 10 }}>
                            <label>כמות מטבעות (Coins) - מחושב:</label>
                            <input type="number" className="glass-input" style={{ borderColor: '#00b894', fontWeight: 'bold' }} value={modal.data.amount} onChange={e => handleModalInput('amount', e.target.value)} />
                        </div>

                        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                            <button onClick={savePosition} className="btn-action btn-add-spot" style={{ flex: 1 }}>
                                {modal.mode === 'add' ? 'שמור פוזיציה' : 'עדכן פוזיציה'}
                            </button>
                            <button onClick={() => setModal({ ...modal, isOpen: false })} className="btn-action" style={{ flex: 1, background: '#333', color: '#ccc' }}>ביטול</button>
                        </div>
                    </div>
                </>
            )}

            {/* Delete Confirm Modal */}
            {deleteModal.isOpen && (
                <>
                    <div className="modal-overlay" onClick={() => setDeleteModal({ ...deleteModal, isOpen: false })}></div>
                    <div className="glass-panel modal-content confirm-modal">
                        <h3 style={{ marginBottom: 10 }}>מחיקת פוזיציה</h3>
                        <p style={{ opacity: 0.8, marginBottom: 25 }}>הפעולה הזו תמחק את הפוזיציה ולא ניתן לשחזר אותה.<br />להמשיך?</p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={confirmDelete} className="btn-action" style={{ background: '#ff4d4d', color: 'white' }}>כן, מחק</button>
                            <button onClick={() => setDeleteModal({ ...deleteModal, isOpen: false })} className="btn-action" style={{ background: '#333', color: 'white' }}>ביטול</button>
                        </div>
                    </div>
                </>
            )}
        </main>
    );
}