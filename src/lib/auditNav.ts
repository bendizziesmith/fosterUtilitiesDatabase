/** Bottom bar on every Site Audits / Kit & Plant page: which button is "you are here". */
export type AuditArea = 'home' | 'audits' | 'kit';

export function currentArea(pathname: string): AuditArea {
  if (pathname === '/audits' || pathname.startsWith('/audits/')) return 'audits';
  if (pathname === '/kit' || pathname.startsWith('/kit/')) return 'kit';
  return 'home';
}
