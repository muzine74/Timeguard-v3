import { Injectable } from '@angular/core';

/**
 * Export Excel (.xlsx) et PDF des tableaux affichés, généré dans le navigateur à partir des
 * données déjà filtrées/triées de la page (ce qui est exporté = ce qui est vu).
 * Les bibliothèques (exceljs, jspdf) sont chargées à la demande, au premier export.
 */

export type ExportCell = string | number | null;
export type ExportColType = 'text' | 'money' | 'int';

export interface ExportColumn {
  header: string;
  type?:  ExportColType;   // défaut : text
  width?: number;          // largeur Excel en caractères (défaut selon le type)
}

export interface ExportRow {
  cells: ExportCell[];
  /** group = ligne d'en-tête de groupe (gras, fond) ; detail = ligne indentée sous un groupe ; total = pied. */
  kind?: 'group' | 'detail' | 'total';
}

export interface ExportTable {
  title:   string;
  columns: ExportColumn[];
  rows:    ExportRow[];
}

export interface ExportDoc {
  /** Nom du fichier sans extension. */
  fileName:   string;
  title:      string;
  subtitle?:  string;
  tables:     ExportTable[];
  landscape?: boolean;
}

const MONEY_FMT = '#,##0.00 "$";-#,##0.00 "$"';
const GOLD = 'C9A227';

@Injectable({ providedIn: 'root' })
export class TableExportService {

  async toExcel(doc: ExportDoc): Promise<void> {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TimeGuard';
    wb.created = new Date();
    const usedNames = new Set<string>();

    for (const table of doc.tables) {
      const ws = wb.addWorksheet(this._sheetName(table.title, usedNames), {
        views: [{ state: 'frozen', ySplit: 4 }],
        pageSetup: { orientation: doc.landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      const n = table.columns.length;

      ws.addRow([`${doc.title} — ${table.title}`]).font = { bold: true, size: 14 };
      ws.mergeCells(1, 1, 1, n);
      ws.addRow([doc.subtitle ?? '']).font = { italic: true, color: { argb: 'FF666666' } };
      ws.mergeCells(2, 1, 2, n);
      ws.addRow([]);

      const head = ws.addRow(table.columns.map(c => c.header));
      head.eachCell((cell, i) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
        cell.alignment = { vertical: 'middle', horizontal: this._isNum(table.columns[i - 1]) ? 'right' : 'left', wrapText: true };
      });

      for (const r of table.rows) {
        const row = ws.addRow(r.cells.map(v => v ?? ''));
        row.eachCell({ includeEmpty: true }, (cell, i) => {
          const col = table.columns[i - 1];
          if (!col) return;
          if (col.type === 'money') cell.numFmt = MONEY_FMT;
          if (col.type === 'int')   cell.numFmt = '0';
          cell.alignment = {
            vertical: 'top', wrapText: true,
            horizontal: this._isNum(col) ? 'right' : 'left',
            indent: r.kind === 'detail' && i === 1 ? 2 : 0,
          };
          if (r.kind === 'group') {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1EC' } };
          }
          if (r.kind === 'total') {
            cell.font = { bold: true };
            cell.border = { top: { style: 'medium', color: { argb: 'FF' + GOLD } } };
          }
        });
      }

      table.columns.forEach((c, i) => {
        ws.getColumn(i + 1).width = c.width ?? (c.type === 'money' ? 14 : c.type === 'int' ? 9 : 22);
      });
    }

    const buf = await wb.xlsx.writeBuffer();
    this._download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${doc.fileName}.xlsx`);
  }

  /**
   * CSV pour Excel en français (Québec) : séparateur « ; », virgule décimale, UTF-8 avec BOM
   * (accents corrects à l'ouverture). Montants en nombres bruts (sans « $ » ni séparateur de milliers)
   * pour rester calculables. Plusieurs tableaux : l'un sous l'autre, précédés de leur titre.
   */
  toCsv(doc: ExportDoc): void {
    const esc = (v: string) => /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const cell = (v: ExportCell, col?: ExportColumn): string => {
      if (v === null || v === undefined || v === '') return '';
      if (typeof v === 'number') {
        return (col?.type === 'money' ? v.toFixed(2) : String(v)).replace('.', ',');
      }
      return esc(String(v));
    };
    const lines: string[] = [];
    const multi = doc.tables.length > 1;
    doc.tables.forEach((t, ti) => {
      if (multi) { if (ti > 0) lines.push(''); lines.push(esc(t.title)); }
      lines.push(t.columns.map(c => esc(c.header)).join(';'));
      for (const r of t.rows) lines.push(r.cells.map((v, i) => cell(v, t.columns[i])).join(';'));
    });
    this._download(new Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' }), `${doc.fileName}.csv`);
  }

  async toPdf(doc: ExportDoc): Promise<void> {
    const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
    const pdf = new jsPDF({ orientation: doc.landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
    const margin = 36;
    const pageW = pdf.internal.pageSize.getWidth();

    pdf.setFont('helvetica', 'bold').setFontSize(15).text(this._pdfText(doc.title), margin, margin + 8);
    pdf.setFont('helvetica', 'normal').setFontSize(9).setTextColor(100);
    if (doc.subtitle) pdf.text(this._pdfText(doc.subtitle), margin, margin + 24);
    pdf.text(this._pdfText(`Exporté le ${this._now()}`), pageW - margin, margin + 8, { align: 'right' });
    pdf.setTextColor(0);

    let y = margin + 44;
    for (const table of doc.tables) {
      if (doc.tables.length > 1) {
        pdf.setFont('helvetica', 'bold').setFontSize(11).text(this._pdfText(table.title), margin, y);
        y += 8;
      }
      const align = table.columns.map(c => (this._isNum(c) ? 'right' : 'left') as 'right' | 'left');
      autoTable(pdf, {
        startY: y,
        margin: { left: margin, right: margin },
        head: [table.columns.map(c => this._pdfText(c.header))],
        body: table.rows.map(r => r.cells.map((v, i) => ({
          content: (r.kind === 'detail' && i === 0 ? '    ' : '') + this._pdfCell(v, table.columns[i]),
          styles: {
            halign: align[i],
            fontStyle: r.kind === 'group' || r.kind === 'total' ? 'bold' : 'normal',
            fillColor: r.kind === 'group' ? [241, 241, 236] : undefined,
          },
        }))),
        styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 3, bottom: 3, left: 5, right: 5 }, overflow: 'linebreak', valign: 'top' },
        headStyles: { fillColor: [31, 41, 55], textColor: 255, fontStyle: 'bold' },
        // Montants et nombres : largeur ajustée au contenu (pas de retour à la ligne) ; le texte prend le reste
        columnStyles: Object.fromEntries(table.columns.map((c, i) => [i, { halign: align[i], cellWidth: this._isNum(c) ? 'wrap' : 'auto' }])),
        didParseCell: d => {
          if (d.section === 'head') d.cell.styles.halign = align[d.column.index];
          const kind = table.rows[d.row.index]?.kind;
          if (d.section === 'body' && kind === 'total') {
            d.cell.styles.lineWidth = { top: 1.2, right: 0, bottom: 0, left: 0 };
            d.cell.styles.lineColor = [201, 162, 39];
          }
        },
        didDrawPage: () => {
          const h = pdf.internal.pageSize.getHeight();
          pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(130);
          pdf.text(this._pdfText(`${doc.title} — page ${pdf.getCurrentPageInfo().pageNumber}`), pageW - margin, h - 16, { align: 'right' });
          pdf.setTextColor(0);
        },
      });
      y = ((pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY) + 24;
    }

    pdf.save(`${doc.fileName}.pdf`);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Nom de fichier sûr : « Factures 2026-09 » → « Factures_2026-09 ». */
  static fileName(...parts: (string | null | undefined)[]): string {
    return parts.filter(Boolean).join('_')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  }

  private _isNum(c?: ExportColumn): boolean { return c?.type === 'money' || c?.type === 'int'; }

  private _pdfCell(v: ExportCell, col?: ExportColumn): string {
    if (v === null || v === '') return '';
    if (typeof v === 'number' && col?.type === 'money') {
      return this._pdfText(v.toLocaleString('fr-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $');
    }
    return this._pdfText(String(v));
  }

  /** Les polices PDF standard ne couvrent que le jeu WinAnsi : espaces fines → espaces, flèches → ASCII. */
  private _pdfText(s: string): string {
    return s.replace(/[  ]/g, ' ').replace(/→/g, '->').replace(/[—–]/g, '-').replace(/[✓✔]/g, 'v').replace(/[^\x00-\xff]/g, '');
  }

  private _sheetName(title: string, used: Set<string>): string {
    const base = (title.replace(/[\\/*?:[\]]/g, ' ').trim() || 'Feuille').slice(0, 28);
    let name = base, i = 2;
    while (used.has(name.toLowerCase())) name = `${base} ${i++}`;
    used.add(name.toLowerCase());
    return name;
  }

  private _now(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  private _download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
