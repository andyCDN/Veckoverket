import type { Category } from "@/lib/types";
import { orderedCategories, categoryLabel } from "@/lib/presentation";
import { GOOGLE_CATEGORY, GOOGLE_CATEGORY_ID } from "@/lib/external-calendar";
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
        {orderedCategories([
          ...categories.filter((c) => c.id !== GOOGLE_CATEGORY_ID),
          GOOGLE_CATEGORY,
        ]).map((category) => (
          <option key={category.id} value={category.id}>
            {categoryLabel(category)}
          </option>
        ))}
      </select>
    </label>
  );
}
