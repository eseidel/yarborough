//! Kernel
//!
//! A priority-based heuristic bidding model with two core protocols:
//! - Discovery Protocol: Show new 4+ card suits (forcing)
//! - Limit Protocol: Define hand strength in known fits or NT (non-forcing)

pub mod auction_model;
pub mod call_interpreter;
pub mod call_purpose;
pub mod call_ranker;
pub mod call_selector;
pub mod call_semantics;
pub mod hand_constraint;
pub mod hand_model;
pub mod point_ranges;
pub mod trace;

pub use auction_model::AuctionModel;
pub use call_interpreter::CallInterpreter;
pub use call_purpose::CallPurpose;
pub use call_ranker::CallRanker;
pub use call_selector::CallSelector;
pub use call_semantics::CallSemantics;
pub use hand_constraint::HandConstraint;
pub use hand_model::HandModel;
pub use point_ranges::PointRanges;
pub use trace::BidTrace;

use types::{Auction, Call, Hand};

/// Main entry point for Kernel bid selection
///
/// Given a hand and auction state, returns the best bid according to Kernel logic.
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
