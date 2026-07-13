import React, { useState } from 'react';
import { useAuth } from './AuthContext.jsx';

function mapError(code) {
  const map = {
    'auth/invalid-email': 'E-mail inválido.',
    'auth/user-not-found': 'Não existe conta com esse e-mail.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com esse e-mail.',
    'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/missing-password': 'Digite uma senha.',
  };
  return map[code] || 'Não foi possível concluir. Tente novamente.';
}

export default function Login() {
  const { login, signup, resetPassword } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'cadastro'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email.trim(), password);
      } else {
        await signup(email.trim(), password);
      }
    } catch (err) {
      setError(mapError(err.code));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError('');
    setInfo('');
    if (!email.trim()) {
      setError('Digite seu e-mail acima primeiro, depois clique em "Esqueci minha senha".');
      return;
    }
    try {
      await resetPassword(email.trim());
      setInfo('Enviamos um link de redefinição de senha para o seu e-mail.');
    } catch (err) {
      setError(mapError(err.code));
    }
  };

  return (
    <div className="login-root">
      <style>{`
        .login-root {
          --paper: #F6F3EC;
          --paper-card: #FFFEFA;
          --line: #DED7C4;
          --ink: #1C2B26;
          --ink-soft: #5B6B63;
          --emerald: #1F6F54;
          --emerald-dark: #16503D;
          font-family: 'IBM Plex Sans', sans-serif;
          min-height: 100vh;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--paper);
          color: var(--ink);
        }
        .login-card {
          width: 100%;
          max-width: 380px;
          background: var(--paper-card);
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 32px 28px;
          box-shadow: 0 8px 24px rgba(28,43,38,0.06);
        }
        .login-brand {
          font-family: 'Fraunces', serif;
          font-size: 22px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .login-brand span { color: var(--emerald); }
        .login-sub { color: var(--ink-soft); font-size: 13px; margin-bottom: 22px; }
        .login-field { margin-bottom: 14px; }
        .login-field label { display: block; font-size: 12px; color: var(--ink-soft); margin-bottom: 5px; }
        .login-field input {
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--line);
          border-radius: 8px;
          font-size: 14px;
          font-family: inherit;
          background: #fff;
          color: var(--ink);
        }
        .login-field input:focus { outline: 2px solid var(--emerald); outline-offset: 1px; }
        .login-btn {
          width: 100%;
          padding: 11px;
          border: none;
          border-radius: 8px;
          background: var(--emerald);
          color: #fff;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
          margin-top: 6px;
        }
        .login-btn:hover { background: var(--emerald-dark); }
        .login-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .login-error { background: #F1E1DB; color: #8B3A2B; font-size: 13px; padding: 9px 11px; border-radius: 8px; margin-bottom: 14px; }
        .login-info { background: #E4EFE9; color: var(--emerald-dark); font-size: 13px; padding: 9px 11px; border-radius: 8px; margin-bottom: 14px; }
        .login-switch { text-align: center; margin-top: 18px; font-size: 13px; color: var(--ink-soft); }
        .login-switch button { background: none; border: none; color: var(--emerald); font-weight: 600; cursor: pointer; font-size: 13px; padding: 0; }
        .login-forgot { text-align: right; margin-top: -8px; margin-bottom: 14px; }
        .login-forgot button { background: none; border: none; color: var(--ink-soft); font-size: 12px; cursor: pointer; text-decoration: underline; padding: 0; }
      `}</style>

      <div className="login-card">
        <div className="login-brand">Livro<span>Caixa</span></div>
        <div className="login-sub">
          {mode === 'login' ? 'Entre para acessar seu planejador financeiro.' : 'Crie sua conta para começar a usar.'}
        </div>

        {error && <div className="login-error">{error}</div>}
        {info && <div className="login-info">{info}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field">
            <label>E-mail</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>
          <div className="login-field">
            <label>Senha</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="mínimo 6 caracteres"
            />
          </div>

          {mode === 'login' && (
            <div className="login-forgot">
              <button type="button" onClick={handleReset}>Esqueci minha senha</button>
            </div>
          )}

          <button className="login-btn" type="submit" disabled={loading}>
            {loading ? 'Aguarde…' : mode === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <div className="login-switch">
          {mode === 'login' ? (
            <>Ainda não tem conta? <button onClick={() => { setMode('cadastro'); setError(''); setInfo(''); }}>Criar conta</button></>
          ) : (
            <>Já tem conta? <button onClick={() => { setMode('login'); setError(''); setInfo(''); }}>Entrar</button></>
          )}
        </div>
      </div>
    </div>
  );
}
