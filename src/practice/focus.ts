import type { DealType } from "../bridge/identifier";
import type { HandSource } from "./record/types";

export const FOCUS_OPTIONS: { value: DealType; label: string }[] = [
  { value: "Random", label: "Random" },
  { value: "Notrump", label: "Notrump" },
  { value: "Preempt", label: "Preempt" },
  { value: "Strong2C", label: "Strong 2♣" },
];

export const ADAPTIVE_OPTION: { value: HandSource; label: string } = {
  value: "Adaptive",
  label: "Weak spots",
};

export const SOURCE_OPTIONS: { value: HandSource; label: string }[] = [
  ...FOCUS_OPTIONS,
  ADAPTIVE_OPTION,
];

export function focusLabel(focus: HandSource): string {
  return (
    SOURCE_OPTIONS.find((option) => option.value === focus)?.label ?? focus
  );
}
