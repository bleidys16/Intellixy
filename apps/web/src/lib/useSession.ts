"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "./api";
import type { User } from "./types";

/**
 * Sesión del usuario. `loading` sigue en true mientras no se sepa el resultado: un fallo de red NO cuenta como
 * "sin sesión" (no debe mandar al login a alguien que sí la tiene), así que en ese caso llega `error` y se puede
 * reintentar con `retry`. Solo un 401 deja `user` en null con `loading` en false.
 */
export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ user: User }>("/auth/me")
      .then((data) => {
        if (cancelled) return;
        setUser(data.user);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
          setError(null);
          setLoading(false);
        } else {
          setError(err instanceof ApiError ? err.message : "No pudimos comprobar tu sesión");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setError(null);
    setAttempt((n) => n + 1);
  }, []);

  return { user, loading, error, retry, setUser };
}
