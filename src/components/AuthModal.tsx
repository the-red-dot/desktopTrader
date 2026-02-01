import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    if (!isOpen) return null;

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setMessage(null);

        try {
            if (isLogin) {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onClose(); // Close modal on success
            } else {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/`, // Redirect back to home after confirm
                    },
                });
                if (error) throw error;
                setMessage({ text: 'נשלח מייל אימות! נא לבדוק את תיבת הדואר.', type: 'success' });
            }
        } catch (error: any) {
            setMessage({ text: error.message || 'שגיאה באימות', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <div className="modal-overlay" onClick={onClose}></div>
            <div className="glass-panel modal-content" style={{ textAlign: 'center' }}>
                <h2 style={{ marginBottom: 20, fontWeight: 800 }}>
                    {isLogin ? 'התחברות למערכת' : 'הרשמה למערכת'}
                </h2>

                {message && (
                    <div style={{
                        padding: 10,
                        borderRadius: 8,
                        marginBottom: 15,
                        fontSize: '0.9rem',
                        background: message.type === 'success' ? 'rgba(0, 184, 148, 0.2)' : 'rgba(255, 118, 117, 0.2)',
                        color: message.type === 'success' ? '#00b894' : '#ff7675',
                        border: `1px solid ${message.type === 'success' ? '#00b894' : '#ff7675'}`
                    }}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                    <div className="input-group">
                        <label>אימייל</label>
                        <input
                            type="email"
                            required
                            className="glass-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="name@example.com"
                        />
                    </div>
                    <div className="input-group">
                        <label>סיסמה</label>
                        <input
                            type="password"
                            required
                            className="glass-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="******"
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="btn-action"
                        style={{ background: isLogin ? '#6c5ce7' : '#00b894', color: 'white', marginTop: 10 }}
                    >
                        {loading ? 'מעבד...' : (isLogin ? 'התחבר' : 'הירשם')}
                    </button>
                </form>

                <div style={{ marginTop: 20, fontSize: '0.9rem', opacity: 0.8 }}>
                    {isLogin ? 'אין לך משתמש עדיין? ' : 'יש לך כבר משתמש? '}
                    <button
                        onClick={() => { setIsLogin(!isLogin); setMessage(null); }}
                        style={{ background: 'none', border: 'none', color: '#74b9ff', cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline' }}
                    >
                        {isLogin ? 'הירשם כאן' : 'התחבר כאן'}
                    </button>
                </div>
            </div>
        </>
    );
}