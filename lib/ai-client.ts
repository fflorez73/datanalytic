import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

const ANTHROPIC_MODEL = 'claude-opus-5';
// gemini-3.7-flash es el modelo Flash más reciente, pero en pruebas reales
// (2026-09-02) devolvía 503 "high demand" de forma consistente — un respaldo
// que no responde cuando se le necesita no sirve. gemini-2.5-flash es la
// versión estable anterior, probada y funcionando en el mismo momento.
const GEMINI_MODEL = 'gemini-2.5-flash';

// El SDK de Anthropic exige streaming (y no acepta timeout > 10min en modo
// no-streaming) — ver nota en generate-combined-narrative.ts. Este mismo
// timeout se usa para el intento de Gemini, así ninguno de los dos proveedores
// puede colgar la llamada indefinidamente.
const REQUEST_TIMEOUT_MS = 240_000;

export type AiProvider = 'anthropic' | 'gemini';

export type NarrativeFallbackResult<T> = {
  data: T;
  provider: AiProvider;
};

type ClaudeFailureReason = 'insufficient_credit' | 'rate_limit' | 'timeout' | 'other';

function describeError(e: unknown): string {
  if (!e) return '(sin error)';
  const err = e as any;
  if (e instanceof Error) {
    const status = err.status !== undefined ? ` status=${err.status}` : '';
    return `${err.name}: ${err.message}${status}`;
  }
  return String(e);
}

function classifyClaudeError(e: unknown): ClaudeFailureReason {
  const err = e as any;
  if (err instanceof Anthropic.APIConnectionTimeoutError) return 'timeout';
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError') return 'timeout';
  if (err instanceof Anthropic.RateLimitError || err?.status === 429) return 'rate_limit';

  const status = err?.status;
  const message = String(err?.message ?? '');
  if ((status === 400 || status === 402) && /credit|insufficient.*balance|balance.*(is )?too low|purchase credits/i.test(message)) {
    return 'insufficient_credit';
  }

  return 'other';
}

async function attemptClaude<T>(opts: {
  system: string;
  user: string;
  maxTokens: number;
  parse: (text: string) => T | null;
}): Promise<{ ok: true; data: T } | { ok: false; reason: ClaudeFailureReason; error: unknown }> {
  try {
    const client = new Anthropic();
    const stream = client.messages.stream(
      {
        model: ANTHROPIC_MODEL,
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: 'user', content: opts.user }],
      },
      { timeout: REQUEST_TIMEOUT_MS }
    );
    const response = await stream.finalMessage();

    if (response.stop_reason === 'max_tokens') {
      return {
        ok: false,
        reason: 'other',
        error: new Error(`Respuesta de Claude truncada por max_tokens — usage: ${JSON.stringify(response.usage)}`),
      };
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) {
      return { ok: false, reason: 'other', error: new Error('Respuesta de Claude sin contenido de texto') };
    }

    const data = opts.parse(textBlock.text);
    if (data === null) {
      return {
        ok: false,
        reason: 'other',
        error: new Error(`JSON de Claude inválido/con forma inesperada: ${textBlock.text.substring(0, 500)}`),
      };
    }

    return { ok: true, data };
  } catch (e) {
    return { ok: false, reason: classifyClaudeError(e), error: e };
  }
}

async function attemptGemini<T>(opts: {
  system: string;
  user: string;
  maxTokens: number;
  parse: (text: string) => T | null;
}): Promise<T> {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: opts.user,
    config: {
      systemInstruction: opts.system,
      responseMimeType: 'application/json',
      maxOutputTokens: opts.maxTokens,
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini no devolvió texto — finishReason: ${response.candidates?.[0]?.finishReason ?? 'desconocido'}`);
  }

  const data = opts.parse(text);
  if (data === null) {
    throw new Error(`JSON de Gemini inválido/con forma inesperada: ${text.substring(0, 500)}`);
  }

  return data;
}

/**
 * Capa compartida de generación de narrativas con IA para los 9 módulos del
 * proyecto (8 generate-*-narrative.ts + el comparador de períodos): intenta
 * Claude primero, con un reintento cuando falla por una razón "blanda" (JSON
 * inválido, truncamiento por max_tokens, error 500/desconocido puntual), y
 * cae a Gemini como respaldo cuando Claude falla por saldo insuficiente,
 * rate limit, timeout, o agota su reintento. Si GEMINI_API_KEY no está
 * configurada, se comporta exactamente igual que antes de este cambio (solo
 * Claude, sin respaldo) — no es obligatoria. Si ambos proveedores fallan,
 * propaga el error real (nunca null silencioso); cada generate-*-narrative.ts
 * decide en su propio catch si ese fallo se traduce en narrative=null (no
 * bloqueante) o en un error visible para el usuario.
 */
export async function generateNarrativeWithFallback<T>(opts: {
  system: string;
  user: string;
  maxTokens: number;
  parse: (text: string) => T | null;
  logPrefix: string;
}): Promise<NarrativeFallbackResult<T>> {
  const hasClaudeKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);

  if (!hasClaudeKey && !hasGeminiKey) {
    throw new Error(`${opts.logPrefix} Ninguna API key de IA configurada (ni ANTHROPIC_API_KEY ni GEMINI_API_KEY).`);
  }

  let lastClaudeError: unknown = null;

  if (hasClaudeKey) {
    const first = await attemptClaude(opts);
    if (first.ok) return { data: first.data, provider: 'anthropic' };
    lastClaudeError = first.error;
    console.error(`${opts.logPrefix} Intento 1 con Claude falló (${first.reason}): ${describeError(first.error)}`);

    if (first.reason === 'other') {
      const second = await attemptClaude(opts);
      if (second.ok) return { data: second.data, provider: 'anthropic' };
      lastClaudeError = second.error;
      console.error(`${opts.logPrefix} Reintento con Claude también falló (${second.reason}): ${describeError(second.error)}`);
    } else {
      console.warn(`${opts.logPrefix} Fallo "${first.reason}" — se omite el reintento con Claude y se pasa directo a Gemini.`);
    }
  } else {
    console.warn(`${opts.logPrefix} ANTHROPIC_API_KEY no configurada — se omite Claude.`);
  }

  if (!hasGeminiKey) {
    if (lastClaudeError) throw lastClaudeError;
    throw new Error(`${opts.logPrefix} No se pudo generar la narrativa: ningún proveedor de IA disponible.`);
  }

  console.warn(`${opts.logPrefix} Usando Gemini (${GEMINI_MODEL}) como respaldo...`);
  try {
    const data = await attemptGemini(opts);
    console.warn(`${opts.logPrefix} Gemini generó la narrativa de respaldo correctamente.`);
    return { data, provider: 'gemini' };
  } catch (geminiError) {
    console.error(`${opts.logPrefix} El respaldo con Gemini también falló: ${describeError(geminiError)}`);
    throw new Error(
      `${opts.logPrefix} Ambos proveedores de IA fallaron. Claude: ${describeError(lastClaudeError)} | Gemini: ${describeError(geminiError)}`
    );
  }
}
