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

export function useMultiColumnSort<T extends Record<string, any>>(
  data: T[],
  options?: {
    sortableKeys?: (keyof T | string)[];
    getSortValue?: (item: T, key: keyof T | string) => any;
  }
) {
  const [sortConfigs, setSortConfigs] = useState<Array<{ key: keyof T | string; direction: 'asc' | 'desc' }>>([]);

  const { sortableKeys = [], getSortValue } = options ?? {};

  const sortedData = useMemo(() => {
    if (sortConfigs.length === 0) return data;

    return [...data].sort((a, b) => {
      for (const { key, direction } of sortConfigs) {
        const isSortable = sortableKeys.length === 0 || sortableKeys.includes(key);
        if (!isSortable) continue;

        const aVal = getSortValue ? getSortValue(a, key) : a[key as keyof T];
        const bVal = getSortValue ? getSortValue(b, key) : b[key as keyof T];

        if (aVal == null && bVal == null) continue;
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

        if (comparison !== 0) {
          return direction === 'asc' ? comparison : -comparison;
        }
      }
      return 0;
    });
  }, [data, sortConfigs, sortableKeys, getSortValue]);

  const handleSort = (key: keyof T | string, shiftKey = false) => {
    if (sortableKeys.length > 0 && !sortableKeys.includes(key)) return;

    setSortConfigs(prev => {
      const existingIndex = prev.findIndex(s => s.key === key);

      if (!shiftKey) {
        // Single column sort
        if (existingIndex >= 0) {
          const current = prev[existingIndex];
          if (current.direction === 'asc') {
            return [{ key, direction: 'desc' }];
          }
          if (current.direction === 'desc') {
            return [];
          }
        }
        return [{ key, direction: 'asc' }];
      } else {
        // Multi-column sort (shift + click)
        const newConfigs = [...prev];
        if (existingIndex >= 0) {
          const current = newConfigs[existingIndex];
          if (current.direction === 'asc') {
            newConfigs[existingIndex] = { key, direction: 'desc' };
          } else {
            newConfigs.splice(existingIndex, 1);
          }
        } else {
          newConfigs.push({ key, direction: 'asc' });
        }
        return newConfigs;
      }
    });
  };

  const clearSort = () => setSortConfigs([]);

  return {
    sortedData,
    sortConfigs,
    handleSort,
    clearSort,
  };
}