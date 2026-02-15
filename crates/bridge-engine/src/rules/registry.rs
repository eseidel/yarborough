use crate::nbk::{AuctionModel, CallSemantics};
use crate::rules::bidding_rule::BiddingRule;
use crate::rules::{discovery, limit, opening};
use bridge_core::Call;

/// Registry of all bidding rules
pub struct RuleRegistry {
    rules: Vec<Box<dyn BiddingRule>>,
}

impl RuleRegistry {
    pub fn new_natural() -> Self {
        let mut rules: Vec<Box<dyn BiddingRule>> = Vec::new();

        // Discovery
        rules.push(Box::new(discovery::NewSuitDiscovery));

        // Opening
        rules.push(Box::new(opening::Strong2C));
        rules.push(Box::new(opening::OneNoTrumpOpening));
        rules.push(Box::new(opening::TwoNoTrumpOpening));
        rules.push(Box::new(opening::SuitOpening));
        rules.push(Box::new(opening::SuitOpeningFourthSeat));
        rules.push(Box::new(opening::WeakTwo));
        rules.push(Box::new(opening::Preempt));
        rules.push(Box::new(opening::PassOpening));

        // Limit (Responses)
        rules.push(Box::new(limit::NoTrumpResponse));
        rules.push(Box::new(limit::SupportResponse));
        rules.push(Box::new(limit::RebidResponse));
        rules.push(Box::new(limit::PassBetterContractIsRemote));
        Self { rules }
    }

    pub fn interpret(&self, auction_model: &AuctionModel, call: &Call) -> Vec<CallSemantics> {
        let mut results = Vec::new();
        for rule in &self.rules {
            if let Some(semantics) = rule.get_semantics(auction_model, call) {
                results.push(semantics);
            }
        }
        results
    }
}
