import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { db } from "@/db";
import { slots, users, recruitments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { routing } from "@/i18n/routing";
import RegistrationClient from "./RegistrationClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slotId: string }>;
}): Promise<Metadata> {
  const { slotId } = await params;
  const [slot] = await db
    .select({ recruitmentId: slots.recruitmentId })
    .from(slots)
    .where(eq(slots.id, slotId))
    .limit(1);

  if (slot?.recruitmentId) {
    const [recruitment] = await db
      .select({ name: recruitments.name })
      .from(recruitments)
      .where(eq(recruitments.id, slot.recruitmentId))
      .limit(1);

    if (recruitment?.name) {
      return { title: recruitment.name };
    }
  }

  return { title: { absolute: "Regie" } };
}

export default async function RegistrationPage({
  params,
}: {
  params: Promise<{ locale: string; slotId: string }>;
}) {
  const { locale, slotId } = await params;

  // If this slot already has a registered student, redirect to their saved locale
  // so the page renders correctly from the very first request.
  // Skip redirect if the student explicitly chose a locale via the language switcher
  // (indicated by the NEXT_LOCALE cookie matching the current URL locale).
  const cookieStore = await cookies();
  const explicitLocale = cookieStore.get("NEXT_LOCALE")?.value;

  if (explicitLocale !== locale) {
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
  }

  return <RegistrationClient />;
}
