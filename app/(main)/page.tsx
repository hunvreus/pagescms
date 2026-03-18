import type { Metadata } from "next";
import { HomePage } from "@/components/home-page";

export const metadata: Metadata = {
  title: "Projects",
};

export default function Page() {
  return <HomePage />;
}
