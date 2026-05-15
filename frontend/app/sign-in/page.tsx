import { redirect } from "next/navigation";

export default function SignInRedirectPage() {
  redirect("/manager/sign-in");
}
