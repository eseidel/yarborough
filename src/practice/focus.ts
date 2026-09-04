import type { DealType } from "../bridge/identifier";

export const FOCUS_OPTIONS: { value: DealType; label: string }[] = [
  { value: "Random", label: "Random" },
  { value: "Notrump", label: "Notrump" },
  { value: "Preempt", label: "Preempt" },
  { value: "Strong2C", label: "Strong 2♣" },
];

export function focusLabel(focus: DealType): string {
  return FOCUS_OPTIONS.find((option) => option.value === focus)?.label ?? focus;
}
