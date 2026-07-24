import {
  DAYS_OF_WEEK,
  DAY_LABELS,
  DayOfWeek,
  formatWeekEnding,
  formatHoursDecimal,
  getStatusInfo,
} from './timesheetUtils';
import {
  PriceWorkFields,
  hasPriceWork,
  trenchTotal,
  jointTotal,
  formatMetres,
  formatPwValue,
} from './priceWork';

export type PdfDayRow = { day: string; start: string; finish: string; hours: string };
type PdfSection = {
  verge: number | null;
  footway: number | null;
  carriageway: number | null;
  total: number;
};
export type PdfPriceWork = { trench: PdfSection; joint: PdfSection };

export interface PdfJob {
  jobNumber: string;
  jobAddress: string;
  dayRows: PdfDayRow[];
  priceWork: PdfPriceWork | null;
  notes: string | null;
}

export interface PdfModel {
  title: string;
  gangerName: string;
  weekEnding: string;
  vehicle: string;
  labourers: string;
  status: string;
  totalHours: string;
  jobs: PdfJob[];
  weeklyTotalHours: string;
  weeklyPriceWork: { trench: number; joint: number } | null;
}

export type PdfTimesheet = {
  week_ending: string;
  status?: string;
  ganger?: { full_name?: string } | null;
  ganger_name_snapshot?: string;
  vehicle_registration_snapshot?: string | null;
  labourer_1_name?: string | null;
  labourer_2_name?: string | null;
  weekly_total_hours: number;
  job_rows?: Array<
    {
      job_number: string;
      job_address: string;
      notes?: string | null;
      day_entries?: Array<{
        day_of_week: string;
        start_time: string | null;
        finish_time: string | null;
        hours_total: number;
      }>;
    } & Partial<PriceWorkFields>
  >;
};

function toFields(job: Partial<PriceWorkFields>): PriceWorkFields {
  return {
    pw_trench_verge: job.pw_trench_verge ?? null,
    pw_trench_footway: job.pw_trench_footway ?? null,
    pw_trench_carriageway: job.pw_trench_carriageway ?? null,
    pw_joint_verge: job.pw_joint_verge ?? null,
    pw_joint_footway: job.pw_joint_footway ?? null,
    pw_joint_carriageway: job.pw_joint_carriageway ?? null,
  };
}

/**
 * Pure: shapes a timesheet into a print model. Same numbers as the screen and CSV,
 * arranged for a tidy A4 document. Kept free of jsPDF so it is unit-testable.
 */
export function buildPdfModel(ts: PdfTimesheet): PdfModel {
  const gangerName =
    ts.ganger?.full_name || ts.ganger_name_snapshot || 'Unknown';
  const labourers =
    [ts.labourer_1_name, ts.labourer_2_name].filter(Boolean).join(', ') || 'None';

  let weekTrench = 0;
  let weekJoint = 0;
  let anyPw = false;

  const jobs: PdfJob[] = (ts.job_rows || []).map((job) => {
    const dayRows = DAYS_OF_WEEK.map((day) => {
      const entry = (job.day_entries || []).find((e) => e.day_of_week === day);
      if (!entry || (!entry.start_time && !entry.finish_time)) return null;
      return {
        day: DAY_LABELS[day as DayOfWeek],
        start: entry.start_time || '-',
        finish: entry.finish_time || '-',
        hours: entry.hours_total > 0 ? formatHoursDecimal(entry.hours_total) : '-',
      };
    }).filter((r): r is PdfDayRow => r !== null);

    const fields = toFields(job);
    let priceWork: PdfPriceWork | null = null;
    if (hasPriceWork(fields)) {
      const t = trenchTotal(fields);
      const j = jointTotal(fields);
      priceWork = {
        trench: {
          verge: fields.pw_trench_verge,
          footway: fields.pw_trench_footway,
          carriageway: fields.pw_trench_carriageway,
          total: t,
        },
        joint: {
          verge: fields.pw_joint_verge,
          footway: fields.pw_joint_footway,
          carriageway: fields.pw_joint_carriageway,
          total: j,
        },
      };
      weekTrench += t;
      weekJoint += j;
      anyPw = true;
    }

    return {
      jobNumber: job.job_number || '',
      jobAddress: job.job_address || '',
      dayRows,
      priceWork,
      notes: job.notes?.trim() ? job.notes.trim() : null,
    };
  });

  return {
    title: 'Foster Utilities — Weekly Timesheet',
    gangerName,
    weekEnding: formatWeekEnding(ts.week_ending),
    vehicle: ts.vehicle_registration_snapshot || 'None',
    labourers,
    status: getStatusInfo(ts.status || 'draft').label,
    totalHours: `${formatHoursDecimal(ts.weekly_total_hours)}h`,
    jobs,
    weeklyTotalHours: `${formatHoursDecimal(ts.weekly_total_hours)}h`,
    weeklyPriceWork: anyPw ? { trench: weekTrench, joint: weekJoint } : null,
  };
}

const TEAL: [number, number, number] = [13, 148, 136]; // teal-600
const SLATE: [number, number, number] = [51, 65, 85]; // slate-700

/**
 * Builds the A4 PDF document for one timesheet and returns the jsPDF instance. jsPDF +
 * autotable are imported dynamically so they are not part of the initial bundle (loaded
 * on first use). Returns `unknown` to avoid pulling jsPDF's types into the initial build.
 */
export async function renderTimesheetPdf(ts: PdfTimesheet): Promise<{ save: (name: string) => void; output: (type: string) => string }> {
  const model = buildPdfModel(ts);
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...SLATE);
  doc.text(model.title, margin, y);
  y += 20;
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const headerPairs: Array<[string, string]> = [
    ['Ganger', model.gangerName],
    ['Week ending', model.weekEnding],
    ['Vehicle', model.vehicle],
    ['Labourers', model.labourers],
    ['Status', model.status],
    ['Total hours', model.totalHours],
  ];
  const colX = [margin, margin + (pageWidth - margin * 2) / 2];
  headerPairs.forEach(([label, value], i) => {
    const x = colX[i % 2];
    if (i % 2 === 0 && i > 0) y += 16;
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`${label}:`, x, y);
    doc.setTextColor(...SLATE);
    doc.text(value, x + 62, y);
  });
  y += 24;

  model.jobs.forEach((job) => {
    ensureSpace(60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...SLATE);
    const jobTitle = job.jobAddress
      ? `Job ${job.jobNumber}  -  ${job.jobAddress}`
      : `Job ${job.jobNumber}`;
    doc.text(jobTitle, margin, y);
    y += 8;

    if (job.dayRows.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Day', 'Start', 'Finish', 'Hours']],
        body: job.dayRows.map((d) => [d.day, d.start, d.finish, d.hours]),
        theme: 'grid',
        headStyles: { fillColor: SLATE, textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: SLATE },
        columnStyles: { 3: { halign: 'right' } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    if (job.priceWork) {
      const pw = job.priceWork;
      ensureSpace(50);
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Price Work', 'Verge', 'F/W', 'C/W', 'Total']],
        body: [
          [
            'Trench (m)',
            formatPwValue(pw.trench.verge),
            formatPwValue(pw.trench.footway),
            formatPwValue(pw.trench.carriageway),
            `${formatMetres(pw.trench.total)} m`,
          ],
          [
            'Joint Hole',
            formatPwValue(pw.joint.verge),
            formatPwValue(pw.joint.footway),
            formatPwValue(pw.joint.carriageway),
            `${pw.joint.total}`,
          ],
        ],
        theme: 'grid',
        headStyles: { fillColor: TEAL, textColor: 255, fontSize: 9 },
        bodyStyles: { fontSize: 9, textColor: SLATE },
        columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    }

    if (job.notes) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      // Measure first, then reserve the space the note actually needs, so a long note
      // is never drawn off the bottom of the page. Emit it in page-sized chunks.
      const noteLines = doc.splitTextToSize(
        job.notes,
        pageWidth - margin * 2 - 34
      ) as string[];
      const lineHeight = 11;
      let remaining = noteLines;
      let first = true;
      while (remaining.length > 0) {
        ensureSpace(lineHeight * 2);
        const roomLines = Math.max(
          1,
          Math.floor((pageHeight - margin - y) / lineHeight)
        );
        const chunk = remaining.slice(0, roomLines);
        remaining = remaining.slice(roomLines);
        if (first) {
          doc.setTextColor(100, 116, 139); // slate-500
          doc.text('Notes:', margin, y);
          first = false;
        }
        doc.setTextColor(...SLATE);
        doc.text(chunk, margin + 34, y);
        y += chunk.length * lineHeight + 4;
      }
    }

    y += 8;
  });

  ensureSpace(50);
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...SLATE);
  doc.text(`Weekly Total: ${model.weeklyTotalHours}`, margin, y);
  if (model.weeklyPriceWork) {
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...TEAL);
    doc.text(
      `Price work (week):  Trench ${formatMetres(model.weeklyPriceWork.trench)} m  ·  Joint Hole ${model.weeklyPriceWork.joint}`,
      margin,
      y
    );
  }

  return doc;
}

/** Generates the PDF and triggers a download. */
export async function downloadTimesheetPdf(ts: PdfTimesheet): Promise<void> {
  const doc = await renderTimesheetPdf(ts);
  const name = ts.ganger?.full_name || ts.ganger_name_snapshot || 'Unknown';
  const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Timesheet_${safeName}_WE_${ts.week_ending}.pdf`);
}
