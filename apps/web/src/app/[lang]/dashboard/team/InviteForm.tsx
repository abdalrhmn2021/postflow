"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/ui/FormError";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Dictionary } from "@/i18n/dictionaries/ar";
import { api, ApiError } from "@/lib/api";
import { errorText, fieldErrors } from "@/lib/errors";
import type { CreatedInvite } from "@/lib/types";
import { LinkBox } from "./LinkBox";

type Props = {
  agencyName: string;
  t: Dictionary["team"];
  roles: Dictionary["dashboard"]["roles"];
  errors: Dictionary["errors"];
  fields: Dictionary["fields"];
};

// POST /api/invites { email, role } -> a link to send. Inviting an email again makes a fresh link
// (the old one stops working). Owner only.
export function InviteForm({ agencyName, t, roles, errors, fields }: Props) {
  const router = useRouter();
  const [role, setRole] = useState<"EDITOR" | "MANAGER">("EDITOR");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [created, setCreated] = useState<CreatedInvite | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setLoading(true);
    setFormError(null);
    setFieldError({});
    setCreated(null);
    try {
      const invite = await api<CreatedInvite>("/invites", {
        method: "POST",
        body: { email: data.get("email"), role: data.get("role") },
      });
      setCreated(invite);
      form.reset();
      setRole("EDITOR");
      router.refresh(); // the open invites list below
    } catch (err) {
      if (err instanceof ApiError && err.code === "EMAIL_TAKEN") {
        setFieldError({ email: errors.EMAIL_TAKEN });
      } else {
        setFormError(errorText(err, errors));
        setFieldError(fieldErrors(err, fields));
      }
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <FormError message={formError} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input name="email" type="email" label={t.email} dir="ltr" autoComplete="off" error={fieldError.email} />
          <Select
            name="role"
            label={t.role}
            value={role}
            onChange={(e) => setRole(e.target.value as "EDITOR" | "MANAGER")}
            options={[
              { value: "EDITOR", label: roles.EDITOR },
              { value: "MANAGER", label: roles.MANAGER },
            ]}
            error={fieldError.role}
            hint={t.roleHints[role]}
          />
        </div>
        <div>
          <Button type="submit" loading={loading}>
            {t.inviteSubmit}
          </Button>
        </div>
      </form>
      {created && <LinkBox link={created.link} email={created.email} agencyName={agencyName} t={t} />}
    </div>
  );
}
