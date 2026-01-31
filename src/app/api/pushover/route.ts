// tradewall\src\app\api\pushover\route.ts

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { message, title } = await request.json();

    const userKey = process.env.PUSHOVER_USER_KEY;
    const token = process.env.PUSHOVER_API_TOKEN;

    if (!userKey || !token) {
      return NextResponse.json({ error: 'Missing Pushover keys in .env.local' }, { status: 500 });
    }

    // בניית המידע לשליחה לפי הדוקומנטציה (application/x-www-form-urlencoded)
    const formData = new URLSearchParams();
    formData.append('token', token);
    formData.append('user', userKey);
    formData.append('message', message);
    if (title) formData.append('title', title);

    // שליחת הבקשה ל-Pushover
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok || data.status !== 1) {
      throw new Error(data.errors ? data.errors.join(', ') : 'Failed to send notification');
    }

    return NextResponse.json({ success: true, request: data.request });
  } catch (error: any) {
    console.error('Pushover Error:', error.message);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}