'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/components/toast';
import { api, type Params } from './api';

/** GET dữ liệu khi path/params đổi; path = null để tạm không tải */
export function useApi<T>(path: string | null, params?: Params) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [tick, setTick] = useState(0);
  const key = path === null ? null : path + JSON.stringify(params ?? {});

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<T>(path, params)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // key gom path + params đã serialize
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

/** Chạy thao tác ghi: tự báo lỗi/thành công bằng toast; trả undefined nếu lỗi */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    async <T>(fn: () => Promise<T>, successMessage?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const result = await fn();
        if (successMessage) toast.success(successMessage);
        return result;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Có lỗi xảy ra');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );

  return { run, busy };
}

/** Giá trị trễ để tìm kiếm khi gõ */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
