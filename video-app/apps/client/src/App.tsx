import { useState } from 'react';
import { VideoCallRoom } from './components/VideoCallRoom';
import { JoinScreen } from './components/JoinScreen';
import { LogOutIcon, UserIcon, AlertIcon } from './components/icons';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const SIGNALING_URL = import.meta.env.VITE_SIGNALING_URL || 'http://localhost:3002';

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface Room {
  id: string;
  name: string;
  type: string;
}

function App() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [roomId, setRoomId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [view, setView] = useState<'auth' | 'rooms' | 'join' | 'call'>('auth');

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC');
  const [joinError, setJoinError] = useState('');

  const inputClass =
    'w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text placeholder:text-muted/50 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
  const primaryBtn =
    'w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 disabled:cursor-not-allowed disabled:opacity-40';

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');

    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/register';
    const body = authMode === 'login'
      ? { email, password }
      : { email, password, displayName };

    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Auth failed');
      }

      const data = await res.json();
      setToken(data.accessToken);
      setUser(data.user);
      setView('rooms');
    } catch (err: any) {
      setAuthError(err.message);
    }
  }

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    setJoinError('');

    try {
      const res = await fetch(`${API_URL}/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newRoomName,
          type: newRoomType,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to create room');
      }

      const created = await res.json();
      setRoom(created);
      setRoomId(created.id);
      await handleJoinRoom(created.id);
    } catch (err: any) {
      setJoinError(err.message);
    }
  }

  async function handleJoinRoom(id: string) {
    setJoinError('');

    try {
      const res = await fetch(`${API_URL}/rooms/${id}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to join room');
      }

      const roomData = await res.json();
      setRoom(roomData);
      setRoomId(id);
      setView('join');
    } catch (err: any) {
      setJoinError(err.message);
    }
  }

  function handleLogout() {
    setToken('');
    setUser(null);
    setRoom(null);
    setRoomId('');
    setView('auth');
  }

  if (view === 'auth') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="w-full max-w-sm animate-float-in">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-bold text-text">Видеозвонки</h1>
            <p className="mt-1 text-sm text-muted">Войдите или создайте аккаунт, чтобы начать</p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-2xl shadow-black/40">
            <div className="mb-5 flex gap-1 rounded-xl bg-bg p-1">
              {(['login', 'register'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setAuthMode(mode);
                    setAuthError('');
                  }}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                    authMode === mode ? 'bg-surface-2 text-text shadow' : 'text-muted hover:text-text'
                  }`}
                >
                  {mode === 'login' ? 'Войти' : 'Регистрация'}
                </button>
              ))}
            </div>

            <form onSubmit={handleAuth} className="space-y-3">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className={inputClass}
              />
              <input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className={inputClass}
              />
              {authMode === 'register' && (
                <input
                  type="text"
                  placeholder="Имя"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  className={inputClass}
                />
              )}

              {authError && (
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 p-2.5 text-sm text-danger">
                  <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0" />
                  {authError}
                </div>
              )}

              <button type="submit" className={primaryBtn}>
                {authMode === 'login' ? 'Войти' : 'Создать аккаунт'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'rooms') {
    return (
      <div className="min-h-screen bg-bg">
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-text">Видео звонки</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-xl border border-border bg-surface px-3 py-1.5 sm:flex">
              <UserIcon className="h-4 w-4 text-muted" />
              <span className="text-sm text-text">{user?.displayName}</span>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm text-muted transition hover:bg-surface-2 hover:text-text"
            >
              <LogOutIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Выйти</span>
            </button>
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-4 pt-6 sm:px-8">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* создать комнату */}
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold text-text">Создать комнату</h2>
              <p className="mt-1 text-sm text-muted">Создайте комнату и пригласите собеседника по коду.</p>
              <form onSubmit={handleCreateRoom} className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Название комнаты"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                  className={inputClass}
                />
                <select
                  value={newRoomType}
                  onChange={(e) => setNewRoomType(e.target.value as 'PUBLIC' | 'PRIVATE')}
                  className={inputClass}
                >
                  <option value="PUBLIC">Публичная</option>
                  <option value="PRIVATE">Приватная</option>
                </select>
                {joinError && <p className="text-sm text-danger">{joinError}</p>}
                <button type="submit" className={primaryBtn}>
                  Создать и войти
                </button>
              </form>
            </section>

            {/* войти в комнату */}
            <section className="rounded-2xl border border-border bg-surface p-6">
              <h2 className="text-lg font-semibold text-text">Войти в комнату</h2>
              <p className="mt-1 text-sm text-muted">Введите код комнаты, которую вам прислали.</p>
              <div className="mt-4 space-y-3">
                <input
                  type="text"
                  placeholder="Код комнаты"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className={`${inputClass} w-full text-base tracking-wide`}
                />
                <button
                  type="button"
                  disabled={!roomId.trim()}
                  onClick={() => roomId && handleJoinRoom(roomId.trim())}
                  className={primaryBtn}
                >
                  Войти
                </button>
              </div>
              {joinError && roomId && <p className="mt-2 text-sm text-danger">{joinError}</p>}
            </section>
          </div>
        </main>
      </div>
    );
  }

  if (view === 'join') {
    return (
      <JoinScreen
        initialRoomId={roomId}
        roomName={room?.name}
        onJoin={(rid) => {
          setRoomId(rid);
          setView('call');
        }}
        onBack={() => setView('rooms')}
      />
    );
  }

  return (
    <VideoCallRoom
      signalingUrl={SIGNALING_URL}
      apiUrl={API_URL}
      token={token}
      userId={user?.id ?? ''}
      roomId={roomId}
      roomName={room?.name}
      onExit={() => setView('rooms')}
    />
  );
}

export default App;