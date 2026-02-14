//! Call Interpreter for NBK
//!
//! Interprets the semantic meaning of calls by querying discovery and limit protocols.

use crate::nbk::{AuctionModel, CallSemantics, DiscoveryProtocol, LimitProtocol, OpeningProtocol};
use bridge_core::Call;

/// Interprets the semantic meaning of calls
pub struct CallInterpreter;

impl CallInterpreter {
    /// Interpret a call given the current models
    pub fn interpret(auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        OpeningProtocol::get_semantics(auction_model, call)
            .or_else(|| LimitProtocol::get_semantics(auction_model, call))
            .or_else(|| DiscoveryProtocol::get_semantics(auction_model, call))
    }
}
