//! Tracing for NBK bid selection
use crate::nbk::call_menu::CallMenu;
use crate::nbk::semantics::CallSemantics;
use crate::nbk::AuctionModel;
use crate::nbk::HandConstraint;
use crate::nbk::HandModel;
use bridge_core::Call;
use serde::{Deserialize, Serialize};

/// A detailed trace of the bid selection process
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BidTrace {
    /// The hand model used for selection
    pub hand_model: HandModel,
    /// The auction state and models of the players
    pub auction_model: AuctionModel,
    /// The call menu generated
    pub menu: CallMenu,
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
