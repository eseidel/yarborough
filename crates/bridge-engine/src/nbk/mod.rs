//! Natural Bidding Kernel (NBK)
//!
//! A priority-based heuristic bidding model with two core protocols:
//! - Discovery Protocol: Show new 4+ card suits (forcing)
//! - Limit Protocol: Define hand strength in known fits or NT (non-forcing)

pub mod auction_model;
pub mod bid_selector;
pub mod constraints;
pub mod discovery;
pub mod hand_model;
pub mod limit;
pub mod partner_model;
pub mod point_ranges;

pub use auction_model::AuctionModel;
pub use constraints::HandConstraint;
pub use hand_model::HandModel;
pub use partner_model::PartnerModel;

use bridge_core::{Auction, Call, Hand, Position};

/// Main entry point for NBK bid selection
///
/// Given a hand, auction state, and position, returns the best bid according to NBK logic.
/// Returns None if no valid bid can be determined (should be rare - will default to Pass).
pub fn select_bid(hand: &Hand, auction: &Auction, position: Position) -> Option<Call> {
    let hand_model = HandModel::from_hand(hand);
    let partner_model = PartnerModel::from_auction(auction, position);
    let auction_model = AuctionModel::from_auction(auction, position.partner());
    let legal_calls = auction.legal_calls();

    Some(bid_selector::BidSelector::select_best_bid(
        &hand_model,
        &partner_model,
        &auction_model,
        &legal_calls,
    ))
}
