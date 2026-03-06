import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { message, title } = await request.json();

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return NextResponse.json({ error: 'Missing Telegram keys in .env.local' }, { status: 500 });
    }

    // נתיב ה-API של טלגרם לשליחת הודעה
    const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    // עיצוב ההודעה - שימוש ב-Markdown כדי להדגיש את הכותרת
    const text = `*${title}*\n${message}`;

    const res = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'Markdown',
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.ok) {
      throw new Error(data.description || 'Failed to send Telegram notification');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Telegram Error:', error.message);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}