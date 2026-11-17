# Trend Recall

Say what you want to wear. Trend Recall searches real fashion shops live with a headless browser, then shows three picks already worn by you.

Built at Agent Harness Build Night (Tokyo, 2026-11-17).

## What happens

1. Tap **Women** or **Men** and say what you want, for example "a black puffer jacket under ten thousand yen".
2. While you talk, the camera takes one photo of your face. Nothing is shown on screen.
3. Lightpanda opens every known shop at the same time and reads photos, names and prices. Pieces flow across the screen as each shop answers.
4. Three picks are chosen (your size from last time, the lowest price, the top result from another shop) and each is redrawn with you wearing it.
5. Tap a pick, answer the size question by voice, then press and hold to confirm. Your size, color and budget are remembered for the next search.

## The harness

The model is a small part. Most of the work is ordinary, fast, repeatable software around it.

- **Tools: a browser with no rendering.** Each shop is one short PandaScript run by `lightpanda run`. Six shops run in parallel. A search returns about 150 to 250 pieces in 2 to 4 seconds, with zero model calls.
- **Learn once, replay forever.** Paste the address of a shop's search results on the opening screen. The harness checks that Lightpanda can read at least five pieces with a photo and a price, then saves the route to `routes.json`. Every later search replays it with no model.
- **Memory.** Size, color and budget from confirmed picks are kept in `memory.json` and used to rank the next picks.
- **Evaluation gates.** A shop that cannot be read, or an address that is not a search result, is refused with the reason. A slow shop is cut off so the screen never waits on it.
- **The model is used only where it is needed.** Gemini 3.1 Flash Image redraws the three picks on your photo (about 10 seconds for three, in parallel). The opening film is one continuous take from Gemini Omni 1.2 Flash.

## Run it

```bash
curl -fsSL https://pkg.lightpanda.io/install.sh | bash
echo "GEMINI_API_KEY=your-key" > .env
bun server.ts
```

Open http://localhost:4477 in Chrome and allow the microphone and camera. Without a key the app still searches and shows shop photos.

```bash
bun test
```

## Files

- `server.ts`: request parsing, PandaScript routes, parallel Lightpanda runs, pick selection, try-on, learning a shop
- `app.html`: the whole screen, voice in and out, camera capture
- `server.test.ts`: unit tests for parsing, normalizing and picking
- `design.html`: a fixed sample of the screens

## Notes

Shops are read only. Confirming a pick does not place an order. The photo of your face is sent to Google to draw the try-on images and is not stored by this app.
