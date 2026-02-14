//! Auction state analysis for NBK

use crate::nbk::{CallInterpreter, PartnerModel};
use bridge_core::{Auction, Position};

/// Analysis of the current auction state
#[derive(Debug, Clone, Default)]
pub struct AuctionModel {
    /// The auction state
    pub auction: Auction,
    /// What our partner has shown
    pub partner_model: PartnerModel,
    /// What we have shown (our own model as seen by partner)
    pub bidder_model: PartnerModel,
}

impl AuctionModel {
    /// Analyze the auction to build models of both hands
    pub fn from_auction(auction: &Auction, our_position: Position) -> Self {
        let mut partner_model = PartnerModel::default();
        let mut bidder_model = PartnerModel::default();

        let partner_position = our_position.partner();
        let mut current_auction = Auction::new(auction.dealer);

        for (position, call) in auction.iter() {
            if position == our_position {
                // Interpret our call based on what partner has shown
                let context = AuctionModel {
                    auction: current_auction.clone(),
                    partner_model: partner_model.clone(),
                    bidder_model: bidder_model.clone(),
                };
                if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                    for constraint in semantics.shows {
                        bidder_model.apply_constraint(constraint);
                    }
                }
            } else if position == partner_position {
                // Interpret partner's call based on what we have shown
                let context = AuctionModel {
                    auction: current_auction.clone(),
                    partner_model: bidder_model.clone(),
                    bidder_model: partner_model.clone(),
                };
                if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                    for constraint in semantics.shows {
                        partner_model.apply_constraint(constraint);
                    }
                }
            }
            current_auction.add_call(*call);
        }

        Self {
            auction: auction.clone(),
            partner_model,
            bidder_model,
        }
    }
}
