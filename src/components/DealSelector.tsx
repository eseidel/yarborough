import type { DealType } from "../bridge/identifier";

interface DealSelectorProps {
  value: DealType;
  onChange: (value: DealType) => void;
}

export function DealSelector({ value, onChange }: DealSelectorProps) {
  const options: { value: DealType; label: string }[] = [
    { value: "Random", label: "Random" },
    { value: "Notrump", label: "Notrump" },
    { value: "Preempt", label: "Preempt" },
    { value: "Strong2C", label: "Strong 2\u2663" },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider px-1">
        Practice Focus
      </label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
              value === opt.value
                ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
