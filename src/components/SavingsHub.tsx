// src/components/SavingsHub.tsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface Asset {
    id: string;
    user_id: string;
    name: string;
    bank_name?: string | null;
    owner_name?: string | null;
    type: 'bank_deposit' | 'fund';
    start_date: string;
    maturity_date: string | null;
    interest_rate: number;
    management_fee_deposit: number;
    management_fee_balance: number;
    tax_rate: number;
    status: 'active' | 'closed';
}

export interface Transaction {
    id: string;
    asset_id: string;
    date: string;
    amount: number;
    type: 'initial_deposit' | 'deposit' | 'withdrawal';
}

export interface Performance {
    id: string;
    asset_id: string;
    date: string;
    yield_percentage: number;
    profit_loss_amount: number | null;
    is_annual: boolean;
}

interface SavingsHubProps {
    user: any;
}

export default function SavingsHub({ user }: SavingsHubProps) {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [performances, setPerformances] = useState<Performance[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterType, setFilterType] = useState<'all' | 'bank_deposit' | 'fund'>('all');

    // Modal States
    const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
    const [modalTab, setModalTab] = useState<'info' | 'transactions' | 'ledger'>('info');
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    // --- Form States for Adding New Asset ---
    const [newAssetName, setNewAssetName] = useState('');
    const [newBankName, setNewBankName] = useState('');
    const [newOwnerName, setNewOwnerName] = useState('');
    const [newAssetType, setNewAssetType] = useState<'bank_deposit' | 'fund'>('bank_deposit');
    const [newTaxRate, setNewTaxRate] = useState('25');
    const [newFeeBalance, setNewFeeBalance] = useState('0');
    const [newInterestRate, setNewInterestRate] = useState('0');
    const [newInitialDeposit, setNewInitialDeposit] = useState(''); 
    const [isSavingAsset, setIsSavingAsset] = useState(false);
    const [isUpdatingAsset, setIsUpdatingAsset] = useState(false);

    // --- Form States for Transactions ---
    const [transDate, setTransDate] = useState(new Date().toISOString().split('T')[0]);
    const [transAmount, setTransAmount] = useState('');
    const [transType, setTransType] = useState<'deposit' | 'withdrawal'>('deposit');
    const [isSavingTrans, setIsSavingTrans] = useState(false);

    // --- Form States for Performance (Ledger) ---
    const [perfDate, setPerfDate] = useState(new Date().toISOString().split('T')[0]);
    const [perfYield, setPerfYield] = useState('');
    const [perfAnchor, setPerfAnchor] = useState('');
    const [isSavingPerf, setIsSavingPerf] = useState(false);

    useEffect(() => {
        if (user) {
            fetchData();
        }
    }, [user]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [assetsRes, transRes, perfRes] = await Promise.all([
                supabase.from('assets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
                supabase.from('asset_transactions').select('*').order('date', { ascending: false }),
                supabase.from('asset_performance').select('*').order('date', { ascending: false })
            ]);

            if (assetsRes.data) setAssets(assetsRes.data);
            if (transRes.data) setTransactions(transRes.data);
            if (perfRes.data) setPerformances(perfRes.data);
        } catch (error) {
            console.error('Error fetching savings data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    // --- Data Management Functions ---

    const handleAddAsset = async () => {
        if (!newAssetName.trim()) return alert('נא להזין שם נכס');
        setIsSavingAsset(true);

        // 1. יצירת הנכס
        const { data: assetData, error: assetError } = await supabase.from('assets').insert([{
            user_id: user.id,
            name: newAssetName,
            bank_name: newBankName,
            owner_name: newOwnerName,
            type: newAssetType,
            start_date: new Date().toISOString().split('T')[0],
            tax_rate: Number(newTaxRate),
            management_fee_balance: Number(newFeeBalance),
            interest_rate: Number(newInterestRate)
        }]).select();

        if (assetError) {
            setIsSavingAsset(false);
            return alert('שגיאה בהוספת נכס: ' + assetError.message);
        }

        if (assetData && assetData[0]) {
            const newAsset = assetData[0] as Asset;
            setAssets(prev => [newAsset, ...prev]);

            // 2. יצירת ההפקדה הראשונית אם המשתמש הזין סכום
            if (newInitialDeposit && Number(newInitialDeposit) > 0) {
                const { data: txData, error: txError } = await supabase.from('asset_transactions').insert([{
                    asset_id: newAsset.id,
                    date: new Date().toISOString().split('T')[0],
                    amount: Number(newInitialDeposit),
                    type: 'initial_deposit'
                }]).select();

                if (!txError && txData) {
                    setTransactions(prev => [txData[0] as Transaction, ...prev]);
                }
            }

            // איפוס מודאל
            setIsAddModalOpen(false);
            setNewAssetName('');
            setNewBankName('');
            setNewOwnerName('');
            setNewTaxRate('25');
            setNewFeeBalance('0');
            setNewInterestRate('0');
            setNewInitialDeposit('');
        }
        
        setIsSavingAsset(false);
    };

    const handleUpdateAsset = async () => {
        if (!selectedAsset) return;
        if (!selectedAsset.name.trim()) return alert('נא להזין שם נכס');

        setIsUpdatingAsset(true);

        const { error } = await supabase.from('assets').update({
            name: selectedAsset.name,
            bank_name: selectedAsset.bank_name,
            owner_name: selectedAsset.owner_name,
            start_date: selectedAsset.start_date,
            maturity_date: selectedAsset.maturity_date || null,
            tax_rate: Number(selectedAsset.tax_rate),
            management_fee_balance: Number(selectedAsset.management_fee_balance),
            interest_rate: Number(selectedAsset.interest_rate),
            status: selectedAsset.status
        }).eq('id', selectedAsset.id);

        setIsUpdatingAsset(false);

        if (error) {
            alert('שגיאה בעדכון הנכס: ' + error.message);
        } else {
            setAssets(prev => prev.map(a => a.id === selectedAsset.id ? selectedAsset : a));
            alert('הנכס עודכן בהצלחה!');
        }
    };

    const handleDeleteAsset = async () => {
        if (!selectedAsset) return;
        
        if (!confirm(`האם אתה בטוח שברצונך למחוק את הנכס "${selectedAsset.name}"?\nפעולה זו תמחק גם את כל התנועות והתשואות המשויכות לו ולא ניתנת לביטול!`)) {
            return;
        }

        try {
            const { error } = await supabase.from('assets').delete().eq('id', selectedAsset.id);
            
            if (error) throw error;

            // Remove from local state
            setAssets(prev => prev.filter(a => a.id !== selectedAsset.id));
            setTransactions(prev => prev.filter(t => t.asset_id !== selectedAsset.id));
            setPerformances(prev => prev.filter(p => p.asset_id !== selectedAsset.id));
            
            setSelectedAsset(null);

        } catch (error: any) {
            alert('שגיאה במחיקת הנכס: ' + error.message);
        }
    };

    const handleAddTransaction = async () => {
        if (!selectedAsset || !transAmount) return alert('נא להזין סכום');
        setIsSavingTrans(true);

        const amountNum = Math.abs(Number(transAmount));
        const finalAmount = transType === 'withdrawal' ? -amountNum : amountNum;

        const { data, error } = await supabase.from('asset_transactions').insert([{
            asset_id: selectedAsset.id,
            date: transDate,
            amount: finalAmount,
            type: transType
        }]).select();

        setIsSavingTrans(false);

        if (error) {
            alert('שגיאה בהוספת תנועה: ' + error.message);
        } else if (data) {
            setTransactions(prev => [data[0] as Transaction, ...prev]);
            setTransAmount('');
        }
    };

    const handleAddPerformance = async () => {
        if (!selectedAsset) return;
        if (!perfYield && !perfAnchor) return alert('נא להזין אחוז תשואה או סכום עוגן רווח בשקלים');
        
        setIsSavingPerf(true);

        const payload: any = {
            asset_id: selectedAsset.id,
            date: perfDate,
        };

        if (perfYield) payload.yield_percentage = Number(perfYield);
        if (perfAnchor) payload.profit_loss_amount = Number(perfAnchor);

        const { data, error } = await supabase.from('asset_performance').insert([payload]).select();

        setIsSavingPerf(false);

        if (error) {
            alert('שגיאה בשמירת התשואה: ' + error.message);
        } else if (data) {
            setPerformances(prev => [data[0] as Performance, ...prev]);
            setPerfYield('');
            setPerfAnchor('');
        }
    };

    // --- חישובים לוגיים נגזרים ---
    const calculateAssetData = (assetId: string) => {
        const assetTrans = transactions.filter(t => t.asset_id === assetId);
        const assetPerfs = performances.filter(p => p.asset_id === assetId);
        const asset = assets.find(a => a.id === assetId);

        let totalDeposited = 0;
        assetTrans.forEach(t => totalDeposited += Number(t.amount));

        let grossProfit = 0;
        
        // חיפוש נקודת עוגן קשיחה בשקלים בביצועים (אם הוזן רווח/הפסד ידני, הוא דורס חישוב לפי אחוזים)
        // לצורך פישוט בדשבורד נשתמש בנקודת העוגן האחרונה שיש לה סכום
        // (הערה: במערכת אמיתית נדרש למיין תאריכים ולצבור, פה הפישוט לוקח את העוגן האחרון)
        const sortedPerfs = [...assetPerfs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latestAnchor = sortedPerfs.find(p => p.profit_loss_amount !== null && p.profit_loss_amount !== undefined);
        
        if (latestAnchor && latestAnchor.profit_loss_amount !== null) {
            grossProfit = Number(latestAnchor.profit_loss_amount);
        } else {
            // אם אין עוגן, חישוב פשוט לפי אחוזים מהקרן המופקדת (או ריבית בפיקדון)
            let totalYield = 0;
            if (asset?.type === 'bank_deposit' && assetPerfs.length === 0 && asset.interest_rate > 0) {
                 // חישוב בסיסי מאוד לריבית שנתית (אם אין דיווחי ביצועים כלל) - למטרות תצוגה ראשונית
                 const years = (new Date().getTime() - new Date(asset.start_date).getTime()) / (1000 * 3600 * 24 * 365.25);
                 if (years > 0) {
                     totalYield = asset.interest_rate * years;
                 }
            } else {
                 assetPerfs.forEach(p => totalYield += Number(p.yield_percentage));
            }
            grossProfit = totalDeposited * (totalYield / 100);
        }

        const taxRate = asset?.tax_rate || 0;
        // המס מנוכה רק מהרווח, ואם יש הפסד אין מס
        const netProfit = grossProfit > 0 ? grossProfit * (1 - (taxRate / 100)) : grossProfit;
        const currentBalance = totalDeposited + netProfit;

        return { totalDeposited, grossProfit, netProfit, currentBalance };
    };

    // --- חישובים לדשבורד העליון ---
    let totalCapital = 0;
    let totalNetProfit = 0;
    let depositsTotal = 0;
    let fundsTotal = 0;

    assets.forEach(asset => {
        const { currentBalance, netProfit } = calculateAssetData(asset.id);
        totalCapital += currentBalance;
        totalNetProfit += netProfit;

        if (asset.type === 'bank_deposit') depositsTotal += currentBalance;
        else fundsTotal += currentBalance;
    });

    const filteredAssets = assets.filter(a => 
        (filterType === 'all' || a.type === filterType) &&
        (a.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
         a.bank_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
         a.owner_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    );

    if (isLoading) return <div style={{ textAlign: 'center', padding: 40, opacity: 0.8 }}>טוען נתונים...</div>;

    return (
        <div className="tab-content active" style={{ direction: 'rtl', padding: '10px' }}>
            <div className="calc-header" style={{ marginBottom: '20px' }}>
                <h2>חסכונות וקרנות 🏦</h2>
                <p>ניהול ומעקב אחר פיקדונות, קרנות השתלמות ופנסיה (₪)</p>
            </div>

            {/* --- Dashboard Top --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', borderTop: '4px solid #6c5ce7' }}>
                    <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>סך הון נזיל וצבור (₪)</div>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                        ₪{totalCapital.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="glass-panel" style={{ padding: '20px', textAlign: 'center', borderTop: `4px solid ${totalNetProfit >= 0 ? '#00b894' : '#ff7675'}` }}>
                    <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>רווח נטו כולל (לאחר מס)</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 'bold', fontFamily: 'monospace', color: totalNetProfit >= 0 ? '#00b894' : '#ff7675' }}>
                        {totalNetProfit >= 0 ? '+' : ''}₪{totalNetProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
                <div className="glass-panel" style={{ padding: '15px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span>פיקדונות בנקאיים:</span>
                        <strong style={{ fontFamily: 'monospace' }}>₪{depositsTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>קרנות וקופות:</span>
                        <strong style={{ fontFamily: 'monospace' }}>₪{fundsTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                    </div>
                </div>
            </div>

            {/* --- Filters & Actions --- */}
            <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', alignItems: 'center' }}>
                <input 
                    type="text" 
                    placeholder="חיפוש נכס, בנק או בעלים..." 
                    className="glass-input" 
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ flex: 1, padding: '10px' }}
                />
                <select className="glass-input" style={{ width: '200px', padding: '10px' }} value={filterType} onChange={e => setFilterType(e.target.value as any)}>
                    <option value="all">כל הנכסים</option>
                    <option value="bank_deposit">פיקדונות בלבד</option>
                    <option value="fund">קרנות בלבד</option>
                </select>
                <button className="btn-action" style={{ background: '#00b894', width: 'auto', padding: '10px 20px', margin: 0 }} onClick={() => setIsAddModalOpen(true)}>
                    + הוסף נכס
                </button>
            </div>

            {/* --- Asset Grid --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {filteredAssets.map(asset => {
                    const data = calculateAssetData(asset.id);
                    return (
                        <div key={asset.id} className="glass-panel" style={{ padding: '20px', cursor: 'pointer', transition: 'transform 0.2s', border: '1px solid rgba(255,255,255,0.05)' }}
                             onClick={() => { setSelectedAsset(asset); setModalTab('info'); }}
                             onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-5px)'}
                             onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                                <div>
                                    <h3 style={{ fontSize: '1.2rem', margin: 0 }}>{asset.name}</h3>
                                    <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '2px' }}>
                                        {asset.bank_name && <span>{asset.bank_name} | </span>}
                                        {asset.owner_name && <span>{asset.owner_name}</span>}
                                    </div>
                                    <span style={{ fontSize: '0.8rem', opacity: 0.8, background: 'rgba(255,255,255,0.1)', padding: '2px 8px', borderRadius: '4px', marginTop: '5px', display: 'inline-block' }}>
                                        {asset.type === 'bank_deposit' ? 'פיקדון בנקאי' : 'קרן/קופה'}
                                    </span>
                                </div>
                                <span style={{ fontSize: '0.8rem', color: asset.status === 'active' ? '#00b894' : '#ff7675' }}>
                                    {asset.status === 'active' ? '● פעיל' : '○ סגור'}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.95rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ opacity: 0.8 }}>קרן מופקדת:</span>
                                    <strong style={{ fontFamily: 'monospace' }}>₪{data.totalDeposited.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ opacity: 0.8 }}>רווח נטו ({asset.tax_rate}% מס):</span>
                                    <strong style={{ fontFamily: 'monospace', color: data.netProfit >= 0 ? '#00b894' : '#ff7675' }}>
                                        {data.netProfit >= 0 ? '+' : ''}₪{data.netProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                    </strong>
                                </div>
                                <div style={{ height: '1px', background: 'rgba(255,255,255,0.1)', margin: '5px 0' }}></div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem' }}>
                                    <span>יתרה מוערכת:</span>
                                    <strong style={{ fontFamily: 'monospace', color: '#a29bfe' }}>₪{data.currentBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong>
                                </div>
                            </div>
                        </div>
                    );
                })}
                {filteredAssets.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', opacity: 0.5, padding: '40px' }}>
                        לא נמצאו נכסים תואמים. לחץ על "הוסף נכס" כדי להתחיל.
                    </div>
                )}
            </div>

            {/* --- Modal Manage Asset --- */}
            {selectedAsset && (
                <>
                    <div className="modal-overlay" onClick={() => setSelectedAsset(null)}></div>
                    <div className="glass-panel modal-content" style={{ width: '600px', maxWidth: '95vw', padding: '0', overflow: 'hidden' }}>
                        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.4rem' }}>{selectedAsset.name}</h3>
                            <div style={{display: 'flex', gap: '15px', alignItems: 'center'}}>
                                <button onClick={handleDeleteAsset} style={{ background: 'none', border: 'none', color: '#ff7675', fontSize: '1.2rem', cursor: 'pointer' }} title="מחק נכס">🗑</button>
                                <button onClick={() => setSelectedAsset(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.02)' }}>
                            <button onClick={() => setModalTab('info')} style={{ flex: 1, padding: '15px', background: modalTab === 'info' ? 'rgba(108, 92, 231, 0.2)' : 'transparent', border: 'none', borderBottom: modalTab === 'info' ? '2px solid #6c5ce7' : '2px solid transparent', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>מידע והגדרות</button>
                            <button onClick={() => setModalTab('transactions')} style={{ flex: 1, padding: '15px', background: modalTab === 'transactions' ? 'rgba(108, 92, 231, 0.2)' : 'transparent', border: 'none', borderBottom: modalTab === 'transactions' ? '2px solid #6c5ce7' : '2px solid transparent', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>תנועות</button>
                            <button onClick={() => setModalTab('ledger')} style={{ flex: 1, padding: '15px', background: modalTab === 'ledger' ? 'rgba(108, 92, 231, 0.2)' : 'transparent', border: 'none', borderBottom: modalTab === 'ledger' ? '2px solid #6c5ce7' : '2px solid transparent', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}>מעקב תשואות</button>
                        </div>

                        <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
                            {modalTab === 'info' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label>שם הנכס</label>
                                        <input type="text" className="glass-input" value={selectedAsset.name} onChange={e => setSelectedAsset({...selectedAsset, name: e.target.value})} />
                                    </div>
                                    <div style={{ display: 'flex', gap: '15px' }}>
                                        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                            <label>קופה / בנק</label>
                                            <input type="text" className="glass-input" value={selectedAsset.bank_name || ''} placeholder="לדוגמה: אלטשולר שחם" onChange={e => setSelectedAsset({...selectedAsset, bank_name: e.target.value})} />
                                        </div>
                                        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                            <label>שם בעל הנכס</label>
                                            <input type="text" className="glass-input" value={selectedAsset.owner_name || ''} onChange={e => setSelectedAsset({...selectedAsset, owner_name: e.target.value})} />
                                        </div>
                                    </div>
                                    <div className="input-group" style={{ marginBottom: 0 }}>
                                        <label>סטטוס</label>
                                        <select className="glass-input" value={selectedAsset.status} onChange={e => setSelectedAsset({...selectedAsset, status: e.target.value as any})}>
                                            <option value="active">פעיל</option>
                                            <option value="closed">סגור / נפדה</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'flex', gap: '15px' }}>
                                        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                            <label>תאריך פתיחה</label>
                                            <input type="date" className="glass-input" value={selectedAsset.start_date} onChange={e => setSelectedAsset({...selectedAsset, start_date: e.target.value})} />
                                        </div>
                                        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                            <label>תחנת יציאה / נזילות</label>
                                            <input type="date" className="glass-input" value={selectedAsset.maturity_date || ''} onChange={e => setSelectedAsset({...selectedAsset, maturity_date: e.target.value})} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '15px' }}>
                                        <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                            <label>מס רווח הון (%)</label>
                                            <input type="number" className="glass-input" value={selectedAsset.tax_rate} onChange={e => setSelectedAsset({...selectedAsset, tax_rate: Number(e.target.value)})} />
                                        </div>
                                        {selectedAsset.type === 'fund' && (
                                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                                <label>דמי ניהול מצבירה (%)</label>
                                                <input type="number" className="glass-input" value={selectedAsset.management_fee_balance} onChange={e => setSelectedAsset({...selectedAsset, management_fee_balance: Number(e.target.value)})} />
                                            </div>
                                        )}
                                        {selectedAsset.type === 'bank_deposit' && (
                                            <div className="input-group" style={{ flex: 1, marginBottom: 0 }}>
                                                <label>ריבית שנתית מתואמת (%)</label>
                                                <input type="number" step="0.01" className="glass-input" value={selectedAsset.interest_rate} onChange={e => setSelectedAsset({...selectedAsset, interest_rate: Number(e.target.value)})} />
                                            </div>
                                        )}
                                    </div>
                                    
                                    <button 
                                        className="btn-action" 
                                        style={{ background: '#0984e3', marginTop: '10px' }} 
                                        onClick={handleUpdateAsset} 
                                        disabled={isUpdatingAsset}
                                    >
                                        {isUpdatingAsset ? 'שומר...' : 'שמור שינויים'}
                                    </button>
                                </div>
                            )}

                            {modalTab === 'transactions' && (
                                <div>
                                    <div style={{ marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px' }}>
                                        <h4 style={{ margin: '0 0 10px 0' }}>הוספת תנועה חדשה</h4>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <input type="date" className="glass-input" style={{ flex: 1 }} value={transDate} onChange={e => setTransDate(e.target.value)} />
                                            <input type="number" className="glass-input" placeholder="סכום (₪)" style={{ flex: 1 }} value={transAmount} onChange={e => setTransAmount(e.target.value)} />
                                            <select className="glass-input" style={{ flex: 1 }} value={transType} onChange={e => setTransType(e.target.value as any)}>
                                                <option value="deposit">הפקדה (+)</option>
                                                <option value="withdrawal">משיכה (-)</option>
                                            </select>
                                            <button className="btn-action" onClick={handleAddTransaction} disabled={isSavingTrans} style={{ background: '#00b894', width: 'auto', padding: '0 20px' }}>
                                                {isSavingTrans ? '...' : 'הוסף'}
                                            </button>
                                        </div>
                                    </div>
                                    <table style={{ width: '100%', textAlign: 'right', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: 0.7 }}>
                                                <th style={{ padding: '10px' }}>תאריך</th>
                                                <th style={{ padding: '10px' }}>סוג</th>
                                                <th style={{ padding: '10px' }}>סכום</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {transactions.filter(t => t.asset_id === selectedAsset.id).map(t => (
                                                <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '10px' }}>{t.date}</td>
                                                    <td style={{ padding: '10px' }}>{t.type === 'withdrawal' ? 'משיכה' : 'הפקדה'}</td>
                                                    <td style={{ padding: '10px', color: Number(t.amount) >= 0 ? '#00b894' : '#ff7675', fontFamily: 'monospace', fontWeight: 'bold' }}>
                                                        {Number(t.amount) >= 0 ? '+' : ''}₪{Math.abs(Number(t.amount)).toLocaleString()}
                                                    </td>
                                                </tr>
                                            ))}
                                            {transactions.filter(t => t.asset_id === selectedAsset.id).length === 0 && (
                                                <tr><td colSpan={3} style={{textAlign: 'center', padding: '20px', opacity: 0.5}}>אין תנועות כספיות לנכס זה</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {modalTab === 'ledger' && (
                                <div>
                                    <div style={{ marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px' }}>
                                        <h4 style={{ margin: '0 0 10px 0' }}>עדכון תשואה / עיגון יתרה</h4>
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            <input type="date" className="glass-input" style={{ flex: 1, minWidth: '120px' }} value={perfDate} onChange={e => setPerfDate(e.target.value)} />
                                            <input type="number" className="glass-input" placeholder="תשואה (%)" style={{ flex: 1, minWidth: '100px' }} value={perfYield} onChange={e => setPerfYield(e.target.value)} />
                                            <input type="number" className="glass-input" placeholder="או: עוגן רווח מדויק (₪)" style={{ flex: 1.5, minWidth: '150px' }} title="הזנת סכום זה תדרוס את חישוב האחוזים עד לנקודה זו" value={perfAnchor} onChange={e => setPerfAnchor(e.target.value)} />
                                            <button className="btn-action" onClick={handleAddPerformance} disabled={isSavingPerf} style={{ background: '#0984e3', width: 'auto', padding: '0 20px' }}>
                                                {isSavingPerf ? '...' : 'שמור'}
                                            </button>
                                        </div>
                                    </div>
                                    <table style={{ width: '100%', textAlign: 'right', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', opacity: 0.7 }}>
                                                <th style={{ padding: '10px' }}>תאריך</th>
                                                <th style={{ padding: '10px' }}>תשואה (%)</th>
                                                <th style={{ padding: '10px' }}>עוגן רווח (₪)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {performances.filter(p => p.asset_id === selectedAsset.id).map(p => (
                                                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '10px' }}>{p.date}</td>
                                                    <td style={{ padding: '10px', color: Number(p.yield_percentage) >= 0 ? '#00b894' : '#ff7675' }}>
                                                        {p.yield_percentage ? `${Number(p.yield_percentage) >= 0 ? '+' : ''}${p.yield_percentage}%` : '-'}
                                                    </td>
                                                    <td style={{ padding: '10px', fontFamily: 'monospace' }}>
                                                        {p.profit_loss_amount !== null ? `₪${Number(p.profit_loss_amount).toLocaleString()}` : '-'}
                                                    </td>
                                                </tr>
                                            ))}
                                            {performances.filter(p => p.asset_id === selectedAsset.id).length === 0 && (
                                                <tr><td colSpan={3} style={{textAlign: 'center', padding: '20px', opacity: 0.5}}>לא הוזנו תשואות</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

            {/* --- Modal Add New Asset --- */}
            {isAddModalOpen && (
                <>
                    <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}></div>
                    <div className="glass-panel modal-content" style={{ padding: '25px', width: '450px' }}>
                        <h3 style={{ marginTop: 0, marginBottom: '20px', textAlign: 'center' }}>הוספת נכס חדש</h3>
                        <div className="input-group">
                            <label>שם הנכס</label>
                            <input type="text" className="glass-input" placeholder='לדוגמה: "השתלמות - מסלול מחקה מדד"' value={newAssetName} onChange={e => setNewAssetName(e.target.value)} />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>קופה / בנק</label>
                                <input type="text" className="glass-input" placeholder='לדוגמה: "אלטשולר שחם"' value={newBankName} onChange={e => setNewBankName(e.target.value)} />
                            </div>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>שם בעל הנכס</label>
                                <input type="text" className="glass-input" value={newOwnerName} onChange={e => setNewOwnerName(e.target.value)} />
                            </div>
                        </div>

                        <div className="input-group">
                            <label>סוג הנכס</label>
                            <select className="glass-input" value={newAssetType} onChange={e => setNewAssetType(e.target.value as any)}>
                                <option value="bank_deposit">פיקדון בנקאי / חיסכון</option>
                                <option value="fund">קרן השתלמות / פנסיה / קופת גמל</option>
                            </select>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <div className="input-group" style={{ flex: 1 }}>
                                <label>מס רווח הון (%)</label>
                                <input type="number" className="glass-input" value={newTaxRate} onChange={e => setNewTaxRate(e.target.value)} />
                            </div>

                            {newAssetType === 'fund' && (
                                <div className="input-group" style={{ flex: 1 }}>
                                    <label>דמי ניהול מצבירה (%)</label>
                                    <input type="number" className="glass-input" value={newFeeBalance} onChange={e => setNewFeeBalance(e.target.value)} />
                                </div>
                            )}

                            {newAssetType === 'bank_deposit' && (
                                <div className="input-group" style={{ flex: 1 }}>
                                    <label>ריבית שנתית מתואמת (%)</label>
                                    <input type="number" step="0.01" className="glass-input" value={newInterestRate} onChange={e => setNewInterestRate(e.target.value)} />
                                </div>
                            )}
                        </div>

                        <div className="input-group" style={{ marginTop: '10px' }}>
                            <label>סכום הפקדה התחלתי (₪)</label>
                            <input type="number" className="glass-input" placeholder="לדוגמה: 50000" value={newInitialDeposit} onChange={e => setNewInitialDeposit(e.target.value)} />
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button className="btn-action" style={{ flex: 1, background: '#00b894' }} onClick={handleAddAsset} disabled={isSavingAsset}>
                                {isSavingAsset ? 'שומר...' : 'שמור'}
                            </button>
                            <button className="btn-action" style={{ flex: 1, background: '#333' }} onClick={() => setIsAddModalOpen(false)}>
                                ביטול
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}