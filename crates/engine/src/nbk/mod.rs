//! Natural Bidding Kernel (NBK)
//!
//! A priority-based heuristic bidding model with two core protocols:
//! - Discovery Protocol: Show new 4+ card suits (forcing)
//! - Limit Protocol: Define hand strength in known fits or NT (non-forcing)

pub mod auction_model;
pub mod call_menu;
pub mod call_selector;
pub mod constraints;
pub mod interpreter;
pub mod partner_model;
pub mod point_ranges;
pub mod semantics;
pub mod trace;

pub use auction_model::AuctionModel;
pub use call_selector::CallSelector;
pub use constraints::HandConstraint;
pub use interpreter::CallInterpreter;
pub use partner_model::PartnerModel;
pub use point_ranges::PointRanges;
pub use semantics::CallSemantics;
pub use trace::BidTrace;

use types::{Auction, Call, Hand};

/// Main entry point for NBK bid selection
///
/// Given a hand and auction state, returns the best bid according to NBK logic.
/// Returns None if no valid bid can be determined (should be rare - will default to Pass).
pub fn select_bid(hand: &Hand, auction: &Auction) -> Option<Call> {
    let auction_model = AuctionModel::from_auction(auction);
    CallSelector::select_best_call(hand, &auction_model)
}

/// Like select_bid but returns a detailed trace
pub fn select_bid_with_trace(hand: &Hand, auction: &Auction) -> BidTrace {
    let auction_model = AuctionModel::from_auction(auction);
    CallSelector::select_best_call_with_trace(hand, &auction_model)
}
