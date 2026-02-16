//! Auction state analysis for NBK

use crate::nbk::{CallInterpreter, PartnerModel};
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
    /// Per-position models indexed by Position::idx()
    models: [PartnerModel; 4],
}

impl AuctionModel {
    pub fn bidder_model(&self) -> &PartnerModel {
        &self.models[self.auction.current_player().idx()]
    }

    pub fn partner_model(&self) -> &PartnerModel {
        &self.models[self.auction.current_player().partner().idx()]
    }

    pub fn lho_model(&self) -> &PartnerModel {
        &self.models[self.auction.current_player().lho().idx()]
    }

    pub fn rho_model(&self) -> &PartnerModel {
        &self.models[self.auction.current_player().rho().idx()]
    }

    /// Analyze the auction to build models of all four hands
    pub fn from_auction(auction: &Auction) -> Self {
        let mut models: [PartnerModel; 4] = Default::default();
        let mut current_auction = Auction::new(auction.dealer);

        for (position, call) in auction.iter() {
            let context = Self {
                auction: current_auction.clone(),
                models: models.clone(),
            };

            if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                for constraint in semantics.shows {
                    models[position.idx()].apply_constraint(constraint);
                }
            }

            current_auction.add_call(*call);
        }

        Self {
            auction: auction.clone(),
            models,
        }
    }
}
