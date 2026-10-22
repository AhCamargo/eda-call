import { useState } from "react";
import { Link } from "react-router-dom";
import { usePbx } from "../context/PbxContext";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ArrowRight, X } from "lucide-react";

const HIDE_KEY = "edacall.primeirosPassos.oculto";

const readHidden = (): boolean => {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
};

// Checklist da configuração inicial, mostrado ao admin no Painel ao vivo até
// tudo estar pronto. Cada passo é detectado pelos dados reais (não por
// cliques), então some sozinho quando o sistema já está funcionando.
export default function PrimeirosPassos() {
  const { user, voipLines, extensions } = usePbx();
  const [hidden, setHidden] = useState(readHidden);

  if (user?.role !== "admin" || hidden) return null;

  const steps = [
    {
      done: voipLines.length > 0,
      title: "Cadastre sua linha telefônica",
      text: "Os dados de acesso que a operadora de telefonia enviou.",
      to: "/linhas-voip",
      action: "Cadastrar linha",
    },
    {
      done: extensions.length > 0,
      title: "Crie os ramais da equipe",
      text: "Um ramal para cada pessoa ou telefone.",
      to: "/ramais",
      action: "Criar ramal",
    },
    {
      done: voipLines.some((l) => !!l.inboundContext),
      title: "Defina o atendimento das ligações recebidas",
      text: "O que quem liga ouve e para onde a ligação vai.",
      to: "/central-telefonica",
      action: "Configurar atendimento",
    },
    {
      done: extensions.some((e) => e.status && e.status !== "offline"),
      title: "Conecte um telefone a um ramal",
      text: "Pelo navegador, em “Atender ligações”, ou num aparelho IP.",
      to: "/agent",
      action: "Abrir telefone",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (doneCount === steps.length) return null;
  const nextIndex = steps.findIndex((s) => !s.done);

  const hide = () => {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* armazenamento indisponível — esconde só nesta sessão */
    }
    setHidden(true);
  };

  return (
    <Card className="bg-zinc-900 border-violet-500/40">
      <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base text-zinc-100">
            Primeiros passos
          </CardTitle>
          <p className="text-xs text-zinc-400 mt-1">
            {doneCount} de {steps.length} concluídos — siga na ordem para
            deixar sua central funcionando.
          </p>
        </div>
        <button
          onClick={hide}
          title="Esconder (você pode configurar pelo menu a qualquer momento)"
          className="text-zinc-500 hover:text-zinc-300 p-1"
        >
          <X size={16} />
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        {steps.map((step, i) => {
          const isNext = i === nextIndex;
          return (
            <div
              key={step.to}
              className={`flex items-center gap-3 rounded-md px-3 py-2 ${
                isNext ? "bg-violet-500/10 border border-violet-500/30" : ""
              }`}
            >
              {step.done ? (
                <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              ) : (
                <Circle size={18} className="text-zinc-600 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    step.done ? "text-zinc-500 line-through" : "text-zinc-100"
                  }`}
                >
                  {i + 1}. {step.title}
                </p>
                {!step.done && (
                  <p className="text-xs text-zinc-400">{step.text}</p>
                )}
              </div>
              {!step.done && (
                <Button
                  asChild
                  size="sm"
                  variant={isNext ? "default" : "outline"}
                  className={
                    isNext
                      ? "bg-violet-600 hover:bg-violet-700 text-white gap-1 shrink-0"
                      : "border-zinc-700 text-zinc-300 gap-1 shrink-0"
                  }
                >
                  <Link to={step.to}>
                    {step.action}
                    <ArrowRight size={13} />
                  </Link>
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
