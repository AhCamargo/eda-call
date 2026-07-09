// Suporte global dos testes E2E

// Comando customizado: login via UI
Cypress.Commands.add("login", (username?: string, password?: string) => {
  const user = username ?? Cypress.env("ADMIN_USER");
  const pass = password ?? Cypress.env("ADMIN_PASS");

  cy.visit("/");
  cy.get('input[autocomplete="username"]').type(user);
  cy.get('input[autocomplete="current-password"]').type(pass);
  cy.get('button[type="submit"]').click();
  cy.url().should("not.include", "login");
  cy.window().its("localStorage").invoke("getItem", "token").should("exist");
});

// Comando customizado: login direto via API (mais rápido para testes que não testam o login)
Cypress.Commands.add("loginByApi", (username?: string, password?: string) => {
  const user = username ?? Cypress.env("ADMIN_USER");
  const pass = password ?? Cypress.env("ADMIN_PASS");

  cy.request("POST", "/api/auth/login", { username: user, password: pass }).then((resp) => {
    expect(resp.status).to.eq(200);
    window.localStorage.setItem("token", resp.body.token);
  });
});

declare global {
  namespace Cypress {
    interface Chainable {
      login(username?: string, password?: string): Chainable<void>;
      loginByApi(username?: string, password?: string): Chainable<void>;
    }
  }
}
