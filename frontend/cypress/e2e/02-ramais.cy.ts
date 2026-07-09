/**
 * CRUD de Ramais — caminho principal.
 * Requer backend rodando em localhost:5000 com banco inicializado.
 */

const RAMAL_NUM = `8${Math.floor(Math.random() * 900) + 100}`; // 8000-8999, evita colisão
const RAMAL_NAME = `Agente Cypress ${RAMAL_NUM}`;

describe("Ramais", () => {
  before(() => {
    cy.login();
  });

  it("navega para /ramais", () => {
    cy.visit("/ramais");
    cy.contains("Ramais").should("be.visible");
  });

  it("abre o dialog de novo ramal", () => {
    cy.visit("/ramais");
    cy.contains("button", /novo ramal/i).click();
    cy.get('[role="dialog"]').should("be.visible");
  });

  it("cria um ramal novo", () => {
    cy.visit("/ramais");
    cy.contains("button", /novo ramal/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('input[name="number"], input[placeholder*="número"], input[placeholder*="ramal"]')
        .first()
        .clear()
        .type(RAMAL_NUM);
      cy.get('input[name="name"], input[placeholder*="nome"]')
        .first()
        .clear()
        .type(RAMAL_NAME);
    });
    cy.get('[role="dialog"]').contains("button", /salvar|criar|confirmar/i).click();
    cy.contains(RAMAL_NAME, { timeout: 8000 }).should("exist");
  });

  it("edita o ramal criado", () => {
    cy.visit("/ramais");
    cy.contains(RAMAL_NAME).should("exist");
    cy.contains("tr", RAMAL_NAME)
      .find('button[aria-label*="editar"], button[title*="ditar"], [data-action="edit"]')
      .first()
      .click();
    cy.get('[role="dialog"]').should("be.visible");
    cy.get('[role="dialog"]').contains("button", /salvar|confirmar/i).click();
    cy.contains(RAMAL_NAME).should("exist");
  });

  it("remove o ramal criado", () => {
    cy.visit("/ramais");
    cy.contains("tr", RAMAL_NAME)
      .find('button[aria-label*="excluir"], button[aria-label*="deletar"], button[title*="xcluir"], [data-action="delete"]')
      .first()
      .click();
    // Confirma dialog de exclusão se houver
    cy.get('[role="dialog"]').then(($dialog) => {
      if ($dialog.is(":visible")) {
        cy.wrap($dialog).contains("button", /confirmar|excluir|deletar|sim/i).click();
      }
    });
    cy.contains(RAMAL_NAME, { timeout: 6000 }).should("not.exist");
  });
});
