/**
 * Relatórios — filtro de data, tabs e exportação.
 */

describe("Relatórios", () => {
  before(() => {
    cy.login();
  });

  it("navega para /relatorios e exibe as tabs", () => {
    cy.visit("/relatorios");
    cy.contains("Relatórios").should("be.visible");
    cy.contains("Por Ramal").should("be.visible");
    cy.contains("Por Campanha").should("be.visible");
    cy.contains("URA Logs").should("be.visible");
    cy.contains("Gravações").should("be.visible");
  });

  it("filtro de data: campos from/to presentes e funcionais", () => {
    cy.visit("/relatorios");
    cy.get('input[type="date"]').should("have.length.at.least", 2);
    cy.get('input[type="date"]').first().should("not.have.value", "");
    cy.get('input[type="date"]').last().should("not.have.value", "");
  });

  it("botão Atualizar dispara busca (sem erros 500)", () => {
    cy.visit("/relatorios");
    cy.intercept("GET", "/api/reports/calls-by-extension*").as("cdrExt");
    cy.contains("button", /atualizar/i).click();
    cy.wait("@cdrExt", { timeout: 10000 }).its("response.statusCode").should("be.lt", 500);
  });

  it("troca para a tab Por Campanha", () => {
    cy.visit("/relatorios");
    cy.contains('[role="tab"]', "Por Campanha").click();
    cy.contains("Todas as campanhas").should("be.visible");
  });

  it("botão XLS fica habilitado quando há dados", () => {
    cy.visit("/relatorios");
    cy.intercept("GET", "/api/reports/calls-by-extension*", { body: [
      { id: 1, phoneNumber: "11999990000", result: "atendida", duration: 60, createdAt: new Date().toISOString(), Extension: { number: "100", name: "Teste" } },
    ] }).as("cdrMock");
    cy.contains("button", /atualizar/i).click();
    cy.wait("@cdrMock");
    cy.contains("button", "XLS").should("not.be.disabled");
  });
});

describe("Relatórios de Produtividade", () => {
  before(() => {
    cy.login();
  });

  it("navega para /relatorios/produtividade", () => {
    cy.visit("/relatorios/produtividade");
    cy.contains("Produtividade dos Agentes").should("be.visible");
  });

  it("filtro de data funciona", () => {
    cy.visit("/relatorios/produtividade");
    cy.get('input[type="date"]').should("have.length", 2);
    cy.contains("button", /atualizar/i).should("exist");
  });

  it("carrega dados dos agentes sem erro 5xx", () => {
    cy.visit("/relatorios/produtividade");
    cy.intercept("GET", "/api/agent-reports*").as("agentReport");
    cy.contains("button", /atualizar/i).click();
    cy.wait("@agentReport", { timeout: 10000 }).its("response.statusCode").should("be.lt", 500);
  });
});
