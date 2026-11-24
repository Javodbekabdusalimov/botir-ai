"use client";

import { Field, inputClass } from "@/components/field";
import { Input } from "@/components/ui/input";
import { maskPhone } from "@/lib/phone";

export function PhoneField({ id = "phone", value, onChange, error }: { id?: string; value: string; onChange: (v: string) => void; error?: string }) {
  return (
    <Field id={id} label="Telefon raqam" error={error}>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        className={inputClass}
        value={value}
        onChange={(e) => onChange(maskPhone(e.target.value))}
        onFocus={() => !value && onChange("+998")}
        placeholder="+998 90 123 45 67"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
      />
    </Field>
  );
}
