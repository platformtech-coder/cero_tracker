'use client';

import { useMemo, useState } from 'react';

export type SortDirection = 'asc' | 'desc' | null;

export interface SortConfig<T> {
  key: keyof T | string;
  direction: SortDirection;
}

export function useTableSort<T extends Record<string, any>>(
  data: T[],
  options?: {
    initialSort?: SortConfig<T>;
    sortableKeys?: (keyof T | string)[];
    getSortValue?: (item: T, key: keyof T | string) => any;
  }
) {
  const [sortConfig, setSortConfig] = useState<SortConfig<T>>(options?.initialSort ?? { key: '', direction: null });

  const { sortableKeys = [], getSortValue } = options ?? {};

  const sortedData = useMemo(() => {
    if (!sortConfig.key || !sortConfig.direction) return data;

    const key = sortConfig.key as keyof T;
    const isSortable = sortableKeys.length === 0 || sortableKeys.includes(key);

    if (!isSortable) return data;

    return [...data].sort((a, b) => {
      const aVal = getSortValue ? getSortValue(a, key) : a[key];
      const bVal = getSortValue ? getSortValue(b, key) : b[key];

      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal, undefined, { numeric: true, sensitivity: 'base' });
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true, sensitivity: 'base' });
      }

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sortConfig, sortableKeys, getSortValue]);

  const handleSort = (key: keyof T | string) => {
    if (sortableKeys.length > 0 && !sortableKeys.includes(key)) return;

    setSortConfig(prev => {
      if (prev.key === key && prev.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      if (prev.key === key && prev.direction === 'desc') {
        return { key, direction: null };
      }
      return { key, direction: 'asc' };
    });
  };

  const getSortIndicator = (key: keyof T | string) => {
    if (sortConfig.key !== key || !sortConfig.direction) return null;
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  };

  const isSorted = (key: keyof T | string) => sortConfig.key === key && !!sortConfig.direction;

  return {
    sortedData,
    sortConfig,
    handleSort,
    getSortIndicator,
    isSorted,
    setSortConfig,
  };
}
