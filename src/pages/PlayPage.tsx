import { useState } from 'react';
import { NavBar } from '../components/NavBar';
import { HandDisplay } from '../components/HandDisplay';
import { CardSpread } from '../components/CardSpread';
import { type Deal, type Card, MOCK_DEAL, randomDeal, handForPosition } from '../bridge';

export function PlayPage() {
  const [deal, setDeal] = useState<Deal>(MOCK_DEAL);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <NavBar title="Play" />
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="text-sm font-semibold text-gray-500 mb-4">Contract: 1NT by North</div>

        {/* Compass layout */}
        <div className="grid grid-cols-[auto_1fr_auto] grid-rows-[auto_1fr_auto] gap-2 items-center justify-items-center">
          {/* Row 1: North */}
          <div />
          <HandDisplay hand={handForPosition(deal, 'N')} position="N" />
          <div />

          {/* Row 2: West, Trick area, East */}
          <HandDisplay hand={handForPosition(deal, 'W')} position="W" />
          <div className="w-40 h-32 bg-emerald-800 rounded-lg flex items-center justify-center text-emerald-400 text-sm shadow-inner">
            Current Trick
          </div>
          <HandDisplay hand={handForPosition(deal, 'E')} position="E" />

          {/* Row 3: South (card spread) */}
          <div />
          <div className="flex flex-col items-center gap-1">
            <div className="font-bold text-xs text-gray-500 uppercase tracking-wider">
              South (You)
            </div>
            <CardSpread
              hand={handForPosition(deal, 'S')}
              selectedCard={selectedCard}
              onSelectCard={setSelectedCard}
            />
          </div>
          <div />
        </div>
      </div>

      {/* Re-deal button */}
      <button
        onClick={() => {
          setDeal(randomDeal());
          setSelectedCard(null);
        }}
        className="fixed bottom-6 right-6 w-14 h-14 bg-emerald-700 text-white rounded-full shadow-lg hover:bg-emerald-600 transition-colors flex items-center justify-center text-xl"
        aria-label="Deal new hand"
      >
        &#x21bb;
      </button>
    </div>
  );
}
