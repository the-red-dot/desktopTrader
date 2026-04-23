// src/components/LiveTicker.tsx

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calculateRSI } from '../app/utils/indicators';

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
    target_price?: number; 
    condition: 'above' | 'below' | 'rsi_bounds';
    note?: string;
    user_id?: string;
    alert_type: 'price' | 'rsi';
    timeframe?: string;
    rsi_length?: number;
    overbought?: number;
    oversold?: number;
}

// קבועים
const FINNHUB_API_KEY = process.env.NEXT_PUBLIC_FINNHUB_API_KEY || "";
const TWELVEDATA_API_KEY = process.env.NEXT_PUBLIC_TWELVEDATA_API_KEY || "cd89afd64e59460d948bec4d847515a1"; // הוספת מפתח ה-API של Twelve Data

const POPULAR_ASSETS = [
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

const COIN_COLORS: { [key: string]: string } = {
    BTC: '#F7931A', ETH: '#627EEA', BNB: '#F3BA2F', SOL: '#14F195',
    AAPL: '#A2AAAD', TSLA: '#CC0000', NVDA: '#76B900'
};

const formatPrice = (price: number) => {
    if (!price && price !== 0) return 'Loading...';
    if (price === 0) return '0.00';
    if (price < 0.0001) return price.toFixed(8);
    if (price < 1) return price.toFixed(6);
    if (price < 10) return price.toFixed(4);
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

interface CustomSelectProps {
    value: string;
    options: { value: string; label: string }[];
    onChange: (value: string) => void;
    disabled?: boolean;
}

const CustomDropdown = ({ value, options, onChange, disabled }: CustomSelectProps) => {
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
        <div ref={containerRef} style={{ position: 'relative', flex: 1, opacity: disabled ? 0.5 : 1 }}>
            <div 
                className="glass-input"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{
                    padding: '10px', cursor: disabled ? 'not-allowed' : 'pointer', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.9rem', userSelect: 'none'
                }}
            >
                <span>{selectedLabel}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: '0.2s' }}>▼</span>
            </div>
            {isOpen && !disabled && (
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
    
    const [alerts, setAlerts] = useState<Alert[]>([]);
    
    const [alertType, setAlertType] = useState<'price' | 'rsi'>('price');
    const [newAlertCoin, setNewAlertCoin] = useState('');
    const [newAlertNote, setNewAlertNote] = useState(''); 
    
    const [newAlertPrice, setNewAlertPrice] = useState('');
    const [newAlertCondition, setNewAlertCondition] = useState<'above' | 'below'>('above');
    
    const [rsiTimeframe, setRsiTimeframe] = useState('1h');
    const [rsiLength, setRsiLength] = useState('14');
    const [rsiOverbought, setRsiOverbought] = useState('70');
    const [rsiOversold, setRsiOversold] = useState('30');
    const [isPersistentRsi, setIsPersistentRsi] = useState(false); // דגל חדש להתראה קבועה

    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchType, setSearchType] = useState<'crypto' | 'stock'>('crypto');
    const [searchQuery, setSearchQuery] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const [currentRsiValues, setCurrentRsiValues] = useState<Record<string, number>>({});
    
    // זיכרון למניעת הפצצת התראות קבועות (מזהה התראה -> תאריך אחרון שבו הופעלה)
    const rsiAlertsCooldown = useRef<Record<string, number>>({});

    useEffect(() => {
        if (tickers && tickers.length > 0 && !newAlertCoin) {
            setNewAlertCoin(tickers[0].symbol);
        }
    }, [tickers, newAlertCoin]);

    const cryptoList = tickers ? tickers.filter(t => t.type === 'crypto') : [];
    const stockList = tickers ? tickers.filter(t => t.type === 'stock') : [];

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

    // --- לוגיקת בדיקת התראות RSI מול Binance API ו-Twelve Data API למניות ---
    useEffect(() => {
        const rsiAlerts = alerts.filter(a => a.alert_type === 'rsi');
        if (rsiAlerts.length === 0) return;

        const checkRsiAlerts = async () => {
            const triggeredAlertIds: string[] = [];
            const rsiUpdates: Record<string, number> = {};
            const now = Date.now();

            const groupedRequests: Record<string, { type: 'crypto' | 'stock', symbol: string, tf: string, alerts: Alert[] }> = {};
            
            rsiAlerts.forEach(alert => {
                // זיהוי חכם: נחפש גם ב-tickers וגם ב-POPULAR_ASSETS כגיבוי, עם טיפוס מפורש
                const ticker = tickers.find(t => t.symbol.toUpperCase() === alert.coin.toUpperCase());
                const type = (ticker ? ticker.type : (POPULAR_ASSETS.find(p => p.symbol.toUpperCase() === alert.coin.toUpperCase())?.type || 'crypto')) as 'crypto' | 'stock';
                
                const symbol = type === 'crypto' ? `${alert.coin.toUpperCase()}USDT` : alert.coin.toUpperCase();
                const tf = alert.timeframe || '1h';
                const key = `${type}_${symbol}_${tf}`;
                
                if (!groupedRequests[key]) {
                    groupedRequests[key] = { type, symbol, tf, alerts: [] };
                }
                groupedRequests[key].alerts.push(alert);
            });

            for (const key of Object.keys(groupedRequests)) {
                const { type, symbol, tf, alerts: alertsGroup } = groupedRequests[key];
                
                try {
                    let closePrices: number[] = [];
                    let currentAssetPrice = 0;
                    
                    if (type === 'crypto') {
                        // משיכת 150 נרות מ-Binance לקריפטו
                        const limit = 150; 
                        const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${tf}&limit=${limit}`);
                        if (!response.ok) continue;
                        
                        const data = await response.json();
                        closePrices = data.map((d: any[]) => parseFloat(d[4]));
                    } else {
                        // Twelve Data API למניות בלבד
                        if (!TWELVEDATA_API_KEY) {
                            console.warn("Missing Twelve Data API Key");
                            continue;
                        }
                        
                        // התאמת חותמות הזמן של המערכת לאלו של Twelve Data
                        const tfMap: Record<string, string> = {
                            '5m': '5min',
                            '15m': '15min',
                            '1h': '1h',
                            '4h': '4h',
                            '1d': '1day'
                        };
                        const res = tfMap[tf] || '1h';
                        
                        const url = `https://api.twelvedata.com/time_series?symbol=${symbol}&interval=${res}&outputsize=150&apikey=${TWELVEDATA_API_KEY}`;
                        const response = await fetch(url);
                        
                        if (!response.ok) {
                            console.warn(`Twelve Data API error for ${symbol}: ${response.status}`);
                            continue;
                        }
                        
                        const data = await response.json();
                        
                        if (data.status === "error" || !data.values || data.values.length === 0) {
                            console.warn(`Twelve Data no data for ${symbol}:`, data.message);
                            continue;
                        }
                        
                        // הנתונים מ-Twelve Data מגיעים מסודרים מהחדש לישן, יש להפוך אותם עבור ה-RSI
                        closePrices = data.values.map((item: any) => parseFloat(item.close)).reverse();
                    }

                    if (closePrices.length === 0) continue;
                    currentAssetPrice = closePrices[closePrices.length - 1];
                    
                    alertsGroup.forEach(alert => {
                        const length = alert.rsi_length || 14;
                        const rsiValues = calculateRSI(closePrices, length);
                        const currentRsi = rsiValues[rsiValues.length - 1];

                        // מבטיח שה-RSI תקין ומוצג ולא "NaN" או ריק
                        if (currentRsi !== null && currentRsi !== undefined && !isNaN(currentRsi)) {
                            rsiUpdates[`${alert.id}`] = currentRsi;

                            let triggeredCondition: 'overbought' | 'oversold' | null = null;
                            
                            if (currentRsi >= (alert.overbought || 70)) {
                                triggeredCondition = 'overbought';
                            } else if (currentRsi <= (alert.oversold || 30)) {
                                triggeredCondition = 'oversold';
                            }

                            if (triggeredCondition) {
                                const isPersistent = alert.note?.includes('[PERSISTENT]');
                                const lastTriggered = rsiAlertsCooldown.current[alert.id] || 0;
                                const cooldownPeriod = 60 * 60 * 1000; // שעה של קירור

                                // נתריע רק אם עברה שעה מאז הפעם האחרונה (או אם זו פעם ראשונה)
                                if (now - lastTriggered > cooldownPeriod) {
                                    sendRsiNotification(alert, currentRsi, currentAssetPrice, triggeredCondition);
                                    rsiAlertsCooldown.current[alert.id] = now;
                                    
                                    if (!isPersistent) {
                                        triggeredAlertIds.push(alert.id);
                                    }
                                }
                            }
                        }
                    });

                } catch (err) {
                    console.error(`Failed to fetch/calculate RSI for ${key}:`, err);
                }
            }

            setCurrentRsiValues(prev => ({...prev, ...rsiUpdates}));
            if (triggeredAlertIds.length > 0) removeTriggeredAlerts(triggeredAlertIds);
        };

        checkRsiAlerts();
        const intervalId = setInterval(checkRsiAlerts, 60000); 

        return () => clearInterval(intervalId);
    }, [alerts, tickers]);

    // בדיקת התראות מחיר
    useEffect(() => {
        const priceAlerts = alerts.filter(a => a.alert_type === 'price' || !a.alert_type); 
        if (priceAlerts.length === 0) return;
        
        const triggeredAlertIds: string[] = [];

        priceAlerts.forEach(alert => {
            const currentPrice = prices[alert.coin];
            if (!currentPrice || alert.target_price === undefined) return;

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
            await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'TradeWall Alert 🚀', message })
            });
        } catch (err) { console.error('Notification failed', err); }
    };

    const sendRsiNotification = async (alert: Alert, currentRsi: number, currentPrice: number, conditionTriggered: 'overbought' | 'oversold') => {
        let message = '';
        const cleanNote = alert.note?.replace('[PERSISTENT]', '').trim();
        const priceFormatted = formatPrice(currentPrice);
        
        if (conditionTriggered === 'oversold') {
            message = `${alert.coin} ירד ל-RSI של ${currentRsi.toFixed(1)} (גרף ${alert.timeframe}).\nנכנס לאזור Oversold 🟢.\nמחיר נוכחי: $${priceFormatted}\nאזור פוטנציאלי לקנייה/לונג.`;
        } else {
            message = `${alert.coin} טיפס ל-RSI של ${currentRsi.toFixed(1)} (גרף ${alert.timeframe}).\nנכנס לאזור Overbought 🔴.\nמחיר נוכחי: $${priceFormatted}\nאזור פוטנציאלי למכירה/שורט.`;
        }
        
        if (cleanNote) message += `\n\nהערה אישית: ${cleanNote}`;
        
        try {
            await fetch('/api/telegram', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'TradeWall RSI Alert 📊', message })
            });
        } catch (err) { console.error('Notification failed', err); }
    };

    const fetchStockName = async (symbol: string): Promise<string> => {
        if (!FINNHUB_API_KEY) return symbol;
        try {
            const res = await fetch(`https://finnhub.io/api/v1/search?q=${symbol}&token=${FINNHUB_API_KEY}`);
            if (!res.ok) return symbol;
            
            const data = await res.json();
            if (data.result && data.result.length > 0) {
                const match = data.result.find((r: any) => r.symbol === symbol) || data.result[0];
                return match.description || match.symbol || symbol;
            }
            return symbol;
        } catch (e) {
            return symbol;
        }
    };

    const handleAddTicker = async (item: { symbol: string, name: string }) => {
        if (!userId) return alert('נא להתחבר כדי לערוך את הרשימה');
        
        setIsAdding(true);
        const symbol = item.symbol.toUpperCase();
        let nameToSave = item.name;

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
            if (onTickerUpdate) onTickerUpdate(); 
        }
    };

    const handleRemoveTicker = async (e: React.MouseEvent, symbol: string) => {
        e.stopPropagation(); 
        if (!userId) return;
        if (!confirm(`האם להסיר את ${symbol} מהרשימה?`)) return;

        const { error } = await supabase.from('tickers').delete().eq('user_id', userId).eq('symbol', symbol);
        
        if (error) {
            alert('שגיאה במחיקה: ' + error.message);
        } else {
            if (onTickerUpdate) onTickerUpdate();
        }
    };

    const addAlert = async () => {
        if (!userId) return alert("עליך להתחבר כדי להוסיף התראות");

        let payload: any = {
            coin: newAlertCoin,
            alert_type: alertType,
            user_id: userId
        };

        if (alertType === 'price') {
            if (!newAlertPrice) return alert("נא להזין מחיר יעד");
            const price = parseFloat(newAlertPrice);
            if (isNaN(price)) return;
            payload.target_price = price;
            payload.condition = newAlertCondition;
            payload.note = newAlertNote;
        } else {
            const len = parseInt(rsiLength);
            const ob = parseFloat(rsiOverbought);
            const os = parseFloat(rsiOversold);

            if (isNaN(len) || isNaN(ob) || isNaN(os)) return alert("נא להזין ערכי RSI תקינים");

            payload.timeframe = rsiTimeframe;
            payload.rsi_length = len;
            payload.overbought = ob;
            payload.oversold = os;
            payload.condition = 'rsi_bounds'; 
            
            // תיוג כהתראה קבועה אם הוסמן
            payload.note = isPersistentRsi ? `[PERSISTENT]` : null;
        }

        const { data, error } = await supabase.from('alerts').insert([payload]).select();

        if (error) alert('שגיאה: ' + error.message);
        else if (data) {
            setAlerts(prev => [data[0] as Alert, ...prev]);
            if (alertType === 'price') setNewAlertPrice('');
            setNewAlertNote('');
            setIsPersistentRsi(false); // איפוס הטוגל
        }
    };

    const removeAlert = async (id: string) => {
        setAlerts(prev => prev.filter(a => a.id !== id));
        await supabase.from('alerts').delete().eq('id', id);
    };

    const filteredAssets = POPULAR_ASSETS
        .filter(a => a.type === searchType)
        .filter(a => 
            a.symbol.toLowerCase().includes(searchQuery.toLowerCase()) || 
            a.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

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

                {activeTab === 'alerts' && (
                    <div>
                        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px 12px', borderRadius: 12, marginBottom: 15, border: '1px solid rgba(255,255,255,0.1)' }}>
                            <h4 style={{ marginBottom: 15, textAlign: 'center', fontSize: '0.95rem' }}>הוסף התראה לנייד</h4>
                            
                            {/* בחירת סוג התראה */}
                            <div style={{ display: 'flex', gap: 5, marginBottom: 15, background: 'rgba(0,0,0,0.3)', padding: 4, borderRadius: 8 }}>
                                <button 
                                    onClick={() => setAlertType('price')} 
                                    style={{ flex: 1, background: alertType === 'price' ? '#a29bfe' : 'transparent', color: 'white', border: 'none', padding: '6px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                                >
                                    מחיר
                                </button>
                                <button 
                                    onClick={() => setAlertType('rsi')} 
                                    style={{ flex: 1, background: alertType === 'rsi' ? '#00b894' : 'transparent', color: 'white', border: 'none', padding: '6px', borderRadius: 6, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 'bold' }}
                                >
                                    RSI
                                </button>
                            </div>

                            {/* טופס מחיר */}
                            {alertType === 'price' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block' }}>מטבע/מניה</label>
                                            {/* נשתמש ב-tickers כאן כדי שאפשר יהיה לבחור מכל הנכסים השמורים */}
                                            <CustomDropdown value={newAlertCoin} options={tickers.map(c => ({ value: c.symbol, label: c.symbol }))} onChange={setNewAlertCoin} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block' }}>תנאי</label>
                                            <CustomDropdown value={newAlertCondition} options={[{ value: 'above', label: 'מעל' }, { value: 'below', label: 'מתחת' }]} onChange={(v) => setNewAlertCondition(v as any)} />
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block' }}>מחיר יעד ($)</label>
                                        <input type="number" placeholder="לדוגמה: 65000" value={newAlertPrice} onChange={e => setNewAlertPrice(e.target.value)} className="glass-input" style={{ padding: '10px', fontSize: '0.9rem' }} />
                                    </div>
                                    <input type="text" placeholder="הערה (אופציונלי)" value={newAlertNote} onChange={e => setNewAlertNote(e.target.value)} className="glass-input" style={{ padding: 12, fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }} />
                                </div>
                            )}

                            {/* טופס RSI - מעוצב מחדש ושואב מ-tickers המלא */}
                            {alertType === 'rsi' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '15px' }}>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block' }}>מטבע/מניה</label>
                                            <CustomDropdown value={newAlertCoin} options={tickers.map(c => ({ value: c.symbol, label: c.symbol }))} onChange={setNewAlertCoin} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block' }}>גרף (זמן)</label>
                                            <CustomDropdown 
                                                value={rsiTimeframe} 
                                                options={[
                                                    { value: '5m', label: '5 דקות' },
                                                    { value: '15m', label: '15 דקות' },
                                                    { value: '1h', label: '1 שעה' },
                                                    { value: '4h', label: '4 שעות' },
                                                    { value: '1d', label: 'יום 1' }
                                                ]} 
                                                onChange={setRsiTimeframe} 
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block', color: '#00b894', textAlign: 'center' }}>OS (קנייה)</label>
                                            <input type="number" placeholder="30" value={rsiOversold} onChange={e => setRsiOversold(e.target.value)} className="glass-input" style={{ padding: '8px', fontSize: '0.9rem', textAlign: 'center', width: '100%', boxSizing: 'border-box' }} />
                                        </div>
                                        <div style={{ flex: 1, background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                            <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block', color: '#ff7675', textAlign: 'center' }}>OB (מכירה)</label>
                                            <input type="number" placeholder="70" value={rsiOverbought} onChange={e => setRsiOverbought(e.target.value)} className="glass-input" style={{ padding: '8px', fontSize: '0.9rem', textAlign: 'center', width: '100%', boxSizing: 'border-box' }} />
                                        </div>
                                    </div>

                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                        <label style={{ fontSize: '0.75rem', opacity: 0.8, marginBottom: '4px', display: 'block', textAlign: 'center' }}>אורך RSI (Length)</label>
                                        <input type="number" placeholder="14" value={rsiLength} onChange={e => setRsiLength(e.target.value)} className="glass-input" style={{ padding: '8px', fontSize: '0.9rem', textAlign: 'center', width: '100%', boxSizing: 'border-box' }} />
                                    </div>

                                    {/* טוגל התראה קבועה בסגנון Switch */}
                                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: isPersistentRsi ? 'rgba(0, 184, 148, 0.1)' : 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px', border: `1px solid ${isPersistentRsi ? 'rgba(0, 184, 148, 0.3)' : 'rgba(255,255,255,0.05)'}`, cursor: 'pointer', transition: '0.3s'}} onClick={() => setIsPersistentRsi(!isPersistentRsi)}>
                                        <div>
                                            <strong style={{color: isPersistentRsi ? '#00b894' : '#ccc', fontSize: '0.85rem', transition: '0.3s'}}>התראה קבועה ♾️</strong>
                                            <div style={{fontSize: '0.7rem', opacity: 0.6}}>לא נמחקת לאחר הפעלה</div>
                                        </div>
                                        <div style={{ width: 36, height: 20, background: isPersistentRsi ? '#00b894' : '#333', borderRadius: 20, position: 'relative', transition: '0.3s' }}>
                                            <div style={{ width: 16, height: 16, background: 'white', borderRadius: '50%', position: 'absolute', top: 2, left: isPersistentRsi ? 2 : 18, transition: '0.3s' }}></div>
                                        </div>
                                    </div>
                                    
                                    <div style={{fontSize:'0.7rem', opacity: 0.5, textAlign: 'center', marginTop: '-4px'}}>
                                        *ה-RSI נבדק כל דקה (לא מעמיס על האתר)
                                    </div>
                                </div>
                            )}

                            <button onClick={addAlert} className="btn-action" style={{ background: '#6c5ce7', marginTop: 0, padding: 10, fontSize: '0.95rem', width: '100%' }}>+ צור ושמור</button>
                        </div>
                        
                        <h4 style={{ marginBottom: 10, opacity: 0.8, fontSize: '0.9rem' }}>התראות פעילות ({alerts.length})</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {alerts.map(alert => {
                                const isPersistent = alert.note?.includes('[PERSISTENT]');
                                const cleanNote = alert.note?.replace('[PERSISTENT]', '').trim();

                                return (
                                    <div key={alert.id} style={{
                                        background: 'rgba(0,0,0,0.3)', padding: '10px 12px', borderRadius: 8,
                                        borderLeft: `4px solid ${COIN_COLORS[alert.coin] || '#888'}`,
                                        display: 'flex', flexDirection: 'column', gap: 4,
                                        borderTop: '1px solid rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                                            <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 'bold' }}>{alert.coin}</span>
                                                
                                                {/* תצוגה שונה לפי סוג התראה */}
                                                {(!alert.alert_type || alert.alert_type === 'price') ? (
                                                    <span style={{ opacity: 0.9, color: alert.condition === 'above' ? '#00b894' : '#ff7675' }}>
                                                        {' '}{alert.condition === 'above' ? 'מעל' : 'מתחת'} ${alert.target_price}
                                                    </span>
                                                ) : (
                                                    <span style={{ opacity: 0.9, color: '#a29bfe' }}>
                                                        {' '}RSI {alert.timeframe} (OS: {alert.oversold} | OB: {alert.overbought})
                                                    </span>
                                                )}

                                                {/* תגית להתראה קבועה */}
                                                {isPersistent && (
                                                    <span style={{background: 'rgba(0, 184, 148, 0.2)', color: '#00b894', fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold'}}>
                                                        קבועה ♾️
                                                    </span>
                                                )}
                                            </div>
                                            <button onClick={() => removeAlert(alert.id)} style={{ background: 'transparent', border: 'none', color: '#ff7675', cursor: 'pointer', fontSize: '1.2rem', padding: '0 5px' }}>×</button>
                                        </div>
                                        
                                        {/* הצגת ערך RSI נוכחי אם זו התראת RSI ויש לנו מידע */}
                                        {alert.alert_type === 'rsi' && currentRsiValues[alert.id] !== undefined && !isNaN(currentRsiValues[alert.id]) && (
                                            <div style={{fontSize: '0.75rem', color: '#00cec9', marginTop: '2px'}}>
                                                ערך RSI נוכחי: <strong>{currentRsiValues[alert.id].toFixed(2)}</strong>
                                            </div>
                                        )}

                                        {cleanNote && <div style={{ fontSize: '0.75rem', opacity: 0.6, fontStyle: 'italic', marginTop: '2px' }}>"{cleanNote}"</div>}
                                    </div>
                                );
                            })}
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