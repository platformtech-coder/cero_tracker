'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import sharedStyles from '@/components/ui/dashboard.module.css';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** Label for the entity being paginated, e.g. "rows", "entries", "notes". Defaults to "rows". */
  rowLabel?: string;
}

/**
 * Shared pagination bar used across all list views.
 * Renders a page window of up to 5 page buttons, prev/next chevrons, and a
 * summary "Page X of Y — Z <rowLabel>" caption.
 *
 * Returns null when only one page exists (nothing to paginate).
 */
export function Pagination({ page, total, pageSize, onChange, rowLabel = 'rows' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  for (let i = start; i <= Math.min(totalPages, start + 4); i++) pages.push(i);

  return (
    <div className={sharedStyles.pagination}>
      <span>Page {page} of {totalPages} — {total} {rowLabel}</span>
      <div className={sharedStyles.paginationBtns}>
        <button
          className={sharedStyles.pageBtn}
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          <ChevronLeft size={14} />
        </button>
        {pages.map(p => (
          <button
            key={p}
            className={`${sharedStyles.pageBtn} ${p === page ? sharedStyles.pageBtnActive : ''}`}
            onClick={() => onChange(p)}
          >
            {p}
          </button>
        ))}
        <button
          className={sharedStyles.pageBtn}
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
