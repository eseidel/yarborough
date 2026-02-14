//! Semantic meaning of calls in the NBK model

use crate::nbk::HandConstraint;
use serde::{Deserialize, Serialize};

/// Purpose of a call in the NBK model
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CallPurpose {
    /// Discovery: Show length in a new suit (forcing)
    Discovery,
    /// Limit: Define hand strength in a known fit or NT (non-forcing)
    Limit,
}

/// Semantic meaning of a call
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallSemantics {
    /// Why we are making this call
    pub purpose: CallPurpose,
    /// What this call shows about our hand
    pub shows: Vec<HandConstraint>,
}
