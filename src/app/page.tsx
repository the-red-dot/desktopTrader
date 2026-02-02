// tradewall\src\app\page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import LiveTicker from '../components/LiveTicker';
import RiskCalculator from '../components/RiskCalculator';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import AuthModal from '../components/AuthModal';
import PositionModal, { Position } from '../components/PositionModal'; 

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

    // Alerts Refresh Trigger
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    // Lock Screen State
    const [isLocked, setIsLocked] = useState(false);
    const [lockPin, setLockPin] = useState('');

    // --- Modal Configuration State ---
    // שינינו את ה-state הזה להיות פשוט יותר, רק מחזיק את המידע על *מה* פותחים
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        mode: 'add' | 'edit';
        coin: string;
        parentIdx: number | null;
        childIdx: number | null;
    }>({
        isOpen: false,
        mode: 'add',
        coin: '',
        parentIdx: null,
        childIdx: null
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
            if (session?.user) {
                fetchPortfolio(session.user.id);
            } else {
                fetchPortfolio(null);
            }
        };
        getUser();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user || null);
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
        
        let query = supabase
            .from('positions')
            .select('*')
            .order('created_at', { ascending: true });

        if (userId) {
            query = query.eq('user_id', userId);
        } else {
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
                        ...spot, 
                        entry: Number(spot.entry),
                        amount: Number(spot.amount),
                        tp: Number(spot.tp),
                        sl: Number(spot.sl),
                        risk: Number(spot.risk),
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
                            ...short,
                            entry: Number(short.entry),
                            amount: Number(short.amount),
                            tp: Number(short.tp),
                            sl: Number(short.sl),
                            risk: Number(short.risk),
                            shorts: []
                        });
                    }
                }
            });

            setPortfolio(newPortfolio);
        }
        setIsLoadingData(false);
    };

    // --- Helpers for Modal ---

    const openModal = (mode: 'add' | 'edit', coin: string, parentIdx: number | null = null, childIdx: number | null = null) => {
        if (!user) {
            setShowAuthModal(true);
            return;
        }
        setModalConfig({
            isOpen: true,
            mode,
            coin,
            parentIdx,
            childIdx
        });
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

            if (type === 'spot') {
                // במחיקת ספוט - מוחקים את כל ההתראות של המטבע למשתמש זה
                await supabase.from('alerts').delete()
                    .eq('coin', coin)
                    .eq('user_id', user.id);
                setRefreshTrigger(prev => prev + 1);
            } else {
                // --- Logic Update: Delete alerts for THIS hedge AND the NEXT hedge entry alert ---
                const currentHedgeNum = (shortIndex ?? 0) + 1;
                const nextHedgeNum = currentHedgeNum + 1;

                const { data: alerts } = await supabase.from('alerts').select('id, note').eq('coin', coin).eq('user_id', user.id);
                
                if (alerts) {
                    const idsToDelete = alerts
                        .filter(a => {
                            if (!a.note) return false;
                            
                            // 1. Delete alerts related to THIS hedge (e.g., "Hedge 2 ... TP", "Hedge 2 ... SL")
                            const relatedToCurrent = a.note.includes(`Hedge ${currentHedgeNum}`);
                            
                            // 2. Delete the Entry Alert for the NEXT hedge (e.g., "⚠️ ENTER HEDGE 3 NOW!")
                            //    This alert was created by the hedge we are currently deleting.
                            const relatedToNextEntry = a.note.includes(`ENTER HEDGE ${nextHedgeNum}`);
                            
                            return relatedToCurrent || relatedToNextEntry;
                        })
                        .map(a => a.id);
                    
                    if (idsToDelete.length > 0) {
                        await supabase.from('alerts').delete().in('id', idsToDelete);
                        setRefreshTrigger(prev => prev + 1);
                    }
                }
            }

            await fetchPortfolio(user ? user.id : null);
            setDeleteModal({ isOpen: false, type: null, coin: '', index: null, shortIndex: null });

        } catch (err: any) {
            alert("שגיאה במחיקה: " + err.message);
        }
    };

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

        if (isLoadingData) return <div style={{ textAlign: 'center', padding: 40, opacity: 0.8 }}>טוען נתונים...</div>;
        if (!user && strategies.length === 0) return <div style={{ textAlign: 'center', padding: 40, opacity: 0.8 }}><p style={{fontSize:'1.1rem', marginBottom:15}}>נא להתחבר כדי לנהל פוזיציות</p><button className="btn-action" style={{background:'#6c5ce7', color:'white', width:150}} onClick={() => setShowAuthModal(true)}>התחברות</button></div>;
        if (strategies.length === 0) return <div style={{ textAlign: 'center', padding: 40, opacity: 0.5 }}><p style={{ fontSize: '1.2rem', marginBottom: 10 }}>הפורטפוליו ריק</p><button className="btn-action btn-add-spot" style={{ width: 200 }} onClick={() => openModal('add', activeTab)}>+ פתח פוזיציית ספוט</button></div>;

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

                            <div className="data-row">
                                <span>כניסה: <strong>${spot.entry}</strong></span>
                                <span>יעד: <span style={{ color: '#00b894' }}>{spot.tp ? `$${spot.tp}` : '-'}</span></span>
                            </div>
                            <div className="data-row">
                                <span>כמות: {spot.amount}</span>
                                <span>סטופ: <span style={{ color: '#ff7675' }}>{spot.sl ? `$${spot.sl}` : '-'}</span></span>
                            </div>
                            {/* --- שורת השקעה וסיכון --- */}
                            <div className="data-row">
                                <span>השקעה: ${spotCost.toFixed(2)}</span>
                                <span>סיכון: {spot.risk ? `$${spot.risk}` : '-'}</span>
                            </div>
                            {/* ---------------------------------- */}
                            <div className="data-row">
                                <span>PNL ספוט:</span>
                                <span className={spotPnL >= 0 ? 'val-profit' : 'val-loss'}>{spotPnL >= 0 ? '+' : ''}${spotPnL.toFixed(2)}</span>
                            </div>

                            {spot.shorts.map((short, sIdx) => {
                                const shortPnL = (short.entry - currentPrice) * short.amount;
                                totalShortPnL += shortPnL;
                                return (
                                    <div key={sIdx} className="sub-card">
                                        <div className="strategy-header" style={{ marginBottom: 8, border: 'none', padding: 0 }}>
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span className="badge badge-short">Hedge {sIdx + 1} ({short.currency || 'USDT'})</span>
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

                            {spot.shorts.length < 4 && (
                                <button className="btn-action btn-add-short" onClick={() => openModal('add', activeTab, idx)}>+ הוסף גידור (Short)</button>
                            )}

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
                    onCoinClick={(coin) => { setActiveTab(coin); }}
                    userId={user?.id || null}
                    refreshTrigger={refreshTrigger}
                />
                <div className="glass-panel calc-col">
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:15}}>
                        <div style={{fontSize:'0.9rem', opacity:0.8}}>
                            {user ? (<span>מחובר: <span style={{color:'#00b894', fontWeight:'bold'}}>{user.email?.split('@')[0]}</span></span>) : (<span>אורח</span>)}
                        </div>
                        <div>
                            {user ? (
                                <button onClick={async () => { await supabase.auth.signOut(); }} className="btn-action" style={{background:'transparent', border:'1px solid rgba(255,255,255,0.2)', padding:'4px 12px', fontSize:'0.8rem', width:'auto'}}>התנתק</button>
                            ) : (
                                <button onClick={() => setShowAuthModal(true)} className="btn-action" style={{background:'#6c5ce7', padding:'4px 12px', fontSize:'0.8rem', width:'auto'}}>התחבר/הרשם</button>
                            )}
                        </div>
                    </div>

                    <div className="tabs-container">
                        <button className={`tab-btn ${activeTab === 'calc' ? 'active' : ''}`} onClick={() => setActiveTab('calc')}>מחשבון</button>
                        <button className={`tab-btn ${activeTab === 'shortcuts' ? 'active' : ''}`} onClick={() => setActiveTab('shortcuts')}>קיצורים</button>
                        {COINS.map(c => (
                            <button key={c} className={`tab-btn ${activeTab === c ? 'active' : ''}`} onClick={() => setActiveTab(c)}>{c}</button>
                        ))}
                    </div>

                    {activeTab === 'calc' && <RiskCalculator prices={prices} />}
                    {activeTab === 'shortcuts' && <KeyboardShortcuts />}
                    {COINS.includes(activeTab) && renderPortfolio()}
                </div>
            </div>

            <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />

            {/* השימוש בקומפוננטה החדשה */}
            <PositionModal
                isOpen={modalConfig.isOpen}
                onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
                mode={modalConfig.mode}
                coin={modalConfig.coin}
                currentPrice={prices[modalConfig.coin]}
                user={user}
                // שליפת אובייקט הספוט האב, אם קיים אינדקס
                parentSpot={(modalConfig.coin && modalConfig.parentIdx !== null) 
                    ? portfolio[modalConfig.coin][modalConfig.parentIdx] 
                    : null
                }
                // שליפת אובייקט הגידור הבן, אם קיים אינדקס
                childHedge={(modalConfig.coin && modalConfig.parentIdx !== null && modalConfig.childIdx !== null)
                    ? portfolio[modalConfig.coin][modalConfig.parentIdx].shorts[modalConfig.childIdx]
                    : null
                }
                childHedgeIndex={modalConfig.childIdx}
                onSuccess={(refreshAlerts) => {
                    fetchPortfolio(user ? user.id : null);
                    if (refreshAlerts) {
                        setRefreshTrigger(prev => prev + 1);
                    }
                }}
            />

            {deleteModal.isOpen && (
                <>
                    <div className="modal-overlay" onClick={() => setDeleteModal({ ...deleteModal, isOpen: false })}></div>
                    <div className="glass-panel modal-content confirm-modal">
                        <h3>מחיקת פוזיציה</h3>
                        <p>האם למחוק את הפוזיציה ואת ההתראות שלה?</p>
                        <div style={{ display: 'flex', gap: 10, marginTop:20 }}>
                            <button onClick={confirmDelete} className="btn-action" style={{ background: '#ff4d4d' }}>מחק</button>
                            <button onClick={() => setDeleteModal({ ...deleteModal, isOpen: false })} className="btn-action" style={{ background: '#333' }}>ביטול</button>
                        </div>
                    </div>
                </>
            )}
        </main>
    );
}