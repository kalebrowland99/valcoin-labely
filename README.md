# Labely & Valcoin – product screenshots

Upload a product photo → download a 1080×1920 fake-app screenshot.

## Setup

```bash
cp .env.example .env.local
# set OPENAI_API_KEY=sk-...
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Flow

1. Pick **Labely** or **Valcoin**
2. Choose a photo
3. Wait for analysis / pricing
4. **Download screenshot** (full 1080×1920 PNG)

## Brands

- **Labely** — food/drink pack shot → nutrition-style product card
- **Valcoin** — coin photo → collector/resale product card

No phones, TikTok posting, or farm orchestration — generation only.
