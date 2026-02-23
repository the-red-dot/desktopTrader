// tradewall\src\components\PositionModal.tsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { calculateHedgeStrategy, HedgeSetup } from '../app/utils/hedgeLogic';

// --- Types (Shared) ---
export interface Position {
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
    symbol: string;
    parent_id?: string | null;
}

interface PositionModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'add' | 'edit';
    coin: string;
    currentPrice: number;
    user: any;
    parentSpot: Position | null;
    childHedge: Position | null;
    childHedgeIndex: number | null;
    onSuccess: (refreshAlerts: boolean) => void;
}

export default function PositionModal({
    isOpen,
    onClose,
    mode,
    coin,
    currentPrice,
    user,
    parentSpot,
    childHedge,
    childHedgeIndex,
    onSuccess
}: PositionModalProps) {
    
    // --- Initial State Helpers ---
    const getInitialDate = () => new Date().toISOString().split('T')[0];
    const getInitialTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    // --- State ---
    const [data, setData] = useState({
        entry: '',
        amount: '',
        tp: '',
        sl: '',
        risk: '',
        currency: 'USDT',
        date: getInitialDate(),
        time: getInitialTime()
    });

    const [strategy, setStrategy] = useState({
        isActive: false,
        hedgesCount: 2,
        riskPercent: 0,
        currentHedgeIndex: 1,
        calculatedSetups: [] as HedgeSetup[]
    });

    const [createAlerts, setCreateAlerts] = useState(false);

    // --- Effects ---
    
    // אתחול הטופס בפתיחה
    useEffect(() => {
        if (isOpen) {
            initializeForm();
        }
    }, [isOpen, coin, mode, parentSpot, childHedge]);

    const initializeForm = () => {
        // איפוס בסיסי
        let initialData = {
            entry: currentPrice ? currentPrice.toString() : '',
            amount: '',
            tp: '',
            sl: '',
            risk: '',
            currency: 'USDT',
            date: getInitialDate(),
            time: getInitialTime()
        };

        let strategyState = {
            isActive: false,
            hedgesCount: 2,
            riskPercent: 0,
            currentHedgeIndex: 1,
            calculatedSetups: [] as HedgeSetup[]
        };

        setCreateAlerts(false);

        // מצב הוספה
        if (mode === 'add') {
            if (parentSpot) {
                // הוספת גידור (Hedge)
                if (parentSpot.tp) {
                    initialData.sl = parentSpot.tp.toString();
                }

                // חישוב מספר הגידור הבא
                const nextHedgeNum = (parentSpot.shorts?.length || 0) + 1;
                strategyState.currentHedgeIndex = nextHedgeNum;

                // בדיקה אם קיימת אסטרטגיה מוגדרת מראש בספוט
                if (parentSpot.strategy_risk_percent && parentSpot.strategy_hedges_count) {
                    
                    // --- תיקון: קביעת נקודת ההתחלה של האסטרטגיה ---
                    // אם כבר קיימים גידורים (למשל פותחים את גידור 2), אנו רוצים שהחישוב יתבסס 
                    // על מחיר הכניסה בפועל של הגידור הראשון, ולא על מחיר הספוט המקורי.
                    // זה מבטיח עקביות עם ההתראות שנוצרו.
                    let startPrice = parentSpot.entry;
                    if (parentSpot.shorts && parentSpot.shorts.length > 0) {
                        // לוקחים את הכניסה של הגידור הראשון כעוגן לחישוב הרשת
                        startPrice = parentSpot.shorts[0].entry;
                    }

                    const setups = calculateHedgeStrategy(
                        parentSpot.entry,
                        parentSpot.tp,
                        parentSpot.amount,
                        parentSpot.strategy_risk_percent,
                        parentSpot.strategy_hedges_count,
                        startPrice // מעבירים את מחיר ההתחלה המעודכן
                    );
                    
                    const setupToApply = setups[parentSpot.shorts?.length || 0];
                    
                    if (setupToApply) {
                        initialData.entry = setupToApply.entry.toString();
                        initialData.tp = setupToApply.tp.toString();
                        initialData.sl = setupToApply.sl.toString();
                        initialData.amount = setupToApply.coinAmount.toString();
                        initialData.risk = setupToApply.riskAmount.toString();
                        
                        strategyState.isActive = true;
                        strategyState.hedgesCount = parentSpot.strategy_hedges_count;
                        strategyState.riskPercent = parentSpot.strategy_risk_percent;
                        strategyState.calculatedSetups = setups;
                    }
                }
            }
        } 
        // מצב עריכה
        else if (mode === 'edit') {
            const source = childHedge || parentSpot;
            if (source) {
                initialData = {
                    ...initialData,
                    entry: source.entry.toString(),
                    amount: source.amount.toString(),
                    tp: source.tp.toString(),
                    sl: source.sl.toString(),
                    risk: source.risk.toString(),
                    currency: source.currency,
                    date: source.trade_date || getInitialDate(),
                    time: source.trade_time || getInitialTime()
                };
            }
        }

        setData(initialData);
        setStrategy(strategyState);
    };

    // --- Logic ---

    const calculateValues = () => {
        const entry = parseFloat(data.entry);
        const amount = parseFloat(data.amount);
        const tp = parseFloat(data.tp);
        const sl = parseFloat(data.sl);

        let calcInvest = 0;
        let calcProfit = 0;
        let calcRisk = 0;

        // האם זה ספוט? (הוספת ספוט, או עריכת ספוט)
        const isSpot = (mode === 'add' && !parentSpot) || (mode === 'edit' && !childHedge);

        if (entry && !isNaN(entry) && amount && !isNaN(amount)) {
            calcInvest = amount * entry;

            // רווח פוטנציאלי (TP)
            if (tp && !isNaN(tp)) {
                if (isSpot) calcProfit = (tp - entry) * amount;
                else calcProfit = Math.abs(entry - tp) * amount; // שורט
            }

            // סיכון פוטנציאלי (SL)
            if (sl && !isNaN(sl)) {
                if (isSpot) calcRisk = (entry - sl) * amount; // לונג: הפסד כשהמחיר יורד
                else calcRisk = Math.abs(sl - entry) * amount; // שורט: הפסד כשהמחיר עולה
            } else {
                // אם אין סטופ, לוקחים את הריסק מהשדה הידני
                calcRisk = parseFloat(data.risk) || 0;
            }
        }

        return { calcInvest, calcProfit, calcRisk };
    };

    const handleInput = (field: string, value: string) => {
        const newData = { ...data, [field]: value };
        
        // --- 1. Hedge Strategy Logic (Priority) ---
        if (strategy.isActive && parentSpot && mode === 'add' && (field === 'entry' || field === 'sl')) {
            const newEntry = field === 'entry' ? parseFloat(value) : parseFloat(newData.entry);
            const newSL = field === 'sl' ? parseFloat(value) : parseFloat(newData.sl);
            
            const targetRisk = parseFloat(data.risk);

            if (!isNaN(newEntry) && !isNaN(newSL) && !isNaN(targetRisk) && newEntry !== newSL) {
                const diff = Math.abs(newEntry - newSL);
                const newAmount = targetRisk / diff;
                
                // הנוסחה: TP = 2 * Entry - SL (יחס 1:1)
                const newTP = (2 * newEntry) - newSL;

                newData.amount = newAmount.toFixed(6);
                newData.tp = newTP.toFixed(4);
            }
            
            setData(newData);
            return;
        }

        // --- 2. Standard Risk Calculation Logic ---
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
        else if (field === 'amount' || field === 'entry' || field === 'sl') {
            const entryVal = parseFloat(newData.entry);
            const slVal = parseFloat(newData.sl);
            const amountVal = parseFloat(newData.amount);
            const riskVal = parseFloat(data.risk);

            if (field !== 'amount' && (isNaN(amountVal) || amountVal === 0) && !isNaN(riskVal) && riskVal > 0 && !isNaN(entryVal) && !isNaN(slVal) && entryVal !== slVal) {
                 const diff = Math.abs(entryVal - slVal);
                 const newAmount = riskVal / diff;
                 newData.amount = newAmount.toFixed(6);
            } 
            else if (!isNaN(amountVal) && !isNaN(entryVal) && !isNaN(slVal)) {
                 const diff = Math.abs(entryVal - slVal);
                 const newRisk = diff * amountVal;
                 newData.risk = newRisk.toFixed(2);
            }
        }
        
        setData(newData);
    };

    const applyHedgeStrategy = (percent: number) => {
        if (!parentSpot) return;
        
        const currentFormEntry = parseFloat(data.entry);
        const startPrice = !isNaN(currentFormEntry) ? currentFormEntry : parentSpot.entry;
        
        const currentFormSL = parseFloat(data.sl);
        const targetSL = !isNaN(currentFormSL) ? currentFormSL : parentSpot.tp;

        const setups = calculateHedgeStrategy(
            parentSpot.entry,
            targetSL,
            parentSpot.amount,
            percent, 
            strategy.hedgesCount,
            startPrice
        );

        const nextHedgeIdx = strategy.currentHedgeIndex - 1; 
        const setupToApply = setups[nextHedgeIdx];

        if (setupToApply) {
            setStrategy(prev => ({
                ...prev,
                isActive: true,
                riskPercent: percent,
                calculatedSetups: setups,
            }));
            
            setData(prev => ({
                ...prev,
                entry: setupToApply.entry.toString(),
                tp: setupToApply.tp.toString(),
                sl: setupToApply.sl.toString(),
                amount: setupToApply.coinAmount.toString(),
                risk: setupToApply.riskAmount.toString(),
            }));
        }
    };

    const handleSave = async () => {
        if (!user) {
            alert("נא להתחבר");
            return;
        }

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
            let refreshAlerts = false;

            if (mode === 'add') {
                if (!parentSpot) {
                    // יצירת ספוט חדש
                    dbPayload.parent_id = null;
                    const { data: inserted, error } = await supabase.from('positions').insert([dbPayload]).select();
                    if (error) throw error;
                    savedRecord = inserted[0];
                } else {
                    // יצירת גידור (Hedge)
                    dbPayload.parent_id = parentSpot.id;
                    
                    // עדכון אסטרטגיה בספוט האב אם זו פעם ראשונה או שהשתנתה
                    if (strategy.isActive && (parentSpot.shorts?.length === 0 || strategy.currentHedgeIndex === 1)) {
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
                // עריכה
                let idToUpdate = '';
                if (childHedge) {
                    idToUpdate = childHedge.id;
                } else if (parentSpot) {
                    idToUpdate = parentSpot.id;
                }
                
                if (idToUpdate) {
                    const { data: updated, error } = await supabase.from('positions').update(dbPayload).eq('id', idToUpdate).select();
                    if (error) throw error;
                    savedRecord = updated[0];
                }
            }

            // --- ALERT CREATION LOGIC ---
            
            // פונקציית עזר לבדיקה האם ההתראה כבר "שרופה" (המחיר כבר עבר את היעד)
            const shouldCreateAlert = (target: number, condition: 'above' | 'below') => {
                // אם אין מחיר נוכחי, ניצור את ההתראה ליתר ביטחון
                if (!currentPrice || currentPrice === 0) return true;
                
                // אם התנאי הוא 'above' (למשל SL של שורט) והמחיר כבר מעל - לא ניצור
                if (condition === 'above' && currentPrice >= target) return false;
                
                // אם התנאי הוא 'below' (למשל TP של שורט) והמחיר כבר מתחת - לא ניצור
                if (condition === 'below' && currentPrice <= target) return false;
                
                return true;
            };

            // יצירת התראות אם המשתמש סימן
            if (createAlerts && savedRecord) {
                const alertsToCreate = [];

                if (!parentSpot) {
                    // Spot Alerts (LONG)
                    // TP (Above)
                    if (tpVal > 0 && shouldCreateAlert(tpVal, 'above')) {
                        alertsToCreate.push({ coin, target_price: tpVal, condition: 'above', note: `Spot ${coin} TP Hit - Close All`, user_id: user.id });
                    }
                    // SL (Below)
                    if (slVal > 0 && shouldCreateAlert(slVal, 'below')) {
                        alertsToCreate.push({ coin, target_price: slVal, condition: 'below', note: `Spot ${coin} SL Hit`, user_id: user.id });
                    }
                } else {
                    // Hedge Alerts (SHORT)
                    // TP (Below)
                    if (tpVal > 0 && shouldCreateAlert(tpVal, 'below')) {
                        alertsToCreate.push({ 
                            coin, target_price: tpVal, condition: 'below', 
                            note: `Hedge ${strategy.currentHedgeIndex} (${coin}) TP`, user_id: user.id 
                        });
                    }
                    // SL (Above)
                    if (slVal > 0 && shouldCreateAlert(slVal, 'above')) {
                        alertsToCreate.push({ 
                            coin, target_price: slVal, condition: 'above', 
                            note: `Hedge ${strategy.currentHedgeIndex} (${coin}) SL`, user_id: user.id 
                        });
                    }

                    // התראה לכניסה לגידור הבא (אם חושב באסטרטגיה)
                    if (strategy.calculatedSetups && strategy.calculatedSetups.length > 0) {
                        const nextSetup = strategy.calculatedSetups.find(s => s.index === strategy.currentHedgeIndex + 1);
                        
                        if (nextSetup) {
                            // קביעת הכיוון: אם הגידור הבא נמוך מהנוכחי (שורט קלאסי) -> below
                            const alertCondition = nextSetup.entry < entry ? 'below' : 'above';

                            if (shouldCreateAlert(nextSetup.entry, alertCondition)) {
                                alertsToCreate.push({
                                    coin: coin,
                                    target_price: nextSetup.entry,
                                    condition: alertCondition,
                                    note: `⚠️ ENTER HEDGE ${nextSetup.index} @ $${nextSetup.entry} | Amt: ${nextSetup.coinAmount} | Inv: $${nextSetup.investAmount} | TP: ${nextSetup.tp} | SL: ${nextSetup.sl}`,
                                    user_id: user.id
                                });
                            }
                        }
                    }
                }

                if (alertsToCreate.length > 0) {
                    await supabase.from('alerts').insert(alertsToCreate);
                    refreshAlerts = true;
                }
            }

            onSuccess(refreshAlerts);
            onClose();

        } catch (err: any) {
            console.error("Error saving position:", err.message);
            alert("שגיאה בשמירה: " + err.message);
        }
    };

    const { calcInvest, calcProfit, calcRisk } = calculateValues();

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" onClick={onClose}></div>
            <div className="glass-panel modal-content" style={{width: 420}}>
                <h3 style={{ textAlign: 'center', marginBottom: 20 }}>
                    {mode === 'add'
                        ? (!parentSpot ? `הוספת ספוט ${coin}` : `הוספת גידור (Hedge ${strategy.currentHedgeIndex})`)
                        : 'עריכת פוזיציה'
                    }
                </h3>

                {/* בחירת אסטרטגיה - מוצג רק בהוספת גידור ראשון */}
                {mode === 'add' && parentSpot && strategy.currentHedgeIndex === 1 && (
                    <div style={{marginBottom: 20, padding: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 10}}>
                        <div style={{fontSize:'0.85rem', marginBottom: 8, textAlign:'center'}}>בחר אסטרטגיה (תחול על כל הגידורים):</div>
                        <div style={{display:'flex', justifyContent:'center', gap:5, marginBottom:10}}>
                            {[1, 2, 3, 4].map(num => (
                                <button 
                                    key={num}
                                    onClick={() => setStrategy(prev => ({...prev, hedgesCount: num}))}
                                    style={{
                                        background: strategy.hedgesCount === num ? '#00b894' : '#333',
                                        border: 'none', borderRadius: 4, padding: '4px 10px', color: 'white', cursor:'pointer', fontSize: '0.8rem'
                                    }}
                                >
                                    {num} {num === 1 ? 'גידור' : 'גידורים'}
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
                                        background: strategy.riskPercent === pct ? '#6c5ce7' : 'rgba(255,255,255,0.1)',
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
                        <input type="date" className="glass-input" value={data.date} onChange={e => handleInput('date', e.target.value)} />
                     </div>
                     <div className="input-group" style={{ flex: 1 }}>
                        <label>שעה</label>
                        <input type="time" className="glass-input" value={data.time} onChange={e => handleInput('time', e.target.value)} />
                     </div>
                </div>

                <div className="input-group">
                    <label>מחיר כניסה ($)</label>
                    <input type="number" className="glass-input" value={data.entry} onChange={e => handleInput('entry', e.target.value)} />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <div className="input-group" style={{ flex: 1 }}>
                        <label>TP (יעד)</label>
                        <input type="number" className="glass-input" value={data.tp} onChange={e => handleInput('tp', e.target.value)} />
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                        <label>SL (סטופ)</label>
                        <input type="number" className="glass-input" value={data.sl} onChange={e => handleInput('sl', e.target.value)} />
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
                            -${calcRisk.toLocaleString(undefined, {maximumFractionDigits:2})}
                        </div>
                    </div>
                    <div style={{width:1, height:30, background:'rgba(255,255,255,0.2)'}}></div>
                    <div style={{textAlign:'center'}}>
                        <div style={{fontSize:'0.75rem', opacity:0.8, marginBottom:2}}>רווח פוטנציאלי (Reward)</div>
                        <div style={{color:'#00b894', fontWeight:'bold', fontFamily:'monospace', fontSize:'1rem'}}>
                            +${calcProfit.toLocaleString(undefined, {maximumFractionDigits:2})}
                        </div>
                    </div>
                </div>

                {/* טבלת השקעה/סיכון/כמות */}
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginTop:10}}>
                     <div className="investment-highlight">
                        <span style={{fontSize:'0.7rem', opacity:0.7}}>סכום סיכון ($)</span>
                        <input type="number" className="glass-input" style={{textAlign:'center', fontSize:'1rem', padding:5}} value={data.risk} onChange={e => handleInput('risk', e.target.value)} />
                     </div>
                     <div className="investment-highlight">
                        <span style={{fontSize:'0.7rem', opacity:0.7}}>כמות (Coins)</span>
                        <input type="number" className="glass-input" style={{textAlign:'center', fontSize:'1rem', padding:5}} value={data.amount} onChange={e => handleInput('amount', e.target.value)} />
                     </div>
                     <div className="investment-highlight">
                        <span style={{fontSize:'0.7rem', opacity:0.7}}>השקעה ($)</span>
                        <div className="investment-val" style={{fontSize:'1rem'}}>${calcInvest.toFixed(2)}</div>
                     </div>
                </div>

                <div style={{marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8}} onClick={() => setCreateAlerts(!createAlerts)}>
                    <div style={{
                        width: 20, height: 20, borderRadius: 4, 
                        border: '2px solid #00b894', 
                        background: createAlerts ? '#00b894' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {createAlerts && <span style={{color:'white', fontWeight:'bold', fontSize:'0.8rem'}}>✓</span>}
                    </div>
                    <span style={{fontSize: '0.9rem'}}>🔔 צור התראות אוטומטיות</span>
                </div>
                
                {createAlerts && mode === 'add' && (
                    <div style={{textAlign:'center', fontSize:'0.75rem', color:'#00b894', marginTop:4, opacity: 0.8}}>
                        {!parentSpot 
                            ? "ייווצרו התראות TP ו-SL לספוט"
                            : `ייווצרו התראות לגידור ${strategy.currentHedgeIndex}` + (strategy.calculatedSetups.length > strategy.currentHedgeIndex ? ` + כוננות לגידור הבא` : "")
                        }
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={handleSave} className="btn-action btn-add-spot" style={{ flex: 1 }}>
                        {mode === 'add' ? 'שמור וצור' : 'עדכן'}
                    </button>
                    <button onClick={onClose} className="btn-action" style={{ flex: 1, background: '#333', color: '#ccc' }}>ביטול</button>
                </div>
            </div>
        </>
    );
}