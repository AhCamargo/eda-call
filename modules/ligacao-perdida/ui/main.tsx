import { createRoot } from "react-dom/client";
import App from "./App";
import type { ModuleContext } from "./api";
import "./styles.css";

// Contrato com o painel do EdaCall: desenhar dentro de `el` e devolver a limpeza.
export function mount(el: HTMLElement, ctx: ModuleContext) {
  const root = createRoot(el);
  root.render(<App ctx={ctx} />);
  return () => root.unmount();
}
