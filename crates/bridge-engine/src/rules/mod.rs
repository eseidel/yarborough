//! NBK Rules DSL
//!
//! This module defines the infrastructure for a declarative bidding DSL.

use crate::nbk::{AuctionModel, CallSemantics};
use bridge_core::Call;

pub mod discovery;
pub mod limit;
pub mod opening;

/// A bidding rule in the NBK DSL
pub trait BiddingRule: Send + Sync {
    /// Whether the rule applies in the given auction context (independent of the call)
    fn applies(&self, auction_model: &AuctionModel) -> bool;

    /// The name of the rule for the given call
    fn name(&self, call: &Call) -> String;

    /// Try to interpret a call using this rule.
    /// Returns semantics if the rule applies to this auction and call.
    fn get_semantics(&self, auction_model: &AuctionModel, call: &Call) -> Option<CallSemantics>;
}

/// Registry of all bidding rules
pub struct RuleRegistry {
    rules: Vec<Box<dyn BiddingRule>>,
}

impl RuleRegistry {
    /// Create a new registry with all default natural rules
    pub fn new_natural() -> Self {
        let mut rules: Vec<Box<dyn BiddingRule>> = Vec::new();

        // Opening Rules
        rules.push(Box::new(opening::Strong2C));
        rules.push(Box::new(opening::NoTrumpOpening));
        rules.push(Box::new(opening::SuitOpening));
        rules.push(Box::new(opening::WeakTwo));
        rules.push(Box::new(opening::Preempt));
        rules.push(Box::new(opening::PassOpening));

        // Limit Rules
        rules.push(Box::new(limit::NoTrumpLimit));
        rules.push(Box::new(limit::SupportLimit));
        rules.push(Box::new(limit::RebidLimit));
        rules.push(Box::new(limit::PassLimit));

        // Discovery Rules
        rules.push(Box::new(discovery::NewSuitDiscovery));

        Self { rules }
    }

    /// Interpret a call by querying all registered rules
    pub fn interpret(&self, auction_model: &AuctionModel, call: &Call) -> Vec<CallSemantics> {
        let mut results = Vec::new();
        for rule in &self.rules {
            if rule.applies(auction_model) {
                if let Some(semantics) = rule.get_semantics(auction_model, call) {
                    results.push(semantics);
                }
            }
        }
        results
    }
}
