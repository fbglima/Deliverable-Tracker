import { redirect } from "next/navigation";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/supabase/server";

export default async function Home() {
  if (!hasSupabaseConfig()) {
    redirect("/login");
  }

  const { user } = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  redirect("/workspaces");
}
