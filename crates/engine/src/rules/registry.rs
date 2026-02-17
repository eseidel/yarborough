use crate::dsl::rule::Rule;
use crate::kernel::{AuctionModel, CallSemantics};
use crate::rules::{advance, natural, opening, overcalls};
use types::Call;

/// Registry of all bidding rules
pub struct RuleRegistry {
    rules: Vec<Box<dyn Rule>>,
}

impl RuleRegistry {
    pub fn new_natural() -> Self {
        let rules: Vec<Box<dyn Rule>> = vec![
            // Natural (Discovery, Responses)
            Box::new(natural::NewSuitAtLevelOne),
            Box::new(natural::FreeBidAtLevelOne),
            Box::new(natural::OneNotrumpResponse),
            Box::new(natural::NewMajorAtLevelTwo),
            Box::new(natural::NewMinorAtLevelTwo),
            Box::new(natural::JumpShiftResponse),
            Box::new(natural::SupportPartner),
            Box::new(natural::NaturalNotrump),
            Box::new(natural::RebidOwnSuit),
            Box::new(natural::BetterContractRemote),
            // Overcalls (when opponents opened)
            Box::new(overcalls::OneLevelOvercall),
            Box::new(overcalls::TwoLevelOvercall),
            Box::new(overcalls::WeakJumpOvercall),
            Box::new(overcalls::OneNotrumpOvercall),
            Box::new(overcalls::OneLevelTakeoutDouble),
            Box::new(overcalls::OneLevelNegativeDouble),
            Box::new(overcalls::TwoLevelNegativeDouble),
            Box::new(overcalls::PassOvercall),
            // Advance (responding to partner's overcall)
            Box::new(advance::RaisePartnerOvercall),
            Box::new(advance::NewSuitAdvance),
            Box::new(advance::NotrumpAdvance),
            Box::new(advance::PassAdvance),
            // Opening
            Box::new(opening::Strong2COpening),
            Box::new(opening::OneNotrumpOpening),
            Box::new(opening::TwoNotrumpOpening),
            Box::new(opening::SuitedOpening),
            Box::new(opening::FourthSeatSuitedOpening),
            Box::new(opening::WeakTwoOpening),
            Box::new(opening::PreemptiveOpening),
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
