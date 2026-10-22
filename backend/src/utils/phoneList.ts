import { parse } from "csv-parse/sync";
import { normalizePhone, PHONE_REGEX } from "./routeHelpers";

// Nomes de coluna aceitos para o telefone (comparados sem acento/maiúsculas).
const PHONE_HEADERS = [
  "telefone",
  "telefones",
  "phone",
  "phonenumber",
  "numero",
  "celular",
  "fone",
  "tel",
  "whatsapp",
];

const normalizeHeader = (h: string) =>
  h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");

// Extrai telefones de um CSV de contatos do jeito que o operador realmente
// o produz: planilha exportada do Excel em pt-BR (separador ";"), com ou sem
// cabeçalho, coluna "Telefone"/"Celular"/"Número", números com máscara.
export const extractPhonesFromCsv = (
  csv: string,
): { valid: string[]; invalid: string[] } => {
  const rows = parse(csv, {
    bom: true,
    delimiter: [",", ";", "\t"],
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true,
  }) as string[][];

  if (!rows.length) return { valid: [], invalid: [] };

  const header = rows[0].map(normalizeHeader);
  let column = header.findIndex((h) => PHONE_HEADERS.includes(h));
  let dataRows = rows.slice(1);

  if (column === -1) {
    const firstRowHasPhone = rows[0].some((cell) =>
      PHONE_REGEX.test(normalizePhone(cell)),
    );
    if (firstRowHasPhone) dataRows = rows; // arquivo sem cabeçalho
    // Sem coluna reconhecida: usa a coluna com mais números válidos.
    const width = Math.max(...dataRows.map((r) => r.length));
    let best = 0;
    column = 0;
    for (let c = 0; c < width; c += 1) {
      const hits = dataRows.filter((r) =>
        PHONE_REGEX.test(normalizePhone(r[c])),
      ).length;
      if (hits > best) {
        best = hits;
        column = c;
      }
    }
  }

  const valid = new Set<string>();
  const invalid: string[] = [];
  for (const row of dataRows) {
    const raw = row[column];
    if (!raw) continue;
    const phone = normalizePhone(raw);
    if (PHONE_REGEX.test(phone)) valid.add(phone);
    else invalid.push(raw);
  }
  return { valid: [...valid], invalid };
};
