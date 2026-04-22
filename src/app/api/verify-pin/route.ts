import { NextResponse } from 'next/server';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { pin } = body;

        // המשתנה הזה נקרא ישירות מהשרת (Vercel) ולעולם לא נחשף החוצה
        const serverPin = process.env.SECRET_PIN;

        if (!serverPin) {
            console.error("SECRET_PIN is not defined in environment variables.");
            return NextResponse.json({ success: false, message: 'Server configuration error' }, { status: 500 });
        }

        if (pin === serverPin) {
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ success: false, message: 'Invalid PIN' }, { status: 401 });
        }
    } catch (error) {
        return NextResponse.json({ success: false, message: 'Server error' }, { status: 500 });
    }
}