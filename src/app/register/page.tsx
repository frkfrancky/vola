import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/auth";

export default async function Page({ searchParams }: PageProps<"/register">) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="register" next={typeof next === "string" ? next : undefined} />;
}
