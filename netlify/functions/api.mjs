// 자율성과지표 관리 - Netlify Functions API
// 데이터는 Netlify Blobs(사이트 전용 저장소)에 저장됩니다. 별도 DB가 필요 없습니다.
import { getStore } from "@netlify/blobs";
import seed from "../../data/seed.json";

const MAX_BODY = 1024 * 1024;     // 1MB
const KEEP_HISTORY = 60;          // 변경 이력 보관 개수
const AI_MIN_INTERVAL = 60 * 1000; // 같은 데이터로 AI 재호출 최소 간격

const json = (status, obj) => new Response(JSON.stringify(obj), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});
const store = () => getStore({ name: "kpi", consistency: "strong" });
const clone = (o) => JSON.parse(JSON.stringify(o));
// 화면이 한국 시간으로 읽도록 KST 기준 문자열(타임존 표기 없음)로 기록
const nowKST = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19);
const validShape = (d) =>
  d && typeof d === "object" && d.meta && typeof d.meta === "object" &&
  Array.isArray(d.kpis) && d.kpis.every((k) => k && Array.isArray(k.subs));

async function readData(s) {
  return (await s.get("data", { type: "json" })) ?? clone(seed);
}

async function readBody(req) {
  const text = await req.text();
  if (!text || text.length > MAX_BODY) return null;
  try { return JSON.parse(text); } catch { return null; }
}

async function saveWithHistory(s, current, next) {
  const key = `history/${String(Date.now()).padStart(15, "0")}`;
  await s.setJSON(key, current);
  const index = (await s.get("history-index", { type: "json" })) ?? [];
  index.unshift({ key, version: current.meta.version, at: current.meta.updatedAt, by: current.meta.updatedBy });
  const dropped = index.splice(KEEP_HISTORY);
  await s.setJSON("history-index", index);
  await s.setJSON("data", next);
  for (const d of dropped) { try { await s.delete(d.key); } catch {} }
}

const editorName = (v, suffix = "") => ((String(v ?? "").trim() || "이름 없음").slice(0, 30) + suffix);

const AI_PROMPT = `당신은 대학 혁신지원사업단의 성과관리 담당자입니다.
아래는 자율성과지표 현황을 자동 분석한 자료입니다. 이 자료만 근거로 사업단장에게 보고할 요약 문안을 한국어로 작성하세요.

작성 규칙
- 분량: 400~600자, 개조식이 아닌 짧은 문단 3개
- 1문단: 전체 진척 상황과 경과율 대비 평가
- 2문단: 부진·주의 지표의 원인과 남은 기간에 필요한 실적
- 3문단: 단장이 결정하거나 지시할 사항 2~3가지
- 자료에 없는 수치나 사실은 만들지 말 것. 측정 전 항목은 평가하지 말고 측정 전이라고만 쓸 것
- 보고서 문체(~함, ~필요) 사용

[분석 자료]
`;

async function summary(req, s) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(501, { message: "ANTHROPIC_API_KEY 환경 변수가 없습니다." });
  const body = (await readBody(req)) ?? {};
  const facts = String(body.facts ?? "").slice(0, 8000);
  const data = await readData(s);
  const version = data.meta.version;
  const cache = await s.get("ai-cache", { type: "json" });
  if (cache && cache.version === version && Date.now() - cache.at < AI_MIN_INTERVAL) {
    return json(200, { text: cache.text, cached: true });
  }
  if (!facts) return json(400, { message: "분석 자료가 비어 있습니다." });
  let r;
  try {
    r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-sonnet-4-5",
        max_tokens: 1200,
        messages: [{ role: "user", content: AI_PROMPT + facts }],
      }),
    });
  } catch {
    return json(502, { message: "AI 서버에 연결하지 못했습니다." });
  }
  if (!r.ok) {
    const msg = { 401: "API 키가 올바르지 않습니다.", 404: "AI_MODEL 이름을 확인해 주세요.", 429: "요청이 많습니다. 잠시 후 다시 시도해 주세요." }[r.status] || `AI 서버 오류(${r.status})`;
    return json(502, { message: msg });
  }
  const resp = await r.json();
  const text = (resp.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  await s.setJSON("ai-cache", { version, text, at: Date.now() });
  return json(200, { text });
}

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  const method = req.method;
  const s = store();

  try {
    if (path === "/api/data" && method === "GET") return json(200, await readData(s));

    if (path === "/api/version" && method === "GET") {
      const m = (await readData(s)).meta;
      return json(200, { version: m.version, updatedAt: m.updatedAt, updatedBy: m.updatedBy });
    }

    if (path === "/api/data" && method === "PUT") {
      const body = await readBody(req);
      if (!body || !validShape(body.data)) return json(400, { error: "bad_data" });
      const current = await readData(s);
      if (body.version !== current.meta.version) return json(409, { error: "conflict", current });
      const next = body.data;
      next.meta.version = (Number(current.meta.version) || 0) + 1;
      next.meta.updatedAt = nowKST();
      next.meta.updatedBy = editorName(body.editor);
      await saveWithHistory(s, current, next);
      return json(200, next);
    }

    if (path === "/api/history" && method === "GET") {
      return json(200, (await s.get("history-index", { type: "json" })) ?? []);
    }

    if (path === "/api/restore" && method === "POST") {
      const body = await readBody(req);
      if (!body || typeof body.key !== "string" || !body.key.startsWith("history/")) return json(400, { error: "bad_request" });
      const old = await s.get(body.key, { type: "json" });
      if (!validShape(old)) return json(404, { error: "not_found" });
      const current = await readData(s);
      if (body.version !== current.meta.version) return json(409, { error: "conflict", current });
      const next = clone(old);
      next.meta.version = (Number(current.meta.version) || 0) + 1;
      next.meta.updatedAt = nowKST();
      next.meta.updatedBy = editorName(body.editor, ` (v${old.meta.version}로 복원)`);
      await saveWithHistory(s, current, next);
      return json(200, next);
    }

    if (path === "/api/ai-status" && method === "GET") return json(200, { enabled: Boolean(process.env.ANTHROPIC_API_KEY) });

    if (path === "/api/summary" && method === "POST") return await summary(req, s);

    return json(404, { error: "not_found" });
  } catch (e) {
    console.error(e);
    return json(500, { error: "server_error", message: "서버 처리 중 오류가 났습니다." });
  }
};

export const config = {
  path: ["/api/data", "/api/version", "/api/history", "/api/restore", "/api/ai-status", "/api/summary"],
};
