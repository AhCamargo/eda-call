/**
 * Campanhas (discador simples) — criação e listagem.
 */

const CAMP_NAME = `CampanhaCypress${Date.now()}`;

describe("Campanhas — Discador", () => {
  before(() => {
    cy.login();
  });

  it("navega para /campanhas/discador", () => {
    cy.visit("/campanhas/discador");
    cy.contains("Campanhas").should("be.visible");
  });

  it("abre o dialog de nova campanha", () => {
    cy.visit("/campanhas/discador");
    cy.contains("button", /nova campanha|criar campanha/i).click();
    cy.get('[role="dialog"]').should("be.visible");
  });

  it("cria campanha e a exibe na lista", () => {
    cy.visit("/campanhas/discador");
    cy.contains("button", /nova campanha|criar campanha/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('input[name="name"], input[placeholder*="nome"]').first().type(CAMP_NAME);
    });
    cy.get('[role="dialog"]').contains("button", /salvar|criar|confirmar/i).click();
    cy.contains(CAMP_NAME, { timeout: 8000 }).should("exist");
  });
});

describe("URA Reversa", () => {
  before(() => {
    cy.login();
  });

  it("navega para /campanhas/ura-reversa", () => {
    cy.visit("/campanhas/ura-reversa");
    cy.contains("URA Reversa").should("be.visible");
  });

  it("exibe formulário de criação de campanha URA", () => {
    cy.visit("/campanhas/ura-reversa");
    cy.contains("button", /nova|criar/i).should("exist");
  });
});
