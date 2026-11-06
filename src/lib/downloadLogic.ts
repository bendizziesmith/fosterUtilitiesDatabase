/** Audit "Downloaded" ticks and the plain delete-kit confirm (round 14). Tested in downloadLogic.test.ts. */
import { longDate } from './auditReport';
import { whoName } from './siteAuditLogic';

export interface AuditDownloadRow {
  audit_id: string;
  downloaded_at: string;
  actor_name: string | null;
  kind: string;
}

/** The latest download of each audit. */
export function latestDownloads<T extends AuditDownloadRow>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    const cur = m.get(r.audit_id);
    if (!cur || r.downloaded_at > cur.downloaded_at) m.set(r.audit_id, r);
  }
  return m;
}

/** "Downloaded 06 Nov by Christina Pearson" */
export const downloadedLabel = (r: Pick<AuditDownloadRow, 'downloaded_at' | 'actor_name'>): string =>
  `Downloaded ${longDate(r.downloaded_at).slice(0, 6)} by ${whoName(r.actor_name)}`;

/** Audit records filter: "Not downloaded yet". */
export const notDownloaded = <A extends { id: string }>(audits: A[], latest: Map<string, unknown>): A[] => audits.filter((a) => !latest.has(a.id));

/** "Delete CAT 1234 completely?" — the item's own plant no (or type name) goes to the database's safety check. */
export function deleteKitConfirm(item: { type_name: string; plant_no: string | null }) {
  const name = `${item.type_name}${item.plant_no ? ` ${item.plant_no}` : ''}`;
  return {
    question: `Delete ${name} completely?`,
    detail: 'It’s removed from Kit & Plant and its history. This can’t be undone.',
    token: item.plant_no ?? item.type_name,
  };
}
