// tradewall\src\app\page.tsx

'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import LiveTicker from '../components/LiveTicker';
import RiskCalculator from '../components/RiskCalculator';
import KeyboardShortcuts from '../components/KeyboardShortcuts';
import AuthModal from '../components/AuthModal';
import { calculateHedgeStrategy, HedgeSetup } from '../app/utils/hedgeLogic';

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
    user_id?: string;
    strategy_hedges_count?: number;
    strategy_risk_percent?: number;
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

    // Alerts Refresh Trigger
    const [refreshTrigger, setRefreshTrigger] = useState(0);

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
        },
        // ניהול אסטרטגיה בתוך המודל
        strategy: {
            isActive: false,      // האם הופעלה אסטרטגיה
            hedgesCount: 2,       // ברירת מחדל לבחירה
            riskPercent: 0,       // האחוז שנבחר
            currentHedgeIndex: 1, // מספר הגידור הנוכחי (1, 2, 3...)
            calculatedSetups: [] as HedgeSetup[] // מערך החישובים המלא
        },
        createAlerts: false // הפעמון
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

    // --- Modal & Strategy Logic ---

    const calculateModalValues = () => {
        const entry = parseFloat(modal.data.entry);
        const amount = parseFloat(modal.data.amount);
        const tp = parseFloat(modal.data.tp);
        const sl = parseFloat(modal.data.sl);

        let calcInvest = 0;
        let calcProfit = 0;
        let calcRisk = 0;

        const isSpot = (modal.mode === 'add' && modal.parentIdx === null) || (modal.mode === 'edit' && modal.childIdx === null);

        if (entry && !isNaN(entry) && amount && !isNaN(amount)) {
            calcInvest = amount * entry;

            // רווח פוטנציאלי (TP)
            if (tp && !isNaN(tp)) {
                if (isSpot) calcProfit = (tp - entry) * amount;
                else calcProfit = Math.abs(entry - tp) * amount; // שורט
            }

            // סיכון פוטנציאלי (SL) - זה מה שנציג במודל
            if (sl && !isNaN(sl)) {
                if (isSpot) calcRisk = (entry - sl) * amount; // לונג: הפסד כשהמחיר יורד
                else calcRisk = Math.abs(sl - entry) * amount; // שורט: הפסד כשהמחיר עולה
            } else {
                // אם אין סטופ, לוקחים את הריסק מהשדה הידני אם הוזן
                calcRisk = parseFloat(modal.data.risk) || 0;
            }
        }

        return { calcInvest, calcProfit, calcRisk };
    };

    const handleModalInput = (field: string, value: string) => {
        const newData = { ...modal.data, [field]: value };
        
        // --- Risk Calculation Logic ---
        // 1. If Risk changed -> Update Amount
        if (field === 'risk') {
             const riskVal = parseFloat(value);
             const entryVal = parseFloat(newData.entry);
             const slVal = parseFloat(newData.sl);
             
             if (!isNaN(riskVal) && !isNaN(entryVal) && !isNaN(slVal) && entryVal !== slVal) {
                 const diff = Math.abs(entryVal - slVal);
                 const newAmount = riskVal / diff;
                 newData.amount = newAmount.toFixed(6);
             }
        }
        // 2. If Amount/Entry/SL changed -> Update Risk
        else if (field === 'amount' || field === 'entry' || field === 'sl') {
            const entryVal = parseFloat(newData.entry);
            const slVal = parseFloat(newData.sl);
            const amountVal = parseFloat(newData.amount);

            if (!isNaN(amountVal) && !isNaN(entryVal) && !isNaN(slVal)) {
                 const diff = Math.abs(entryVal - slVal);
                 const newRisk = diff * amountVal;
                 newData.risk = newRisk.toFixed(2);
            }
        }
        
        if (modal.strategy.isActive && modal.parentIdx !== null && (field === 'entry' || field === 'sl')) {
            const spot = portfolio[modal.coin][modal.parentIdx];
            const newEntry = field === 'entry' ? parseFloat(value) : parseFloat(modal.data.entry);
            const newSL = field === 'sl' ? parseFloat(value) : parseFloat(modal.data.sl);

            if (!isNaN(newEntry) && !isNaN(newSL) && spot) {
                const newSetups = calculateHedgeStrategy(
                    spot.entry,
                    newSL,
                    spot.amount,
                    modal.strategy.riskPercent,
                    modal.strategy.hedgesCount,
                    newEntry
                );

                const currentSetupIdx = modal.strategy.currentHedgeIndex - 1;
                const updatedSetup = newSetups[currentSetupIdx];

                if (updatedSetup) {
                    newData.amount = updatedSetup.coinAmount.toString();
                    newData.risk = updatedSetup.riskAmount.toString();
                    newData.tp = updatedSetup.tp.toString();
                }

                setModal(prev => ({
                    ...prev,
                    data: newData,
                    strategy: {
                        ...prev.strategy,
                        calculatedSetups: newSetups
                    }
                }));
                return;
            }
        }

        setModal(prev => ({ ...prev, data: newData }));
    };

    const applyHedgeStrategy = (percent: number) => {
        if (modal.parentIdx === null) return;
        
        const spot = portfolio[modal.coin][modal.parentIdx];
        if (!spot) return;

        const currentFormEntry = parseFloat(modal.data.entry);
        const startPrice = !isNaN(currentFormEntry) ? currentFormEntry : spot.entry;
        
        const currentFormSL = parseFloat(modal.data.sl);
        const targetSL = !isNaN(currentFormSL) ? currentFormSL : spot.tp;

        const setups = calculateHedgeStrategy(
            spot.entry,
            targetSL,
            spot.amount,
            percent, 
            modal.strategy.hedgesCount,
            startPrice
        );

        const nextHedgeIdx = modal.strategy.currentHedgeIndex - 1; 
        const setupToApply = setups[nextHedgeIdx];

        if (setupToApply) {
            setModal(prev => ({
                ...prev,
                strategy: {
                    ...prev.strategy,
                    isActive: true,
                    riskPercent: percent,
                    calculatedSetups: setups,
                },
                data: {
                    ...prev.data,
                    entry: setupToApply.entry.toString(),
                    tp: setupToApply.tp.toString(),
                    sl: setupToApply.sl.toString(),
                    amount: setupToApply.coinAmount.toString(),
                    risk: setupToApply.riskAmount.toString(),
                }
            }));
        }
    };

    const { calcInvest: modalInvest, calcProfit: modalProfit, calcRisk: modalRisk } = calculateModalValues();

    const openModal = (mode: 'add' | 'edit', coin: string, parentIdx: number | null = null, childIdx: number | null = null) => {
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

        let strategyState = {
            isActive: false,
            hedgesCount: 2, 
            riskPercent: 0,
            currentHedgeIndex: 1,
            calculatedSetups: [] as HedgeSetup[]
        };

        if (mode === 'add' && parentIdx !== null) {
            const spot = portfolio[coin][parentIdx];
            if (spot.tp) {
                initialData.sl = spot.tp.toString();
            }

            const nextHedgeNum = spot.shorts.length + 1;
            strategyState.currentHedgeIndex = nextHedgeNum;

            // עדכון: מאפשר חישוב גם לגידור הראשון אם יש נתונים בספוט
            if (spot.strategy_risk_percent && spot.strategy_hedges_count) {
                const setups = calculateHedgeStrategy(
                    spot.entry,
                    spot.tp,
                    spot.amount,
                    spot.strategy_risk_percent,
                    spot.strategy_hedges_count
                );
                
                const setupToApply = setups[spot.shorts.length]; 
                
                if (setupToApply) {
                    initialData.entry = setupToApply.entry.toString();
                    initialData.tp = setupToApply.tp.toString();
                    initialData.sl = setupToApply.sl.toString();
                    initialData.amount = setupToApply.coinAmount.toString();
                    initialData.risk = setupToApply.riskAmount.toString();
                    
                    strategyState.isActive = true;
                    strategyState.hedgesCount = spot.strategy_hedges_count;
                    strategyState.riskPercent = spot.strategy_risk_percent;
                    strategyState.calculatedSetups = setups;
                }
            }
        }

        if (mode === 'edit') {
            if (parentIdx !== null && childIdx === null) {
                const p = portfolio[coin][parentIdx];
                initialData = { ...initialData, entry: p.entry.toString(), amount: p.amount.toString(), tp: p.tp.toString(), sl: p.sl.toString(), risk: p.risk.toString(), currency: p.currency };
            } else if (parentIdx !== null && childIdx !== null) {
                const s = portfolio[coin][parentIdx].shorts[childIdx];
                initialData = { ...initialData, entry: s.entry.toString(), amount: s.amount.toString(), tp: s.tp.toString(), sl: s.sl.toString(), risk: s.risk.toString(), currency: s.currency };
            }
        }

        setModal({
            isOpen: true,
            mode,
            coin,
            parentIdx,
            childIdx,
            data: initialData,
            strategy: strategyState,
            createAlerts: false
        });
    };

    const savePosition = async () => {
        if (!user) return;

        const { coin, parentIdx, childIdx, mode, data, strategy, createAlerts } = modal;
        const entry = parseFloat(data.entry);
        const amount = parseFloat(data.amount);

        if (!entry || !amount) {
            alert("נא למלא מחיר וכמות");
            return;
        }

        const tpVal = parseFloat(data.tp) || 0;
        const slVal = parseFloat(data.sl) || 0;

        const dbPayload: any = {
            symbol: coin,
            entry: entry,
            amount: amount,
            tp: tpVal,
            sl: slVal,
            risk: parseFloat(data.risk) || 0,
            currency: data.currency,
            trade_date: data.date,
            trade_time: data.time,
            user_id: user.id
        };

        try {
            let savedRecord: any = null;

            if (mode === 'add') {
                if (parentIdx === null) {
                    dbPayload.parent_id = null;
                    const { data: inserted, error } = await supabase.from('positions').insert([dbPayload]).select();
                    if (error) throw error;
                    savedRecord = inserted[0];
                } else {
                    const parentSpot = portfolio[coin][parentIdx];
                    if (!parentSpot?.id) throw new Error("Parent ID not found");
                    dbPayload.parent_id = parentSpot.id;
                    
                    if (strategy.isActive && (parentSpot.shorts.length === 0 || strategy.currentHedgeIndex === 1)) {
                        await supabase.from('positions').update({
                            strategy_hedges_count: strategy.hedgesCount,
                            strategy_risk_percent: strategy.riskPercent
                        }).eq('id', parentSpot.id);
                    }

                    const { data: inserted, error } = await supabase.from('positions').insert([dbPayload]).select();
                    if (error) throw error;
                    savedRecord = inserted[0];
                }

            } else {
                let idToUpdate = '';
                if (childIdx === null && parentIdx !== null) idToUpdate = portfolio[coin][parentIdx].id;
                else if (parentIdx !== null && childIdx !== null) idToUpdate = portfolio[coin][parentIdx].shorts[childIdx].id;
                const { data: updated, error } = await supabase.from('positions').update(dbPayload).eq('id', idToUpdate).select();
                if (error) throw error;
                savedRecord = updated[0];
            }

            if (createAlerts && savedRecord) {
                const alertsToCreate = [];

                if (parentIdx === null) {
                    if (tpVal > 0) alertsToCreate.push({ coin, target_price: tpVal, condition: 'above', note: `Spot ${coin} TP Hit - Close All`, user_id: user.id });
                    if (slVal > 0) alertsToCreate.push({ coin, target_price: slVal, condition: 'below', note: `Spot ${coin} SL Hit`, user_id: user.id });
                } else {
                    if (tpVal > 0) alertsToCreate.push({ 
                        coin, target_price: tpVal, condition: 'below', 
                        note: `Hedge ${strategy.currentHedgeIndex} (${coin}) TP`, user_id: user.id 
                    });
                    if (slVal > 0) alertsToCreate.push({ 
                        coin, target_price: slVal, condition: 'above', 
                        note: `Hedge ${strategy.currentHedgeIndex} (${coin}) SL`, user_id: user.id 
                    });

                    if (strategy.calculatedSetups && strategy.calculatedSetups.length > 0) {
                        const nextSetup = strategy.calculatedSetups.find(s => s.index === strategy.currentHedgeIndex + 1);
                        
                        if (nextSetup) {
                            alertsToCreate.push({
                                coin: coin,
                                target_price: nextSetup.entry,
                                condition: 'above',
                                note: `⚠️ ENTER HEDGE ${nextSetup.index} NOW! ($${nextSetup.entry})`,
                                user_id: user.id
                            });
                        }
                    }
                }

                if (alertsToCreate.length > 0) {
                    await supabase.from('alerts').insert(alertsToCreate);
                    // עדכון טריגר לרענון התראות בזמן אמת
                    setRefreshTrigger(prev => prev + 1);
                }
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
                            {/* --- שורת השקעה וסיכון (חדש) --- */}
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

            {modal.isOpen && (
                <>
                    <div className="modal-overlay" onClick={() => setModal({ ...modal, isOpen: false })}></div>
                    <div className="glass-panel modal-content" style={{width: 420}}>
                        <h3 style={{ textAlign: 'center', marginBottom: 20 }}>
                            {modal.mode === 'add'
                                ? (modal.parentIdx === null ? `הוספת ספוט ${modal.coin}` : `הוספת גידור (Hedge ${modal.strategy.currentHedgeIndex})`)
                                : 'עריכת פוזיציה'
                            }
                        </h3>

                        {modal.mode === 'add' && modal.parentIdx !== null && modal.strategy.currentHedgeIndex === 1 && (
                            <div style={{marginBottom: 20, padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 10}}>
                                <div style={{fontSize:'0.85rem', marginBottom: 8, textAlign:'center'}}>בחר אסטרטגיה (תחול על כל הגידורים):</div>
                                <div style={{display:'flex', justifyContent:'center', gap:5, marginBottom:10}}>
                                    {[2,3,4].map(num => (
                                        <button 
                                            key={num}
                                            onClick={() => setModal(prev => ({...prev, strategy: {...prev.strategy, hedgesCount: num}}))}
                                            style={{
                                                background: modal.strategy.hedgesCount === num ? '#00b894' : '#333',
                                                border: 'none', borderRadius: 4, padding: '4px 10px', color: 'white', cursor:'pointer', fontSize: '0.8rem'
                                            }}
                                        >
                                            {num} גידורים
                                        </button>
                                    ))}
                                </div>
                                <div style={{display:'flex', gap: 5, justifyContent: 'center'}}>
                                    {[25, 50, 75, 100].map(pct => (
                                        <button 
                                            key={pct}
                                            onClick={() => applyHedgeStrategy(pct)}
                                            className="btn-action"
                                            style={{
                                                background: modal.strategy.riskPercent === pct ? '#6c5ce7' : 'rgba(255,255,255,0.1)',
                                                fontSize: '0.8rem', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)', width: 'auto'
                                            }}
                                        >
                                            {pct}% סיכון
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10 }}>
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
                                <label>TP (יעד)</label>
                                <input type="number" className="glass-input" value={modal.data.tp} onChange={e => handleModalInput('tp', e.target.value)} />
                            </div>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>SL (סטופ)</label>
                                <input type="number" className="glass-input" value={modal.data.sl} onChange={e => handleModalInput('sl', e.target.value)} />
                            </div>
                        </div>

                        {/* תצוגת רווח/הפסד פוטנציאלי */}
                        <div style={{
                            display:'flex', justifyContent:'space-around', alignItems:'center', 
                            marginBottom:12, padding:10, borderRadius:8, 
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <div style={{textAlign:'center'}}>
                                <div style={{fontSize:'0.75rem', opacity:0.8, marginBottom:2}}>הפסד פוטנציאלי (Risk)</div>
                                <div style={{color:'#ff7675', fontWeight:'bold', fontFamily:'monospace', fontSize:'1rem'}}>
                                    -${modalRisk.toLocaleString(undefined, {maximumFractionDigits:2})}
                                </div>
                            </div>
                            <div style={{width:1, height:30, background:'rgba(255,255,255,0.2)'}}></div>
                            <div style={{textAlign:'center'}}>
                                <div style={{fontSize:'0.75rem', opacity:0.8, marginBottom:2}}>רווח פוטנציאלי (Reward)</div>
                                <div style={{color:'#00b894', fontWeight:'bold', fontFamily:'monospace', fontSize:'1rem'}}>
                                    +${modalProfit.toLocaleString(undefined, {maximumFractionDigits:2})}
                                </div>
                            </div>
                        </div>

                        {/* --- שינוי: טבלת 3 עמודות עם שדה סיכון --- */}
                        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:10}}>
                             <div className="investment-highlight">
                                <span style={{fontSize:'0.7rem', opacity:0.7}}>סכום סיכון ($)</span>
                                <input type="number" className="glass-input" style={{textAlign:'center', fontSize:'1rem', padding:5}} value={modal.data.risk} onChange={e => handleModalInput('risk', e.target.value)} />
                             </div>
                             <div className="investment-highlight">
                                <span style={{fontSize:'0.7rem', opacity:0.7}}>כמות (Coins)</span>
                                <input type="number" className="glass-input" style={{textAlign:'center', fontSize:'1rem', padding:5}} value={modal.data.amount} onChange={e => handleModalInput('amount', e.target.value)} />
                             </div>
                             <div className="investment-highlight">
                                <span style={{fontSize:'0.7rem', opacity:0.7}}>השקעה ($)</span>
                                <div className="investment-val" style={{fontSize:'1rem'}}>${modalInvest.toFixed(2)}</div>
                             </div>
                        </div>

                        <div style={{marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8}} onClick={() => setModal(prev => ({...prev, createAlerts: !prev.createAlerts}))}>
                            <div style={{
                                width: 20, height: 20, borderRadius: 4, 
                                border: '2px solid #00b894', 
                                background: modal.createAlerts ? '#00b894' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {modal.createAlerts && <span style={{color:'white', fontWeight:'bold', fontSize:'0.8rem'}}>✓</span>}
                            </div>
                            <span style={{fontSize: '0.9rem'}}>🔔 צור התראות אוטומטיות</span>
                        </div>
                        
                        {modal.createAlerts && modal.mode === 'add' && (
                            <div style={{textAlign:'center', fontSize:'0.75rem', color:'#00b894', marginTop:4, opacity: 0.8}}>
                                {modal.parentIdx === null 
                                    ? "ייווצרו התראות TP ו-SL לספוט"
                                    : `ייווצרו התראות לגידור ${modal.strategy.currentHedgeIndex}` + (modal.strategy.calculatedSetups.length > modal.strategy.currentHedgeIndex ? ` + כוננות לגידור הבא` : "")
                                }
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                            <button onClick={savePosition} className="btn-action btn-add-spot" style={{ flex: 1 }}>
                                {modal.mode === 'add' ? 'שמור וצור' : 'עדכן'}
                            </button>
                            <button onClick={() => setModal({ ...modal, isOpen: false })} className="btn-action" style={{ flex: 1, background: '#333', color: '#ccc' }}>ביטול</button>
                        </div>
                    </div>
                </>
            )}

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