use crate::inference::PartnerProfile;
use crate::schema::Constraint;
use bridge_core::call::Call;
use bridge_core::hand::Hand;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ConstraintTrace {
    pub constraint: Constraint,
    pub satisfied: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct RuleTrace {
    pub rule_name: String,
    pub description: String,
    pub call: Call,
    pub priority: i32,
    pub constraints: Vec<ConstraintTrace>,
    pub satisfied: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct BidTrace {
    pub hand: Hand,
    pub profile: PartnerProfile,
    pub rules_considered: Vec<RuleTrace>,
    pub selected_call: Option<Call>,
}
