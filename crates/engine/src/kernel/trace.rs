//! Tracing for Kernel bid selection
use crate::kernel::{AuctionModel, CallRanker, CallSemantics, HandConstraint};
use serde::{Deserialize, Serialize};
use types::Call;

/// A detailed trace of the bid selection process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BidTrace {
    /// The auction state and models of the players
    pub auction_model: AuctionModel,
    /// The call ranker generated
    pub menu: CallRanker,
    /// Detailed steps of the selection process
    pub selection_steps: Vec<SelectionStep>,
    /// The final call selected (if any)
    pub selected_call: Option<Call>,
}

/// A single step in the bid selection process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SelectionStep {
    /// The group being considered
    pub group_name: String,
    /// The call being considered
    pub call: Call,
    /// The semantics of the call
    pub semantics: CallSemantics,
    /// Whether the hand satisfied all constraints
    pub satisfied: bool,
    /// Which constraints failed (if any)
    pub failed_constraints: Vec<HandConstraint>,
}
