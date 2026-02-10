import { type Call, type StrainName, strainSymbol, strainColor } from '../bridge';

const STRAINS: StrainName[] = ['C', 'D', 'H', 'S', 'N'];
const LEVELS = [1, 2, 3, 4, 5, 6, 7];

/** Returns true if `call` is a legal bid given the current highest bid. */
function isLegalBid(level: number, strain: StrainName, lastBid?: Call): boolean {
  if (!lastBid || lastBid.type !== 'bid') return true;
  if (level > lastBid.level!) return true;
  if (level < lastBid.level!) return false;
  // Same level: compare strain rank (C < D < H < S < N)
  return STRAINS.indexOf(strain) > STRAINS.indexOf(lastBid.strain!);
}

export function BiddingBox({
  onBid,
  lastBid,
}: {
  onBid: (call: Call) => void;
  lastBid?: Call;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-3 space-y-2">
      {/* Pass button */}
      <button
        onClick={() => onBid({ type: 'pass' })}
        className="w-full py-2 rounded bg-gray-200 hover:bg-gray-300 font-semibold text-gray-600 transition-colors"
      >
        Pass
      </button>

      {/* Bid grid: 7 levels × 5 strains */}
      <div className="grid grid-cols-5 gap-1">
        {LEVELS.map(level =>
          STRAINS.map(strain => {
            const legal = isLegalBid(level, strain, lastBid);
            return (
              <button
                key={`${level}${strain}`}
                disabled={!legal}
                onClick={() => onBid({ type: 'bid', level, strain })}
                className={`py-1.5 rounded text-sm font-semibold transition-colors ${
                  legal
                    ? 'bg-gray-100 hover:bg-emerald-100'
                    : 'bg-gray-50 text-gray-300 cursor-not-allowed'
                }`}
              >
                {level}
                <span className={legal ? strainColor(strain) : ''}>
                  {strainSymbol(strain)}
                </span>
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
