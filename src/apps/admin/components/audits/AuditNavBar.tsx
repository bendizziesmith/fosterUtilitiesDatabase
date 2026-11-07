import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Home, ClipboardCheck, Wrench } from 'lucide-react';
import { currentArea, AuditArea } from '../../../../lib/auditNav';

const ITEMS: { area: AuditArea; label: string; path: string; icon: typeof Home }[] = [
  { area: 'home', label: 'Home', path: '/', icon: Home },
  { area: 'audits', label: 'Site Audits', path: '/audits', icon: ClipboardCheck },
  { area: 'kit', label: 'Kit & Plant', path: '/kit', icon: Wrench },
];

/**
 * Home / Site Audits / Kit & Plant. Phone: fixed bottom bar (safe-area padded).
 * Computer: a footer row at the end of the page. The current area is highlighted.
 */
export function AuditNavBar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const here = currentArea(pathname);
  return (
    <nav
      aria-label="Site Audits and Kit & Plant"
      className="fixed sm:static bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 sm:border sm:rounded-xl sm:mt-8 px-2 sm:px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:py-3 shadow-[0_-2px_8px_rgba(15,23,42,0.06)] sm:shadow-none"
    >
      <ul className="grid grid-cols-3 gap-2 max-w-4xl mx-auto">
        {ITEMS.map(({ area, label, path, icon: Icon }) => {
          const on = here === area;
          return (
            <li key={area}>
              <button
                type="button"
                onClick={() => navigate(path)}
                aria-current={on ? 'page' : undefined}
                className={`w-full min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-2 rounded-lg px-1 text-xs sm:text-sm font-semibold transition-colors duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  on ? 'bg-blue-600 text-white' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Wraps every Site Audits / Kit & Plant page: content, then the nav bar; phone content is padded so the bar never covers it. */
export function AuditShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] sm:pb-0">
      {children}
      <AuditNavBar />
    </div>
  );
}
