//! Call Interpreter for NBK
//!
//! Interprets the semantic meaning of calls by querying discovery and limit protocols.

use crate::nbk::{AuctionModel, CallSemantics, DiscoveryProtocol, LimitProtocol};
use bridge_core::Call;

/// Interprets the semantic meaning of calls
pub struct CallInterpreter;

impl CallInterpreter {
    /// Interpret a call given the current models
    pub fn interpret(auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        // If there's a conflict between the two, it should return the semantics from the Limit protocol.
        let limit_semantics = LimitProtocol::get_semantics(auction_model, call);
        if limit_semantics.is_some() {
            return limit_semantics;
        }

        DiscoveryProtocol::get_semantics(auction_model, call)
    }
}
