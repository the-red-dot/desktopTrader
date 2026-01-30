// tradewall\src\components\LiveTicker.tsx

import React from 'react';

// הגדרת הטיפוסים הנדרשים לקומפוננטה
type Prices = {
    [key: string]: number;
};

interface LiveTickerProps {
    prices: Prices;
    onCoinClick: (coin: string) => void;
}

const COINS = ['BTC', 'ETH', 'BNB', 'SOL'];

export default function LiveTicker({ prices, onCoinClick }: LiveTickerProps) {
    return (
        <div className="glass-panel ticker-col">
            <h3 style={{textAlign:'center', marginBottom:20, opacity:0.9}}>שוק בזמן אמת</h3>
            {COINS.map(coin => {
                return (
                    <div key={coin} className="coin-card" onClick={() => onCoinClick(coin)}>
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
                );
            })}
        </div>
    );
}