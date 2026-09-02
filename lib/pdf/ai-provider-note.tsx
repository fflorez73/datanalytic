import 'server-only';
import { Text } from '@react-pdf/renderer';
import type { AiProvider } from '@/lib/ai-client';

/**
 * Nota discreta que solo se renderiza cuando la narrativa fue generada con
 * el proveedor de IA de respaldo (Gemini) en vez del principal (Claude) —
 * ver lib/ai-client.ts. No depende del StyleSheet de cada documento PDF
 * (estilo inline) para poder reutilizarse en los 8 documentos por igual.
 */
export function AiProviderPdfNote({ provider }: { provider?: AiProvider }) {
  if (provider !== 'gemini') return null;

  return (
    <Text style={{ marginTop: 10, fontSize: 8, fontFamily: 'Helvetica-Oblique', color: '#94a3b8', textAlign: 'center' }}>
      Esta narrativa fue generada con un proveedor de IA de respaldo porque el proveedor principal no estaba disponible en el momento del análisis.
    </Text>
  );
}
