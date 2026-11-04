import { useEffect, useState } from 'react';
import { Auditor } from '../../../../lib/supabase';

const KEY = 'foster.audit.lastActorId';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * "Who's doing this?" — defaults to the last name picked on this device
 * (remembered in localStorage), as long as that person is still on the list.
 */
export function useActor(auditors: Auditor[]) {
  const [actorId, setActorIdState] = useState<string>(() => read() ?? '');
  useEffect(() => {
    if (actorId && auditors.length && !auditors.some((a) => a.id === actorId)) setActorIdState('');
  }, [auditors, actorId]);
  const setActorId = (id: string) => {
    setActorIdState(id);
    try {
      if (id) localStorage.setItem(KEY, id);
    } catch {
      /* private mode: just don't remember */
    }
  };
  const actor = auditors.find((a) => a.id === actorId) ?? null;
  return { actorId, setActorId, actor };
}
