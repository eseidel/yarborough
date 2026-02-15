//! Semantic meaning of calls in the NBK model

use crate::nbk::HandConstraint;
use serde::{Deserialize, Serialize};

/// Semantic meaning of a call
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CallSemantics {
    /// What this call shows about our hand
    pub shows: Vec<HandConstraint>,
    /// Name of the rule that generated these semantics
    pub rule_name: String,
    /// Human-readable description of what the call means
    pub description: String,
}
