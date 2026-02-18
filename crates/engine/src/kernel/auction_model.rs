//! Auction state analysis for Kernel

use crate::kernel::{CallInterpreter, CallSemantics, HandModel};
use types::{Auction, Position};

use serde::{Deserialize, Serialize};

/// Analysis of the current auction state.
///
/// Models are stored in a flat array indexed by `Position::idx()`. Getter
/// methods rotate into the perspective of `auction.current_player()`.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuctionModel {
    /// The auction state
    pub auction: Auction,
    /// Per-position profiles indexed by Position::idx()
    hands: [HandModel; 4],
    /// Semantics for each call in the auction
    semantics: Vec<Option<CallSemantics>>,
}

impl AuctionModel {
    pub fn bidder_hand(&self) -> &HandModel {
        &self.hands[self.auction.current_player().idx()]
    }

    pub fn partner_hand(&self) -> &HandModel {
        &self.hands[self.auction.current_player().partner().idx()]
    }

    pub fn lho_hand(&self) -> &HandModel {
        &self.hands[self.auction.current_player().lho().idx()]
    }

    pub fn rho_hand(&self) -> &HandModel {
        &self.hands[self.auction.current_player().rho().idx()]
    }

    pub fn last_call_semantics(&self, position: Position) -> Option<&CallSemantics> {
        self.auction
            .last_call_index_for_position(position)
            .and_then(|idx| self.semantics.get(idx).and_then(|s| s.as_ref()))
    }

    pub fn bidder_last_call_semantics(&self) -> Option<&CallSemantics> {
        self.last_call_semantics(self.auction.current_player())
    }

    pub fn partner_last_call_semantics(&self) -> Option<&CallSemantics> {
        self.last_call_semantics(self.auction.current_player().partner())
    }

    pub fn lho_last_call_semantics(&self) -> Option<&CallSemantics> {
        self.last_call_semantics(self.auction.current_player().lho())
    }

    pub fn rho_last_call_semantics(&self) -> Option<&CallSemantics> {
        self.last_call_semantics(self.auction.current_player().rho())
    }

    /// Analyze the auction to build models of all four hands
    pub fn from_auction(auction: &Auction) -> Self {
        let mut hands: [HandModel; 4] = Default::default();
        let mut semantics: Vec<Option<CallSemantics>> = Vec::new();
        let mut current_auction = Auction::new(auction.dealer);

        for (position, call) in auction.iter() {
            let context = Self {
                auction: current_auction.clone(),
                hands: hands.clone(),
                semantics: semantics.clone(),
            };

            let call_semantics = CallInterpreter::interpret(&context, call);
            if let Some(call_semantics) = &call_semantics {
                for constraint in &call_semantics.shows {
                    hands[position.idx()].apply_constraint(*constraint);
                }
            }
            semantics.push(call_semantics);
            current_auction.add_call(*call);
        }

        Self {
            auction: auction.clone(),
            hands,
            semantics,
        }
    }
}
