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
    is_half_position?: boolean; // נוסף דגל לזיהוי חצי פוזיציה
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
        currentHedgeIndex: 1
    });

    const [createAlerts, setCreateAlerts] = useState(false);
    
    // --- Half Position States ---
    const [isHalfPosition, setIsHalfPosition] = useState(false);
    const [completionData, setCompletionData] = useState({ active: false, entry: '', amount: '' });

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
            currentHedgeIndex: 1
        };

        setCreateAlerts(false);
        setIsHalfPosition(false);
        setCompletionData({ active: false, entry: '', amount: '' });

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

                // חישוב רשת דינמי (Dynamic Grid) - מתאים את הצעד הבא בהתאם לכניסה של הגידור הקודם בפועל!
                if (parentSpot.strategy_risk_percent && parentSpot.strategy_hedges_count) {
                    const riskPercent = parentSpot.strategy_risk_percent;
                    const totalHedges = parentSpot.strategy_hedges_count;
                    
                    // עוגן הכניסה הוא המחיר האחרון שבוצעה בו כניסה (או הספוט, או הגידור הקודם)
                    let lastEntryPrice = parentSpot.entry;
                    if (parentSpot.shorts && parentSpot.shorts.length > 0) {
                        lastEntryPrice = parentSpot.shorts[parentSpot.shorts.length - 1].entry;
                    }

                    const targetSL = parentSpot.tp; 
                    const distanceToSL = targetSL - lastEntryPrice;
                    
                    // כמה גידורים נותרו לפתוח, כולל הגידור הנוכחי
                    const remainingHedges = totalHedges - nextHedgeNum + 1;
                    
                    if (remainingHedges > 0) {
                        // מחלקים את המרחק שנותר באופן שווה
                        const step = distanceToSL / (remainingHedges + 1);
                        const expectedEntry = lastEntryPrice + step;

                        // תקציב הסיכון לכל גידור תמיד נגזר מהפוזיציה המקורית
                        const spotPotentialProfit = Math.abs(parentSpot.tp - parentSpot.entry) * parentSpot.amount;
                        const normalizedPercent = riskPercent > 1 ? riskPercent / 100 : riskPercent;
                        const riskPerHedge = (spotPotentialProfit * normalizedPercent) / totalHedges;

                        // חישוב כמות ו-TP לצעד הדינמי החדש
                        const distExpectedToSL = Math.abs(targetSL - expectedEntry);
                        const expectedAmount = distExpectedToSL > 0 ? riskPerHedge / distExpectedToSL : 0;
                        const expectedTP = (2 * expectedEntry) - targetSL;

                        initialData.entry = parseFloat(expectedEntry.toFixed(4)).toString();
                        initialData.tp = parseFloat(expectedTP.toFixed(4)).toString();
                        initialData.sl = targetSL.toString();
                        initialData.amount = parseFloat(expectedAmount.toFixed(6)).toString();
                        initialData.risk = parseFloat(riskPerHedge.toFixed(2)).toString();

                        strategyState.isActive = true;
                        strategyState.hedgesCount = totalHedges;
                        strategyState.riskPercent = riskPercent;
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

                setIsHalfPosition(source.is_half_position || false);

                // שחזור הסטייט של האסטרטגיה במצב עריכה של שורט
                if (childHedge && parentSpot && parentSpot.strategy_risk_percent && parentSpot.strategy_hedges_count) {
                    strategyState.isActive = true;
                    strategyState.hedgesCount = parentSpot.strategy_hedges_count;
                    strategyState.riskPercent = parentSpot.strategy_risk_percent;
                    // childHedgeIndex מתחיל מ-0, אז מספר הגידור הוא אינדקס + 1
                    strategyState.currentHedgeIndex = (childHedgeIndex !== null ? childHedgeIndex : 0) + 1;
                }
            }
        }

        setData(initialData);
        setStrategy(strategyState);
    };

    // --- Logic ---

    // Toggle חצי פוזיציה במצב הוספה
    const handleToggleHalf = () => {
        const nextHalf = !isHalfPosition;
        setIsHalfPosition(nextHalf);
        
        setData(prev => {
            const currentAmount = parseFloat(prev.amount);
            const currentRisk = parseFloat(prev.risk);
            
            if (isNaN(currentAmount) || isNaN(currentRisk)) return prev;

            return {
                ...prev,
                amount: nextHalf ? (currentAmount / 2).toFixed(6) : (currentAmount * 2).toFixed(6),
                risk: nextHalf ? (currentRisk / 2).toFixed(2) : (currentRisk * 2).toFixed(2)
            };
        });
    };

    const getCompletionDefaults = () => {
        const currentEntry = parseFloat(data.entry);
        const sl = parseFloat(data.sl);
        const totalHedges = strategy.hedgesCount || parentSpot?.strategy_hedges_count || 1;
        const currentIndex = strategy.currentHedgeIndex || 1;
        
        const remainingHedges = totalHedges - currentIndex + 1;
        const distanceToSL = sl - currentEntry;
        const step = distanceToSL / (remainingHedges + 1);
        const expectedEntry = currentEntry + step;
        
        const remRisk = parseFloat(data.risk); // The remaining 50% risk
        const distToExpectedSL = Math.abs(sl - expectedEntry);
        const expectedAmt = distToExpectedSL > 0 ? remRisk / distToExpectedSL : 0;
        
        return {
            entry: expectedEntry.toFixed(4),
            amount: expectedAmt.toFixed(6)
        };
    };

    const handleCompletionEntryChange = (newEntryStr: string) => {
        const newEntry = parseFloat(newEntryStr);
        const remRisk = parseFloat(data.risk);
        const sl = parseFloat(data.sl);
        
        if (!isNaN(newEntry) && !isNaN(sl) && !isNaN(remRisk) && newEntry !== sl) {
            const dist = Math.abs(sl - newEntry);
            const requiredAmt = remRisk / dist;
            setCompletionData(prev => ({ ...prev, entry: newEntryStr, amount: requiredAmt.toFixed(6) }));
        } else {
            setCompletionData(prev => ({ ...prev, entry: newEntryStr }));
        }
    };

    const calculateValues = () => {
        // מתחשב בנתוני ההשלמה אם אנחנו בתהליך של השלמת חצי פוזיציה
        let activeEntry = parseFloat(data.entry);
        let activeAmount = parseFloat(data.amount);
        let activeTP = parseFloat(data.tp);
        let activeSL = parseFloat(data.sl);
        let activeRiskInput = parseFloat(data.risk);

        if (completionData.active) {
            const cEntry = parseFloat(completionData.entry);
            const cAmount = parseFloat(completionData.amount);
            if (!isNaN(cEntry) && !isNaN(cAmount) && cAmount > 0) {
                activeAmount = activeAmount + cAmount;
                activeEntry = ((parseFloat(data.entry) * parseFloat(data.amount)) + (cEntry * cAmount)) / activeAmount;
                if (!isNaN(activeSL)) {
                    activeTP = (2 * activeEntry) - activeSL; // מעדכן יעד ממוצע לתצוגה על בסיס יחס 1:1
                }
            }
        }

        let calcInvest = 0;
        let calcProfit = 0;
        let calcRisk = 0;

        // האם זה ספוט?
        const isSpot = (mode === 'add' && !parentSpot) || (mode === 'edit' && !childHedge);

        if (activeEntry && !isNaN(activeEntry) && activeAmount && !isNaN(activeAmount)) {
            calcInvest = activeAmount * activeEntry;

            // רווח פוטנציאלי (TP)
            if (activeTP && !isNaN(activeTP)) {
                if (isSpot) calcProfit = (activeTP - activeEntry) * activeAmount;
                else calcProfit = Math.abs(activeEntry - activeTP) * activeAmount; // שורט
            }

            // סיכון פוטנציאלי (SL)
            if (activeSL && !isNaN(activeSL)) {
                if (isSpot) calcRisk = (activeEntry - activeSL) * activeAmount; // לונג: הפסד כשהמחיר יורד
                else calcRisk = Math.abs(activeSL - activeEntry) * activeAmount; // שורט: הפסד כשהמחיר עולה
            } else {
                // אם אין סטופ, לוקחים את הריסק מהשדה הידני
                calcRisk = activeRiskInput || 0;
            }
        }

        return { calcInvest, calcProfit, calcRisk, activeEntry, activeAmount, activeTP, activeSL };
    };

    const handleInput = (field: string, value: string) => {
        const newData = { ...data, [field]: value };
        
        // --- 1. Hedge Strategy Logic (Priority) ---
        if (strategy.isActive && parentSpot && (field === 'entry' || field === 'sl')) {
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
        
        // יצירה דינמית של צעד הגידור הראשון (Hedge 1)
        const lastEntryPrice = parentSpot.entry; 
        const targetSL = parentSpot.tp;
        const distanceToSL = targetSL - lastEntryPrice;
        
        const remainingHedges = strategy.hedgesCount; // זהו הגידור הראשון ולכן נותרו כולם
        const step = distanceToSL / (remainingHedges + 1);
        const expectedEntry = lastEntryPrice + step;

        const spotPotentialProfit = Math.abs(parentSpot.tp - parentSpot.entry) * parentSpot.amount;
        const normalizedPercent = percent > 1 ? percent / 100 : percent;
        let riskPerHedge = (spotPotentialProfit * normalizedPercent) / strategy.hedgesCount;

        const distExpectedToSL = Math.abs(targetSL - expectedEntry);
        let expectedAmount = distExpectedToSL > 0 ? riskPerHedge / distExpectedToSL : 0;
        const expectedTP = (2 * expectedEntry) - targetSL;

        // אם המשתמש כבר סימן מראש חצי פוזיציה
        if (isHalfPosition) {
            riskPerHedge /= 2;
            expectedAmount /= 2;
        }

        setStrategy(prev => ({
            ...prev,
            isActive: true,
            riskPercent: percent
        }));
        
        setData(prev => ({
            ...prev,
            entry: parseFloat(expectedEntry.toFixed(4)).toString(),
            tp: parseFloat(expectedTP.toFixed(4)).toString(),
            sl: targetSL.toString(),
            amount: parseFloat(expectedAmount.toFixed(6)).toString(),
            risk: parseFloat(riskPerHedge.toFixed(2)).toString(),
        }));
    };

    const handleSave = async () => {
        if (!user) {
            alert("נא להתחבר");
            return;
        }

        let finalEntry = parseFloat(data.entry);
        let finalAmount = parseFloat(data.amount);
        let finalTP = parseFloat(data.tp) || 0;
        let finalRisk = parseFloat(data.risk) || 0;
        let finalSL = parseFloat(data.sl) || 0;
        let saveIsHalf = isHalfPosition;

        if (!finalEntry || !finalAmount) {
            alert("נא למלא מחיר וכמות");
            return;
        }

        // --- לוגיקת השלמת חצי פוזיציה ---
        if (mode === 'edit' && completionData.active) {
            const newEntry = parseFloat(completionData.entry);
            const newAmount = parseFloat(completionData.amount);
            
            if (isNaN(newEntry) || isNaN(newAmount) || newAmount <= 0) {
                alert("נא למלא מחיר וכמות תקינים להשלמה");
                return;
            }

            const oldEntry = finalEntry;
            const oldAmount = finalAmount;
            
            finalAmount = oldAmount + newAmount;
            finalEntry = parseFloat((((oldEntry * oldAmount) + (newEntry * newAmount)) / finalAmount).toFixed(4));
            
            // עדכון ה-TP כדי לשמור על יחס 1:1 לממוצע החדש
            if (finalSL) {
                finalTP = parseFloat(((2 * finalEntry) - finalSL).toFixed(4));
                finalRisk = Math.abs(finalSL - finalEntry) * finalAmount;
            }
            
            // מסירים את הסטטוס של "חצי פוזיציה"
            saveIsHalf = false; 
        }

        const dbPayload: any = {
            symbol: coin,
            entry: finalEntry,
            amount: finalAmount,
            tp: finalTP,
            sl: finalSL,
            risk: finalRisk,
            currency: data.currency,
            trade_date: data.date,
            trade_time: data.time,
            is_half_position: saveIsHalf,
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
                // עריכה (השלמה משתמשת גם בעדכון הזה)
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
            
            const shouldCreateAlert = (target: number, condition: 'above' | 'below') => {
                if (!currentPrice || currentPrice === 0) return true;
                if (condition === 'above' && currentPrice >= target) return false;
                if (condition === 'below' && currentPrice <= target) return false;
                return true;
            };

            // יצירת והחלפת התראות
            if (createAlerts && savedRecord) {
                const alertsToCreate = [];

                if (!parentSpot) {
                    // Spot Alerts (LONG)
                    if (mode === 'edit') {
                        const { data: existingAlerts } = await supabase.from('alerts').select('id, note').eq('coin', coin).eq('user_id', user.id);
                        if (existingAlerts) {
                            const idsToDelete = existingAlerts
                                .filter(a => a.note && (a.note.includes(`Spot ${coin} TP Hit`) || a.note.includes(`Spot ${coin} SL Hit`)))
                                .map(a => a.id);
                            if (idsToDelete.length > 0) await supabase.from('alerts').delete().in('id', idsToDelete);
                        }
                    }

                    if (finalTP > 0 && shouldCreateAlert(finalTP, 'above')) {
                        alertsToCreate.push({ coin, target_price: finalTP, condition: 'above', note: `Spot ${coin} TP Hit - Close All`, user_id: user.id });
                    }
                    if (finalSL > 0 && shouldCreateAlert(finalSL, 'below')) {
                        alertsToCreate.push({ coin, target_price: finalSL, condition: 'below', note: `Spot ${coin} SL Hit`, user_id: user.id });
                    }
                } else {
                    // Hedge Alerts (SHORT)
                    if (mode === 'edit' && strategy.isActive) {
                        const nextHedgeNum = strategy.currentHedgeIndex + 1;
                        const { data: existingAlerts } = await supabase.from('alerts').select('id, note').eq('coin', coin).eq('user_id', user.id);
                        if (existingAlerts) {
                            const idsToDelete = existingAlerts
                                .filter(a => {
                                    if (!a.note) return false;
                                    // מחיקת ההתראות הישנות שקשורות לגידור הזה (או להתראת ההשלמה) ולגידור הבא
                                    return a.note.includes(`Hedge ${strategy.currentHedgeIndex} (${coin})`) || 
                                           a.note.includes(`COMPLETE HEDGE ${strategy.currentHedgeIndex}`) ||
                                           a.note.includes(`ENTER HEDGE ${nextHedgeNum}`);
                                })
                                .map(a => a.id);
                            if (idsToDelete.length > 0) await supabase.from('alerts').delete().in('id', idsToDelete);
                        }
                    }

                    if (finalTP > 0 && shouldCreateAlert(finalTP, 'below')) {
                        alertsToCreate.push({ 
                            coin, target_price: finalTP, condition: 'below', 
                            note: `Hedge ${strategy.currentHedgeIndex} (${coin}) TP`, user_id: user.id 
                        });
                    }
                    if (finalSL > 0 && shouldCreateAlert(finalSL, 'above')) {
                        alertsToCreate.push({ 
                            coin, target_price: finalSL, condition: 'above', 
                            note: `Hedge ${strategy.currentHedgeIndex} (${coin}) SL`, user_id: user.id 
                        });
                    }

                    // --- יצירת התראה דינמית מלאה לגידור הבא (או להשלמת הגידור הנוכחי) ---
                    const activeRiskPercent = strategy.riskPercent || parentSpot.strategy_risk_percent || 0;
                    const activeHedgesCount = strategy.hedgesCount || parentSpot.strategy_hedges_count || 0;
                    
                    // בדיקה האם זו שמירה של חצי פוזיציה שצריך להשלים, או מעבר לגידור הבא
                    const isCompletionAlert = saveIsHalf;
                    const alertHedgeNum = isCompletionAlert ? strategy.currentHedgeIndex : strategy.currentHedgeIndex + 1;

                    if (activeRiskPercent > 0 && activeHedgesCount > 0 && alertHedgeNum <= activeHedgesCount) {
                        
                        const remainingHedges = activeHedgesCount - alertHedgeNum + 1;
                        
                        const distanceToSL = finalSL - finalEntry; 
                        const step = distanceToSL / (remainingHedges + 1); 
                        const nextExpectedEntry = parseFloat((finalEntry + step).toFixed(4));
                        
                        const spotPotentialProfit = Math.abs(parentSpot.tp - parentSpot.entry) * parentSpot.amount;
                        const normalizedPercent = activeRiskPercent > 1 ? activeRiskPercent / 100 : activeRiskPercent;
                        
                        // סיכון רגיל לגידור מלא
                        let riskForNextAlert = (spotPotentialProfit * normalizedPercent) / activeHedgesCount;

                        let nextCoinAmount = 0;
                        let nextInvestAmount = 0;
                        let nextTP = 0;
                        let alertTargetPrice = nextExpectedEntry;

                        // אם זאת רק התראת השלמה לחצי פוזיציה, נתריע רק על 50% הנותרים וניקח את נתוני החצי פוזיציה
                        if (isCompletionAlert) {
                            riskForNextAlert /= 2;
                            alertTargetPrice = nextExpectedEntry; // בהשלמה אנחנו מכוונים למדרגה הבאה שחושבה
                            const distToSL = Math.abs(finalSL - alertTargetPrice);
                            nextCoinAmount = parseFloat((distToSL > 0 ? riskForNextAlert / distToSL : 0).toFixed(6));
                            nextInvestAmount = parseFloat((alertTargetPrice * nextCoinAmount).toFixed(2));
                            nextTP = parseFloat(((2 * alertTargetPrice) - finalSL).toFixed(4));
                        } else {
                            const distExpectedToSL = Math.abs(finalSL - nextExpectedEntry);
                            nextCoinAmount = parseFloat((distExpectedToSL > 0 ? riskForNextAlert / distExpectedToSL : 0).toFixed(6));
                            nextInvestAmount = parseFloat((nextExpectedEntry * nextCoinAmount).toFixed(2));
                            nextTP = parseFloat(((2 * nextExpectedEntry) - finalSL).toFixed(4));
                        }

                        const alertCondition = alertTargetPrice < finalEntry ? 'below' : 'above';

                        if (shouldCreateAlert(alertTargetPrice, alertCondition)) {
                            const alertPrefix = isCompletionAlert ? `⚠️ COMPLETE HEDGE` : `⚠️ ENTER HEDGE`;
                            alertsToCreate.push({
                                coin: coin,
                                target_price: alertTargetPrice,
                                condition: alertCondition,
                                note: `${alertPrefix} ${alertHedgeNum} @ $${alertTargetPrice} | Amt: ${nextCoinAmount} | Inv: $${nextInvestAmount} | TP: ${nextTP} | SL: ${finalSL}`,
                                user_id: user.id
                            });
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

    const { calcInvest, calcProfit, calcRisk, activeEntry, activeAmount, activeTP } = calculateValues();

    if (!isOpen) return null;

    return (
        <>
            <div className="modal-overlay" onClick={onClose}></div>
            <div className="glass-panel modal-content" style={{width: 420, maxHeight: '90vh', overflowY: 'auto'}}>
                <h3 style={{ textAlign: 'center', marginBottom: 20 }}>
                    {mode === 'add'
                        ? (!parentSpot ? `הוספת ספוט ${coin}` : `הוספת גידור (Hedge ${strategy.currentHedgeIndex})`)
                        : (!parentSpot ? `עריכת ספוט ${coin}` : `עריכת גידור (Hedge ${strategy.currentHedgeIndex})`)
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

                {/* טוגל חצי פוזיציה במצב הוספת גידור */}
                {mode === 'add' && parentSpot && (
                    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(108, 92, 231, 0.1)', padding: '10px 15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid rgba(108, 92, 231, 0.3)'}}>
                        <div>
                            <strong style={{color: '#a29bfe', fontSize: '0.9rem'}}>חצי פוזיציה (כניסה מוקדמת)</strong>
                            <div style={{fontSize: '0.75rem', opacity: 0.7}}>היכנס עם 50% מהכמות והשלם בהמשך</div>
                        </div>
                        <div style={{
                            width: 40, height: 22, background: isHalfPosition ? '#6c5ce7' : '#333', 
                            borderRadius: 20, position: 'relative', cursor: 'pointer', transition: '0.3s'
                        }} onClick={handleToggleHalf}>
                            <div style={{
                                width: 18, height: 18, background: 'white', borderRadius: '50%', 
                                position: 'absolute', top: 2, left: isHalfPosition ? 2 : 20, transition: '0.3s'
                            }}></div>
                        </div>
                    </div>
                )}

                {/* אזור השלמת חצי פוזיציה (מוצג רק בעריכת שורט שמסומן כחצי) */}
                {mode === 'edit' && childHedge && isHalfPosition && (
                    <div style={{marginBottom: 15}}>
                        {!completionData.active ? (
                            <button onClick={() => {
                                const defaults = getCompletionDefaults();
                                setCompletionData({ active: true, entry: defaults.entry, amount: defaults.amount });
                            }} className="btn-action" style={{background: '#0984e3'}}>
                                השלם פוזיציה (קנה עוד 50%)
                            </button>
                        ) : (
                            <div style={{background: 'rgba(9, 132, 227, 0.1)', border: '1px solid #0984e3', padding: 15, borderRadius: 8}}>
                                <h4 style={{color: '#74b9ff', margin: '0 0 10px 0'}}>השלמת פוזיציה</h4>
                                <div style={{display: 'flex', gap: 10, marginBottom: 10}}>
                                    <div className="input-group" style={{flex: 1, margin: 0}}>
                                        <label style={{fontSize: '0.75rem'}}>מחיר כניסה חדש</label>
                                        <input type="number" className="glass-input" style={{padding: 8}} value={completionData.entry} onChange={e => handleCompletionEntryChange(e.target.value)} />
                                    </div>
                                    <div className="input-group" style={{flex: 1, margin: 0}}>
                                        <label style={{fontSize: '0.75rem'}}>כמות נוספת</label>
                                        <input type="number" className="glass-input" style={{padding: 8}} value={completionData.amount} onChange={e => setCompletionData({...completionData, amount: e.target.value})} />
                                    </div>
                                </div>
                                
                                <div style={{display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#0984e3', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '6px', marginBottom: '10px'}}>
                                    <div style={{textAlign: 'center', flex: 1}}>
                                        <div style={{opacity: 0.8, marginBottom: 2}}>השקעה משלימה ($)</div>
                                        <strong style={{fontSize: '1rem'}}>${(parseFloat(completionData.entry) > 0 && parseFloat(completionData.amount) > 0) ? (parseFloat(completionData.entry) * parseFloat(completionData.amount)).toFixed(2) : '-'}</strong>
                                    </div>
                                    <div style={{width: 1, background: 'rgba(9, 132, 227, 0.3)'}}></div>
                                    <div style={{textAlign: 'center', flex: 1}}>
                                        <div style={{opacity: 0.8, marginBottom: 2}}>מחיר ממוצע צפוי</div>
                                        <strong style={{fontSize: '1rem', color: '#00b894'}}>${completionData.entry && completionData.amount ? (((parseFloat(data.entry) * parseFloat(data.amount)) + (parseFloat(completionData.entry) * parseFloat(completionData.amount))) / (parseFloat(data.amount) + parseFloat(completionData.amount))).toFixed(4) : '-'}</strong>
                                    </div>
                                </div>

                                <div style={{fontSize: '0.75rem', color: '#a29bfe', textAlign: 'center'}}>
                                    השדות למטה מתעדכנים בזמן אמת לתצוגת סך הפוזיציה המאוחדת.
                                </div>
                                <button onClick={() => setCompletionData({...completionData, active: false})} style={{background: 'transparent', border: 'none', color: '#ff7675', cursor: 'pointer', width: '100%', marginTop: 10}}>ביטול השלמה</button>
                            </div>
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10 }}>
                     <div className="input-group" style={{ flex: 1 }}>
                        <label>תאריך</label>
                        <input type="date" className="glass-input" value={data.date} onChange={e => handleInput('date', e.target.value)} disabled={completionData.active} />
                     </div>
                     <div className="input-group" style={{ flex: 1 }}>
                        <label>שעה</label>
                        <input type="time" className="glass-input" value={data.time} onChange={e => handleInput('time', e.target.value)} disabled={completionData.active} />
                     </div>
                </div>

                <div className="input-group">
                    <label>{completionData.active ? 'מחיר כניסה ממוצע ($)' : 'מחיר כניסה ($)'}</label>
                    <input 
                        type="number" 
                        className="glass-input" 
                        value={completionData.active ? (isNaN(activeEntry) ? '' : activeEntry.toFixed(4)) : data.entry} 
                        onChange={e => handleInput('entry', e.target.value)} 
                        disabled={completionData.active} 
                    />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                    <div className="input-group" style={{ flex: 1 }}>
                        <label>{completionData.active ? 'TP (יעד ממוצע)' : 'TP (יעד)'}</label>
                        <input 
                            type="number" 
                            className="glass-input" 
                            value={completionData.active ? (isNaN(activeTP) ? '' : activeTP.toFixed(4)) : data.tp} 
                            onChange={e => handleInput('tp', e.target.value)} 
                            disabled={completionData.active} 
                        />
                    </div>
                    <div className="input-group" style={{ flex: 1 }}>
                        <label>SL (סטופ)</label>
                        <input type="number" className="glass-input" value={data.sl} onChange={e => handleInput('sl', e.target.value)} disabled={completionData.active} />
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
                        <span style={{fontSize:'0.7rem', opacity:0.7}}>{completionData.active ? 'סה"כ סיכון צפוי ($)' : 'סכום סיכון ($)'}</span>
                        <input 
                            type="number" 
                            className="glass-input" 
                            style={{textAlign:'center', fontSize:'1rem', padding:5}} 
                            value={completionData.active ? calcRisk.toFixed(2) : data.risk} 
                            onChange={e => handleInput('risk', e.target.value)} 
                            disabled={completionData.active} 
                        />
                     </div>
                     <div className="investment-highlight">
                        <span style={{fontSize:'0.7rem', opacity:0.7}}>{completionData.active ? 'סה"כ כמות צפויה' : 'כמות (Coins)'}</span>
                        <input 
                            type="number" 
                            className="glass-input" 
                            style={{textAlign:'center', fontSize:'1rem', padding:5}} 
                            value={completionData.active ? activeAmount.toFixed(6) : data.amount} 
                            onChange={e => handleInput('amount', e.target.value)} 
                            disabled={completionData.active} 
                        />
                     </div>
                     <div className="investment-highlight">
                        <span style={{fontSize:'0.7rem', opacity:0.7}}>{completionData.active ? 'סה"כ השקעה' : 'השקעה ($)'}</span>
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
                    <span style={{fontSize: '0.9rem'}}>
                        {mode === 'add' ? '🔔 צור התראות אוטומטיות' : '🔔 עדכן התראות אוטומטיות'}
                    </span>
                </div>
                
                {createAlerts && (
                    <div style={{textAlign:'center', fontSize:'0.75rem', color:'#00b894', marginTop:4, opacity: 0.8}}>
                        {mode === 'add' ? (
                            !parentSpot 
                                ? "ייווצרו התראות TP ו-SL לספוט"
                                : `ייווצרו התראות לגידור ${strategy.currentHedgeIndex}` + (isHalfPosition ? ` + התראת השלמה לגידור זה` : (strategy.currentHedgeIndex < (strategy.hedgesCount || parentSpot.strategy_hedges_count || 0) ? ` + כוננות לגידור הבא` : ""))
                        ) : (
                            !parentSpot 
                                ? "ההתראות הקיימות לספוט יעודכנו מחדש"
                                : `התראות גידור ${strategy.currentHedgeIndex} וההתראות הבאות יעודכנו מחדש`
                        )}
                    </div>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                    <button onClick={handleSave} className="btn-action btn-add-spot" style={{ flex: 1 }}>
                        {mode === 'add' ? 'שמור וצור' : (completionData.active ? 'שמור השלמה' : 'שמור עדכון')}
                    </button>
                    <button onClick={onClose} className="btn-action" style={{ flex: 1, background: '#333', color: '#ccc' }}>ביטול</button>
                </div>
            </div>
        </>
    );
}