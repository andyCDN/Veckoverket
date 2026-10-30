import type { Category } from "@/lib/types";
import { GOOGLE_CATEGORY_ID } from "@/lib/external-calendar";
import { AUTO_CATEGORY } from "@/lib/calendar-categories";

export function GoogleCategorySelect({
  categories,
  value,
  onChange,
  name,
  automaticName,
}: {
  categories: Category[];
  value: string;
  onChange: (value: string) => void;
  name?: string;
  automaticName?: string;
}) {
  return (
    <label className="google-category-field">
      Kategori
      <select
        aria-label={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value={AUTO_CATEGORY}>
          Automatisk{automaticName ? `: ${automaticName}` : " (kategoriregler)"}
        </option>
        <option value={GOOGLE_CATEGORY_ID}>
          Ej kategoriserad (Google Kalender)
        </option>
        {categories
          .filter((category) => category.id !== GOOGLE_CATEGORY_ID)
          .map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
      </select>
    </label>
  );
}
