/**
 * VAT invoice PDF, generated once at payment and stored in the private
 * "invoices" bucket. Customers download it from their dashboard.
 */
import "server-only";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { fontBytes } from "@/lib/print/fonts.server";
import { formatMoney } from "@/lib/pricing/calculate";

export interface InvoiceData {
  invoiceNumber: string;
  orderNumber: string;
  issuedAt: Date;
  customer: { name: string; company: string | null; email: string };
  lines: Array<{ description: string; detail: string; amountPence: number }>;
  subtotalPence: number;
  vatRate: number;
  vatPence: number;
  totalPence: number;
  currency: string;
}

export async function renderInvoicePdf(inv: InvoiceData): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const regular = await pdf.embedFont(fontBytes("lato", false), { subset: true });
  const bold = await pdf.embedFont(fontBytes("lato", true), { subset: true });
  const page = pdf.addPage([595.28, 841.89]); // A4
  const ink = rgb(0.106, 0.122, 0.141), steel = rgb(0.357, 0.392, 0.439), accent = rgb(0.769, 0.063, 0.373);
  const money = (p: number) => formatMoney(p, inv.currency);
  let y = 790;
  const text = (s: string, x: number, size = 10, font = regular, color = ink) => page.drawText(s, { x, y, size, font, color });
  const right = (s: string, xRight: number, size = 10, font = regular) => page.drawText(s, { x: xRight - font.widthOfTextAtSize(s, size), y, size, font, color: ink });

  page.drawRectangle({ x: 50, y: 806, width: 36, height: 4, color: accent });
  text("Digital Heroes Print", 50, 16, bold); right("VAT invoice", 545, 16, bold);
  y -= 22; text("Test-mode invoice: payment was taken through Stripe's test environment.", 50, 9, regular, steel);
  y -= 40;
  text("Billed to", 50, 9, bold, steel); right(`Invoice ${inv.invoiceNumber}`, 545, 10, bold);
  y -= 15; text(inv.customer.name || inv.customer.email, 50); right(`Order ${inv.orderNumber}`, 545);
  y -= 14; if (inv.customer.company) text(inv.customer.company, 50); right(`Issued ${inv.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`, 545);
  y -= 14; text(inv.customer.email, 50); right("Paid by card", 545);

  y -= 40;
  page.drawLine({ start: { x: 50, y: y + 14 }, end: { x: 545, y: y + 14 }, thickness: 0.5, color: steel });
  text("Description", 50, 9, bold, steel); right("Amount (ex VAT)", 545, 9, bold);
  y -= 8;
  for (const line of inv.lines) {
    y -= 18; text(line.description, 50, 10, bold); right(money(line.amountPence), 545);
    y -= 13; text(line.detail, 50, 9, regular, steel);
  }
  y -= 24;
  page.drawLine({ start: { x: 330, y: y + 14 }, end: { x: 545, y: y + 14 }, thickness: 0.5, color: steel });
  text("Subtotal", 330); right(money(inv.subtotalPence), 545);
  y -= 16; text(`VAT at ${Math.round(inv.vatRate * 100)}%`, 330); right(money(inv.vatPence), 545);
  y -= 20; text("Total paid", 330, 12, bold); right(money(inv.totalPence), 545, 12, bold);

  y = 60; text("Thank you for your order. Questions about this invoice: reply to your order confirmation email.", 50, 8, regular, steel);
  pdf.setTitle(`Invoice ${inv.invoiceNumber}`);
  return pdf.save();
}
