# Labely & Valcoin – product screenshots

Upload a product photo → download a 1080×1920 fake-app screenshot / scan video.

## Setup (local)

```bash
cp .env.example .env.local
# set OPENAI_API_KEY=sk-...
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy on Vercel

1. Import the GitHub repo (`valcoin-labely`) in [Vercel](https://vercel.com/new).
2. Framework preset: **Next.js** (auto-detected).
3. Add environment variable:
   - `OPENAI_API_KEY` = your OpenAI secret key (Production + Preview)
4. Deploy.

Or from the CLI (after `npx vercel login`):

```bash
npx vercel link
npx vercel env add OPENAI_API_KEY
npx vercel --prod
```

Labely analysis can take ~10–20s (multiple OpenAI calls). Function `maxDuration` is set to **60s** so it fits Vercel Hobby.

## Flow

1. Pick **Labely** or **Valcoin**
2. Choose a photo
3. Wait for analysis / pricing
4. **Download video** (MP4) or **Download PNG**
5. Optional: check **Remove sound effects & meme images** for a silent export

## Brands

- **Labely** — food/drink pack shot → nutrition-style product card
- **Valcoin** — coin photo → collector/resale product card

No phones, TikTok posting, or farm orchestration — generation only.
