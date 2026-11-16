/**
 * Accounting export (PRD §11 "Xero-ready"). Today: a CSV in Xero's
 * "Import sales invoices" format. Behind an adapter interface so a live Xero
 * API integration (OAuth2 + Invoices endpoint) can replace it without
 * touching callers.
 *
 * Each order line is exported as quantity 1 with the line total as the unit
 * amount, so Xero's totals match ours to the penny (our unit prices can be
 * fractional pence for very large label runs).
 */
import { toCsv } from "@/lib/print/csv";

export interface ExportOrder {
  number: string;
  paidAt: string;          // ISO
  customerName: string;
  email: string;
  currency: string;
  vatRate: number;
  lines: Array<{ description: string; amountPence: number }>; // ex VAT
}

export interface AccountingAdapter {
  readonly name: string;
  exportInvoices(orders: ExportOrder[]): Promise<{ filename: string; mime: string; body: string }>;
}

const HEADER = ["*ContactName", "EmailAddress", "*InvoiceNumber", "Reference", "*InvoiceDate", "*DueDate", "*Description", "*Quantity", "*UnitAmount", "*AccountCode", "*TaxType", "Currency"];

const ukDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
};

export const xeroCsvAdapter: AccountingAdapter = {
  name: "Xero CSV",
  async exportInvoices(orders) {
    const rows: Array<Array<string | number>> = [HEADER];
    for (const o of orders) {
      const date = ukDate(o.paidAt); // paid by card at checkout, so due = invoice date
      const taxType = o.vatRate > 0 ? `${Math.round(o.vatRate * 100)}% (VAT on Income)` : "No VAT";
      for (const line of o.lines) {
        rows.push([o.customerName, o.email, o.number, o.number, date, date, line.description, 1, (line.amountPence / 100).toFixed(2), "200", taxType, o.currency]);
      }
    }
    return { filename: `xero-sales-invoices-${new Date().toISOString().slice(0, 10)}.csv`, mime: "text/csv", body: toCsv(rows) };
  },
};
