import type { AiProvider } from '@/lib/ai-client';

/**
 * Nota discreta que solo se muestra cuando la narrativa fue generada con el
 * proveedor de IA de respaldo (Gemini) en vez del principal (Claude) — ver
 * lib/ai-client.ts. No renderiza nada para 'anthropic' ni para narrativas
 * antiguas sin el campo (undefined).
 */
export function AiProviderNote({ provider }: { provider?: AiProvider }) {
  if (provider !== 'gemini') return null;

  return (
    <p className="text-center text-xs italic text-slate-400">
      Esta narrativa fue generada con un proveedor de IA de respaldo porque el proveedor principal no estaba disponible en el momento del análisis.
    </p>
  );
}
