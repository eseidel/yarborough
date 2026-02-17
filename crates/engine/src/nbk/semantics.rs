//! Semantic meaning of calls in the NBK model

use crate::dsl::annotations::Annotation;
use crate::dsl::planner::Planner;
use crate::nbk::HandConstraint;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

/// Semantic meaning of a call
#[derive(Clone, Serialize, Deserialize)]
pub struct CallSemantics {
    /// What this call shows about our hand
    pub shows: Vec<HandConstraint>,
    /// Metadata about the bid (not hand constraints)
    pub annotations: Vec<Annotation>,
    /// Name of the rule that generated these semantics
    pub rule_name: String,
    /// Optional planner for selecting the bid
    #[serde(skip)]
    pub planner: Option<Arc<dyn Planner>>,
}

impl std::fmt::Debug for CallSemantics {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CallSemantics")
            .field("shows", &self.shows)
            .field("annotations", &self.annotations)
            .field("rule_name", &self.rule_name)
            .field("planner", &self.planner.as_ref().map(|_| "Some(Planner)"))
            .finish()
    }
}
