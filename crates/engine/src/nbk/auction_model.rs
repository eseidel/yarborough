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

/// Maps Position to a stable array index.
fn pos_idx(p: Position) -> usize {
    match p {
        Position::North => 0,
        Position::East => 1,
        Position::South => 2,
        Position::West => 3,
    }
}

impl AuctionModel {
    /// Build an AuctionModel from a position's perspective using the model array.
    fn from_perspective(
        auction: Auction,
        models: &[PartnerModel; 4],
        position: Position,
    ) -> Self {
        let partner = position.partner();
        let lho = position.next();
        let rho = partner.next();
        Self {
            auction,
            bidder_model: models[pos_idx(position)].clone(),
            partner_model: models[pos_idx(partner)].clone(),
            lho_model: models[pos_idx(lho)].clone(),
            rho_model: models[pos_idx(rho)].clone(),
        }
    }

    /// Analyze the auction to build models of all four hands
    pub fn from_auction(auction: &Auction, our_position: Position) -> Self {
        let mut models: [PartnerModel; 4] = Default::default();
        let mut current_auction = Auction::new(auction.dealer);

        for (position, call) in auction.iter() {
            let context = Self::from_perspective(current_auction.clone(), &models, position);

            if let Some(semantics) = CallInterpreter::interpret(&context, call) {
                for constraint in semantics.shows {
                    models[pos_idx(position)].apply_constraint(constraint);
                }
            }

            current_auction.add_call(*call);
        }

        Self::from_perspective(auction.clone(), &models, our_position)
    }
}
