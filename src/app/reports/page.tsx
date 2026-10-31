import { redirect } from "next/navigation";
import { readDb } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ReportsRootPage() {
  const db = await readDb();
  const campaignId = db.campaigns[0]?.id ?? "camp-q3";
  redirect(`/reports/${campaignId}`);
}
