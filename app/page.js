"use client";

import dynamic from "next/dynamic";

const ProductScreenshotApp = dynamic(
  () => import("@/components/ProductScreenshotApp"),
  { ssr: false, loading: () => null }
);

export default function HomePage() {
  return <ProductScreenshotApp />;
}
