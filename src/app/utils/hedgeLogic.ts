// src/app/utils/hedgeLogic.ts

export interface HedgeSetup {
    index: number;         // מספר הגידור (1, 2, 3...)
    entry: number;         // מחיר כניסה
    tp: number;           // טייק פרופיט (יחס 1:1 לסיכון)
    sl: number;           // סטופ לוס (קבוע, שווה ל-Spot TP)
    riskAmount: number;    // כמה דולרים מסכנים בפוזיציה הזו
    potentialProfit: number; // רווח פוטנציאלי (אם מגיע ל-TP)
    coinAmount: number;    // כמה מטבעות צריך לקנות כדי לעמוד בסיכון
    investAmount: number;  // סה"כ דולרים להשקעה (Entry * CoinAmount)
}

/**
 * מחשב אסטרטגיית גידור מדורגת (Layered Hedge Strategy)
 * @param spotEntry מחיר כניסה לספוט (משמש לחישוב בסיס הרווח)
 * @param spotTP מחיר יעד לספוט / סטופ לגידור (משמש לחישוב רווח וגם כגבול עליון)
 * @param spotAmount כמות מטבעות בספוט
 * @param riskPercent אחוז הסיכון הרצוי מתוך הרווח הפוטנציאלי (למשל 50 או 0.5)
 * @param hedgesCount מספר הגידורים הרצוי (2, 3, 4)
 * @param customStrategyStart (אופציונלי) מחיר התחלה ידני לגידור הראשון. אם לא סופק, ילקח ה-spotEntry
 */
export function calculateHedgeStrategy(
    spotEntry: number,
    spotTP: number,
    spotAmount: number,
    riskPercent: number, 
    hedgesCount: number,
    customStrategyStart?: number
): HedgeSetup[] {
    
    // נרמול האחוז (אם התקבל 50, נהפוך ל-0.5)
    const normalizedPercent = riskPercent > 1 ? riskPercent / 100 : riskPercent;

    // 1. חישוב הרווח הפוטנציאלי של הספוט (הבסיס לתקציב הסיכון)
    // התקציב תמיד נגזר מהפוזיציה המקורית
    const spotPotentialProfit = Math.abs(spotTP - spotEntry) * spotAmount;
    
    // 2. חישוב סך תקציב הסיכון לכל הגידורים יחד
    const totalRiskBudget = spotPotentialProfit * normalizedPercent;
    
    // 3. סיכון פר גידור בודד (חלוקה שווה)
    const riskPerHedge = totalRiskBudget / hedgesCount;
    
    // נקודת ההתחלה של רשת הגידורים (המשתמש יכול לשנות אותה)
    const gridStart = customStrategyStart !== undefined ? customStrategyStart : spotEntry;
    
    // 4. חישוב המרחק הכולל (הטווח בין כניסה לסטופ) לטובת המדרגות
    const totalDistance = spotTP - gridStart;
    
    const setups: HedgeSetup[] = [];

    // 5. לולאת חישוב לכל גידור
    for (let i = 0; i < hedgesCount; i++) {
        // חישוב המיקום של הגידור על הסקאלה הלינארית
        // עבור 4 גידורים: 0%, 25%, 50%, 75%
        const ratio = i / hedgesCount; 
        
        // מחיר הכניסה לגידור הנוכחי
        const entry = gridStart + (totalDistance * ratio);
        
        // ה-SL תמיד קבוע = Spot TP
        const sl = spotTP;
        
        // המרחק לסטופ מהכניסה הנוכחית
        const distanceToSL = Math.abs(sl - entry);
        
        // חישוב כמות המטבעות: Risk = Amount * Distance
        const coinAmount = distanceToSL > 0 ? (riskPerHedge / distanceToSL) : 0;
        
        // חישוב TP ביחס 1:1 לסיכון
        // בגידור שורט, ה-TP נמוך ממחיר הכניסה
        const tp = entry - distanceToSL;

        // חישוב רווח פוטנציאלי (מרחק ל-TP * כמות)
        const potentialProfit = Math.abs(entry - tp) * coinAmount;
        
        setups.push({
            index: i + 1,
            entry: parseFloat(entry.toFixed(4)),
            tp: parseFloat(tp.toFixed(4)),
            sl: parseFloat(sl.toFixed(4)),
            riskAmount: parseFloat(riskPerHedge.toFixed(2)),
            potentialProfit: parseFloat(potentialProfit.toFixed(2)),
            coinAmount: parseFloat(coinAmount.toFixed(6)),
            investAmount: parseFloat((entry * coinAmount).toFixed(2))
        });
    }

    return setups;
}