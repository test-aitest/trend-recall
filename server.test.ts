import { expect, test } from "bun:test";
import { parseQuery, normalize, pickThree, routeScript, shopName, templateFor, ROUTES } from "./server";

const wear = ROUTES.find((r) => r.site === "wear" && r.gender === "men")!;
const wearItems = ROUTES.find((r) => r.site === "wearItems" && r.gender === "women")!;
const zara = ROUTES.find((r) => r.site === "zara" && r.gender === "men")!;
const memory = { size: "M" };

test("reads garment, yen budget and color from an English request", () => {
  const p = parseQuery("a black puffer jacket under ten thousand yen");
  expect(p).toMatchObject({ keyword: "ダウンジャケット", label: "Puffer jacket", budget: 10000, colorEn: "Black", gender: "" });
});

test("converts a dollar budget to yen and detects men's", () => {
  const p = parseQuery("men's wool coat under $120");
  expect(p).toMatchObject({ label: "Coat", budget: 18000, gender: "men" });
});

test("detects women and a plain number budget", () => {
  expect(parseQuery("women's knit sweater under 8,000")).toMatchObject({ label: "Knit sweater", budget: 8000, gender: "women" });
});

test("falls back to outerwear with no budget when nothing is recognised", () => {
  expect(parseQuery("something nice")).toMatchObject({ label: "Outerwear", budget: 0, gender: "", colorEn: "" });
});

test("does not read women as men", () => {
  expect(parseQuery("women's coat").gender).toBe("women");
});

test("a WEAR look keeps brand, price, size and height and hides Japanese", () => {
  const item = normalize(wear, { href: "https://wear.jp/a/1/", img: "https://images.wear2.jp/coordinate/x/y/1_276.jpg", alt: "", txt: "2026.11.6WYM LIDNM¥12,650 / size:Mwato174cm", color: "" }, "Puffer jacket")!;
  expect(item).toMatchObject({ name: "WYM LIDNM Puffer jacket", price: 12650, size: "M", height: "174", kind: "look" });
  expect(item.img.endsWith("_500.jpg")).toBe(true);
});

test("a WEAR look without an adult height is dropped", () => {
  expect(normalize(wear, { href: "h", img: "https://images.wear2.jp/coordinate/x/y/1_276.jpg", alt: "", txt: "2026.11.6TAION¥7,920 / size:120cmkid120cm", color: "" }, "Coat")).toBeNull();
});

test("a Japanese item name becomes brand plus English label", () => {
  const item = normalize(wearItems, { href: "h", img: "https://c.imgz.jp/1/2/3B_18_D_215.jpg", alt: "KOBE LETTUCE（コウベレタス）の「リバーシブルボアジャケット」（ダウンジャケット/コート）", txt: "¥3,998¥3,998", color: "" }, "Puffer jacket")!;
  expect(item.name).toBe("KOBE LETTUCE Puffer jacket");
  expect(item.price).toBe(3998);
  expect(item.img).toBe("https://c.imgz.jp/1/2/3B_18_D_500.jpg");
});

test("an entry without a price is dropped", () => {
  expect(normalize(zara, { href: "h", img: "i", alt: "x", txt: "no price here", color: "" }, "Coat")).toBeNull();
});

test("color is added to the WEAR search words only", () => {
  expect(routeScript(wear, "コート", "ブラック")).toContain(encodeURIComponent("ブラック コート"));
  expect(routeScript(zara, "コート", "ブラック")).not.toContain(encodeURIComponent("ブラック"));
});

const item = (over: object) => ({ shop: "WEAR Items Men", kind: "item", href: Math.random().toString(), img: Math.random().toString(), name: "n", brand: "b", price: 5000, size: "", height: "", color: "", ...over });

test("picks three different pieces within budget, same size first", () => {
  const all = [
    item({ shop: "WEAR Men", kind: "look", price: 9000, size: "L", height: "180" }),
    item({ shop: "WEAR Men", kind: "look", price: 8000, size: "M", height: "170" }),
    item({ shop: "WEAR Women", kind: "look", price: 7000, size: "S", height: "160" }),
    item({ price: 3000 }), item({ price: 4000 }), item({ price: 30000 }),
  ] as any[];
  const picks = pickThree(all, parseQuery("coat under 10000 yen"), memory);
  expect(picks).toHaveLength(3);
  expect(new Set(picks.map((p) => p.href)).size).toBe(3);
  expect(picks[0]).toMatchObject({ size: "M", price: 8000 });
  expect(picks[0].why).toContain("like last time");
  expect(picks[1].price).toBe(3000);
  expect(picks[1].why).toContain("¥7,000 under budget");
  expect(picks.every((p) => p.price <= 10000)).toBe(true);
});

test("never claims to be under budget when the cheapest is over it", () => {
  const all = [item({ price: 20000 }), item({ price: 30000 }), item({ price: 40000 })] as any[];
  const picks = pickThree(all, parseQuery("coat under 10000 yen"), memory);
  expect(picks[0].why).toBe("Lowest price found");
});

test("returns fewer than three when little was found", () => {
  expect(pickThree([item({})] as any[], parseQuery("coat"), memory)).toHaveLength(1);
  expect(pickThree([], parseQuery("coat"), memory)).toHaveLength(0);
});

test("names a learned shop from its address", () => {
  expect(shopName("https://www.dot-st.com/search/?q=x")).toBe("DOT ST");
  expect(shopName("https://store.united-arrows.co.jp/list")).toBe("UNITED ARROWS");
});

test("turns the searched word in a pasted address into a reusable slot", () => {
  const pasted = "https://example.jp/search?q=" + encodeURIComponent("コート") + "&sort=new";
  expect(templateFor(pasted, "コート")).toBe("https://example.jp/search?q=$Q&sort=new");
  expect(templateFor("https://example.jp/new-arrivals", "")).toBe("https://example.jp/new-arrivals");
});

test("a shop learned from an English search is searched with the English word", () => {
  const route = { shop: "X", site: "learned", gender: "", kind: "item", url: "https://x.jp/search?q=$Q", english: true } as any;
  expect(routeScript(route, "コート", "ブラック")).toContain("https://x.jp/search?q=coat");
  expect(routeScript({ ...route, english: false }, "コート", "ブラック")).toContain(encodeURIComponent("コート"));
});

test("reads small number words as a budget", () => {
  expect(parseQuery("a black hoodie under eight thousand yen").budget).toBe(8000);
  expect(parseQuery("a coat under twelve thousand yen").budget).toBe(12000);
});
