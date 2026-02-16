//! Auction state analysis for NBK

use crate::nbk::{CallInterpreter, HandModel};
use types::Auction;

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

    /// Analyze the auction to build models of all four hands
    pub fn from_auction(auction: &Auction) -> Self {
        let mut hands: [HandModel; 4] = Default::default();
        let mut current_auction = Auction::new(auction.dealer);

        for (position, call) in auction.iter() {
            let context = Self {
                auction: current_auction.clone(),
                hands: hands.clone(),
            };

            if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                for constraint in semantics.shows {
                    hands[position.idx()].apply_constraint(constraint);
                }
            }

            current_auction.add_call(*call);
        }

        Self {
            auction: auction.clone(),
            hands,
        }
    }
}
