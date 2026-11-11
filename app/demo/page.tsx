import type { Metadata } from "next";
import PublicLivePage from "../PublicLivePage";
import demoData from "@/lib/demo-data.json";

export const metadata: Metadata = {
  title: "TMT Cup · 500 partidos de demostración",
  robots: { index: false, follow: false },
};

export default function DemoPage() {
  return <PublicLivePage demoData={demoData} />;
}
