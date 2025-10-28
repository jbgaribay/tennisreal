import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ProtectedPage() {
  const supabase = await createClient();

  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) {
    redirect("/auth/login");
  }

  return (
    <div className="flex-1 w-full flex flex-col gap-12">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">Welcome back!</h1>
        <p className="text-muted-foreground mb-8">
          You're signed in and your progress is being tracked.
        </p>
        
        <div className="flex gap-4 justify-center">
          <a
            href="/"
            className="bg-primary text-primary-foreground hover:bg-primary/90 px-6 py-3 rounded-md font-medium transition-colors"
          >
            Play Today's Grid
          </a>
        </div>
      </div>
      
      <div className="bg-muted/50 rounded-lg p-6">
        <h2 className="font-semibold mb-4">Your Account Benefits</h2>
        <ul className="text-sm text-muted-foreground space-y-2">
          <li>✅ Progress automatically saved</li>
          <li>✅ Daily streak tracking</li>
          <li>✅ Personal statistics</li>
          <li>✅ Leaderboard participation</li>
          <li>🔜 Achievement badges</li>
          <li>🔜 Historical puzzle access</li>
        </ul>
      </div>
    </div>
  );
}