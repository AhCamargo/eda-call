describe("Login", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("exibe o formulário de login", () => {
    cy.get('input[autocomplete="username"]').should("exist");
    cy.get('input[autocomplete="current-password"]').should("exist");
    cy.get('button[type="submit"]').should("exist");
  });

  it("rejeita credenciais inválidas", () => {
    cy.get('input[autocomplete="username"]').type("invalido");
    cy.get('input[autocomplete="current-password"]').type("errada");
    cy.get('button[type="submit"]').click();
    cy.contains("inválidos").should("be.visible");
    cy.window().its("localStorage").invoke("getItem", "token").should("be.null");
  });

  it("faz login com sucesso e redireciona para o dashboard", () => {
    cy.login();
    cy.url().should("include", "/callcenter");
    cy.contains("Call Center").should("be.visible");
  });

  it("persiste sessão após reload", () => {
    cy.login();
    cy.reload();
    cy.url().should("not.equal", "/");
    cy.window().its("localStorage").invoke("getItem", "token").should("exist");
  });
});
