// Normaliza o número que a operadora entregou no CallerID para o formato
// internacional brasileiro (55 + DDD + número), que é o que o WhatsApp usa.
//
// Formatos vistos em troncos brasileiros:
//   44999998888       DDD + celular
//   044999998888      0 + DDD + celular
//   01544999998888    0 + código de operadora + DDD + celular
//   5544999998888     já com o país
//   +55 44 99999-8888 com máscara
//   999998888         sem DDD (ligação local) → usa o DDD padrão configurado

export interface BrPhone {
  /** Só dígitos, com país: 5544999998888 */
  digits: string;
  ddd: string;
  /** Celular (9 dígitos começando por 9). Fixos raramente têm WhatsApp. */
  isMobile: boolean;
}

const VALID_DDD = /^[1-9][1-9]$/;

export const normalizeBrPhone = (raw: string | null | undefined, defaultAreaCode = ""): BrPhone | null => {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return null;

  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    d = d.slice(2);
  } else {
    d = d.replace(/^0+/, "");
    // Código de operadora (ex.: 015, 021) antes do DDD: sobra DDD + número com 2 dígitos a mais
    if (d.length === 12 || d.length === 13) d = d.slice(2);
  }

  if (d.length === 8 || d.length === 9) {
    const area = String(defaultAreaCode).replace(/\D/g, "");
    if (!VALID_DDD.test(area)) return null;
    d = area + d;
  }

  if (d.length !== 10 && d.length !== 11) return null;

  const ddd = d.slice(0, 2);
  const local = d.slice(2);
  if (!VALID_DDD.test(ddd)) return null;

  const isMobile = local.length === 9 ? local.startsWith("9") : /^[6-9]/.test(local);
  // Celular antigo de 8 dígitos ganha o nono dígito
  const subscriber = local.length === 8 && isMobile ? `9${local}` : local;
  if (local.length === 9 && !isMobile) return null;
  if (local.length === 8 && !/^[2-9]/.test(local)) return null;

  return { digits: `55${ddd}${subscriber}`, ddd, isMobile };
};

/** 5544999998888 → (44) 99999-8888 */
export const formatBrPhone = (digits: string): string => {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(digits);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : digits;
};
