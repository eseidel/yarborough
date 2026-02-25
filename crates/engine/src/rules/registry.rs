use crate::dsl::rule::Rule;
use crate::kernel::{AuctionModel, CallSemantics};
use crate::rules::{competitive, jacoby_2nt, natural, opening};
use types::Call;

/// Registry of all bidding rules
pub struct RuleRegistry {
    rules: Vec<Box<dyn Rule>>,
}

impl RuleRegistry {
    pub fn new_natural() -> Self {
        let rules: Vec<Box<dyn Rule>> = vec![
            Box::new(jacoby_2nt::Jacoby2NTResponse),
            Box::new(jacoby_2nt::Jacoby2NTRebidNewSuitLevel3),
            Box::new(jacoby_2nt::Jacoby2NTRebidNewSuitLevel4),
            Box::new(jacoby_2nt::Jacoby2NTRebidMajorLevel3),
            Box::new(jacoby_2nt::Jacoby2NTRebidMajorLevel4),
            Box::new(jacoby_2nt::Jacoby2NTRebid3NT),
            Box::new(natural::NewSuitAtLevelOne),
            Box::new(natural::FreeBidAtLevelOne),
            Box::new(natural::OneNotrumpResponse),
            Box::new(natural::NewMajorAtLevelTwo),
            Box::new(natural::NewMinorAtLevelTwo),
            Box::new(natural::JumpShift),
            Box::new(natural::TwoNotrumpJumpResponse),
            Box::new(natural::ThreeNotrumpJumpResponse),
            Box::new(natural::SupportPartner),
            Box::new(natural::TwoNotrumpJumpRebid),
            Box::new(natural::NaturalNotrump),
            Box::new(natural::RebidOwnSuit),
            Box::new(natural::BetterContractRemote),
            Box::new(competitive::OneLevelOvercall),
            Box::new(competitive::TwoLevelOvercall),
            Box::new(competitive::WeakJumpOvercall),
            Box::new(competitive::OneNotrumpOvercall),
            Box::new(competitive::OneLevelTakeoutDouble),
            Box::new(competitive::OneLevelNegativeDouble),
            Box::new(competitive::TwoLevelNegativeDouble),
            Box::new(competitive::PassOvercall),
            Box::new(competitive::RaiseResponseToOvercall),
            Box::new(competitive::NewSuitResponseToOvercall),
            Box::new(competitive::CuebidResponseToOvercall),
            Box::new(competitive::NotrumpResponseToOvercall),
            Box::new(competitive::LawOfTotalTricks),
            Box::new(competitive::PassResponseToOvercall),
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
