// tradewall\src\components\LiveTicker.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient'; // וודא שהנתיב תואם למיקום הקובץ בפרויקט

type Prices = {
    [key: string]: number;
};

interface LiveTickerProps {
    prices: Prices;
    onCoinClick: (coin: string) => void;
}

interface Alert {
    id: string;
    coin: string;
    target_price: number; // שינוי שם כדי שיתאים ל-DB
    condition: 'above' | 'below';
    note?: string; // שדה חדש להערה
}

const COINS = ['BTC', 'ETH', 'BNB', 'SOL'];

// הגדרת צבעים לכל מטבע לזיהוי מהיר
const COIN_COLORS: { [key: string]: string } = {
    BTC: '#F7931A', // כתום ביטקוין
    ETH: '#627EEA', // סגול אתריום
    BNB: '#F3BA2F', // צהוב ביננס
    SOL: '#14F195'  // ירוק סולנה
};

export default function LiveTicker({ prices, onCoinClick }: LiveTickerProps) {
    const [activeTab, setActiveTab] = useState<'market' | 'alerts'>('market');
    
    // ניהול התראות
    const [alerts, setAlerts] = useState<Alert[]>([]);
    
    // טופס הוספת התראה
    const [newAlertCoin, setNewAlertCoin] = useState('BTC');
    const [newAlertPrice, setNewAlertPrice] = useState('');
    const [newAlertCondition, setNewAlertCondition] = useState<'above' | 'below'>('above');
    const [newAlertNote, setNewAlertNote] = useState(''); // שדה הערה חדש

    // טעינת התראות מה-DB בעת טעינת הרכיב
    useEffect(() => {
        fetchAlerts();
    }, []);

    const fetchAlerts = async () => {
        const { data, error } = await supabase
            .from('alerts')
            .select('*')
            .order('created_at', { ascending: false });
        
        if (error) {
            console.error('Error fetching alerts:', error);
        } else if (data) {
            // המרה לטיפוס שלנו
            setAlerts(data as Alert[]);
        }
    };

    // --- לוגיקת בדיקת מחירים והתראות ---
    useEffect(() => {
        if (alerts.length === 0) return;

        // שימוש במערך זמני כדי לאסוף מזהים למחיקה
        const triggeredAlertIds: string[] = [];

        alerts.forEach(alert => {
            const currentPrice = prices[alert.coin];
            if (!currentPrice) return;

            let triggered = false;
            if (alert.condition === 'above' && currentPrice >= alert.target_price) {
                triggered = true;
            } else if (alert.condition === 'below' && currentPrice <= alert.target_price) {
                triggered = true;
            }

            if (triggered) {
                sendNotification(alert, currentPrice);
                triggeredAlertIds.push(alert.id);
            }
        });

        // מחיקת ההתראות שהופעלו מהדאטהבייס ומהסטייט
        if (triggeredAlertIds.length > 0) {
            removeTriggeredAlerts(triggeredAlertIds);
        }

    }, [prices, alerts]);

    const removeTriggeredAlerts = async (ids: string[]) => {
        // עדכון אופטימי ב-UI
        setAlerts(prev => prev.filter(a => !ids.includes(a.id)));

        // מחיקה מה-DB
        await supabase.from('alerts').delete().in('id', ids);
    };

    const sendNotification = async (alert: Alert, currentPrice: number) => {
        const direction = alert.condition === 'above' ? 'עלה מעל' : 'ירד מתחת ל';
        
        // בניית ההודעה עם ההערה (אם יש)
        let message = `${alert.coin} הגיע למחיר $${currentPrice}! (יעד: ${direction} $${alert.target_price})`;
        if (alert.note && alert.note.trim() !== '') {
            message += `\nהערה: ${alert.note}`;
        }
        
        try {
            await fetch('/api/pushover', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    title: 'TradeWall Alert 🚀',
                    message: message 
                })
            });
            console.log('Notification sent:', message);
        } catch (err) {
            console.error('Failed to send notification', err);
        }
    };

    const addAlert = async () => {
        if (!newAlertPrice) return;
        const price = parseFloat(newAlertPrice);
        if (isNaN(price)) return;

        const alertPayload = {
            coin: newAlertCoin,
            target_price: price,
            condition: newAlertCondition,
            note: newAlertNote
        };

        // שמירה ב-Supabase
        const { data, error } = await supabase
            .from('alerts')
            .insert([alertPayload])
            .select();

        if (error) {
            alert('שגיאה בשמירת ההתראה');
            console.error(error);
        } else if (data) {
            // הוספה לרשימה המקומית
            setAlerts(prev => [data[0] as Alert, ...prev]);
            // איפוס שדות
            setNewAlertPrice('');
            setNewAlertNote('');
        }
    };

    const removeAlert = async (id: string) => {
        // עדכון אופטימי
        setAlerts(prev => prev.filter(a => a.id !== id));
        // מחיקה מה-DB
        await supabase.from('alerts').delete().eq('id', id);
    };

    return (
        <div className="glass-panel ticker-col" style={{display:'flex', flexDirection:'column', height:'100%', padding: '16px'}}>
            {/* כותרת וטאבים */}
            <div style={{display:'flex', justifyContent:'center', gap:10, marginBottom:15, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px'}}>
                <button 
                    onClick={() => setActiveTab('market')}
                    style={{
                        background: activeTab === 'market' ? 'rgba(255,255,255,0.2)' : 'transparent',
                        border: 'none', color:'white', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontWeight:'bold', fontSize: '0.9rem'
                    }}
                >
                    שוק
                </button>
                <button 
                    onClick={() => setActiveTab('alerts')}
                    style={{
                        background: activeTab === 'alerts' ? 'rgba(255,255,255,0.2)' : 'transparent',
                        border: 'none', color:'white', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontWeight:'bold', fontSize: '0.9rem'
                    }}
                >
                    התראות 🔔
                </button>
            </div>

            {/* תוכן הטאבים - הוספתי כאן מרווח גלילה */}
            <div style={{flex:1, overflowY:'auto', paddingRight: '8px', paddingLeft: '8px'}}>
                
                {/* טאב שוק */}
                {activeTab === 'market' && (
                    <div style={{display:'flex', flexDirection:'column', gap:16}}>
                        {COINS.map(coin => (
                            <div key={coin} className="coin-card" onClick={() => onCoinClick(coin)} style={{cursor: 'pointer'}}>
                                <div className="coin-info">
                                    <h3>{coin}</h3>
                                    <span>{coin === 'BTC' ? 'Bitcoin' : coin === 'ETH' ? 'Ethereum' : coin}</span>
                                </div>
                                <div className="coin-price">
                                    <div className="price-val" style={{color: prices[coin] > 0 ? '#00ff88' : 'white'}}>
                                        {prices[coin] ? `$${prices[coin].toFixed(2)}` : 'Loading...'}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* טאב התראות */}
                {activeTab === 'alerts' && (
                    <div>
                        <div style={{background:'rgba(255,255,255,0.05)', padding:12, borderRadius:12, marginBottom:15, border: '1px solid rgba(255,255,255,0.1)'}}>
                            <h4 style={{marginBottom:10, textAlign:'center', fontSize: '0.95rem'}}>הוסף התראה לנייד</h4>
                            
                            <div style={{display:'flex', gap:5, marginBottom:8}}>
                                <select 
                                    value={newAlertCoin} 
                                    onChange={(e) => setNewAlertCoin(e.target.value)}
                                    className="glass-input" 
                                    // הוספתי paddingLeft כדי שהטקסט לא יוסתר ע"י האייקון
                                    style={{padding:5, paddingLeft: '35px', fontSize:'0.9rem', flex: 1}}
                                >
                                    {COINS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                
                                <select 
                                    value={newAlertCondition} 
                                    onChange={(e) => setNewAlertCondition(e.target.value as 'above' | 'below')}
                                    className="glass-input"
                                    // הוספתי paddingLeft כדי שהטקסט לא יוסתר ע"י האייקון
                                    style={{padding:5, paddingLeft: '35px', fontSize:'0.9rem', flex: 1}}
                                >
                                    <option value="above">מעל</option>
                                    <option value="below">מתחת</option>
                                </select>
                            </div>

                            <input 
                                type="number" 
                                placeholder="מחיר יעד ($)" 
                                value={newAlertPrice}
                                onChange={(e) => setNewAlertPrice(e.target.value)}
                                className="glass-input"
                                style={{padding:8, marginBottom:8, fontSize:'0.9rem'}}
                            />

                            {/* שדה הערה */}
                            <input 
                                type="text" 
                                placeholder="הערה (אופציונלי)" 
                                value={newAlertNote}
                                onChange={(e) => setNewAlertNote(e.target.value)}
                                className="glass-input"
                                style={{padding:8, marginBottom:10, fontSize:'0.9rem'}}
                            />

                            <button 
                                onClick={addAlert}
                                className="btn-action"
                                style={{background:'#6c5ce7', marginTop:0, padding:8, fontSize: '0.9rem'}}
                            >
                                + צור ושמור
                            </button>
                        </div>

                        <h4 style={{marginBottom:10, opacity:0.8, fontSize:'0.9rem'}}>התראות פעילות ({alerts.length})</h4>
                        <div style={{display:'flex', flexDirection:'column', gap:8}}>
                            {alerts.length === 0 && <div style={{textAlign:'center', opacity:0.5, fontSize:'0.8rem', padding: '20px'}}>אין התראות פעילות</div>}
                            
                            {alerts.map(alert => (
                                <div key={alert.id} style={{
                                    background:'rgba(0,0,0,0.3)', 
                                    padding:'10px 12px', 
                                    borderRadius:8, 
                                    // שימוש בצבע המטבע לגבול השמאלי
                                    borderLeft: `4px solid ${COIN_COLORS[alert.coin] || '#888'}`,
                                    display:'flex', flexDirection:'column', gap: 4,
                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                    borderRight: '1px solid rgba(255,255,255,0.05)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)'
                                }}>
                                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', width: '100%'}}>
                                        <div style={{fontSize:'0.85rem'}}>
                                            <span style={{fontWeight:'bold'}}>{alert.coin}</span> 
                                            {/* הוספת צבע לתנאי מעל/מתחת לאינדיקציה נוספת */}
                                            <span style={{opacity: 0.9, color: alert.condition === 'above' ? '#00b894' : '#ff7675'}}>
                                                {' '}{alert.condition === 'above' ? '>' : '<'} ${alert.target_price}
                                            </span>
                                        </div>
                                        <button 
                                            onClick={() => removeAlert(alert.id)}
                                            style={{background:'transparent', border:'none', color:'#ff7675', cursor:'pointer', fontSize:'1.2rem', padding: '0 5px'}}
                                            title="מחק התראה"
                                        >
                                            ×
                                        </button>
                                    </div>
                                    {alert.note && (
                                        <div style={{fontSize: '0.75rem', opacity: 0.6, fontStyle: 'italic'}}>
                                            "{alert.note}"
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}