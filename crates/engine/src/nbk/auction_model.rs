//! Auction state analysis for NBK

use crate::nbk::{CallInterpreter, PartnerModel};
use types::{Auction, Position};

use serde::{Deserialize, Serialize};

/// Analysis of the current auction state
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuctionModel {
    /// The auction state
    pub auction: Auction,
    /// What our partner has shown
    pub partner_model: PartnerModel,
    /// What we have shown (our own model as seen by partner)
    pub bidder_model: PartnerModel,
    /// What the left-hand opponent has shown
    pub lho_model: PartnerModel,
    /// What the right-hand opponent has shown
    pub rho_model: PartnerModel,
}

impl AuctionModel {
    /// Analyze the auction to build models of all four hands
    pub fn from_auction(auction: &Auction, our_position: Position) -> Self {
        let mut partner_model = PartnerModel::default();
        let mut bidder_model = PartnerModel::default();
        let mut lho_model = PartnerModel::default();
        let mut rho_model = PartnerModel::default();

        let partner_position = our_position.partner();
        let lho_position = our_position.next();
        let rho_position = partner_position.next();
        let mut current_auction = Auction::new(auction.dealer);

        for (position, call) in auction.iter() {
            if position == our_position {
                // Interpret our call based on what partner has shown
                let context = AuctionModel {
                    auction: current_auction.clone(),
                    partner_model: partner_model.clone(),
                    bidder_model: bidder_model.clone(),
                    lho_model: lho_model.clone(),
                    rho_model: rho_model.clone(),
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
                    lho_model: rho_model.clone(),
                    rho_model: lho_model.clone(),
                };
                if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                    for constraint in semantics.shows {
                        partner_model.apply_constraint(constraint);
                    }
                }
            } else if position == lho_position {
                // Interpret LHO's call from their perspective (their partner is RHO)
                let context = AuctionModel {
                    auction: current_auction.clone(),
                    partner_model: rho_model.clone(),
                    bidder_model: lho_model.clone(),
                    lho_model: partner_model.clone(),
                    rho_model: bidder_model.clone(),
                };
                if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                    for constraint in semantics.shows {
                        lho_model.apply_constraint(constraint);
                    }
                }
            } else if position == rho_position {
                // Interpret RHO's call from their perspective (their partner is LHO)
                let context = AuctionModel {
                    auction: current_auction.clone(),
                    partner_model: lho_model.clone(),
                    bidder_model: rho_model.clone(),
                    lho_model: bidder_model.clone(),
                    rho_model: partner_model.clone(),
                };
                if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                    for constraint in semantics.shows {
                        rho_model.apply_constraint(constraint);
                    }
                }
            }
            current_auction.add_call(*call);
        }

        Self {
            auction: auction.clone(),
            partner_model,
            bidder_model,
            lho_model,
            rho_model,
        }
    }
}
