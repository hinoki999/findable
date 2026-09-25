import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../services/supabase';
import { getBlockedUserIds } from '../services/api';
import { useAuth } from './AuthContext';

const RETRY_INTERVAL_MS = 10000;

interface BlockedUsersContextType {
  // Users in a block relationship with the current user (either direction).
  // null until the first successful load - callers must treat null as "unknown"
  // and show no nearby users, never as "nobody is blocked".
  blockedUserIds: Set<string> | null;
  // True while the most recent load attempt failed (a retry is scheduled).
  loadFailed: boolean;
}

const BlockedUsersContext = createContext<BlockedUsersContextType>({
  blockedUserIds: null,
  loadFailed: false,
});

export const BlockedUsersProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userId } = useAuth();
  const [blockedUserIds, setBlockedUserIds] = useState<Set<string> | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    // Signed out (or switching accounts): drop the previous user's list
    setBlockedUserIds(null);
    setLoadFailed(false);
    if (!userId) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const fetchBlockedUserIds = async () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      try {
        const ids = await getBlockedUserIds();
        if (cancelled) return;
        setBlockedUserIds(ids);
        setLoadFailed(false);
      } catch (error) {
        if (cancelled) return;
        // Keep the last known block list (if any) and retry in the background
        console.error('[BLOCKS] Failed to load block list, retrying:', error);
        setLoadFailed(true);
        retryTimer = setTimeout(fetchBlockedUserIds, RETRY_INTERVAL_MS);
      }
    };

    fetchBlockedUserIds();

    // Stay in sync via Realtime instead of polling
    const channel = supabase
      .channel('blocks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks', filter: `blocker_id=eq.${userId}` },
        () => fetchBlockedUserIds()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocks', filter: `blocked_id=eq.${userId}` },
        () => fetchBlockedUserIds()
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <BlockedUsersContext.Provider value={{ blockedUserIds, loadFailed }}>
      {children}
    </BlockedUsersContext.Provider>
  );
};

export const useBlockedUsers = () => useContext(BlockedUsersContext);
