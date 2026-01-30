// tradewall\src\components\RiskCalculator.tsx

import React, { useState, useEffect } from 'react';

type Prices = {
    [key: string]: number;
};

interface RiskCalculatorProps {
    prices: Prices;
}

const COINS = ['BTC', 'ETH', 'BNB', 'SOL'];

export default function RiskCalculator({ prices }: RiskCalculatorProps) {
    // State פנימי למחשבון - מנותק מהדף הראשי
    const [calcMode, setCalcMode] = useState<'long' | 'short'>('long');
    const [selectedCoin, setSelectedCoin] = useState<string>('BTC');
    const [inputs, setInputs] = useState({
        risk: 50,
        entry: '',
        tp: '',
        sl: ''
    });

    // עדכון אוטומטי של מחיר הכניסה כשהמחיר משתנה (אם השדה ריק)
    useEffect(() => {
        if (!inputs.entry && prices[selectedCoin] > 0) {
            setInputs(prev => ({ ...prev, entry: prices[selectedCoin].toString() }));
        }
    }, [prices[selectedCoin], selectedCoin, inputs.entry]); 

    // לוגיקת החישוב
    const runRiskCalc = () => {
        const entry = parseFloat(inputs.entry);
        const risk = inputs.risk;
        const slPrice = parseFloat(inputs.sl);
        const tpPrice = parseFloat(inputs.tp);

        // חישוב בסיסי דורש כניסה, סיכון וסטופ
        if (!entry || !risk || !slPrice) return { posSize: 0, amount: 0, tpPercent: 0, slPercent: 0, expectedProfit: 0, expectedLoss: 0 };

        const priceDiff = Math.abs(entry - slPrice);
        if (priceDiff === 0) return { posSize: 0, amount: 0, tpPercent: 0, slPercent: 0, expectedProfit: 0, expectedLoss: 0 };

        const amount = risk / priceDiff;
        const posSize = amount * entry;

        const tpPercent = tpPrice ? ((Math.abs(tpPrice - entry) / entry) * 100) : 0;
        const slPercent = ((Math.abs(slPrice - entry) / entry) * 100);

        // חישוב רווח והפסד דולרי צפוי
        const expectedProfit = tpPrice ? (amount * Math.abs(tpPrice - entry)) : 0;
        // ההפסד הצפוי אמור להיות שווה לערך הסיכון שהוזן, אבל נחשב אותו כדי לוודא דיוק מתמטי
        const expectedLoss = amount * Math.abs(slPrice - entry); 

        return { posSize, amount, tpPercent, slPercent, expectedProfit, expectedLoss };
    };

    const results = runRiskCalc();

    return (
        <div className="tab-content active">
            <div className="calc-header">
                <h2>ניהול סיכונים</h2>
                <p>חשב גודל פוזיציה לפי הסיכון ומחיר סטופ</p>
            </div>

            <div className="coin-select-row">
                {COINS.map(c => (
                    <button key={c} 
                        className={`coin-btn ${selectedCoin === c ? 'active' : ''}`}
                        onClick={() => {
                            setSelectedCoin(c);
                            setInputs(prev => ({...prev, entry: prices[c].toString()}));
                        }}
                    >
                        {c}
                    </button>
                ))}
            </div>

            <div className="mode-toggle">
                <button className={`mode-btn short ${calcMode === 'short' ? 'active' : ''}`} onClick={() => setCalcMode('short')}>SHORT 📉</button>
                <button className={`mode-btn long ${calcMode === 'long' ? 'active' : ''}`} onClick={() => setCalcMode('long')}>LONG 📈</button>
            </div>

            <div style={{display:'flex', gap:15}}>
                <div className="input-group" style={{flex:1}}>
                    <label>סיכון ($) מקסימלי</label>
                    <input type="number" className="glass-input" value={inputs.risk} 
                        onChange={(e) => setInputs({...inputs, risk: parseFloat(e.target.value) || 0})} />
                </div>
                <div className="input-group" style={{flex:1}}>
                    <label>מחיר כניסה ($)</label>
                    <input type="number" className="glass-input" value={inputs.entry} 
                        onChange={(e) => setInputs({...inputs, entry: e.target.value})} />
                </div>
            </div>

            <div style={{display:'flex', gap:15}}>
                <div className="input-group" style={{flex:1}}>
                    <label>מחיר יעד (TP $)</label>
                    <input type="number" className="glass-input" placeholder="מחיר יעד" value={inputs.tp}
                        onChange={(e) => setInputs({...inputs, tp: e.target.value})} />
                </div>
                <div className="input-group" style={{flex:1}}>
                    <label>מחיר סטופ (SL $)</label>
                    <input type="number" className="glass-input" placeholder="מחיר סטופ" value={inputs.sl}
                        onChange={(e) => setInputs({...inputs, sl: e.target.value})} />
                </div>
            </div>

            <div className="calc-result-box">
                <div className="res-top">
                    <div style={{textAlign:'right'}}>
                        <span className="res-label">גודל פוזיציה נדרש (Total):</span>
                        <div className="res-main-val">${results.posSize.toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                    </div>
                    <div style={{textAlign:'left'}}>
                        <span className="res-label">כמות מטבעות לקנייה:</span>
                        <div className="res-sub-val">{results.amount.toFixed(4)} {selectedCoin}</div>
                    </div>
                </div>
                
                <div className="res-grid">
                    <div className="res-item-small" style={{textAlign:'right'}}>
                        <span className="res-label">Target Price</span>
                        <div className="val" style={{color:'#00b894'}}>
                            {inputs.tp ? `$${parseFloat(inputs.tp).toFixed(2)}` : '-'}
                            {inputs.tp && <span style={{fontSize:'0.7em', opacity:0.7, marginRight: 5}}>({results.tpPercent.toFixed(2)}%)</span>}
                        </div>
                        {/* תצוגת רווח צפוי */}
                        {results.expectedProfit > 0 && (
                            <div style={{color: '#00b894', fontSize: '0.85em', marginTop: '4px', opacity: 0.9}}>
                                רווח צפוי: +${results.expectedProfit.toLocaleString(undefined, {maximumFractionDigits: 2})}
                            </div>
                        )}
                    </div>
                    <div className="res-item-small" style={{textAlign:'left'}}>
                        <span className="res-label">Stop Price</span>
                        <div className="val" style={{color:'#ff7675'}}>
                            {inputs.sl ? `$${parseFloat(inputs.sl).toFixed(2)}` : '-'}
                            {inputs.sl && <span style={{fontSize:'0.7em', opacity:0.7, marginRight: 5}}>({results.slPercent.toFixed(2)}%)</span>}
                        </div>
                        {/* תצוגת הפסד צפוי */}
                        {results.expectedLoss > 0 && (
                            <div style={{color: '#ff7675', fontSize: '0.85em', marginTop: '4px', opacity: 0.9}}>
                                הפסד צפוי: -${results.expectedLoss.toLocaleString(undefined, {maximumFractionDigits: 2})}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}