// A cell that reads like a field label: words only, no digits ("Due Date", "PNR").
const LABEL_CELL = /^[A-Za-z][A-Za-z .'/#&()-]{0,24}$/;

// Field names printed on tickets, bills, invoices and passes. A row only counts as a
// header of labels if at least one cell is one of these.
const KNOWN_LABEL =
  /^(?:from|to|flight|train|bus|seat|gate|pnr|booking(?: id| ref| reference)?|passenger|name|date|time|day|departure|arrival|boarding|terminal|cabin|class|coach(?: \/ berth)?|berth|status|platform|guests?|table|venue|entry|event(?: name)?|amount(?: due)?|due date|bill date|billing period|units consumed|consumer|customer|account(?: id| no)?|bill reference|reference|invoice(?: no)?|order(?: id| no)?|item|qty|price|total|payment|purchase date|warranty(?: until| till)?|serial|retailer|merchant|company|role|location|deadline|code|offer|expiry|valid (?:till|until)|product)$/i;

// Airport / station codes are values, never labels ("DEL  BLR").
const CODE_CELL = /^[A-Z]{3,5}$/;

/** Read explicit key/value rows emitted by OCR from tables and form-like PDFs. */
export function labelledValue(text: string, labels: string | string[]): string | undefined {
  const alternatives = (Array.isArray(labels) ? labels : [labels])
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(`^\\s*(?:${alternatives})\\s*[:\\t]\\s*(.+?)\\s*$`, 'im');
  const value = text.match(pattern)?.[1]?.trim();
  if (!value || isLabelHeader(value)) return undefined;
  return value;
}

function isLabelHeader(value: string): boolean {
  const headers = new Set(['amount', 'date', 'time', 'price', 'total', 'currency', 'merchant', 'company', 'role', 'location', 'deadline', 'offer', 'code', 'expiry', 'product', 'item', 'quantity', 'qty', 'ingredients', 'method', 'return deadline', 'warranty until']);
  const cells = value.split('\t').map((cell) => cell.trim().toLowerCase()).filter(Boolean);
  return cells.length > 0 && cells.every((cell) => headers.has(cell));
}

/**
 * Boarding passes, bills and posters print labels above their values in columns.
 * OCR returns each visual row as one line with cells separated by tabs, so
 *
 *   FLIGHT\tDATE\tDEPARTURE        →   FLIGHT: 6E 6132
 *   6E 6132\t29SEP\t06:20              DATE: 29SEP
 *                                      DEPARTURE: 06:20
 *
 * Rewriting the grid as "Label: value" lines lets the ordinary same-line rules
 * (PNR, due date, departure time, route) read it. Key–value tables ("Payment  UPI"
 * above "Warranty  12 months") are left alone.
 */
export function pairLabelledCells(text: string): string {
  const lines = text.split('\n');
  const output: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const labels = cells(lines[i]);
    const values = i + 1 < lines.length ? cells(lines[i + 1]) : [];
    const isGrid =
      labels.length >= 2 &&
      labels.length === values.length &&
      labels.every((cell) => LABEL_CELL.test(cell) && (KNOWN_LABEL.test(cell) || !CODE_CELL.test(cell))) &&
      labels.some((cell) => KNOWN_LABEL.test(cell)) &&
      // The next row is values, not another row of field names.
      !KNOWN_LABEL.test(values[0]);
    if (isGrid) {
      labels.forEach((label, index) => output.push(`${label}: ${values[index]}`));
      i += 1;
    } else {
      output.push(lines[i]);
    }
  }
  return output.join('\n');
}

function cells(line: string): string[] {
  return line
    .split('\t')
    .map((cell) => cell.trim())
    .filter(Boolean);
}
