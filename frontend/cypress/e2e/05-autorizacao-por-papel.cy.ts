/**
 * Cobertura de autorização por papel no frontend (achado R5 da auditoria de
 * segurança — antes desta suíte, todos os specs Cypress logavam como o
 * mesmo usuário admin, então uma regressão em App.tsx (ex.: remover o
 * `isAdmin && ...` de uma rota) não seria detectada automaticamente).
 *
 * Cria usuários supervisor/agent efêmeros via API (admin), testa que rotas
 * administrativas ficam inacessíveis para eles, e remove os usuários no
 * final.
 */
const SUFFIX = `${Date.now()}`;
const SUPERVISOR_USER = `cy-supervisor-${SUFFIX}`;
const AGENT_USER = `cy-agent-${SUFFIX}`;
const TEST_PASSWORD = "senha-teste-123";

let adminToken: string;
let supervisorId: number;
let agentId: number;

describe("Autorização por papel (admin/supervisor/agent)", () => {
  before(() => {
    cy.request("POST", "/api/auth/login", {
      username: Cypress.env("ADMIN_USER"),
      password: Cypress.env("ADMIN_PASS"),
    }).then((resp) => {
      adminToken = resp.body.token;
      const authHeaders = { Authorization: `Bearer ${adminToken}` };

      cy.request({
        method: "POST",
        url: "/api/users",
        headers: authHeaders,
        body: { username: SUPERVISOR_USER, password: TEST_PASSWORD, role: "supervisor" },
      }).then((r) => (supervisorId = r.body.id));

      cy.request({
        method: "POST",
        url: "/api/users",
        headers: authHeaders,
        body: { username: AGENT_USER, password: TEST_PASSWORD, role: "agent" },
      }).then((r) => (agentId = r.body.id));
    });
  });

  after(() => {
    const authHeaders = { Authorization: `Bearer ${adminToken}` };
    if (supervisorId) cy.request({ method: "DELETE", url: `/api/users/${supervisorId}`, headers: authHeaders });
    if (agentId) cy.request({ method: "DELETE", url: `/api/users/${agentId}`, headers: authHeaders });
  });

  it("agente não acessa /usuarios (admin only) — é redirecionado para /agent", () => {
    cy.login(AGENT_USER, TEST_PASSWORD);
    cy.visit("/usuarios");
    cy.url().should("include", "/agent");
    cy.contains("Usuários").should("not.exist");
  });

  it("agente não acessa /ramais (admin only) — é redirecionado", () => {
    cy.login(AGENT_USER, TEST_PASSWORD);
    cy.visit("/ramais");
    cy.url().should("not.include", "/ramais");
  });

  it("agente não acessa /relatorios (supervisor+) — é redirecionado", () => {
    cy.login(AGENT_USER, TEST_PASSWORD);
    cy.visit("/relatorios");
    cy.url().should("not.include", "/relatorios");
  });

  it("supervisor acessa /relatorios normalmente", () => {
    cy.login(SUPERVISOR_USER, TEST_PASSWORD);
    cy.visit("/relatorios");
    cy.url().should("include", "/relatorios");
  });

  it("supervisor não acessa /usuarios (admin only) — é redirecionado", () => {
    cy.login(SUPERVISOR_USER, TEST_PASSWORD);
    cy.visit("/usuarios");
    cy.url().should("include", "/supervisor");
    cy.contains("Usuários").should("not.exist");
  });

  it("admin acessa /usuarios normalmente", () => {
    cy.login();
    cy.visit("/usuarios");
    cy.url().should("include", "/usuarios");
  });
});
