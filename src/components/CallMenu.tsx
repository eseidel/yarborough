import type { CallInterpretation } from '../bridge';
import { CallDisplay } from './CallDisplay';

export function CallMenu({
  interpretations,
  onSelect,
}: {
  interpretations: CallInterpretation[];
  onSelect: (interp: CallInterpretation) => void;
}) {
  return (
    <div className="divide-y divide-gray-200">
      {interpretations.map((interp, i) => (
        <button
          key={i}
          onClick={() => onSelect(interp)}
          className="flex items-center gap-4 w-full px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-semibold shrink-0">
            <CallDisplay call={interp.call} />
          </div>
          <div>
            {interp.ruleName && <div className="font-semibold text-sm">{interp.ruleName}</div>}
            {interp.description && <div className="text-sm text-gray-500">{interp.description}</div>}
            {!interp.ruleName && !interp.description && (
              <div className="text-sm text-gray-400">Unknown</div>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
