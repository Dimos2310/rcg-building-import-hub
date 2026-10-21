import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Buildings Registry" },
      { name: "description", content: "Manage your buildings and import them from Excel." },
      { property: "og:title", content: "Buildings Registry" },
      { property: "og:description", content: "Manage your buildings and import them from Excel." },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/buildings" : "/auth" });
  },
});
