import { redirect } from "next/navigation";
import { db } from "@/db";
import { slots, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { routing } from "@/i18n/routing";
import RegistrationClient from "./RegistrationClient";

export default async function RegistrationPage({
  params,
}: {
  params: Promise<{ locale: string; slotId: string }>;
}) {
  const { locale, slotId } = await params;

  // If this slot already has a registered student, redirect to their saved locale
  // so the page renders correctly from the very first request.
  const [slot] = await db
    .select({ studentId: slots.studentId })
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (slot?.studentId) {
    const [student] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.id, slot.studentId))
      .limit(1);

    const savedLocale = student?.locale;
    if (
      savedLocale &&
      savedLocale !== locale &&
      routing.locales.includes(savedLocale as (typeof routing.locales)[number])
    ) {
      redirect(`/${savedLocale}/register/${slotId}`);
    }
  }

  return <RegistrationClient />;
}
