export function getBrand(config = {}) {
  const raw = config.appId;
  if (raw === "valcoin") {
    return {
      appId: "valcoin",
      appName: "Valcoin",
      slideshowName: "Valcoin",
      appLower: "valcoin",
      appCategory: "coinscan",
    };
  }
  return {
    appId: "labely",
    appName: "Labely",
    slideshowName: "Labely",
    appLower: "labely",
    appCategory: "foodscan",
  };
}
