import { useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { getAccessToken, refreshSession } from '../api/client';
import type { Activity, AppNotification, NotificationList, Task } from '../api/types';
import { useAuth } from './AuthContext';

interface RealtimeState {
  connected: boolean;
  onlineUsers: number | null; // admin only
}

const RealtimeContext = createContext<RealtimeState>({ connected: false, onlineUsers: null });
export const useRealtime = () => useContext(RealtimeContext);

export const FEED_LIMIT = 20;

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<RealtimeState>({ connected: false, onlineUsers: null });
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;

    const socket: Socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
      // A function, so every (re)connect sends the *current* access token.
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket'],
    });

    let hasConnectedBefore = false;
    const invalidateData = () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['task'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    };

    socket.on('connect', () => {
      setState((s) => ({ ...s, connected: true }));
      // Coming back from a drop: anything we missed is re-read from the database, not from memory.
      if (hasConnectedBefore) {
        queryClient.invalidateQueries({ queryKey: ['activity'] });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        invalidateData();
      }
      hasConnectedBefore = true;
    });
    socket.on('disconnect', () => setState((s) => ({ ...s, connected: false })));
    socket.on('connect_error', async (err) => {
      // Middleware rejections are not retried automatically: refresh the token, then reconnect by hand.
      if (err.message === 'UNAUTHORIZED' && (await refreshSession())) socket.connect();
    });

    socket.on('presence:count', ({ count }: { count: number }) => setState((s) => ({ ...s, onlineUsers: count })));

    socket.on('activity:new', (a: Activity) => {
      queryClient.setQueryData<Activity[]>(['activity'], (old) =>
        old ? [a, ...old.filter((x) => x.id !== a.id)].slice(0, FEED_LIMIT * 2) : old,
      );
      queryClient.invalidateQueries({ queryKey: ['task', a.taskId] });
    });

    socket.on('task:updated', (t: Task) => {
      queryClient.setQueriesData<Task[]>({ queryKey: ['tasks'] }, (old) => old?.map((x) => (x.id === t.id ? t : x)));
      invalidateData(); // lists with filters / sort order / dashboards may need to add or drop the row
    });
    socket.on('task:removed', () => invalidateData());

    socket.on('notification:new', ({ notification, unreadCount }: { notification: AppNotification; unreadCount: number }) => {
      queryClient.setQueryData<NotificationList>(['notifications'], (old) =>
        old ? { data: [notification, ...old.data.filter((n) => n.id !== notification.id)].slice(0, 20), unreadCount } : old,
      );
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });
    socket.on('notification:count', () => queryClient.invalidateQueries({ queryKey: ['notifications'] }));

    return () => {
      socket.removeAllListeners();
      socket.close();
      setState({ connected: false, onlineUsers: null });
    };
  }, [userId, queryClient]);

  return <RealtimeContext.Provider value={state}>{children}</RealtimeContext.Provider>;
}
