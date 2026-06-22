import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  /**
   * サンプリング温度。未指定時はハルシネーション抑制のため低め(0.6)を既定にする。
   * 事実厳守が重要な生成（投稿・返信）は呼び出し側でさらに低く(0.4〜0.5)指定する。
   */
  temperature?: number;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () => {
  // ★GEMINI_API_KEY があれば Google の OpenAI 互換エンドポイントを直接使う
  //   （Manus/Forge ゲートウェイを経由しない）。
  if (ENV.geminiApiKey) {
    return `${ENV.geminiBaseUrl.replace(/\/$/, "")}/chat/completions`;
  }
  return ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";
};

const resolveApiKey = () => ENV.geminiApiKey || ENV.forgeApiKey;

const resolveModel = () => ENV.geminiModel || "gemini-2.5-flash";

const assertApiKey = () => {
  if (!resolveApiKey()) {
    throw new Error("GEMINI_API_KEY (または BUILT_IN_FORGE_API_KEY) is not configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const payload: Record<string, unknown> = {
    model: resolveModel(),
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768;
  // ハルシネーション抑制：温度は既定で低め。呼び出し側指定があれば優先。
  payload.temperature = typeof params.temperature === 'number' ? params.temperature : 0.6;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  // ★#17 タイムアウトとリトライ付きフェッチ。
  //   - 60 秒で AbortController によるタイムアウト
  //   - 5xx / ネットワーク失敗のときだけ最大 2 回リトライ（指数バックオフ 1s → 3s）
  //   - 4xx は即時失敗（リトライ対象外。プロンプトやスキーマの問題）
  const TIMEOUT_MS = 60_000;
  const MAX_ATTEMPTS = 3;
  const apiUrl = resolveApiUrl();
  const fetchHeaders = {
    "content-type": "application/json",
    authorization: `Bearer ${resolveApiKey()}`,
  } as const;
  const body = JSON.stringify(payload);

  let response: Response | null = null;
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: fetchHeaders,
        body,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // 4xx は即時失敗（リトライしても直らない）。ただし 429（レート制限）は
      // 一時的なので例外的にリトライ対象にする（自動投稿の同時実行で発生しうる）。
      if (!response.ok && response.status >= 400 && response.status < 500 && response.status !== 429) {
        const errorText = await response.text();
        throw new Error(
          `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
        );
      }
      // 429 / 5xx はリトライ
      if (!response.ok) {
        const errorText = await response.text();
        lastError = new Error(
          `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
        );
        if (attempt < MAX_ATTEMPTS) {
          // 429 は Retry-After ヘッダを尊重（なければやや長めのバックオフ）。
          const retryAfterSec = Number(response.headers.get("retry-after"));
          const backoff = response.status === 429
            ? (retryAfterSec > 0 ? retryAfterSec * 1000 : (attempt === 1 ? 2000 : 5000))
            : (attempt === 1 ? 1000 : 3000);
          console.warn(`[LLM] ${response.status} on attempt ${attempt}, retrying in ${backoff}ms`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
        throw lastError;
      }
      // 成功
      break;
    } catch (e: any) {
      clearTimeout(timer);
      // タイムアウト / ネットワーク系
      const msg = e?.message ?? String(e);
      const isAbort = e?.name === 'AbortError';
      lastError = isAbort
        ? new Error(`LLM invoke timed out after ${TIMEOUT_MS}ms (attempt ${attempt})`)
        : e;
      if (attempt < MAX_ATTEMPTS && (isAbort || msg.includes('fetch failed') || msg.includes('ECONN'))) {
        const backoff = attempt === 1 ? 1000 : 3000;
        console.warn(`[LLM] network/timeout on attempt ${attempt}, retrying in ${backoff}ms`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw lastError;
    }
  }

  if (!response) {
    throw lastError ?? new Error('LLM invoke failed (no response)');
  }

  // 応答ボディのパースと構造検証。
  // これがないと呼び出し側の `response.choices[0].message.content` が
  // choices 空配列のときに TypeError でクラッシュする（=「生成に失敗」）。
  let parsed: any;
  try {
    parsed = await response.json();
  } catch (e: any) {
    throw new Error(`LLM invoke failed: could not parse response body (${e?.message ?? e})`);
  }
  if (!parsed || !Array.isArray(parsed.choices) || parsed.choices.length === 0) {
    // Gemini がコンテンツブロック等で choices を返さないケース。finish_reason も拾う。
    const fr = parsed?.choices?.[0]?.finish_reason ?? parsed?.promptFeedback?.blockReason;
    throw new Error(`LLM invoke failed: no choices in response${fr ? ` (reason: ${fr})` : ""}`);
  }
  return parsed as InvokeResult;
}
