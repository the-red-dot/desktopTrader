// tradewall\src\components\KeyboardShortcuts.tsx

import React from 'react';

export default function KeyboardShortcuts() {
    return (
        <div className="tab-content active">
             <div className="calc-header">
                <h2>קיצורי מקלדת</h2>
                <p>ייעול עבודה בווינדוס</p>
            </div>
            <div className="shortcuts-grid">
                {[
                    { keys: ['Win','Ctrl','D'], desc: 'יוצר שולחן עבודה וירטואלי חדש' },
                    { keys: ['Win','Tab'], desc: 'מבט משימות / שולחנות עבודה' },
                    { keys: ['Alt','Tab'], desc: 'מעבר מהיר בין חלונות' },
                    { keys: ['Win','V'], desc: 'היסטוריית לוח (Clipboard)' },
                    { keys: ['Win','Arrows'], desc: 'הצמדת חלונות לצדדים' },
                    { keys: ['Ctrl','Shift','T'], desc: 'שחזור לשונית שנסגרה' },
                    { keys: ['Win','Shift','S'], desc: 'צילום מסך (Snipping Tool)' },
                    { keys: ['Win','E'], desc: 'פתיחת סייר הקבצים' },
                ].map((s, i) => (
                    <div key={i} className="shortcut-card">
                        <div className="key-combo">
                            {s.keys.map((k, j) => <React.Fragment key={j}><span className="key">{k}</span>{j < s.keys.length-1 && '+'}</React.Fragment>)}
                        </div>
                        <div className="shortcut-desc">{s.desc}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}