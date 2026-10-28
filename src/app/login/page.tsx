import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="login" next={typeof next === "string" ? next : undefined} />;
}
