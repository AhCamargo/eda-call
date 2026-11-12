// Contrato entre o EdaCall (o "shell") e a tela de um módulo.
//
// Cada módulo entrega um arquivo ES module (ui.entry no manifesto) que o shell
// importa em tempo de execução, sem rebuild do EdaCall. O arquivo exporta
// `mount(el, ctx)`: desenha a tela dentro de `el` com o framework que quiser
// (React, Vue, nada) e devolve uma função de limpeza. Assim o módulo é uma
// peça independente: tem as próprias dependências e a própria versão.

export interface EdaCallModuleUser {
  id: number | string;
  username: string;
  role: "admin" | "supervisor" | "agent";
}

export interface EdaCallModuleContext {
  /** Base da API do módulo, já passando pelo núcleo: `${API}/modules/<id>/api`. */
  apiBase: string;
  /** JWT do usuário logado — mande em `Authorization: Bearer`. */
  token: string;
  user: EdaCallModuleUser;
  /** Rota do módulo no painel, ex.: `/m/ligacao-perdida`. */
  basePath: string;
  /** Navega dentro do painel do EdaCall (sem recarregar a página). */
  navigate: (path: string) => void;
}

export interface EdaCallModuleEntry {
  mount: (el: HTMLElement, ctx: EdaCallModuleContext) => void | (() => void);
}

export interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  ui: {
    entry: string;
    style: string | null;
    menu: { label: string; hint?: string; icon?: string; section?: string };
  };
}
