/** Seed titles for Valcoin when the upload has no catalog name. */
export const VALUABLE_US_COINS = [
  "1909-S VDB Lincoln cent",
  "1916-D Mercury dime",
  "1877 Indian Head cent",
  "1901-S Barber quarter",
  "1894-S Barber dime",
  "1913 Liberty Head nickel",
  "1932-D Washington quarter",
  "1932-S Washington quarter",
  "1893-S Morgan silver dollar",
  "1921 Peace dollar",
  "1937-D 3-legged Buffalo nickel",
  "1922 no D Lincoln cent",
  "1914-D Lincoln cent",
  "1926-S Buffalo nickel",
  "1908-S Indian Head cent",
  "1873-CC Seated Liberty dollar",
  "1907 High Relief Saint-Gaudens double eagle",
  "1885 Liberty Head nickel",
  "2004-D Wisconsin quarter (extra leaf error)",
  "1955 Lincoln cent (doubled die obverse)",
  "1972 Lincoln cent (doubled die obverse)",
  "1943 copper Lincoln cent",
  "1969-S Lincoln cent (doubled die obverse)",
  "1982 no-mint-mark Roosevelt dime (error variety)",
  "2000-P Sacagawea dollar (Cheerios variety)",
  "2007 Presidential dollar (missing edge lettering error)",
  "1995 doubled die Lincoln cent",
  "1976-S silver Washington quarter (proof)",
  "1964 Washington quarter (proof)",
  "1892 Columbus commemorative half dollar",
  "1986 American Silver Eagle (bullion)",
  "1995-W American Silver Eagle (proof)",
  "1933 Saint-Gaudens double eagle",
];

export function pickValuableUSCoin() {
  const idx = Math.floor(Math.random() * VALUABLE_US_COINS.length);
  return VALUABLE_US_COINS[idx];
}

export function autoSoldListings(itemName, soldPrice) {
  const PREFIXES = ["Pre-owned ", "Used ", "Vintage ", "Authentic "];
  const SUFFIXES = [" - Great Condition", " - Gently Used", " (Pre-loved)", " - Excellent"];
  const SOURCES = ["eBay", "Heritage Auctions", "Stack's Bowers", "GreatCollections"];
  const price = parseFloat(soldPrice);
  const makeRow = (seed) => ({
    title: `${PREFIXES[seed % PREFIXES.length]}${itemName}${SUFFIXES[(seed + 1) % SUFFIXES.length]}`,
    source: SOURCES[seed % SOURCES.length],
    price: Number.isNaN(price) ? "" : String(Math.round(price * (seed % 2 === 0 ? 0.88 : 1.08))),
    inStock: false,
  });
  return [makeRow(0), makeRow(1)];
}

export function fallbackCoinPrices() {
  const buys = [2, 3, 5, 8, 10, 12, 15, 20, 25, 35, 50];
  const spent = buys[Math.floor(Math.random() * buys.length)];
  const sold = Math.round(spent * (1.4 + Math.random() * 0.8));
  return { spentPrice: String(spent), soldPrice: String(sold) };
}
