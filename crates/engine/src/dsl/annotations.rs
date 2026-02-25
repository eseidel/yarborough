//! Annotations for bidding rules
//!
//! Annotations are metadata about a bid's meaning that don't describe
//! hand constraints. They're used for categorization (e.g., activating
//! the notrump response system) and as preconditions for later rules.

use serde::{Deserialize, Serialize};

/// Metadata attached to a bid by its rule.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Annotation {
    /// This bid activates the notrump system (Stayman, transfers, etc.)
    NotrumpSystemsOn,
    /// This bid is a suited overcall (1-level, 2-level, or weak jump)
    Overcall,
    /// This bid is a Jacoby 2NT response (game forcing, 4+ card support)
    Jacoby2NT,
    /// This bid is a conventional response, prioritizing it above other calls
    ConventionalResponse,
}
