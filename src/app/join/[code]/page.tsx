import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { households } from "@/db/schema";
import { JoinHouseholdForm } from "@/components/household-forms";
import { getCurrentUser } from "@/lib/auth";

export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  const { code } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);

  const [household] = await getDb()
    .select({ name: households.name })
    .from(households)
    .where(eq(households.inviteCode, code.toUpperCase()));

  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">
        {household ? <>Rejoindre « {household.name} »</> : "Invitation"}
      </h1>
      {!household && <p className="text-sm text-danger">Ce lien d&apos;invitation n&apos;est pas valide.</p>}
      <JoinHouseholdForm defaultCode={household ? code.toUpperCase() : undefined} />
    </div>
  );
}
