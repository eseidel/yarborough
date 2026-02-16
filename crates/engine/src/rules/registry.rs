use crate::dsl::bidding_rule::BiddingRule;
use crate::nbk::{AuctionModel, CallSemantics};
use crate::rules::{natural, opening, overcalls};
use types::Call;

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
            // Overcalls (when opponents opened)
            Box::new(overcalls::OneLevelOvercall),
            Box::new(overcalls::TwoLevelOvercall),
            Box::new(overcalls::WeakJumpOvercall),
            Box::new(overcalls::OneNtOvercall),
            Box::new(overcalls::PassOvercall),
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
