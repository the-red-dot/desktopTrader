// tradewall\src\components\LiveTicker.tsx

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// טיפוסים
type Prices = {
    [key: string]: number;
};

export interface TickerItem {
    symbol: string;
    type: 'crypto' | 'stock';
    name: string;
}

interface LiveTickerProps {
    prices: Prices;
    onCoinClick: (coin: string) => void;
    userId: string | null;
    refreshTrigger: number;
    tickers: TickerItem[]; // מקבל את רשימת הטיקרים מהאבא
    onTickerUpdate?: () => void; // פונקציה לריענון הנתונים בדף האב
}

interface Alert {
    id: string;
    coin: string;
    target_price: number;
    condition: 'above' | 'below';
    note?: string;
    user_id?: string;
}

// קבועים
const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";

// רשימת נכסים פופולריים לחיפוש מהיר
const POPULAR_ASSETS = [
    // Crypto
    { symbol: 'BTC', name: 'Bitcoin', type: 'crypto' },
    { symbol: 'ETH', name: 'Ethereum', type: 'crypto' },
    { symbol: 'BNB', name: 'Binance Coin', type: 'crypto' },
    { symbol: 'SOL', name: 'Solana', type: 'crypto' },
    { symbol: 'XRP', name: 'Ripple', type: 'crypto' },
    { symbol: 'ADA', name: 'Cardano', type: 'crypto' },
    { symbol: 'DOGE', name: 'Dogecoin', type: 'crypto' },
    { symbol: 'LINK', name: 'Chainlink', type: 'crypto' },
    { symbol: 'LTC', name: 'Litecoin', type: 'crypto' },
    { symbol: 'LUNC', name: 'Terra Classic', type: 'crypto' },
    // Stocks
    { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock' },
    { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock' },
    { symbol: 'NVDA', name: 'NVIDIA Corp.', type: 'stock' },
    { symbol: 'MSFT', name: 'Microsoft', type: 'stock' },
    { symbol: 'GOOGL', name: 'Alphabet Inc.', type: 'stock' },
    { symbol: 'AMZN', name: 'Amazon.com', type: 'stock' },
    { symbol: 'META', name: 'Meta Platforms', type: 'stock' },
    { symbol: 'NFLX', name: 'Netflix', type: 'stock' },
    { symbol: 'AMD', name: 'Advanced Micro Devices', type: 'stock' },
    { symbol: 'COIN', name: 'Coinbase Global', type: 'stock' },
];

// צבעים
const COIN_COLORS: { [key: string]: string } = {
    BTC: '#F7931A', ETH: '#627EEA', BNB: '#F3BA2F', SOL: '#14F195',
    AAPL: '#A2AAAD', TSLA: '#CC0000', NVDA: '#76B900' // צבעי מניות לדוגמה
};

// --- פונקציית עזר לפורמט מחיר חכם ---
const formatPrice = (price: number) => {
    if (!price && price !== 0) return 'Loading...';
    if (price === 0) return '0.00';
    
    // למטבעות "זולים" מאוד כמו LUNC (למשל 0.000036)
    if (price < 0.0001) return price.toFixed(8);
    // למטבעות זולים (מתחת לדולר)
    if (price < 1) return price.toFixed(6);
    // למטבעות קטנים (1-10 דולר)
    if (price < 10) return price.toFixed(4);
    
    // רגיל (2 ספרות אחרי הנקודה)
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// --- רכיב בחירה מותאם אישית ---
interface CustomSelectProps {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
}

const CustomDropdown = ({ value, options, onChange }: CustomSelectProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedLabel = options.find(o => o.value === value)?.label || value;

    return (
        <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
            <div 
                className="glass-input"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '10px', cursor: 'pointer', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.9rem', userSelect: 'none'
                }}
            >
                <span>{selectedLabel}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>▼</span>
            </div>
            {isOpen && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, width: '100%',
                    background: '#1a1a2e', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px', zIndex: 1000, boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
                    maxHeight: '200px', overflowY: 'auto'
                }}>
                    {options.map((option) => (
                        <div
                            key={option.value}
                            onClick={() => { onChange(option.value); setIsOpen(false); }}
                            style={{
                                padding: '10px 12px', cursor: 'pointer', fontSize: '0.9rem',
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                background: value === option.value ? 'rgba(255,255,255,0.1)' : 'transparent',
                                color: 'white'
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.15)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = value === option.value ? 'rgba(255,255,255,0.1)' : 'transparent')}
                        >
                            {option.label}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- רכיב סטטוס שוק ---
const MarketStatus = () => {
    const [isOpen, setIsOpen] = useState(false);
    
    useEffect(() => {
        const checkMarket = () => {
            const now = new Date();
            const nyTime = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
            const day = nyTime.getDay(); 
            const hour = nyTime.getHours();
            const minute = nyTime.getMinutes();
            const timeInMinutes = hour * 60 + minute;

            const marketOpen = 9 * 60 + 30;
            const marketClose = 16 * 60;
            const isWeekday = day >= 1 && day <= 5;

            const isOpenNow = isWeekday && timeInMinutes >= marketOpen && timeInMinutes < marketClose;
            setIsOpen(isOpenNow);
        };

        checkMarket();
        const interval = setInterval(checkMarket, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            fontSize: '0.8rem', padding: '8px', background: 'rgba(0,0,0,0.2)',
            borderRadius: '8px', marginBottom: '10px', textAlign: 'center',
            border: `1px solid ${isOpen ? 'rgba(0,255,136,0.3)' : 'rgba(255,77,77,0.3)'}`
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>שוק המניות (NY):</span>
                <span style={{ fontWeight: 'bold', color: isOpen ? '#00ff88' : '#ff4d4d' }}>
                    {isOpen ? 'פתוח 🟢' : 'סגור 🔴'}
                </span>
            </div>
            <div style={{ fontSize: '0.7rem', opacity: 0.6, marginTop: 4 }}>
                שעות מסחר: 16:30 - 23:00 (שעון ישראל)
            </div>
        </div>
    );
};

export default function LiveTicker({ prices, onCoinClick, userId, refreshTrigger, tickers, onTickerUpdate }: LiveTickerProps) {
    const [activeTab, setActiveTab] = useState<'market' | 'alerts'>('market');
    
    // ניהול התראות
    const [alerts, setAlerts] = useState<Alert[]>([]);
    
    // טופס הוספת התראה
    const [newAlertCoin, setNewAlertCoin] = useState('');
    const [newAlertPrice, setNewAlertPrice] = useState('');
    const [newAlertCondition, setNewAlertCondition] = useState<'above' | 'below'>('above');
    const [newAlertNote, setNewAlertNote] = useState(''); 

    // ניהול חיפוש והוספת טיקרים
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchType, setSearchType] = useState<'crypto' | 'stock'>('crypto');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // הגדרת ברירת מחדל לקוין
    useEffect(() => {
        if (tickers && tickers.length > 0 && !newAlertCoin) {
            setNewAlertCoin(tickers[0].symbol);
        }
    }, [tickers, newAlertCoin]);

    // חלוקה לקטגוריות
    const cryptoList = tickers ? tickers.filter(t => t.type === 'crypto') : [];
    const stockList = tickers ? tickers.filter(t => t.type === 'stock') : [];

    // טעינת התראות מה-DB
    useEffect(() => {
        if (userId) {
            fetchAlerts();
        } else {
            setAlerts([]);
        }
    }, [userId, refreshTrigger]);

    const fetchAlerts = async () => {
        let query = supabase
            .from('alerts')
            .select('*')
            .order('created_at', { ascending: false });

        if (userId) {
            query = query.eq('user_id', userId);
        } else {
            query = query.is('user_id', null);
        }

        const { data, error } = await query;
        if (!error && data) setAlerts(data as Alert[]);
    };

    // בדיקת התראות
    useEffect(() => {
        if (alerts.length === 0) return;
        const triggeredAlertIds: string[] = [];

        alerts.forEach(alert => {
            const currentPrice = prices[alert.coin];
            if (!currentPrice) return;

            let triggered = false;
            if (alert.condition === 'above' && currentPrice >= alert.target_price) triggered = true;
            else if (alert.condition === 'below' && currentPrice <= alert.target_price) triggered = true;

            if (triggered) {
                sendNotification(alert, currentPrice);
                triggeredAlertIds.push(alert.id);
            }
        });

        if (triggeredAlertIds.length > 0) removeTriggeredAlerts(triggeredAlertIds);
    }, [prices, alerts]);

    const removeTriggeredAlerts = async (ids: string[]) => {
        setAlerts(prev => prev.filter(a => !ids.includes(a.id)));
        await supabase.from('alerts').delete().in('id', ids);
    };

    const sendNotification = async (alert: Alert, currentPrice: number) => {
        const direction = alert.condition === 'above' ? 'עלה מעל' : 'ירד מתחת ל';
        let message = `${alert.coin} הגיע למחיר $${currentPrice}! (יעד: ${direction} $${alert.target_price})`;
        if (alert.note) message += `\nהערה: ${alert.note}`;
        
        try {
            // --- התראות Pushover מושהות זמנית ---
            /*
            await fetch('/api/pushover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'TradeWall Alert 🚀', message })
            });
            */

            // --- שליחת התראה לטלגרם במקום ---
            await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'TradeWall Alert 🚀', message })
            });
        } catch (err) { console.error('Notification failed', err); }
    };

    // --- לוגיקת הוספה/מחיקה של טיקרים ---

    const fetchStockName = async (symbol: string): Promise<string> => {
        if (!FINNHUB_API_KEY) return symbol;
        try {
            // חיפוש הסימול ב-Finnhub כדי לקבל את השם המלא (Description)
            const res = await fetch(`https://finnhub.io/api/v1/search?q=${symbol}&token=${FINNHUB_API_KEY}`);
            if (!res.ok) return symbol;
            
            const data = await res.json();
            // מציאת התאמה מדויקת לסימול
            if (data.result && data.result.length > 0) {
                const match = data.result.find((r: any) => r.symbol === symbol) || data.result[0];
                return match.description || match.symbol || symbol;
            }
            return symbol;
        } catch (e) {
            console.error("Failed to fetch stock name:", e);
            return symbol;
        }
    };

    const handleAddTicker = async (item: { symbol: string, name: string }) => {
        if (!userId) return alert('נא להתחבר כדי לערוך את הרשימה');
        
        setIsAdding(true);
        const symbol = item.symbol.toUpperCase();
        let nameToSave = item.name;

        // אם זו הוספה ידנית (השם זהה לסימול) וזו מניה, ננסה למשוך שם מלא
        if (searchType === 'stock' && nameToSave === symbol) {
            nameToSave = await fetchStockName(symbol);
        }
        
        const { error } = await supabase.from('tickers').insert([{
            user_id: userId,
            symbol: symbol,
            type: searchType,
            name: nameToSave
        }]);

        setIsAdding(false);

        if (error) {
            if (error.code === '23505') alert('מטבע/מניה זו כבר קיימת ברשימה שלך');
            else alert('שגיאה בהוספה: ' + error.message);
        } else {
            setIsSearchOpen(false);
            setSearchQuery('');
            // עדכון מיידי של דף האב
            if (onTickerUpdate) onTickerUpdate(); 
        }
    };

    const handleRemoveTicker = async (e: React.MouseEvent, symbol: string) => {
        e.stopPropagation(); // למנוע לחיצה על הכרטיס שבוחרת אותו
        if (!userId) return;
        if (!confirm(`האם להסיר את ${symbol} מהרשימה?`)) return;

        const { error } = await supabase.from('tickers').delete().eq('user_id', userId).eq('symbol', symbol);
        
        if (error) {
            alert('שגיאה במחיקה: ' + error.message);
        } else {
            // עדכון מיידי של דף האב
            if (onTickerUpdate) onTickerUpdate();
        }
    };

    const addAlert = async () => {
        if (!userId) return alert("עליך להתחבר כדי להוסיף התראות");
        if (!newAlertPrice) return;
        const price = parseFloat(newAlertPrice);
        if (isNaN(price)) return;

        const { data, error } = await supabase.from('alerts').insert([{
            coin: newAlertCoin, target_price: price, condition: newAlertCondition, note: newAlertNote, user_id: userId
        }]).select();

        if (error) alert('שגיאה: ' + error.message);
        else if (data) {
            setAlerts(prev => [data[0] as Alert, ...prev]);
            setNewAlertPrice(''); setNewAlertNote('');
        }
    };

    const removeAlert = async (id: string) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
        await supabase.from('alerts').delete().eq('id', id);
    };

    // סינון תוצאות חיפוש
    const filteredAssets = POPULAR_ASSETS
        .filter(a => a.type === searchType)
        .filter(a => 
            a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
            a.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

    // רכיב עזר להצגת רשימה (מעודכן עם כפתור מחיקה)
    const renderList = (items: TickerItem[]) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {items.map(item => (
                <div key={item.symbol} className="coin-card" onClick={() => onCoinClick(item.symbol)} style={{ cursor: 'pointer', position: 'relative' }}>
                    <div className="coin-info">
                        <h3>{item.symbol}</h3>
                        <span>{item.name}</span>
                    </div>
                    <div className="coin-price">
                        <div className="price-val" style={{ color: (prices[item.symbol] || 0) > 0 ? '#00ff88' : 'white' }}>
                            {prices[item.symbol] ? `$${formatPrice(prices[item.symbol])}` : 'Loading...'}
                        </div>
                    </div>
                    
                    {/* כפתור מחיקה */}
                    <button 
                        onClick={(e) => handleRemoveTicker(e, item.symbol)}
                        className="delete-ticker-btn"
                        style={{
                            position: 'absolute', top: 5, left: 5, 
                            background: 'transparent', border: 'none', 
                            color: '#ff7675', opacity: 0.5, cursor: 'pointer', fontSize: '1.1rem'
                        }}
                        title="הסר מהרשימה"
                    >
                        🗑
                    </button>
                </div>
            ))}
        </div>
    );

    return (
        <div className="glass-panel ticker-col" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', position: 'relative' }}>
            {/* כותרת וטאבים */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginBottom: 15, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' }}>
                <button onClick={() => setActiveTab('market')} style={{ background: activeTab === 'market' ? 'rgba(255,255,255,0.2)' : 'transparent', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>שוק</button>
                <button onClick={() => setActiveTab('alerts')} style={{ background: activeTab === 'alerts' ? 'rgba(255,255,255,0.2)' : 'transparent', border: 'none', color: 'white', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>התראות 🔔</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', paddingLeft: '4px' }}>
                {activeTab === 'market' && (
                    <>
                        {/* קריפטו */}
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '2px solid #a29bfe', paddingBottom: 5 }}>
                                <h4 style={{ color: '#a29bfe', margin: 0, fontSize: '0.9rem' }}>קריפטו (Crypto)</h4>
                                <button 
                                    onClick={() => { setSearchType('crypto'); setIsSearchOpen(true); }}
                                    style={{ background: 'rgba(162, 155, 254, 0.2)', color: '#a29bfe', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >+</button>
                            </div>
                            {renderList(cryptoList)}
                        </div>

                        {/* מניות */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, borderBottom: '2px solid #ff7675', paddingBottom: 5 }}>
                                <h4 style={{ color: '#ff7675', margin: 0, fontSize: '0.9rem' }}>מניות (Stocks)</h4>
                                <button 
                                    onClick={() => { setSearchType('stock'); setIsSearchOpen(true); }}
                                    style={{ background: 'rgba(255, 118, 117, 0.2)', color: '#ff7675', border: 'none', borderRadius: '50%', width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >+</button>
                            </div>
                            <MarketStatus />
                            {renderList(stockList)}
                        </div>
                    </>
                )}

                {/* טאב התראות - ללא שינוי */}
                {activeTab === 'alerts' && (
                    <div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 12, marginBottom: 15, border: '1px solid rgba(255,255,255,0.1)' }}>
                            <h4 style={{ marginBottom: 10, textAlign: 'center', fontSize: '0.95rem' }}>הוסף התראה לנייד</h4>
                            <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                                <CustomDropdown value={newAlertCoin} options={tickers.map(c => ({ value: c.symbol, label: c.symbol }))} onChange={setNewAlertCoin} />
                                <CustomDropdown value={newAlertCondition} options={[{ value: 'above', label: 'מעל' }, { value: 'below', label: 'מתחת' }]} onChange={(v) => setNewAlertCondition(v as any)} />
                            </div>
                            <input type="number" placeholder="מחיר יעד ($)" value={newAlertPrice} onChange={e => setNewAlertPrice(e.target.value)} className="glass-input" style={{ padding: 12, marginBottom: 8, fontSize: '0.9rem' }} />
                            <input type="text" placeholder="הערה" value={newAlertNote} onChange={e => setNewAlertNote(e.target.value)} className="glass-input" style={{ padding: 12, marginBottom: 10, fontSize: '0.9rem' }} />
                            <button onClick={addAlert} className="btn-action" style={{ background: '#6c5ce7', marginTop: 0, padding: 8, fontSize: '0.9rem' }}>+ צור ושמור</button>
                        </div>
                        <h4 style={{ marginBottom: 10, opacity: 0.8, fontSize: '0.9rem' }}>התראות פעילות ({alerts.length})</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {alerts.map(alert => (
                                <div key={alert.id} style={{
                                    background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8,
                                    borderLeft: `4px solid ${COIN_COLORS[alert.coin] || '#888'}`,
                                    display: 'flex', flexDirection: 'column', gap: 4,
                                    borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                        <div style={{ fontSize: '0.85rem' }}>
                                            <span style={{ fontWeight: 'bold' }}>{alert.coin}</span>
                                            <span style={{ opacity: 0.9, color: alert.condition === 'above' ? '#00b894' : '#ff7675' }}>
                                                {' '}{alert.condition === 'above' ? 'מעל' : 'מתחת'} ${alert.target_price}
                                            </span>
                                        </div>
                                        <button onClick={() => removeAlert(alert.id)} style={{ background: 'transparent', border: 'none', color: '#ff7675', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' }}>×</button>
                                    </div>
                                    {alert.note && <div style={{ fontSize: '0.75rem', opacity: 0.6, fontStyle: 'italic' }}>"{alert.note}"</div>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* --- מודאל חיפוש והוספה --- */}
            {isSearchOpen && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(16, 18, 27, 0.95)', backdropFilter: 'blur(10px)',
                    zIndex: 2000, padding: 20, display: 'flex', flexDirection: 'column', borderRadius: 24
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 15 }}>
                        <h3 style={{ margin: 0 }}>הוסף {searchType === 'crypto' ? 'קריפטו' : 'מניה'}</h3>
                        <button onClick={() => setIsSearchOpen(false)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                    </div>
                    
                    <input 
                        type="text" 
                        placeholder="חפש סימול (למשל: BTC, AAPL)..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="glass-input"
                        autoFocus
                        style={{ padding: 12, marginBottom: 15 }}
                    />

                    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {/* הצגת תוצאות מהרשימה הפופולרית */}
                        {filteredAssets.map(asset => (
                            <div 
                                key={asset.symbol} 
                                onClick={() => handleAddTicker(asset)}
                                style={{
                                    padding: '12px', background: 'rgba(255,255,255,0.05)', 
                                    borderRadius: 12, cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                                    border: '1px solid rgba(255,255,255,0.05)'
                                }}
                            >
                                <span style={{ fontWeight: 'bold' }}>{asset.symbol}</span>
                                <span style={{ opacity: 0.7, fontSize: '0.9rem' }}>{asset.name}</span>
                            </div>
                        ))}

                        {/* אופציה להוספה ידנית אם לא נמצא ברשימה הפופולרית */}
                        {searchQuery.length > 0 && !filteredAssets.find(a => a.symbol === searchQuery.toUpperCase()) && (
                            <div 
                                onClick={() => handleAddTicker({ symbol: searchQuery.toUpperCase(), name: searchQuery.toUpperCase() })}
                                style={{
                                    padding: '12px', background: 'rgba(108, 92, 231, 0.2)', 
                                    borderRadius: 12, cursor: 'pointer', textAlign: 'center',
                                    border: '1px solid #6c5ce7', marginTop: 10
                                }}
                            >
                                {isAdding 
                                    ? <span>מחפש שם ומוסיף...</span>
                                    : <span>+ הוסף <strong>{searchQuery.toUpperCase()}</strong> כ-{searchType === 'crypto' ? 'קריפטו' : 'מניה'}</span>
                                }
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}