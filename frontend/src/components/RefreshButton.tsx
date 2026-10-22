import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Botão "Atualizar" padrão das telas (mesmo visual da Central Telefônica).
// Gira enquanto `onRefresh` não termina; `loading` permite que a tela
// informe um carregamento que ela mesma iniciou.
export default function RefreshButton({
  onRefresh,
  loading = false,
}: {
  onRefresh: () => Promise<unknown> | void;
  loading?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const spinning = busy || loading;
  return (
    <Button
      variant="outline"
      size="icon"
      title="Atualizar"
      disabled={spinning}
      onClick={async () => {
        setBusy(true);
        try {
          await onRefresh();
        } finally {
          setBusy(false);
        }
      }}
    >
      <RefreshCw className={`h-4 w-4 ${spinning ? "animate-spin" : ""}`} />
    </Button>
  );
}
