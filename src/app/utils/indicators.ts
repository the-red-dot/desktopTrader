// src/app/utils/indicators.ts

/**
 * מחשב RSI (Relative Strength Index) בהינתן מערך של מחירי סגירה.
 * * @param closes מערך של מחירי סגירה (הישן ביותר ראשון, החדש ביותר אחרון)
 * @param period אורך תקופת ה-RSI (ברירת מחדל 14)
 * @returns מערך של ערכי RSI בהתאמה למחירי הסגירה. לערכים הראשונים (לפני ה-period) יהיה null.
 */
export function calculateRSI(closes: number[], period: number = 14): (number | null)[] {
    if (!closes || closes.length <= period) {
        return closes.map(() => null);
    }

    const rsiArray: (number | null)[] = new Array(closes.length).fill(null);

    let gains = 0;
    let losses = 0;

    // חישוב ממוצע ראשוני
    for (let i = 1; i <= period; i++) {
        const change = closes[i] - closes[i - 1];
        if (change > 0) {
            gains += change;
        } else {
            losses -= change; // הופך לחיובי
        }
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // RSI ראשון
    if (avgLoss === 0) {
        rsiArray[period] = 100;
    } else {
        const rs = avgGain / avgLoss;
        rsiArray[period] = 100 - (100 / (1 + rs));
    }

    // חישוב המשך ה-RSI לפי החלקה (Smoothed Moving Average - SMMA) - השיטה המקובלת
    for (let i = period + 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1];
        
        let currentGain = 0;
        let currentLoss = 0;

        if (change > 0) {
            currentGain = change;
        } else {
            currentLoss = Math.abs(change);
        }

        avgGain = ((avgGain * (period - 1)) + currentGain) / period;
        avgLoss = ((avgLoss * (period - 1)) + currentLoss) / period;

        if (avgLoss === 0) {
            rsiArray[i] = 100;
        } else {
            const rs = avgGain / avgLoss;
            rsiArray[i] = 100 - (100 / (1 + rs));
        }
    }

    return rsiArray;
}