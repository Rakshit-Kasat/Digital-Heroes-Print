/**
 * Gallery content: real jobs rendered by our own print engine from the
 * seeded templates, with realistic variable data. No stock placeholders —
 * every image on the site is something the system can actually produce.
 */
export interface Sample {
  product: string;                 // product slug
  title: string;
  widthMm: number;
  heightMm: number;
  text?: Record<string, string>;   // element id -> replacement text
  colors?: Record<string, string>; // element id -> fill/colour
  background?: string;
}

export const SAMPLES: Sample[] = [
  { product: "race-bibs", title: "Peak Trail 10K, adult bib", widthMm: 210, heightMm: 148 },
  { product: "race-bibs", title: "Peak Trail 10K, CSV merge row 214", widthMm: 210, heightMm: 148, text: { number: "214", name: "PRIYA SHARMA" } },
  { product: "race-bibs", title: "Junior fun run, kids size", widthMm: 160, heightMm: 110, text: { event: "RIVERSIDE JUNIOR 2K", number: "37", name: "OLLIE" }, colors: { band: "#1f6f8b" } },
  { product: "mtb-number-boards", title: "Valley Enduro, rider board", widthMm: 180, heightMm: 200 },
  { product: "mtb-number-boards", title: "Night race, junior board", widthMm: 150, heightMm: 160, text: { series: "LANTERN NIGHT RACE", number: "8", rider: "M. OKAFOR" }, background: "#ffffff" },
  { product: "product-labels", title: "Marmalade jar label", widthMm: 90, heightMm: 60 },
  { product: "product-labels", title: "Chilli sauce bottle label", widthMm: 70, heightMm: 100, text: { brand: "HOT HOUSE", product: "Scotch Bonnet Sauce", detail: "150 ml · Fiery · Keep refrigerated" }, background: "#fff4e6", colors: { product: "#b42318" } },
  { product: "vinyl-stickers", title: "Club laptop sticker", widthMm: 100, heightMm: 100 },
  { product: "vinyl-stickers", title: "Bumper sticker", widthMm: 300, heightMm: 75, text: { title: "BRAKE FOR BIKES", sub: "Share the road" }, background: "#1b1f24" },
  { product: "self-inking-stamps", title: "Company address stamp", widthMm: 58, heightMm: 22 },
  { product: "self-inking-stamps", title: "Approval stamp", widthMm: 38, heightMm: 14, text: { co: "APPROVED", addr: "Signed ______  Date ______" } },
  { product: "engraved-plates", title: "Cup plate, series champion", widthMm: 70, heightMm: 25 },
  { product: "engraved-plates", title: "Shield plate, runner-up", widthMm: 100, heightMm: 30, text: { title: "Runner-up", event: "Northside Junior League 2026" }, background: "#c9ccd1" },
  { product: "acrylic-signs", title: "Workshop door sign", widthMm: 300, heightMm: 120 },
  { product: "acrylic-signs", title: "Reception desk plaque", widthMm: 200, heightMm: 60, text: { title: "Reception", sub: "Please sign in on arrival" }, background: "#f1e6d2" },
];
