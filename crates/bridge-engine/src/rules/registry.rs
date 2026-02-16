use crate::dsl::bidding_rule::BiddingRule;
use crate::nbk::{AuctionModel, CallSemantics};
use crate::rules::{natural, opening};
use bridge_core::Call;

/// Registry of all bidding rules
pub struct RuleRegistry {
    rules: Vec<Box<dyn BiddingRule>>,
}

impl RuleRegistry {
    pub fn new_natural() -> Self {
        let rules: Vec<Box<dyn BiddingRule>> = vec![
            // Natural (Discovery, Responses)
            Box::new(natural::NewSuitAtLevelOne),
            Box::new(natural::OneNotrumpResponse),
            Box::new(natural::NewMajorAtLevelTwo),
            Box::new(natural::NewMinorAtLevelTwo),
            Box::new(natural::SupportPartner),
            Box::new(natural::NaturalNotrump),
            Box::new(natural::RebidOwnSuit),
            Box::new(natural::BetterContractRemote),
            // Opening
            Box::new(opening::Strong2C),
            Box::new(opening::OneNoTrumpOpening),
            Box::new(opening::TwoNoTrumpOpening),
            Box::new(opening::SuitOpening),
            Box::new(opening::SuitOpeningFourthSeat),
            Box::new(opening::WeakTwo),
            Box::new(opening::Preempt),
            Box::new(opening::PassOpening),
        ];
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
