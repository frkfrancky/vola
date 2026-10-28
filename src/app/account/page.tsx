import { ChangePasswordForm } from "@/components/password-forms";
import { requireUser } from "@/lib/auth";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mon compte</h1>
        <p className="text-sm text-muted">
          {user.name} · {user.email}
        </p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
