import { describe, it, expect } from "vitest";
import { extractPhonesFromCsv } from "./phoneList";

describe("extractPhonesFromCsv", () => {
  it("lê a coluna telefone (instrução exibida na tela)", () => {
    const { valid } = extractPhonesFromCsv("nome,telefone\nAna,11999990000\nBia,11988880000\n");
    expect(valid).toEqual(["11999990000", "11988880000"]);
  });

  it("aceita CSV do Excel pt-BR (separador ;) com BOM, acento e máscara", () => {
    const csv = "﻿Nome;Número\nAna;(11) 99999-0000\nBia;+55 11 98888-0000\n";
    const { valid } = extractPhonesFromCsv(csv);
    expect(valid).toEqual(["11999990000", "5511988880000"]);
  });

  it("aceita arquivo sem cabeçalho, um número por linha", () => {
    const { valid } = extractPhonesFromCsv("11999990000\n11988880000\n");
    expect(valid).toEqual(["11999990000", "11988880000"]);
  });

  it("acha a coluna de telefone mesmo com cabeçalho desconhecido", () => {
    const { valid } = extractPhonesFromCsv("cliente,contato\nAna,11999990000\nBia,11988880000\n");
    expect(valid).toEqual(["11999990000", "11988880000"]);
  });

  it("remove duplicados e separa inválidos", () => {
    const { valid, invalid } = extractPhonesFromCsv("telefone\n11999990000\n11999990000\n123\n");
    expect(valid).toEqual(["11999990000"]);
    expect(invalid).toEqual(["123"]);
  });

  it("aceita os nomes de coluna antigos (phone, phoneNumber)", () => {
    expect(extractPhonesFromCsv("phoneNumber\n11999990000\n").valid).toEqual(["11999990000"]);
    expect(extractPhonesFromCsv("phone\n11999990000\n").valid).toEqual(["11999990000"]);
  });
});
