//! Auction state analysis for NBK

use crate::nbk::{CallInterpreter, PartnerModel};
use bridge_core::{Auction, Position};

/// Analysis of the current auction state
#[derive(Debug, Clone, Default)]
pub struct AuctionModel {
    /// The auction state
    #[allow(dead_code)]
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

    /// Whether the auction is currently forcing (partner's bid demands a response)
    ///
    /// Conservative approach: Most opening bids are not forcing unless responder has already shown values
    pub fn is_forcing(&self) -> bool {
        // Simplified for now: it's forcing if we have shown values and partner bid a new suit.
        // This logic was previously in is_auction_forcing and will be refined.
        // For now, if partner has bid and we have bid, consider it forcing if it's discovery.
        // Actually, let's keep it simple for now as we're refactoring.
        self.bidder_model.min_hcp.is_some()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bridge_core::{Auction, Call, Position, Strain};

    fn make_auction_with_bids(dealer: Position, calls: Vec<Call>) -> Auction {
        let mut auction = Auction::new(dealer);
        for call in calls {
            auction.calls.push(call);
        }
        auction
    }

    #[test]
    fn test_empty_auction_not_forcing() {
        let auction = Auction::new(Position::North);
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(!model.is_forcing());
    }

    #[test]
    fn test_opening_bid_not_forcing() {
        // North opens 1S - South (responder) can pass
        let auction = make_auction_with_bids(
            Position::North,
            vec![Call::Bid {
                level: 1,
                strain: Strain::Spades,
            }],
        );
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(!model.is_forcing()); // Responder can pass weak hands
    }

    #[test]
    fn test_after_response_is_forcing() {
        // North opens 1S, East passes, South responds 2C, West passes
        // Now it's North's turn - is it forcing?
        let auction = make_auction_with_bids(
            Position::North,
            vec![
                Call::Bid {
                    level: 1,
                    strain: Strain::Spades,
                }, // North
                Call::Pass, // East
                Call::Bid {
                    level: 2,
                    strain: Strain::Clubs,
                }, // South (we responded)
                Call::Pass, // West
            ],
        );
        // From North's perspective (opener), after South responded
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(model.is_forcing()); // Opener's rebid after response is forcing
    }

    #[test]
    fn test_all_passes_not_forcing() {
        let auction =
            make_auction_with_bids(Position::North, vec![Call::Pass, Call::Pass, Call::Pass]);
        let model = AuctionModel::from_auction(&auction, Position::South);
        assert!(!model.is_forcing());
    }
}
