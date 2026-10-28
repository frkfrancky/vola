import { ResetPasswordForm } from "@/components/password-forms";

export default async function Page({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  return <ResetPasswordForm token={token} />;
}
