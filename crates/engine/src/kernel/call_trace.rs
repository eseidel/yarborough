//! Tracing for Kernel call selection
use crate::kernel::{AuctionModel, CallRanker, CallSemantics, HandConstraint};
use serde::{Deserialize, Serialize};
use types::Call;

/// A detailed trace of the call selection process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallTrace {
    /// The auction state and models of the players
    pub auction_model: AuctionModel,
    /// The call ranker generated
    pub ranker: CallRanker,
    /// Detailed steps of the selection process
    pub call_selection_steps: Vec<CallSelectionStep>,
    /// The final call selected (if any)
    pub selected_call: Option<Call>,
}

/// A single step in the call selection process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallSelectionStep {
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
