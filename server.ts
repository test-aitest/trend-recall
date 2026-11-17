import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = import.meta.dir;
const RUNS = join(DIR, "runs");
const MEMORY = join(DIR, "memory.json");
mkdirSync(RUNS, { recursive: true });

const EXTRACT = `(()=>{const out=[];const seen=new Set();for(const a of document.querySelectorAll('a')){const im=a.querySelector('img');if(!im)continue;let e=a,box=null;for(let k=0;k<4&&e;k++){if(/[¥￥]/.test(e.textContent)&&e.textContent.length<500){box=e;break}e=e.parentElement}if(!box)continue;const img=im.getAttribute('data-original')||im.getAttribute('data-src')||im.currentSrc||im.src||'';if(!img||img.startsWith('data:')||img.includes('transparent-background')||seen.has(a.href))continue;seen.add(a.href);const sku=box.querySelector('[data-sku]');let color='';try{color=sku?JSON.parse(sku.getAttribute('data-sku')).color_name||'':''}catch{}out.push({href:a.href,img,alt:im.alt||'',txt:box.textContent.replace(/\\s+/g,' ').trim().slice(0,220),color})}return JSON.stringify(out.slice(0,60))})()`;

type Route = { shop: string; site: "wear" | "wearItems" | "baycrews" | "zara" | "learned"; gender: "men" | "women" | ""; kind: "look" | "item"; url: string; outerUrl?: string; english?: boolean };
export const ROUTES: Route[] = [
  { shop: "WEAR Women", site: "wear", gender: "women", kind: "look", url: "https://wear.jp/women-coordinate/?search_word=$Q" },
  { shop: "WEAR Men", site: "wear", gender: "men", kind: "look", url: "https://wear.jp/men-coordinate/?search_word=$Q" },
  { shop: "WEAR Items Women", site: "wearItems", gender: "women", kind: "item", url: "https://wear.jp/women-item/?search_word=$Q" },
  { shop: "WEAR Items Men", site: "wearItems", gender: "men", kind: "item", url: "https://wear.jp/men-item/?search_word=$Q" },
  { shop: "ZARA Woman", site: "zara", gender: "women", kind: "item", url: "https://www.zara.com/jp/ja/search?searchTerm=$Q&section=WOMAN", outerUrl: "https://www.zara.com/jp/ja/woman-outerwear-l1184.html" },
  { shop: "ZARA Man", site: "zara", gender: "men", kind: "item", url: "https://www.zara.com/jp/ja/search?searchTerm=$Q&section=MAN", outerUrl: "https://www.zara.com/jp/ja/man-outerwear-l715.html" },
];

const LEARNED = join(DIR, "routes.json");
function learnedRoutes(): Route[] {
  return existsSync(LEARNED) ? JSON.parse(readFileSync(LEARNED, "utf8")) : [];
}
export function shopName(url: string) {
  const host = new URL(url).hostname.replace(/^(www|shop|store)\./, "");
  return host.split(".")[0].replace(/-/g, " ").toUpperCase();
}
export function templateFor(url: string, keyword: string) {
  const encoded = encodeURIComponent(keyword);
  return keyword && url.includes(encoded) ? url.replace(encoded, "$Q") : keyword && url.includes(keyword) ? url.replace(keyword, "$Q") : url;
}

type Item = { shop: string; kind: string; href: string; img: string; name: string; brand: string; price: number; size: string; height: string; color: string };

export function routeScript(route: Route, keyword: string, colorJa = "") {
  const outer = /ダウン|ジャケット|コート|アウター|ブルゾン/.test(keyword);
  const base = outer && route.outerUrl ? route.outerUrl : route.url;
  const english = ENGLISH.find(([, ja]) => ja === keyword)?.[2].toLowerCase() ?? "outerwear";
  const words = route.english ? english : colorJa && (route.site === "wear" || route.site === "wearItems") ? `${colorJa} ${keyword}` : keyword;
  const url = base.replace("$Q", encodeURIComponent(words));
  return `const page = new Page();\nawait page.goto(${JSON.stringify(url)}, { timeout: 15000 });\nreturn page.evaluate(${JSON.stringify(EXTRACT)});\n`;
}

function bigger(img: string) {
  return img.replace(/_276\.jpg/, "_500.jpg").replace(/_(d|D)_(125|215)\.jpg/, "_$1_500.jpg").replace(/&w=\d+/, "&w=750");
}

const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/;
export function normalize(route: Route, raw: { href: string; img: string; alt: string; txt: string; color: string }, label: string): Item | null {
  const priceMatch = raw.txt.match(/[¥￥]\s?([\d,]+)/);
  if (!priceMatch) return null;
  const price = Number(priceMatch[1].replace(/,/g, ""));
  if (!price) return null;
  const before = raw.txt.slice(0, priceMatch.index).trim();
  let name = raw.alt || before;
  let brand = "";
  let size = "";
  let height = "";
  if (route.kind === "look") {
    if (!raw.img.includes("/coordinate/")) return null;
    brand = before.replace(/^\d{4}\.\d{1,2}\.\d{1,2}\s*/, "").trim();
    size = raw.txt.match(/size:\s?(XXS|XS|XXL|XL|S|M|L|F)/)?.[1] ?? "";
    height = raw.txt.match(/(1[4-9]\d)cm\s*$/)?.[1] ?? "";
    if (!height) return null;
    name = brand || "Street look";
  } else if (route.site === "baycrews") {
    const cleaned = before.replace(/^([A-Z0-9]{1,4}|フリー)\s+/, "").replace("お気に入りアイテムに登録", "").trim();
    brand = raw.alt.split(" ")[0] ?? "";
    name = cleaned || raw.alt;
  } else if (route.site === "wearItems") {
    brand = raw.alt.match(/^(.+?)（/)?.[1] ?? "";
    name = raw.alt.match(/「(.+?)」?（/)?.[1] ?? raw.alt.match(/「(.+)/)?.[1] ?? raw.alt;
    name = name.replace(/【.*?】/g, "").trim();
  } else if (route.site === "zara") {
    name = before || raw.alt;
    brand = "ZARA";
  }
  if (JAPANESE.test(brand)) brand = route.site === "zara" ? "ZARA" : "";
  if (JAPANESE.test(name) || !name) name = [brand, label].filter(Boolean).join(" ");
  else if (route.kind === "look") name = `${brand} ${label}`.trim();
  return { shop: route.shop, kind: route.kind, href: raw.href, img: bigger(raw.img), name: name.slice(0, 60), brand, price, size, height, color: raw.color };
}

const GARMENTS = ["ダウンジャケット", "ダウン", "ジャケット", "コート", "アウター", "ブルゾン", "ニット", "セーター", "カーディガン", "パーカー", "スウェット", "デニム", "パンツ", "スカート", "ワンピース", "シャツ", "ブラウス", "ブーツ", "スニーカー", "マフラー", "バッグ", "ベスト"];
const COLORS: [RegExp, string, string][] = [
  [/黒|ブラック|black/i, "ブラック", "Black"],
  [/白|ホワイト|white/i, "ホワイト", "White"],
  [/ベージュ|beige/i, "ベージュ", "Beige"],
  [/茶|ブラウン|brown/i, "ブラウン", "Brown"],
  [/紺|ネイビー|navy/i, "ネイビー", "Navy"],
  [/グレー|灰色|gray|grey/i, "グレー", "Gray"],
  [/カーキ|khaki/i, "カーキ", "Khaki"],
  [/赤|レッド|red/i, "レッド", "Red"],
];

const ENGLISH: [RegExp, string, string][] = [
  [/puffer|down jacket|down coat/i, "ダウンジャケット", "Puffer jacket"],
  [/bomber|blouson/i, "ブルゾン", "Bomber jacket"],
  [/jacket/i, "ジャケット", "Jacket"],
  [/coat/i, "コート", "Coat"],
  [/outerwear/i, "アウター", "Outerwear"],
  [/cardigan/i, "カーディガン", "Cardigan"],
  [/sweater|knit|jumper/i, "ニット", "Knit sweater"],
  [/hoodie|hoody/i, "パーカー", "Hoodie"],
  [/sweatshirt/i, "スウェット", "Sweatshirt"],
  [/jeans|denim/i, "デニム", "Denim"],
  [/pants|trousers|slacks/i, "パンツ", "Pants"],
  [/skirt/i, "スカート", "Skirt"],
  [/dress/i, "ワンピース", "Dress"],
  [/blouse/i, "ブラウス", "Blouse"],
  [/shirt/i, "シャツ", "Shirt"],
  [/boots/i, "ブーツ", "Boots"],
  [/sneakers|trainers/i, "スニーカー", "Sneakers"],
  [/scarf/i, "マフラー", "Scarf"],
  [/bag/i, "バッグ", "Bag"],
  [/vest|gilet/i, "ベスト", "Vest"],
];
const WORDS: Record<string, number> = { five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, fifty: 50 };
const YEN_PER_DOLLAR = 150;

export function parseQuery(q: string) {
  let budget = 0;
  const dollars = q.match(/\$\s?([\d,]+)|([\d,]+)\s*(dollars|bucks|usd)/i);
  const thousand = q.match(/([\d.]+|five|ten|fifteen|twenty|thirty|fifty)\s*(thousand|k\b)/i);
  const man = q.match(/(\d+(?:\.\d+)?)\s*万/);
  const plain = q.match(/([\d,]{4,})/);
  if (dollars) budget = Number((dollars[1] ?? dollars[2]).replace(/,/g, "")) * YEN_PER_DOLLAR;
  else if (thousand) budget = Math.round((WORDS[thousand[1].toLowerCase()] ?? Number(thousand[1])) * 1000);
  else if (man) budget = Math.round(Number(man[1]) * 10000);
  else if (plain) budget = Number(plain[1].replace(/,/g, ""));
  const color = COLORS.find(([re]) => re.test(q));
  const english = ENGLISH.find(([re]) => re.test(q));
  const garment = GARMENTS.find((g) => q.includes(g));
  const keyword = english?.[1] ?? garment ?? "アウター";
  const label = english?.[2] ?? "Outerwear";
  const gender = /\bmen'?s?\b|\bmale\b|\bguys?\b|メンズ|男/i.test(q) ? "men" : /women|ladies|female|レディース|女/i.test(q) ? "women" : "";
  return { keyword, label, gender, budget, colorJa: color?.[1] ?? "", colorEn: color?.[2] ?? "" };
}

async function runRoute(route: Route, keyword: string, label: string, colorJa = "") {
  const file = join(RUNS, `${route.shop.replace(/\W/g, "_")}_${Date.now()}.js`);
  writeFileSync(file, routeScript(route, keyword, colorJa));
  const started = performance.now();
  const proc = Bun.spawn(["lightpanda", "run", file], { stdout: "pipe", stderr: "ignore" });
  const text = await new Response(proc.stdout).text();
  await proc.exited;
  const ms = Math.round(performance.now() - started);
  let items: Item[] = [];
  try {
    const line = text.trim().split("\n").filter((l) => l.startsWith("[")).pop() ?? "[]";
    items = (JSON.parse(line) as any[]).map((r) => normalize(route, r, label)).filter(Boolean) as Item[];
  } catch {}
  return { shop: route.shop, ms, items };
}

function loadMemory() {
  return existsSync(MEMORY) ? JSON.parse(readFileSync(MEMORY, "utf8")) : { size: "M", color: "", budget: 0, bought: [] };
}

export function pickThree(all: Item[], parsed: ReturnType<typeof parseQuery>, memory: any) {
  const inBudget = parsed.budget ? all.filter((i) => i.price <= parsed.budget) : all;
  const pool = inBudget.length >= 3 ? inBudget : all;
  const used = new Set<string>();
  const take = (list: Item[]) => {
    const found = list.find((i) => !used.has(i.href) && !used.has(i.img));
    if (found) { used.add(found.href); used.add(found.img); }
    return found;
  };
  const picks: (Item & { why: string })[] = [];
  const looks = pool.filter((i) => i.kind === "look");
  const sized = looks.filter((i) => i.size === memory.size);
  const look = take(sized.length ? sized : looks);
  if (look) picks.push({ ...look, why: look.size === memory.size ? `Size ${look.size}, like last time${look.height ? ` · worn at ${look.height} cm` : ""}` : `Most worn on WEAR this week` });
  const secondLook = take(looks.filter((i) => i.shop !== look?.shop));
  const items = pool.filter((i) => i.kind === "item");
  const cheapest = take([...items].sort((a, b) => a.price - b.price));
  if (cheapest) picks.push({ ...cheapest, why: parsed.budget && cheapest.price <= parsed.budget ? `Lowest price · ¥${(parsed.budget - cheapest.price).toLocaleString()} under budget` : "Lowest price found" });
  const other = secondLook ?? take(items.filter((i) => i.shop !== cheapest?.shop)) ?? take(pool);
  if (other) picks.push({ ...other, why: other.kind === "look" ? `Popular on ${other.shop}${other.height ? ` · worn at ${other.height} cm` : ""}` : `Top result at ${other.shop}` });
  while (picks.length < 3) { const more = take(pool) ?? take(all); if (!more) break; picks.push({ ...more, why: `Top result at ${more.shop}` }); }
  return picks;
}

process.on("unhandledRejection", (error) => console.log("unhandled", String(error)));
process.on("uncaughtException", (error) => console.log("uncaught", String(error)));

const TYPES: Record<string, string> = { html: "text/html; charset=utf-8", jpg: "image/jpeg", png: "image/png", js: "text/javascript", mp4: "video/mp4" };

if (import.meta.main) Bun.serve({
  port: 4477,
  idleTimeout: 60,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/api/search") {
      const q = url.searchParams.get("q") ?? "";
      const parsed = parseQuery(q);
      const memory = loadMemory();
      const started = performance.now();
      const stream = new ReadableStream({
        async start(controller) {
          let gone = false;
          const send = (event: string, data: unknown) => { if (gone) return; try { controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { gone = true; } };
          const asked = url.searchParams.get("g");
          const gender = parsed.gender || (asked === "men" || asked === "women" ? asked : "");
          const known = [...ROUTES, ...learnedRoutes()];
          const routes = gender ? known.filter((r) => !r.gender || r.gender === gender) : known;
          send("parsed", { ...parsed, gender, shops: routes.length, memory });
          const all: Item[] = [];
          let open = true;
          const work = Promise.all(routes.map(async (route) => {
            const result = await runRoute(route, parsed.keyword, parsed.label, parsed.colorJa);
            if (!open) return;
            all.push(...result.items);
            if (result.items.length) arrived++;
            send("shop", { ...result, elapsed: Math.round(performance.now() - started) });
          }));
          let arrived = 0;
          const enough = new Promise<void>((resolve) => {
            const timer = setInterval(() => {
              const elapsed = performance.now() - started;
              if ((elapsed > 3600 && arrived >= Math.min(3, routes.length)) || elapsed > 9000) { clearInterval(timer); resolve(); }
            }, 100);
            work.finally(() => clearInterval(timer));
          });
          await Promise.race([work, enough]);
          open = false;
          send("done", { ms: Math.round(performance.now() - started), count: all.length, picks: pickThree(all, parsed, memory), modelCalls: 0 });
          try { controller.close(); } catch {}
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } });
    }
    if (url.pathname === "/api/learn" && req.method === "POST") {
      const body = await req.json();
      let target: URL;
      try { target = new URL(String(body.url)); } catch { return Response.json({ error: "That is not a web address" }, { status: 400 }); }
      if (!/^https?:$/.test(target.protocol)) return Response.json({ error: "That is not a web address" }, { status: 400 });
      const shop = shopName(target.href);
      const decoded = decodeURIComponent(target.href);
      const japanese = GARMENTS.find((g) => decoded.includes(g)) ?? "";
      const english = japanese ? "" : (ENGLISH.map(([re]) => target.search.match(re)?.[0]).find(Boolean) ?? "");
      const route: Route = { shop, site: "learned", gender: "", kind: "item", url: templateFor(target.href, japanese || english), english: !!english };
      if (!route.url.includes("$Q")) return Response.json({ error: "Search that shop for a piece first, then paste the address of the results" }, { status: 422 });
      const result = await runRoute({ ...route, url: target.href }, "", "Piece");
      if (result.items.length < 5) return Response.json({ error: `Could not read ${shop}: found ${result.items.length} pieces with a photo and a price` }, { status: 422 });
      const others = learnedRoutes().filter((r) => r.shop !== shop);
      writeFileSync(LEARNED, JSON.stringify([...others, route], null, 2));
      return Response.json({ shop, pieces: result.items.length, ms: result.ms, searchable: route.url.includes("$Q"), total: ROUTES.length + others.length + 1 });
    }
    if (url.pathname === "/api/tryon" && req.method === "POST") {
      const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
      if (!key) return Response.json({ error: "no image model key" }, { status: 501 });
      const body = await req.json();
      const model = process.env.TRYON_IMAGE_MODEL ?? "gemini-3.1-flash-image";
      try {
        const garment = await fetch(body.img);
        const garmentData = Buffer.from(await garment.arrayBuffer()).toString("base64");
        const garmentType = garment.headers.get("content-type")?.split(";")[0] ?? "image/jpeg";
        const selfieData = String(body.selfie).split(",")[1];
        const prompt = "Virtual try-on for an online clothing shop. Image 1 is the customer, who uploaded this photo of themselves. Image 2 is a piece or an outfit from the shop. Show the customer wearing it in a full-body fashion photo, keeping the customer's own face, hair and skin tone. Vertical 3:4, daylight street, no text.";
        const started = performance.now();
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "image/jpeg", data: selfieData } }, { inline_data: { mime_type: garmentType, data: garmentData } }] }] }),
        });
        const json: any = await response.json();
        const part = json.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData ?? p.inline_data);
        const inline = part?.inlineData ?? part?.inline_data;
        if (!inline) { console.log("tryon failed", response.status, JSON.stringify(json).slice(0, 300)); return Response.json({ error: "no image returned" }, { status: 502 }); }
        console.log("tryon", body.name, Math.round(performance.now() - started) + "ms");
        return Response.json({ image: `data:${inline.mimeType ?? inline.mime_type ?? "image/png"};base64,${inline.data}` });
      } catch (error) {
        console.log("tryon error", String(error));
        return Response.json({ error: "tryon failed" }, { status: 502 });
      }
    }
    if (url.pathname === "/api/remember" && req.method === "POST") {
      const body = await req.json();
      const memory = loadMemory();
      memory.size = body.size || memory.size;
      memory.color = body.color || memory.color;
      memory.budget = body.budget || memory.budget;
      memory.bought = [...(memory.bought ?? []), { name: body.name, shop: body.shop, price: body.price, at: new Date().toISOString() }];
      writeFileSync(MEMORY, JSON.stringify(memory, null, 2));
      return Response.json(memory);
    }
    const path = url.pathname === "/" ? "/app.html" : url.pathname;
    const file = Bun.file(join(DIR, path));
    if (!path.includes("..") && (await file.exists())) return new Response(file, { headers: { "content-type": TYPES[path.split(".").pop() ?? ""] ?? "application/octet-stream", "cache-control": "no-cache" } });
    return new Response("Not found", { status: 404 });
  },
});
if (import.meta.main) console.log("Trend Recall on http://localhost:4477");
