//! Call Interpreter for NBK
//!
//! Interprets the semantic meaning of calls by querying discovery and limit protocols.

use crate::nbk::{AuctionModel, CallSemantics};
use crate::rules::registry::RuleRegistry;
use std::sync::OnceLock;
use types::Call;

/// Interprets the semantic meaning of calls
pub struct CallInterpreter;

static REGISTRY: OnceLock<RuleRegistry> = OnceLock::new();

impl CallInterpreter {
    /// Interpret a call given the current models
    pub fn interpret(auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics> {
        let registry = REGISTRY.get_or_init(RuleRegistry::new_natural);
        let semantics = registry.interpret(auction_model, call);
        // For now, we just pick the first interpretation.
        // In the future, we might use a more sophisticated selection process.
        semantics.into_iter().next()
    }
}
